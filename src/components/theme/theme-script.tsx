"use client";

import { useSyncExternalStore } from "react";
import { sidebarInitScript } from "@/components/shell/sidebar-state";
import { themeInitScript } from "./theme-provider";

const subscribe = () => () => {};

/** Everything html needs before first paint: the theme, then the sidebar's state. */
export const prePaintScript = themeInitScript + sidebarInitScript;

/**
 * The pre-paint theme script, rendered only into the server HTML: the browser
 * runs it while parsing, before first paint, and React drops it after
 * hydration. A client-side render (Next.js falls back to one when the server
 * shell fails) renders nothing, because React never executes a script it
 * creates and warns when asked to; ThemeProvider applies the theme on mount
 * instead (and useSidebar does the same for the sidebar).
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const server = useSyncExternalStore(
    subscribe,
    () => false,
    () => true,
  );
  if (!server) return null;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: prePaintScript }} />;
}
