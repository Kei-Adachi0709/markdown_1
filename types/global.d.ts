/// <reference types="node" />

import type { ExecuteCodePayload, ExecutionResult } from '../src/common/ipc';

declare global {
  interface Window {
    api: {
      executeCode(payload: ExecuteCodePayload): Promise<ExecutionResult>;
      getWorkingDirectory(): Promise<string>;
    };
  }
}

export {};
