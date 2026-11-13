import { contextBridge, ipcRenderer } from "electron";
import { PRINT_PREVIEW_CHANNEL } from "./ipc-channels";

contextBridge.exposeInMainWorld("desktop", {
  printPreview: (): Promise<void> => ipcRenderer.invoke(PRINT_PREVIEW_CHANNEL),
});
