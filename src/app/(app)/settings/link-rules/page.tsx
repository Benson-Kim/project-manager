import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { LinkRulesMatrix } from "@/modules/requirements/components/link-rules-matrix";
import { listLinkRules } from "@/modules/requirements/repository/requirements";

const L = messages.settings.linkRules;

export const metadata: Metadata = { title: `${L.title} — ${messages.app.name}` };

/**
 * Settings > Link rules, Admin only. notFound() for a User keeps the page out of reach, and the
 * action and usp_RequirementLinkRule_Set both refuse a non-Admin too.
 */
export default async function LinkRulesPage() {
  const session = await auth.requireSession();
  if (session.role !== "Admin") notFound();
  const rules = await listLinkRules(session.userId);

  return (
    <>
      <PageHeader title={L.title} />
      <p className="mb-4 max-w-2xl text-sm text-ink-muted">{L.intro}</p>
      <LinkRulesMatrix rules={rules} />
    </>
  );
}
