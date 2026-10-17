"use client";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

/** The printed minutes: the browser's (or the desktop app's) print dialog over the print stylesheet. */
export function PrintMinutesButton() {
  return (
    <Button
      type="button"
      className="min-h-11 print:hidden"
      data-testid="print-minutes"
      onClick={() => window.print()}
    >
      {messages.meetings.printMinutes}
    </Button>
  );
}
