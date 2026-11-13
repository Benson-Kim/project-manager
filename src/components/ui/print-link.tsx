import Link from "next/link";
import { buttonClass, type ButtonVariant } from "@/components/ui/button-styles";
import { PrinterIcon } from "@/components/ui/printer-icon";

/** A link to a printable view, marked with the printer icon like every print action. */
export function PrintLink({
  href,
  label,
  testId,
  variant = "secondary",
}: {
  href: string;
  label: string;
  testId?: string;
  variant?: ButtonVariant;
}) {
  return (
    <Link href={href} data-testid={testId} className={`${buttonClass(variant)} print:hidden`}>
      <PrinterIcon />
      {label}
    </Link>
  );
}
