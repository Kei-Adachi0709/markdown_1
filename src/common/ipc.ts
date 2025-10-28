export interface ExecuteCodePayload {
  lang: string;
  code: string;
  cwd?: string | null;
  execId: string;
}

export type ExecutionStatus = 'ok' | 'error' | 'timeout' | 'unsupported';

export interface ExecutionResult {
  execId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  status: ExecutionStatus;
  message?: string;
  durationMs: number;
}
