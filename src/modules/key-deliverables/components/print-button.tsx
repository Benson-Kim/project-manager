"use client";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

/** The report/downloadable view (issue #9): the browser's print-to-PDF over the print stylesheet. */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="print:hidden"
      onClick={() => window.print()}
    >
      {messages.keyDeliverables.print}
    </Button>
  );
}
