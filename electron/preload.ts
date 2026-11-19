import { contextBridge, ipcRenderer } from "electron";
import { DATABASE_READY_CHANNEL, PRINT_PREVIEW_CHANNEL } from "./ipc-channels";

contextBridge.exposeInMainWorld("desktop", {
  printPreview: (): Promise<void> => ipcRenderer.invoke(PRINT_PREVIEW_CHANNEL),
  ensureDatabase: (): Promise<boolean> => ipcRenderer.invoke(DATABASE_READY_CHANNEL),
});

