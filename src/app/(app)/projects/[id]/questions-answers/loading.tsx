import { Skeleton } from "@/components/ui/states";
import { messages } from "@/lib/messages";

/** Q&A list segment skeleton while the page streamed data loads. */
export default function QuestionsAnswersLoading() {
  return (
    <output aria-label={messages.app.loading} className="flex w-full flex-col gap-3 pt-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-96 w-full" />
    </output>
  );
}
