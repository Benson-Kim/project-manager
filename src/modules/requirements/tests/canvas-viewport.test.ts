import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH } from "../canvas/layout";
import {
  anyNodeInViewport,
  shouldShowBackToContent,
  type ViewportNode,
} from "../canvas/viewport-visibility";

const box = (x: number, y: number, over: Partial<ViewportNode> = {}): ViewportNode => ({
  position: { x, y },
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
  ...over,
});

const container = { width: 1000, height: 600 };

describe("canvas viewport visibility", () => {
  it("reports false on empty canvas without showing Back to content", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    expect(anyNodeInViewport([], viewport, container)).toBe(false);
    expect(shouldShowBackToContent([], viewport, container)).toBe(false);
  });

  it("detects visible nodes and shows Back to content when panned completely offscreen", () => {
    const nodes = [box(100, 100)];
    expect(anyNodeInViewport(nodes, { x: 0, y: 0, zoom: 1 }, container)).toBe(true);
    expect(shouldShowBackToContent(nodes, { x: 0, y: 0, zoom: 1 }, container)).toBe(false);

    const offLeft = { x: -400, y: 0, zoom: 1 };
    expect(anyNodeInViewport(nodes, offLeft, container)).toBe(false);
    expect(shouldShowBackToContent(nodes, offLeft, container)).toBe(true);

    const offRight = { x: 950, y: 0, zoom: 1 };
    expect(anyNodeInViewport(nodes, offRight, container)).toBe(false);
    expect(shouldShowBackToContent(nodes, offRight, container)).toBe(true);

    const offTop = { x: 0, y: -300, zoom: 1 };
    expect(anyNodeInViewport(nodes, offTop, container)).toBe(false);
    expect(shouldShowBackToContent(nodes, offTop, container)).toBe(true);

    const offBottom = { x: 0, y: 550, zoom: 1 };
    expect(anyNodeInViewport(nodes, offBottom, container)).toBe(false);
    expect(shouldShowBackToContent(nodes, offBottom, container)).toBe(true);
  });

  it("detects 1px partial overlaps and treats edge-touching as outside", () => {
    const nodes = [box(0, 0)];
    expect(anyNodeInViewport(nodes, { x: -NODE_WIDTH + 1, y: 0, zoom: 1 }, container)).toBe(true);
    expect(anyNodeInViewport(nodes, { x: -NODE_WIDTH, y: 0, zoom: 1 }, container)).toBe(false);
    expect(anyNodeInViewport(nodes, { x: container.width - 1, y: 0, zoom: 1 }, container)).toBe(
      true,
    );
    expect(anyNodeInViewport(nodes, { x: container.width, y: 0, zoom: 1 }, container)).toBe(false);
    expect(anyNodeInViewport(nodes, { x: 0, y: -NODE_HEIGHT + 1, zoom: 1 }, container)).toBe(true);
    expect(anyNodeInViewport(nodes, { x: 0, y: -NODE_HEIGHT, zoom: 1 }, container)).toBe(false);
    expect(anyNodeInViewport(nodes, { x: 0, y: container.height - 1, zoom: 1 }, container)).toBe(
      true,
    );
    expect(anyNodeInViewport(nodes, { x: 0, y: container.height, zoom: 1 }, container)).toBe(false);
  });

  it("accounts for zoom when transforming ReactFlow coordinates", () => {
    const nodes = [box(1500, 0)];
    expect(shouldShowBackToContent(nodes, { x: 0, y: 0, zoom: 1 }, container)).toBe(true);
    expect(shouldShowBackToContent(nodes, { x: 0, y: 0, zoom: 0.5 }, container)).toBe(false);
    expect(shouldShowBackToContent(nodes, { x: -2000, y: 0, zoom: 2 }, container)).toBe(true);
    expect(shouldShowBackToContent(nodes, { x: -2500, y: 0, zoom: 2 }, container)).toBe(false);
  });

  it("prefers measured dimensions and ignores hidden nodes", () => {
    const wide = box(0, 0, { measured: { width: 400, height: 200 } });
    expect(anyNodeInViewport([wide], { x: -350, y: 0, zoom: 1 }, container)).toBe(true);

    const hiddenInView = box(50, 50, { hidden: true });
    const visibleOffscreen = box(3000, 3000);
    expect(
      anyNodeInViewport([hiddenInView, visibleOffscreen], { x: 0, y: 0, zoom: 1 }, container),
    ).toBe(false);
    expect(
      shouldShowBackToContent([hiddenInView, visibleOffscreen], { x: 0, y: 0, zoom: 1 }, container),
    ).toBe(true);
    expect(shouldShowBackToContent([hiddenInView], { x: 0, y: 0, zoom: 1 }, container)).toBe(false);
  });

  it("guards against zero-sized containers, invalid zoom, and NaN coordinates", () => {
    const nodes = [box(50, 50)];
    expect(shouldShowBackToContent(nodes, { x: 0, y: 0, zoom: 1 }, { width: 0, height: 600 })).toBe(
      false,
    );
    expect(shouldShowBackToContent(nodes, { x: 0, y: 0, zoom: 0 }, container)).toBe(false);
    expect(shouldShowBackToContent(nodes, { x: Number.NaN, y: 0, zoom: 1 }, container)).toBe(false);
    expect(shouldShowBackToContent([box(Number.NaN, 10)], { x: 0, y: 0, zoom: 1 }, container)).toBe(
      false,
    );
  });
});
