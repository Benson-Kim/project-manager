"use client";

import { Button } from "@/components/ui/button";
import type { ButtonVariant } from "@/components/ui/button-styles";

/** Opens the browser's (or the desktop app's) print dialog over the page's print stylesheet. */
export function PrintButton({
  label,
  testId,
  variant,
}: {
  label: string;
  testId: string;
  variant?: ButtonVariant;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      className="min-h-11 print:hidden"
      data-testid={testId}
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
