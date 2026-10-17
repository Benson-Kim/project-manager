import type { Metadata } from "next";
import { messages } from "@/lib/messages";
import { FinancialView } from "../financial-view";

export const metadata: Metadata = {
  title: `${messages.financials.documentsTab} · ${messages.financials.title} — ${messages.app.name}`,
};

export default function FinancialDocumentsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FinancialView tab="documents" {...props} />;
}
