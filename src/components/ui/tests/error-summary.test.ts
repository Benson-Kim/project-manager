import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import { ErrorSummary } from "../form/error-summary";

const render = (message: string | null) =>
  renderToStaticMarkup(createElement(ErrorSummary, { message }));

const count = (html: string, text: string) => html.split(text).length - 1;

describe("ErrorSummary", () => {
  it("says the form could not be saved once when that is the whole message", () => {
    expect(count(render(messages.errors.summaryTitle), messages.errors.summaryTitle)).toBe(1);
  });

  it("keeps the reason under the title for any other message", () => {
    const html = render(messages.errors.CONFLICT);
    expect(count(html, messages.errors.summaryTitle)).toBe(1);
    expect(html).toContain(messages.errors.CONFLICT);
  });

  it("renders nothing without a message", () => {
    expect(render(null)).toBe("");
  });
});
