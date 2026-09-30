import { describe, it, expect, vi } from "vitest";
import { handleActionResult, handleDeleteResult } from "./sheet-form-state";
import type { SheetFormStateConfig } from "./sheet-form-state";

function makeConfig(overrides: Partial<SheetFormStateConfig> = {}): SheetFormStateConfig {
  return {
    onSuccess: vi.fn(),
    setSummary: vi.fn(),
    setConflict: vi.fn(),
    toast: vi.fn(),
    announce: vi.fn(),
    refresh: vi.fn(),
    applyResult: vi.fn(),
    ...overrides,
  };
}

describe("handleActionResult", () => {
  it("calls toast + announce + onSuccess + refresh on ok result", () => {
    const cfg = makeConfig();
    handleActionResult({ ok: true, data: null }, "Saved", cfg);
    expect(cfg.toast).toHaveBeenCalledWith("Saved");
    expect(cfg.announce).toHaveBeenCalledWith("Saved");
    expect(cfg.onSuccess).toHaveBeenCalledOnce();
    expect(cfg.refresh).toHaveBeenCalledOnce();
    expect(cfg.setSummary).not.toHaveBeenCalled();
  });

  it("calls applyResult + setSummary on error result", () => {
    const cfg = makeConfig();
    const r = {
      ok: false as const,
      error: { code: "VALIDATION" as const, message: "Check fields." },
    };
    handleActionResult(r, "Saved", cfg);
    expect(cfg.setSummary).toHaveBeenCalledWith("Check fields.");
    expect(cfg.applyResult).toHaveBeenCalledWith(r);
    expect(cfg.onSuccess).not.toHaveBeenCalled();
    expect(cfg.setConflict).not.toHaveBeenCalled();
  });

  it("sets conflict flag on CONFLICT error code", () => {
    const cfg = makeConfig();
    handleActionResult(
      { ok: false, error: { code: "CONFLICT", message: "Stale record." } },
      "Saved",
      cfg,
    );
    expect(cfg.setConflict).toHaveBeenCalledWith(true);
  });

  it("does not set conflict flag for non-CONFLICT errors", () => {
    const cfg = makeConfig();
    handleActionResult(
      { ok: false, error: { code: "NOT_FOUND", message: "Gone." } },
      "Saved",
      cfg,
    );
    expect(cfg.setConflict).not.toHaveBeenCalled();
  });
});

describe("handleDeleteResult", () => {
  it("dismisses confirm dialog and calls onSuccess on ok result", () => {
    const cfg = makeConfig();
    const setConfirmDelete = vi.fn();
    handleDeleteResult({ ok: true, data: null }, "Deleted", setConfirmDelete, cfg);
    expect(setConfirmDelete).toHaveBeenCalledWith(false);
    expect(cfg.toast).toHaveBeenCalledWith("Deleted");
    expect(cfg.announce).toHaveBeenCalledWith("Deleted");
    expect(cfg.onSuccess).toHaveBeenCalledOnce();
    expect(cfg.refresh).toHaveBeenCalledOnce();
  });

  it("dismisses confirm dialog and shows summary on failure", () => {
    const cfg = makeConfig();
    const setConfirmDelete = vi.fn();
    handleDeleteResult(
      { ok: false, error: { code: "NOT_FOUND", message: "Gone." } },
      "Deleted",
      setConfirmDelete,
      cfg,
    );
    expect(setConfirmDelete).toHaveBeenCalledWith(false);
    expect(cfg.setSummary).toHaveBeenCalledWith("Gone.");
    expect(cfg.onSuccess).not.toHaveBeenCalled();
  });

  it("sets conflict flag on CONFLICT during delete", () => {
    const cfg = makeConfig();
    handleDeleteResult(
      { ok: false, error: { code: "CONFLICT", message: "Stale." } },
      "Deleted",
      vi.fn(),
      cfg,
    );
    expect(cfg.setConflict).toHaveBeenCalledWith(true);
  });
});
