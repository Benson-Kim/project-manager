import { contextBridge, ipcRenderer } from "electron";
import {
  CROSS_LINK_COMPLETE_CHANNEL,
  CROSS_LINK_START_CHANNEL,
  DATABASE_READY_CHANNEL,
  OPEN_LOCAL_PATH_CHANNEL,
  PAGE_NOTE_OPEN_CHANNEL,
  PRINT_PREVIEW_CHANNEL,
  SAVE_WORK_CHANNEL,
} from "./ipc-channels";
import type { OpenLocalPathResult } from "./local-path";

function subscribe(channel: string, listener: () => void): () => void {
  const handler = () => listener();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("desktop", {
  printPreview: (): Promise<void> => ipcRenderer.invoke(PRINT_PREVIEW_CHANNEL),
  onSaveWork: (listener: () => void): (() => void) => subscribe(SAVE_WORK_CHANNEL, listener),
  onAddPageNote: (listener: () => void): (() => void) =>
    subscribe(PAGE_NOTE_OPEN_CHANNEL, listener),
  onAddCrossLink: (listener: () => void): (() => void) =>
    subscribe(CROSS_LINK_START_CHANNEL, listener),
  onCompleteCrossLink: (listener: () => void): (() => void) =>
    subscribe(CROSS_LINK_COMPLETE_CHANNEL, listener),
  ensureDatabase: (): Promise<boolean> => ipcRenderer.invoke(DATABASE_READY_CHANNEL),
  openLocalPath: (folder: string): Promise<OpenLocalPathResult> =>
    ipcRenderer.invoke(OPEN_LOCAL_PATH_CHANNEL, folder),
});
