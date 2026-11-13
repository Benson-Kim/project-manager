import { afterEach, describe, expect, it, vi } from "vitest";
import { printWithPreview } from "../print-with-preview";

function stubWindow(desktop?: { printPreview?: () => Promise<void> }) {
  const win = Object.assign(new EventTarget(), { print: vi.fn(), desktop });
  const seen: string[] = [];
  for (const type of ["beforeprint", "afterprint"])
    win.addEventListener(type, () => seen.push(type));
  win.print.mockImplementation(() => seen.push("print"));
  vi.stubGlobal("window", win);
  return { win, seen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("printWithPreview", () => {
  it("opens the browser's print dialog when there is no desktop bridge", async () => {
    const { seen } = stubWindow();
    await printWithPreview();
    expect(seen).toEqual(["print"]);
  });

  it("shows the desktop preview with the print-fit events around it and no dialog", async () => {
    const printPreview = vi.fn(async () => undefined);
    const { win, seen } = stubWindow({ printPreview });

    await printWithPreview();

    expect(printPreview).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["beforeprint", "afterprint"]);
    expect(win.print).not.toHaveBeenCalled();
  });

  it("falls back to the print dialog when the preview fails", async () => {
    const { seen } = stubWindow({ printPreview: () => Promise.reject(new Error("no preview")) });
    await printWithPreview();
    expect(seen).toEqual(["beforeprint", "afterprint", "print"]);
  });
});
