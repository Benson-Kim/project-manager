import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { messages } from "@/lib/messages";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-xl font-semibold text-ink">{messages.app.notFoundTitle}</h1>
      <p className="text-sm text-ink-muted">{messages.app.notFoundBody}</p>
      <Link href="/" className={`${buttonClass("primary")} mt-2 px-6`}>
        {messages.app.goHome}
      </Link>
    </main>
  );
}
