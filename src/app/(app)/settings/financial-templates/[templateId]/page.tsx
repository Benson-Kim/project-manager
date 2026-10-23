import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNull } from "@/lib/row-access";
import { TemplateEditor } from "@/modules/financials/components/template-editor";
import { getTemplate } from "@/modules/financials/repository/templates";

const T = messages.financials.templates;

export const metadata: Metadata = { title: `${T.title} — ${messages.app.name}` };

const templateIdSchema = z.coerce.number().int().positive();

/** One master template, or a new one (`new`, Admins only). Non-admins read it. */
export default async function FinancialTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const session = await auth.requireSession();
  const { templateId } = await params;
  const isAdmin = session.role === "Admin";

  let template = null;
  if (templateId === "new") {
    if (!isAdmin) notFound();
  } else {
    const parsed = templateIdSchema.safeParse(templateId);
    if (!parsed.success) notFound();
    template = await orNull(getTemplate(parsed.data, session.userId));
    if (!template) notFound();
  }

  return (
    <>
      <Link
        href="/settings/financial-templates"
        className="mt-2 inline-flex min-h-10 items-center text-sm text-accent"
      >
        {T.title}
      </Link>
      <PageHeader title={template?.name ?? T.newTemplate} />
      <TemplateEditor
        key={template ? `${template.id}:${template.rowVer}` : "new"}
        template={template}
        canEdit={isAdmin}
      />
    </>
  );
}
