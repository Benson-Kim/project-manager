import { describe, expect, it, vi } from "vitest";
import { createSavePage, type SavePageDeps } from "../save-page";

const page = (title = "Overview: Alpha") => ({
  id: 1,
  getTitle: () => title,
  printToPDF: vi.fn(async () => Buffer.from("%PDF")),
});

function setup(chosen: string | undefined) {
  const deps = {
    chooseFile: vi.fn<SavePageDeps["chooseFile"]>(async () => chosen),
    writeFile: vi.fn<SavePageDeps["writeFile"]>(async () => undefined),
  };
  return { deps, save: createSavePage(deps) };
}

describe("createSavePage", () => {
  it("offers the page title as the file name and writes the page where the user picks", async () => {
    const { deps, save } = setup("C:\\Docs\\Overview.pdf");
    const source = page();
    await expect(save(source, undefined)).resolves.toBe("C:\\Docs\\Overview.pdf");
    expect(deps.chooseFile).toHaveBeenCalledWith("Overview Alpha.pdf", undefined);
    expect(source.printToPDF).toHaveBeenCalledWith({ printBackground: true, preferCSSPageSize: true });
    expect(deps.writeFile).toHaveBeenCalledWith("C:\\Docs\\Overview.pdf", Buffer.from("%PDF"));
  });

  it("renders and writes nothing when the user cancels", async () => {
    const { deps, save } = setup(undefined);
    const source = page();
    await expect(save(source, undefined)).resolves.toBeUndefined();
    expect(source.printToPDF).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("asks once while a save of the same page is still open", async () => {
    let pick!: (file: string | undefined) => void;
    const deps = {
      chooseFile: vi.fn(() => new Promise<string | undefined>((resolve) => (pick = resolve))),
      writeFile: vi.fn(async () => undefined),
    };
    const save = createSavePage(deps);
    const source = page();
    const first = save(source, undefined);
    await expect(save(source, undefined)).resolves.toBeUndefined();
    pick(undefined);
    await first;
    expect(deps.chooseFile).toHaveBeenCalledTimes(1);
  });
});
