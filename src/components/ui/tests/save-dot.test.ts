import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SaveDot } from "../save-dot";

const render = (pending: boolean) =>
  renderToStaticMarkup(
    createElement(SaveDot, { pending, label: "Saving", testId: "dot", status: "saving" }),
  );

describe("SaveDot", () => {
  it("shows the dot and tells screen readers while changes wait to be saved", () => {
    const html = render(true);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/data-testid="dot"[^>]*class="[^"]*rounded-full(?![^"]*invisible)/);
    expect(html).toContain('<span class="sr-only">Saving</span>');
  });

  it("hides the dot but keeps its space once everything is saved", () => {
    const html = render(false);
    expect(html).toMatch(/data-testid="dot"[^>]*class="[^"]*invisible/);
    expect(html).toContain('data-status="saving"');
    expect(html).toContain("size-4");
    expect(html).toContain('<span class="sr-only"></span>');
  });
});
