"use client";

import { diagramToBpmnXml } from "../model/bpmn-xml";
import type { BpmnDiagram } from "../model/diagram";
import { diagramSvg } from "../model/svg";

/** Largest PNG side in pixels: twice the diagram's size, unless that would pass this. */
const PNG_MAX_SIDE = 8000;

export const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** A diagram name made safe as a file name on Windows. */
export function fileName(name: string): string {
  const printable = [...name].filter((ch) => ch >= " ").join("");
  return (
    printable
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim()
      .slice(0, 100) || "diagram"
  );
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPng(diagram: BpmnDiagram, name: string): Promise<void> {
  const { svg, width, height } = diagramSvg(diagram);
  const scale = Math.min(2, PNG_MAX_SIDE / Math.max(width, height));
  const image = new Image();
  image.src = svgDataUrl(svg);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob) saveBlob(blob, `${fileName(name)}.png`);
}

export function downloadBpmnXml(diagram: BpmnDiagram, name: string): void {
  const xml = diagramToBpmnXml(diagram, name);
  saveBlob(new Blob([xml], { type: "application/xml" }), `${fileName(name)}.bpmn`);
}
