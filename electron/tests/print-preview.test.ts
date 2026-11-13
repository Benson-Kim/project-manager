import type { BrowserWindowConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createPrintPreview, previewFileName, type PreviewSource } from "../print-preview";

function harness() {
  let onClosed: (() => void) | undefined;
  const win = {
    loadFile: vi.fn(async () => undefined),
    once: vi.fn((_event: "closed", listener: () => void) => {
      onClosed = listener;
    }),
  };
  const deps = {
    writePdf: vi.fn(async (fileName: string) => `C:/tmp/print-preview-x/${fileName}`),
    removePdf: vi.fn(async () => undefined),
    openWindow: vi.fn((_options: BrowserWindowConstructorOptions) => win),
  };
  return { deps, win, close: () => onClosed?.() };
}

function source(overrides: Partial<PreviewSource> = {}): PreviewSource {
  return {
    id: 7,
    getTitle: () => "Meeting minutes",
    printToPDF: vi.fn(async () => Buffer.from("%PDF")),
    ...overrides,
  };
}

describe("previewFileName", () => {
  it("strips characters a file name cannot hold", () => {
    expect(previewFileName('Q3: plan / "draft" <v2>?')).toBe("Q3 plan draft v2.pdf");
  });

  it("falls back to Print when nothing is left", () => {
    expect(previewFileName("  /:*  ")).toBe("Print.pdf");
  });

  it("keeps long titles to 80 characters", () => {
    expect(previewFileName("a".repeat(200))).toBe(`${"a".repeat(80)}.pdf`);
  });
});

describe("createPrintPreview", () => {
  it("renders the page to a PDF and opens it in a sandboxed child window", async () => {
    const { deps, win } = harness();
    const page = source();
    const parent = {} as never;

    await createPrintPreview(deps)(page, parent);

    expect(page.printToPDF).toHaveBeenCalledWith({
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(deps.writePdf).toHaveBeenCalledWith("Meeting minutes.pdf", Buffer.from("%PDF"));
    expect(deps.openWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        parent,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          plugins: true,
        },
      }),
    );
    expect(win.loadFile).toHaveBeenCalledWith("C:/tmp/print-preview-x/Meeting minutes.pdf");
  });

  it("removes the PDF when the preview window closes", async () => {
    const { deps, close } = harness();
    await createPrintPreview(deps)(source(), undefined);

    expect(deps.removePdf).not.toHaveBeenCalled();
    close();
    expect(deps.removePdf).toHaveBeenCalledWith("C:/tmp/print-preview-x/Meeting minutes.pdf");
  });

  it("ignores a second request from the same page while the first is still rendering", async () => {
    const { deps } = harness();
    let finish: (pdf: Buffer) => void = () => undefined;
    const page = source({
      printToPDF: vi.fn(() => new Promise<Buffer>((resolve) => (finish = resolve))),
    });
    const show = createPrintPreview(deps);

    const first = show(page, undefined);
    await show(page, undefined);
    finish(Buffer.from("%PDF"));
    await first;

    expect(page.printToPDF).toHaveBeenCalledTimes(1);
    expect(deps.openWindow).toHaveBeenCalledTimes(1);
  });

  it("lets the page try again after a failed render", async () => {
    const { deps } = harness();
    const printToPDF = vi
      .fn<PreviewSource["printToPDF"]>()
      .mockRejectedValueOnce(new Error("render failed"))
      .mockResolvedValueOnce(Buffer.from("%PDF"));
    const page = source({ printToPDF });
    const show = createPrintPreview(deps);

    await expect(show(page, undefined)).rejects.toThrow("render failed");
    await show(page, undefined);

    expect(deps.openWindow).toHaveBeenCalledTimes(1);
  });
});
