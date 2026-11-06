import Link from "next/link";
import { messages } from "@/lib/messages";

/** The way in from the register, the deliverables list and WBS and Gantt. */
export function CanvasLink({ projectId }: { projectId: number }) {
  return (
    <Link
      href={`/projects/${projectId}/deliverables/canvas`}
      data-testid="canvas-link"
      className="inline-flex min-h-10 items-center rounded-md border border-line px-6 text-sm font-medium text-ink"
    >
      {messages.requirements.canvas.link}
    </Link>
  );
}
