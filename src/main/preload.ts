import { contextBridge, ipcRenderer } from 'electron';
import type { ExecuteCodePayload } from '@common/ipc.js';

contextBridge.exposeInMainWorld('api', {
  /** Request the main process to execute a code snippet in a sandboxed child process. */
  executeCode: (payload: ExecuteCodePayload) => ipcRenderer.invoke('execute-code', payload),
  /** Provide the default working directory used for code execution. */
  getWorkingDirectory: async (): Promise<string> => process.cwd(),
});
