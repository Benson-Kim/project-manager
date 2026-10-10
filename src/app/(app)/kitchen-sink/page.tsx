import { notFound } from "next/navigation";
import { RichTextView } from "@/components/ui/rich-text/rich-text-view";
import { KitchenSink } from "./kitchen-sink";
import { RichTextDemo } from "./rich-text-demo";
import {
  accessLegacySample,
  richTextDemoSample,
  richTextDemoSchema,
} from "./rich-text-demo-schema";

/**
 * Dev-only gallery exercising every shared primitive — the surface for the
 * foundation Playwright + axe suite. Excluded from production (404).
 */
export const metadata = { title: "Kitchen sink" };

export default async function KitchenSinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.E2E !== "1") {
    notFound();
  }
  // The rich-text demo submits here (GET): the shared schema sanitises on the server.
  const { richText } = await searchParams;
  const parsed =
    typeof richText === "string" ? richTextDemoSchema.safeParse({ richText }) : undefined;
  const saved = parsed?.success ? parsed.data.richText : null;

  return (
    <KitchenSink
      richText={
        <RichTextDemo
          defaultValue={saved ?? richTextDemoSample}
          preview={<RichTextView html={saved} testId="ks-rich-text-view" />}
          legacy={<RichTextView html={accessLegacySample} testId="ks-rich-text-legacy" />}
        />
      }
    />
  );
}
