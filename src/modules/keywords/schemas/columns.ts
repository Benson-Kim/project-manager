import { columnSchemaFor } from "@/lib/custom-columns/register";
import { messages } from "@/lib/messages";

const M = messages.keywords;

export const KEYWORD_BUILT_IN_COLUMNS = [
  { key: "Keyword", name: M.keyword },
  { key: "Definition", name: M.definition },
  { key: "CreatedAtUtc", name: M.addedAt },
] as const;

export const keywordColumnSchema = columnSchemaFor("Keyword");
