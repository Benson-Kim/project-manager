const CHANNEL = "pm-changes";

let channel: BroadcastChannel | null = null;

function sharedChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL);
  return channel;
}

/**
 * Tells the app's other windows that this one saved, so they reload their data. One channel
 * object sends and listens, and a channel never hears its own message, so a window never
 * reloads for its own save.
 */
export function notifySaved() {
  sharedChannel()?.postMessage("saved");
}

/** Calls listener whenever another window of the app saves; returns the unsubscribe. */
export function onOtherWindowSaved(listener: () => void): () => void {
  const listen = sharedChannel();
  if (!listen) return () => undefined;
  listen.addEventListener("message", listener);
  return () => listen.removeEventListener("message", listener);
}
