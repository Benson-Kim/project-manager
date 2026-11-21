import type { BrowserWindowConstructorOptions } from "electron";
import { previewFileName, type PreviewSource } from "./print-preview";

type Parent = BrowserWindowConstructorOptions["parent"];

export type SavePageDeps = {
  chooseFile(defaultName: string, parent: Parent): Promise<string | undefined>;
  writeFile(file: string, pdf: Buffer): Promise<void>;
};

/** Saves the page, through its print stylesheet, as a PDF where the user picks; answers the file, or nothing when they cancel. */
export function createSavePage(deps: SavePageDeps) {
  const busy = new Set<number>();
  return async function savePageAsPdf(
    source: PreviewSource,
    parent: Parent,
  ): Promise<string | undefined> {
    if (busy.has(source.id)) return undefined;
    busy.add(source.id);
    try {
      const file = await deps.chooseFile(previewFileName(source.getTitle()), parent);
      if (!file) return undefined;
      const pdf = await source.printToPDF({ printBackground: true, preferCSSPageSize: true });
      await deps.writeFile(file, pdf);
      return file;
    } finally {
      busy.delete(source.id);
    }
  };
}
