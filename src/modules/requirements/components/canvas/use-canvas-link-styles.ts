"use client";

import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { notifySaved } from "@/lib/cross-window";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { setCanvasLinkStyleAction } from "../../actions";
import { itemKey } from "../../canvas/gaps";
import { carriesLook, lookOf, withLook, type LinkLook } from "../../canvas/link-layout";
import type { CanvasLink } from "../../schemas/canvas";
import type { Remember } from "./use-canvas-undo";

const keyOf = (link: CanvasLink) => `${link.UpstreamKind}:${link.UpstreamId}>${link.DownstreamId}`;

type Overlay = { from: readonly CanvasLink[]; looks: ReadonlyMap<string, LinkLook> };

const unsaved = (links: readonly CanvasLink[], looks: ReadonlyMap<string, LinkLook>) => {
  const next = new Map(looks);
  for (const link of links) {
    const look = next.get(keyOf(link));
    if (look && carriesLook(link, look)) next.delete(keyOf(link));
  }
  return next;
};

/**
 * A new look shows at once and saves in the background, in order per link, so the last one wins.
 * A shown look gives way once a read of the links carries it, so a read that lands while later
 * looks are still saving does not bring an older look back.
 */
export function useCanvasLinkStyles(
  canvasId: number,
  links: readonly CanvasLink[],
  remember: Remember,
) {
  const { toast } = useToast();
  const [overlay, setOverlay] = useState<Overlay>({ from: links, looks: new Map() });
  const queue = useRef(new Map<string, Promise<void>>());
  let looks = overlay.looks;
  if (overlay.from !== links) {
    looks = unsaved(links, overlay.looks);
    setOverlay({ from: links, looks });
  }

  const styled = useMemo(
    () =>
      looks.size
        ? links.map((link) => {
            const look = looks.get(keyOf(link));
            return look ? withLook(link, look) : link;
          })
        : links,
    [links, looks],
  );

  const show = (key: string, look: LinkLook | null) =>
    setOverlay((current) => {
      const next = new Map(current.looks);
      if (look) next.set(key, look);
      else next.delete(key);
      return { from: current.from, looks: next };
    });

  const save = async (link: CanvasLink, look: LinkLook, forget: () => void) => {
    const result = await setCanvasLinkStyleAction({
      canvasId,
      upstreamKind: link.UpstreamKind,
      upstreamId: link.UpstreamId,
      downstreamId: link.DownstreamId,
      style: look.style,
      branchFromId: look.branchFromId,
      branchAt: look.branchAt,
    });
    if (result.ok) {
      notifySaved();
      return;
    }
    forget();
    show(keyOf(link), null);
    toast({ variant: "error", title: firstError(result.error) });
  };

  const setLook = (link: CanvasLink, look: LinkLook, undoable = true) => {
    const key = keyOf(link);
    const forget = remember(
      undoable
        ? {
            kind: "style",
            upKey: itemKey(link.UpstreamKind, link.UpstreamId),
            downId: link.DownstreamId,
            before: lookOf(link),
          }
        : null,
    );
    show(key, look);
    const next = (queue.current.get(key) ?? Promise.resolve()).then(() => save(link, look, forget));
    queue.current.set(key, next);
    return next;
  };

  return { links: styled, setLook };
}
