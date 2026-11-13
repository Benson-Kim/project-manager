import fs from "fs";
import path from "path";
import type { BrowserWindowConstructorOptions } from "electron";

export type PreviewSource = {
  id: number;
  getTitle(): string;
  printToPDF(options: { printBackground: boolean; preferCSSPageSize: boolean }): Promise<Buffer>;
};

export type PreviewWindow = {
  loadFile(file: string): Promise<void>;
  once(event: "closed", listener: () => void): void;
};

export type PrintPreviewDeps = {
  writePdf(fileName: string, pdf: Buffer): Promise<string>;
  removePdf(file: string): Promise<void>;
  openWindow(options: BrowserWindowConstructorOptions): PreviewWindow;
};

const UNSAFE_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function previewFileName(title: string): string {
  const name = title.replace(UNSAFE_FILE_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${name || "Print"}.pdf`;
}

/** Renders the page through its print stylesheet and opens the pages in a preview window to print from. */
export function createPrintPreview(deps: PrintPreviewDeps) {
  const busy = new Set<number>();
  return async function showPrintPreview(
    source: PreviewSource,
    parent: BrowserWindowConstructorOptions["parent"],
  ): Promise<void> {
    if (busy.has(source.id)) return;
    busy.add(source.id);
    try {
      const pdf = await source.printToPDF({ printBackground: true, preferCSSPageSize: true });
      const file = await deps.writePdf(previewFileName(source.getTitle()), pdf);
      const win = deps.openWindow({
        parent,
        width: 960,
        height: 1000,
        autoHideMenuBar: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          plugins: true,
        },
      });
      win.once("closed", () => void deps.removePdf(file).catch(() => undefined));
      await win.loadFile(file);
    } finally {
      busy.delete(source.id);
    }
  };
}

export function tempPdfFiles(tempRoot: string): Pick<PrintPreviewDeps, "writePdf" | "removePdf"> {
  return {
    async writePdf(fileName, pdf) {
      const dir = await fs.promises.mkdtemp(path.join(tempRoot, "print-preview-"));
      const file = path.join(dir, fileName);
      await fs.promises.writeFile(file, pdf);
      return file;
    },
    removePdf: (file) => fs.promises.rm(path.dirname(file), { recursive: true, force: true }),
  };
}
