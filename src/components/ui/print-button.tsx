"use client";

import { Button } from "@/components/ui/button";

/** Opens the browser's (or the desktop app's) print dialog over the page's print stylesheet. */
export function PrintButton({ label, testId }: { label: string; testId: string }) {
  return (
    <Button
      type="button"
      className="min-h-11 print:hidden"
      data-testid={testId}
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
