import { Skeleton } from "@/components/ui/states";
import { messages } from "@/lib/messages";

/** Workspace segment skeleton: breadcrumb, name, section nav, content. */
export default function ProjectWorkspaceLoading() {
  return (
    <output aria-label={messages.app.loading} className="flex w-full flex-col gap-3 pt-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-96 w-full" />
    </output>
  );
}
