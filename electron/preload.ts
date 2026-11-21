import { contextBridge, ipcRenderer } from "electron";
import { DATABASE_READY_CHANNEL, PRINT_PREVIEW_CHANNEL, SAVE_WORK_CHANNEL } from "./ipc-channels";

contextBridge.exposeInMainWorld("desktop", {
  printPreview: (): Promise<void> => ipcRenderer.invoke(PRINT_PREVIEW_CHANNEL),
  onSaveWork: (listener: () => void): (() => void) => {
    const handler = () => listener();
    ipcRenderer.on(SAVE_WORK_CHANNEL, handler);
    return () => ipcRenderer.removeListener(SAVE_WORK_CHANNEL, handler);
  },
  ensureDatabase: (): Promise<boolean> => ipcRenderer.invoke(DATABASE_READY_CHANNEL),
});
