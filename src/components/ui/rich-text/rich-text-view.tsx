import { sanitizeRichText } from "@/lib/rich-text/sanitize";

/**
 * Renders stored rich text (ADR-0025). Server component: it sanitises again
 * on render (defence in depth), so HTML stored before the sanitiser existed,
 * such as the Access seeds, renders safely and with legacy markup converted.
 * Styles: `.rich-text` in globals.css (typography, tables, print).
 * Renders nothing for an empty value; the caller decides what "empty" shows.
 */
export function RichTextView({
  html,
  className,
  testId,
}: {
  html: string | null | undefined;
  className?: string;
  testId?: string;
}) {
  const clean = html ? sanitizeRichText(html) : "";
  if (clean === "") return null;
  return (
    <div
      className={`rich-text ${className ?? ""}`}
      data-testid={testId}
      // Safe: sanitised against the allow-list on the line above.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
