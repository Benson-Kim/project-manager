import { z } from "zod";
import { endpointWithLabelSchema, type EndpointWithLabel } from "../schemas/cross-link";

const STORAGE_KEY = "pm:pending-cross-link:v1";
const CHANNEL_NAME = "pm-pending-cross-link";

const pendingSourceSchema = endpointWithLabelSchema.extend({
  startedAtIso: z.string(),
});

export type PendingCrossLinkSource = z.infer<typeof pendingSourceSchema>;

type WireMessage =
  { type: "set"; payload: PendingCrossLinkSource } | { type: "clear" } | { type: "hello" };

function safeReadSession(): PendingCrossLinkSource | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const checked = pendingSourceSchema.safeParse(parsed);
    return checked.success ? checked.data : null;
  } catch {
    return null;
  }
}

function safeWriteSession(val: PendingCrossLinkSource | null) {
  if (typeof window === "undefined") return;
  try {
    if (val) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort when storage is restricted.
  }
}

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function readPendingCrossLink(): PendingCrossLinkSource | null {
  return safeReadSession();
}

export function setPendingCrossLink(endpoint: EndpointWithLabel): PendingCrossLinkSource {
  const checked = endpointWithLabelSchema.parse(endpoint);
  const record: PendingCrossLinkSource = {
    ...checked,
    startedAtIso: new Date().toISOString(),
  };
  safeWriteSession(record);
  const ch = openChannel();
  if (ch) {
    try {
      ch.postMessage({ type: "set", payload: record } satisfies WireMessage);
    } finally {
      ch.close();
    }
  }
  return record;
}

export function clearPendingCrossLink(): void {
  safeWriteSession(null);
  const ch = openChannel();
  if (ch) {
    try {
      ch.postMessage({ type: "clear" } satisfies WireMessage);
    } finally {
      ch.close();
    }
  }
}

/**
 * Keeps the pending-portal dock synchronized across Electron / browser windows
 * using BroadcastChannel + per-tab sessionStorage.
 */
export function subscribePendingCrossLink(
  onChange: (next: PendingCrossLinkSource | null) => void,
): () => void {
  const ch = openChannel();
  if (!ch) return () => {};

  const onMessage = (event: MessageEvent<WireMessage>) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "set") {
      const parsed = pendingSourceSchema.safeParse(msg.payload);
      if (!parsed.success) return;
      safeWriteSession(parsed.data);
      onChange(parsed.data);
      return;
    }
    if (msg.type === "clear") {
      safeWriteSession(null);
      onChange(null);
      return;
    }
    if (msg.type === "hello") {
      const current = safeReadSession();
      if (current) {
        try {
          ch.postMessage({ type: "set", payload: current } satisfies WireMessage);
        } catch {
          // Ignore channel post errors.
        }
      }
    }
  };

  ch.addEventListener("message", onMessage);
  if (!safeReadSession()) {
    try {
      ch.postMessage({ type: "hello" } satisfies WireMessage);
    } catch {
      // Ignore initial sync probe failures.
    }
  }

  return () => {
    ch.removeEventListener("message", onMessage);
    ch.close();
  };
}
