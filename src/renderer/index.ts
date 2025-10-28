import { renderMarkdown } from './markdown.js';
import {
  buildCodeBlockMap,
  updateMarkdownWithExecution,
  type CodeBlockMap,
  type ExecOutputUpdate,
  normalizeLanguageId,
} from './execOutput.js';
import { createExecId } from '@common/crypto.js';
import type { ExecutionResult } from '@common/ipc.js';

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const preview = document.getElementById('preview') as HTMLElement;

let currentMarkdown = '';
let codeBlockMap: CodeBlockMap = new Map();
const runningExecIds = new Set<string>();

const INITIAL_CONTENT = `# Local Markdown Executor

左側で Markdown を編集し、右側でプレビューを確認できます。
コードブロックの右上にある [Run ▶] ボタンでローカル実行、 [Copy] でクリップボードにコピーできます。

\`\`\`python
print("Hello from Python")
\`\`\`

\`\`\`javascript
console.log('Hello from Node.js');
\`\`\`

\`\`\`ruby
puts 'これは未サポートです'
\`\`\`
`;

function ensureInitialized(): void {
  if (!editor || !preview) {
    throw new Error('エディタの初期化に失敗しました');
  }
}

function normalizeCode(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

ensureInitialized();

editor.value = INITIAL_CONTENT;
currentMarkdown = editor.value;
void renderPreview();

editor.addEventListener('input', () => {
  currentMarkdown = editor.value;
  void renderPreview();
});

/** Render the Markdown preview and attach toolbars to each code fence. */
async function renderPreview(): Promise<void> {
  codeBlockMap = await buildCodeBlockMap(currentMarkdown);
  preview.innerHTML = renderMarkdown(currentMarkdown);
  await enhanceCodeBlocks();
}

type RunContext = {
  execId: string;
  lang: string;
  code: string;
  runButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
  spinner: HTMLElement;
};

async function enhanceCodeBlocks(): Promise<void> {
  const codeElements = Array.from(preview.querySelectorAll('pre > code')) as HTMLElement[];

  for (const codeElement of codeElements) {
    const pre = codeElement.parentElement;
    if (!pre) {
      continue;
    }

    const existingToolbar = pre.querySelector('.code-toolbar');
    if (existingToolbar) {
      existingToolbar.remove();
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';

    const runButton = createToolbarButton('Run ▶', 'run');
    const copyButton = createToolbarButton('Copy', 'copy');
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.style.display = 'none';

    toolbar.append(runButton, copyButton, spinner);
    pre.append(toolbar);

    const langClass = Array.from(codeElement.classList).find(cls => cls.startsWith('language-'));
    const lang = normalizeLanguageId(langClass?.replace('language-', '') ?? '');
    const codeText = codeElement.textContent ?? '';
    const normalizedCode = normalizeCode(codeText);
    const execId = await createExecId(lang, normalizedCode);
    codeElement.dataset.execId = execId;

    const runContext: RunContext = {
      execId,
      lang,
      code: normalizedCode,
      runButton,
      copyButton,
      spinner,
    };

    runButton.addEventListener('click', () => {
      void handleRun(runContext);
    });

    copyButton.addEventListener('click', () => {
      void handleCopy(codeText, copyButton);
    });
  }
}

/** Execute the code snippet associated with a toolbar interaction. */
async function handleRun(context: RunContext): Promise<void> {
  if (runningExecIds.has(context.execId)) {
    return;
  }

  runningExecIds.add(context.execId);
  setRunningState(context, true);

  try {
    const cwd = await window.api.getWorkingDirectory();
    const result = await window.api.executeCode({
      lang: context.lang,
      code: context.code,
      cwd,
      execId: context.execId,
    });

    await applyExecutionResult(context.execId, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知のエラーが発生しました。';
    const fallback: ExecutionResult = {
      execId: context.execId,
      exitCode: null,
      stdout: '',
      stderr: '',
      status: 'error',
      message,
      durationMs: 0,
    };
    await applyExecutionResult(context.execId, fallback, message);
  } finally {
    runningExecIds.delete(context.execId);
    setRunningState(context, false);
  }
}

/** Apply the execution result to the Markdown source and refresh the preview. */
async function applyExecutionResult(
  execId: string,
  result: ExecutionResult,
  overrideOutput?: string,
): Promise<void> {
  const output = overrideOutput ?? buildOutputText(result);
  const update: ExecOutputUpdate = {
    execId,
    result,
    output,
  };

  const updatedMarkdown = updateMarkdownWithExecution(currentMarkdown, update, codeBlockMap);
  if (updatedMarkdown !== currentMarkdown) {
    currentMarkdown = updatedMarkdown;
    editor.value = currentMarkdown;
  }
  await renderPreview();
}

function buildOutputText(result: ExecutionResult): string {
  const segments: string[] = [];
  if (result.stdout) {
    segments.push(result.stdout);
  }
  if (result.stderr) {
    segments.push(result.stderr);
  }
  if (segments.length === 0 && result.message) {
    return result.message;
  }
  if (segments.length === 0 && result.status === 'timeout') {
    return result.message ?? `実行がタイムアウトしました (${result.durationMs.toFixed(0)}ms)。`;
  }
  if (segments.length === 0 && result.status === 'unsupported') {
    return result.message ?? 'この言語は未サポートです。';
  }
  return segments.join('');
}

async function handleCopy(code: string, button: HTMLButtonElement): Promise<void> {
  const originalText = button.textContent ?? 'Copy';
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = 'Copied!';
  } catch {
    button.textContent = 'Copy failed';
  } finally {
    setTimeout(() => {
      button.textContent = originalText;
    }, 1200);
  }
}

function setRunningState(context: RunContext, running: boolean): void {
  context.runButton.disabled = running;
  context.copyButton.disabled = running;
  context.spinner.style.display = running ? 'inline-block' : 'none';
}

function createToolbarButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.type = 'button';
  button.textContent = label;
  return button;
}