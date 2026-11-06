"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import {
  allocateRequirementAction,
  createRequirementLinkAction,
  deleteRequirementLinkAction,
  unallocateRequirementAction,
} from "../../actions";
import type { ItemConnection } from "../../canvas/board-model";
import { oneAtATime } from "../../canvas/one-at-a-time";
import type { CanvasItem, CanvasLink } from "../../schemas/canvas";

const linkKey = (upKind: CanvasItem["Kind"], upId: number, downId: number) =>
  `${upKind}:${upId}>${downId}`;

/**
 * A link saves on the server and comes back with the page's next read, so none is drawn early.
 * One request per link at a time: a second click while the first is saving sends nothing.
 */
export function useCanvasLinks() {
  const { toast } = useToast();
  const [run] = useState(oneAtATime);

  const send = (key: string, request: () => Promise<ActionResult<unknown>>) =>
    run(key, async () => {
      const result = await request();
      if (!result.ok) toast({ variant: "error", title: firstError(result.error) });
    });

  const connect = ({ up, down }: ItemConnection) =>
    send(linkKey(up.Kind, up.ItemId, down.ItemId), () =>
      up.Kind === "Wbs"
        ? allocateRequirementAction({ requirementId: down.ItemId, keyDeliverableId: up.ItemId })
        : createRequirementLinkAction({
            requirementId: down.ItemId,
            upstreamRequirementId: up.ItemId,
          }),
    );

  /** Sends the link's RowVer, so a link changed since the page read comes back as a conflict. */
  const disconnect = (link: CanvasLink) =>
    send(linkKey(link.UpstreamKind, link.UpstreamId, link.DownstreamId), () =>
      link.UpstreamKind === "Wbs"
        ? unallocateRequirementAction({
            requirementId: link.DownstreamId,
            keyDeliverableId: link.UpstreamId,
            rowVer: link.RowVer,
          })
        : deleteRequirementLinkAction({
            requirementId: link.DownstreamId,
            upstreamRequirementId: link.UpstreamId,
            rowVer: link.RowVer,
          }),
    );

  return { connect, disconnect };
}
