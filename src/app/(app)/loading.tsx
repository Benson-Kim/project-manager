import { ListSkeleton } from "@/components/ui/states";

/** Template loading state — every module route segment ships one like it. */
export default function Loading() {
  return (
    <div className="py-4">
      <ListSkeleton />
    </div>
  );
}
