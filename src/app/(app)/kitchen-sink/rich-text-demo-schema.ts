import { z } from "zod";
import { richTextSchema } from "@/lib/rich-text/schema";

/**
 * Kitchen-sink rich-text form (ADR-0025): the same schema validates in the
 * browser and, after the GET submit, sanitises on the server page.
 */
export const richTextDemoSchema = z.object({
  richText: richTextSchema({ max: 4000, required: "Enter some text" }),
});

/** Starting content: one of each mark the toolbar makes. */
export const richTextDemoSample =
  "<h2>Meeting notes</h2><p>Plain, <strong>bold</strong>, <em>italic</em>, <u>underlined</u> " +
  'and <s>struck</s> text in <span style="font-family: Cambria; font-size: 14pt">Cambria 14</span>.</p>' +
  "<ul><li><p>First point</p></li><li><p>Second point</p></li></ul>";

/** Seeded Access HTML (db/seed/018_it_resource_item.sql, item 10): legacy markup to convert. */
export const accessLegacySample =
  '<div>T<u>his </u>field support <strong>rich </strong>text <font\r\nface="Arial Rounded MT Bold" size=5><em>editing</em></font></div>';
