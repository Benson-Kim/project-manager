"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { messages } from "@/lib/messages";

/**
 * The ONE toast system (ADR-0008). success/info 4 s, warning 6 s, error sticky.
 * Max 3 visible (older ones drop first). Optional single action (e.g. undo).
 */
export type ToastVariant = "success" | "info" | "warning" | "error";

export interface ToastInput {
  variant: ToastVariant;
  title: string;
  action?: { label: string; onAction: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS: Record<ToastVariant, number | null> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: null,
};

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success bg-success-soft text-ink",
  info: "border-accent bg-accent-soft text-ink",
  warning: "border-warning bg-warning-soft text-ink",
  error: "border-danger bg-danger-soft text-ink",
};

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { ...input, id }]);
      const timeout = AUTO_DISMISS_MS[input.variant];
      if (timeout !== null) {
        setTimeout(() => dismiss(id), timeout);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-toast) flex flex-col items-center gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:items-end sm:pb-4"
        role="region"
        aria-label="Notifications"
      >
        <div aria-live="polite" className="sr-only">
          {toasts
            .filter((t) => t.variant !== "error")
            .map((t) => t.title)
            .join(" ")}
        </div>
        <div aria-live="assertive" className="sr-only">
          {toasts
            .filter((t) => t.variant === "error")
            .map((t) => t.title)
            .join(" ")}
        </div>
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid={`toast-${t.variant}`}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-md border-l-4 bg-surface-raised p-3 shadow-lg ${variantStyles[t.variant]}`}
          >
            <p className="flex-1 text-sm">{t.title}</p>
            {t.action ? (
              <button
                type="button"
                className="min-h-9 px-2 text-sm font-medium text-accent"
                onClick={() => {
                  t.action?.onAction();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label={messages.actions.close}
              className="flex size-11 items-center justify-center text-ink-muted"
              onClick={() => dismiss(t.id)}
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside Toaster");
  return ctx;
}
