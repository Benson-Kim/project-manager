import type { Metadata } from "next";
import { messages } from "@/lib/messages";
import { FinancialView } from "../financial-view";

export const metadata: Metadata = {
  title: `${messages.financials.settings} · ${messages.financials.title} — ${messages.app.name}`,
};

export default function FinancialSettingsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FinancialView tab="settings" {...props} />;
}
