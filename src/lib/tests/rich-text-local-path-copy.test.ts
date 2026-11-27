import { afterEach, describe, expect, it, vi } from "vitest";
import { copyLocalPath } from "@/components/ui/rich-text/local-path-view";
import { messages } from "@/lib/messages";

const folder = "C:\\Projects\\Plans 2026";

describe("copyLocalPath", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows an error toast and does not throw without a clipboard (plain-http page)", async () => {
    vi.stubGlobal("navigator", {});
    const toast = vi.fn();

    await expect(copyLocalPath(folder, toast)).resolves.toBe(false);

    expect(toast).toHaveBeenCalledExactlyOnceWith({
      variant: "error",
      title: messages.richText.localPathCopyFailed,
    });
  });

  it("shows an error toast when the browser refuses the write", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    });
    const toast = vi.fn();

    await expect(copyLocalPath(folder, toast)).resolves.toBe(false);

    expect(toast).toHaveBeenCalledExactlyOnceWith({
      variant: "error",
      title: messages.richText.localPathCopyFailed,
    });
  });

  it("copies the path as written and reports success", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const toast = vi.fn();

    await expect(copyLocalPath(folder, toast)).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledExactlyOnceWith(folder);
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      variant: "success",
      title: messages.richText.localPathCopied,
    });
  });
});
