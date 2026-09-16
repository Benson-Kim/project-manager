"use client";

import { messages } from "@/lib/messages";

/** Last-resort error page (replaces the root layout when it crashes). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
        <h1 className="text-xl font-semibold">{messages.app.errorTitle}</h1>
        <p className="text-sm opacity-70">{messages.app.errorBody}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-2 inline-flex min-h-9 items-center rounded-md border px-6 text-sm font-medium"
        >
          {messages.app.retry}
        </button>
      </body>
    </html>
  );
}
