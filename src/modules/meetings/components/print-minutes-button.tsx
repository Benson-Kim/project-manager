import { PrintButton } from "@/components/ui/print-button";
import { messages } from "@/lib/messages";

/** The printed minutes: the browser's (or the desktop app's) print dialog over the print stylesheet. */
export function PrintMinutesButton() {
  return <PrintButton label={messages.meetings.printMinutes} testId="print-minutes" />;
}
