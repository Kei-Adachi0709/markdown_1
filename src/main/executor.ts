import { type IpcMain, type IpcMainInvokeEvent } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { ExecuteCodePayload, ExecutionResult } from '@common/ipc.js';

/** The timeout duration for code execution in milliseconds. */
const EXECUTION_TIMEOUT_MS = 10_000;

/** Register the IPC handler that brokers code execution requests. */
export function registerExecutionHandler(ipcMain: IpcMain): void {
  ipcMain.handle(
    'execute-code',
    async (_event: IpcMainInvokeEvent, payload: ExecuteCodePayload) => executeCode(payload),
  );
}

/** Execute a single code block using the language-specific runner. */
async function executeCode(payload: ExecuteCodePayload): Promise<ExecutionResult> {
  const { lang, code, cwd, execId } = payload;
  const normalizedLang = lang.trim().toLowerCase();
  const workingDir = cwd && cwd.length > 0 ? cwd : process.cwd();

  if (!existsSync(workingDir)) {
    return {
      execId,
      exitCode: null,
      stdout: '',
      stderr: '',
      status: 'error',
      message: `作業ディレクトリが存在しません: ${workingDir}`,
      durationMs: 0,
    };
  }

  const start = performance.now();

  try {
    switch (normalizedLang) {
      case 'python':
      case 'py':
        return await runPython(execId, code, workingDir, start);
      case 'javascript':
      case 'js':
        return await runNode(execId, code, workingDir, start);
      case 'bash':
      case 'sh':
        return await runBash(execId, code, workingDir, start);
      default:
        return {
          execId,
          exitCode: null,
          stdout: '',
          stderr: '',
          status: 'unsupported',
          message: 'この言語は未サポートです。',
          durationMs: performance.now() - start,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
    return {
      execId,
      exitCode: null,
      stdout: '',
      stderr: '',
      status: 'error',
      message,
      durationMs: performance.now() - start,
    };
  }
}

/** Execute a Python snippet using the first available runtime. */
async function runPython(
  execId: string,
  code: string,
  cwd: string,
  start: number,
): Promise<ExecutionResult> {
  const runtimes = ['python3', 'python'];
  for (const runtime of runtimes) {
    try {
      return await runWithTempFile(execId, code, cwd, start, runtime, '.py');
    } catch (error) {
      if (isMissingBinary(error)) {
        continue;
      }
      throw error;
    }
  }

  return {
    execId,
    exitCode: null,
    stdout: '',
    stderr: '',
    status: 'unsupported',
    message: '実行可能な Python ランタイムが見つかりませんでした。',
    durationMs: performance.now() - start,
  };
}

/** Run a JavaScript snippet with the current Node.js binary. */
async function runNode(
  execId: string,
  code: string,
  cwd: string,
  start: number,
): Promise<ExecutionResult> {
  const nodePath = process.execPath;
  return runWithTempFile(execId, code, cwd, start, nodePath, '.js');
}

/** Execute a shell snippet when /bin/bash is available. */
async function runBash(
  execId: string,
  code: string,
  cwd: string,
  start: number,
): Promise<ExecutionResult> {
  const bashPath = '/bin/bash';
  if (!existsSync(bashPath)) {
    return {
      execId,
      exitCode: null,
      stdout: '',
      stderr: '',
      status: 'unsupported',
      message: 'この環境では bash/sh は未サポートです。',
      durationMs: performance.now() - start,
    };
  }
  return runWithTempFile(execId, code, cwd, start, bashPath, '.sh', ['-c']);
}

/**
 * Persist the snippet to a temporary file, execute it, and capture stdout/stderr.
 * Ensures the temporary artifacts are removed no matter how the process exits.
 */
async function runWithTempFile(
  execId: string,
  code: string,
  cwd: string,
  start: number,
  command: string,
  extension: string,
  additionalArgs: string[] = [],
): Promise<ExecutionResult> {
  const tempDir = await fs.mkdtemp(join(tmpdir(), 'mdexec-'));
  const filePath = join(tempDir, `snippet${extension}`);

  try {
    await fs.writeFile(filePath, code, { encoding: 'utf8' });

    const args = [...additionalArgs, filePath];
    const runResult = await runProcess(command, args, cwd);

    const duration = performance.now() - start;
    if (runResult.timedOut) {
      return {
        execId,
        exitCode: null,
        stdout: '',
        stderr: '',
        status: 'timeout',
        message: `実行がタイムアウトしました (${EXECUTION_TIMEOUT_MS}ms)。`,
        durationMs: duration,
      };
    }

    const status: ExecutionResult['status'] = runResult.exitCode === 0 ? 'ok' : 'error';

    return {
      execId,
      exitCode: runResult.exitCode,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      status,
      message: runResult.errorMessage,
      durationMs: duration,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

interface RunProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  errorMessage?: string;
}

/** Spawn a child process, honoring the global timeout and collecting output streams. */
async function runProcess(command: string, args: string[], cwd: string): Promise<RunProcessResult> {
  return new Promise<RunProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    let timeout = false;

    const timeoutId = setTimeout(() => {
      timeout = true;
      terminateProcessTree(child).catch(() => {
        // ignore cleanup errors
      });
    }, EXECUTION_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: unknown) => {
      stdout += typeof chunk === 'string' ? chunk : String(chunk);
    });

    child.stderr?.on('data', (chunk: unknown) => {
      stderr += typeof chunk === 'string' ? chunk : String(chunk);
    });

    child.on('error', (error: Error & { code?: string }) => {
      clearTimeout(timeoutId);
      if (finished) {
        return;
      }
      finished = true;
      if (isMissingBinary(error)) {
        resolve({ stdout: '', stderr: '', exitCode: null, timedOut: false, errorMessage: error.message });
      } else {
        reject(error);
      }
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      if (finished) {
        return;
      }
      finished = true;
      resolve({ stdout, stderr, exitCode: code, timedOut: timeout });
    });
  });
}

/** Terminate a child process and any of its descendants. */
async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    return new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
  }

  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      process.kill(child.pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
}

function isMissingBinary(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: string };
  return candidate.code === 'ENOENT';
}
