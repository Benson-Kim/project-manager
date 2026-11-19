"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ButtonVariant } from "@/components/ui/button-styles";
import { PrinterIcon } from "@/components/ui/printer-icon";
import { printWithPreview } from "@/lib/print-with-preview";

/**
 * Every print button: the printer icon and its label. By default it previews the page's print
 * stylesheet, then prints (desktop preview window or the browser's dialog); a view with its own
 * print flow passes onPrint.
 */
export function PrintButton({
  label,
  testId,
  variant,
  onPrint,
  className = "min-h-11",
}: {
  label: string;
  testId: string;
  variant?: ButtonVariant;
  onPrint?: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      className={`${className} print:hidden`}
      data-testid={testId}
      onClick={onPrint ?? (() => void printWithPreview())}
    >
      <PrinterIcon />
      {label}
    </Button>
  );
}

/**
 * For a PrintButton whose onPrint first loads what is printed: prints once each time `ready`
 * turns true, then calls `done`.
 */
export function usePrintWhenReady(ready: boolean, done: () => void) {
  const printed = useRef(false);
  useEffect(() => {
    if (!ready) {
      printed.current = false;
      return;
    }
    if (printed.current) return;
    printed.current = true;
    void printWithPreview().finally(done);
  }, [ready, done]);
}
