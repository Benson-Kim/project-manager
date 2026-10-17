"use client";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

/** The browser's print dialog over the print stylesheet (ADR-0030); hidden on paper. */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="print:hidden"
      onClick={() => window.print()}
      data-testid="print-financial"
    >
      {messages.financials.print}
    </Button>
  );
}
