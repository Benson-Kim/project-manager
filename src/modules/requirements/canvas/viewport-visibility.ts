import type { Viewport } from "@xyflow/react";
import { resolvedNodeSize, type NodeBox } from "./board-model";

export type ViewportNode = NodeBox;

export interface ViewportSize {
  width: number;
  height: number;
}

function hasValidViewport(viewport: Viewport, container: ViewportSize): boolean {
  return (
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom > 0 &&
    Number.isFinite(container.width) &&
    Number.isFinite(container.height) &&
    container.width > 0 &&
    container.height > 0
  );
}

/**
 * True when at least one non-hidden node strictly intersects the viewport in ReactFlow coordinates.
 * Computes from node positions and dimensions rather than DOM bounding boxes so ReactFlow's
 * `onlyRenderVisibleElements` culling never hides off-screen cards.
 */
export function anyNodeInViewport(
  nodes: readonly ViewportNode[],
  viewport: Viewport,
  container: ViewportSize,
): boolean {
  if (!hasValidViewport(viewport, container)) return false;
  const viewLeft = -viewport.x / viewport.zoom;
  const viewTop = -viewport.y / viewport.zoom;
  const viewRight = (container.width - viewport.x) / viewport.zoom;
  const viewBottom = (container.height - viewport.y) / viewport.zoom;
  const finiteBounds =
    Number.isFinite(viewLeft) &&
    Number.isFinite(viewTop) &&
    Number.isFinite(viewRight) &&
    Number.isFinite(viewBottom);

  for (const node of nodes) {
    if (node.hidden) continue;
    const { x, y } = node.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const { width, height } = resolvedNodeSize(node);
    if (finiteBounds) {
      if (x < viewRight && x + width > viewLeft && y < viewBottom && y + height > viewTop) {
        return true;
      }
      continue;
    }
    const left = x * viewport.zoom + viewport.x;
    const top = y * viewport.zoom + viewport.y;
    const right = (x + width) * viewport.zoom + viewport.x;
    const bottom = (y + height) * viewport.zoom + viewport.y;
    if (left < container.width && right > 0 && top < container.height && bottom > 0) {
      return true;
    }
  }
  return false;
}

/** True when visible nodes exist on the board and none of them intersect the viewport. */
export function shouldShowBackToContent(
  nodes: readonly ViewportNode[],
  viewport: Viewport,
  container: ViewportSize,
): boolean {
  if (!hasValidViewport(viewport, container)) return false;
  const hasVisibleNode = nodes.some(
    (node) => !node.hidden && Number.isFinite(node.position.x) && Number.isFinite(node.position.y),
  );
  if (!hasVisibleNode) return false;
  return !anyNodeInViewport(nodes, viewport, container);
}
