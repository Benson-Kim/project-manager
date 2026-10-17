import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/provider";
import { messages } from "@/lib/messages";
import { orNotFound } from "@/lib/row-access";
import { financialReport } from "@/modules/financials/calc/report";
import { PrintButton } from "@/modules/financials/components/print-button";
import { getFinancialSheet } from "@/modules/financials/repository/financials";
import { parseProjectId } from "../../../project-id";

const M = messages.financials;
const idSchema = z.coerce.number().int().positive();

/** The browser's "Save as PDF" names the file after the title, so it carries the financial's. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; financialId: string }>;
}): Promise<Metadata> {
  const session = await auth.requireSession();
  const { id, financialId } = await params;
  const sheetId = idSchema.safeParse(financialId);
  if (parseProjectId(id) === null || !sheetId.success) return { title: M.print };
  try {
    const sheet = await getFinancialSheet(sheetId.data, session.userId);
    if (sheet.financial.projectId !== parseProjectId(id)) return { title: M.print };
    return { title: M.printTitle(sheet.financial.title || messages.app.untitled) };
  } catch {
    return { title: M.print };
  }
}

/**
 * The printable financial record (ADR-0030; the rptFinancials equivalent): the
 * breakdown, the budget summary, the monitoring per line and the document
 * checklist with its files, from the same report model as the PDF. The print
 * stylesheet hides the app chrome; "Print" uses the browser's print dialog
 * (save as PDF there too), which also works in the desktop edition.
 */
export default async function FinancialPrintPage({
  params,
}: {
  params: Promise<{ id: string; financialId: string }>;
}) {
  const session = await auth.requireSession();
  const { id, financialId } = await params;
  const projectId = parseProjectId(id);
  const sheetId = idSchema.safeParse(financialId);
  if (projectId === null || !sheetId.success) notFound();

  const sheet = await orNotFound(getFinancialSheet(sheetId.data, session.userId));
  if (sheet.financial.projectId !== projectId) notFound();
  const report = financialReport(sheet);
  const D = M.documents;
  const s = report.documentSummary;
  const base = `/projects/${projectId}/financials/${sheet.financial.id}`;

  return (
    <article className="flex flex-col gap-6 py-4" data-testid="financial-print">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href={base}
          className="inline-flex min-h-10 items-center text-sm text-accent underline"
        >
          {report.title}
        </Link>
        <PrintButton />
        <a
          href={`${base}/pdf`}
          className="inline-flex min-h-10 items-center text-sm text-accent underline"
        >
          {M.downloadPdf}
        </a>
      </div>
      <header>
        <h1 className="text-2xl font-semibold text-ink">{M.printTitle(report.title)}</h1>
        <p className="text-sm text-ink-muted">{report.period}</p>
      </header>

      <section aria-labelledby="print-breakdown">
        <h2 id="print-breakdown" className="mb-2 text-lg font-semibold text-ink">
          {M.breakdown}
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          {report.fields.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {report.tables.map((table, t) => (
        <section key={table.heading} aria-labelledby={`print-table-${t}`}>
          <h2 id={`print-table-${t}`} className="mb-2 text-lg font-semibold text-ink">
            {table.heading}
          </h2>
          {table.rows.length === 0 ? (
            <p className="text-sm text-ink-muted">{D.none}</p>
          ) : (
            <div
              className="relative overflow-x-auto rounded-md border border-line print:overflow-visible"
              tabIndex={0}
              role="region"
              aria-label={table.heading}
            >
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-raised">
                    {table.columns.map((c, i) => (
                      <th
                        key={c}
                        scope="col"
                        className={`px-2 py-1 font-medium ${table.numeric.includes(i) ? "text-right" : "text-left"}`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, r) => (
                    <tr
                      key={r}
                      className={`border-b border-line ${table.strong.includes(r) ? "font-semibold" : ""}`}
                    >
                      {row.map((cell, i) =>
                        i === 0 ? (
                          <th key={i} scope="row" className="px-2 py-1 text-left font-normal">
                            {cell}
                          </th>
                        ) : (
                          <td
                            key={i}
                            className={`px-2 py-1 ${table.numeric.includes(i) ? "text-right tabular-nums whitespace-nowrap" : ""}`}
                          >
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <section aria-labelledby="print-documents">
        <h2 id="print-documents" className="mb-1 text-lg font-semibold text-ink">
          {D.heading}
        </h2>
        <p className="mb-2 text-sm text-ink">
          {D.summary(s.required, s.requiredWithFile, s.undecided)}
        </p>
        {report.documents.length === 0 ? (
          <p className="text-sm text-ink-muted">{D.empty}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {report.documents.map((d) => (
              <li
                key={d.name}
                className="break-inside-avoid rounded-md border border-line p-2 text-sm"
              >
                <p className="font-medium text-ink">
                  {d.name} · <span className="font-normal">{d.required}</span>
                </p>
                {d.reason ? (
                  <p className="whitespace-pre-wrap break-words text-ink">
                    <span className="text-ink-muted">{D.reason}: </span>
                    {d.reason}
                  </p>
                ) : null}
                {d.suggestion ? (
                  <p className="break-words text-ink-muted">
                    {D.suggestion}: {d.suggestion}
                  </p>
                ) : null}
                {d.files.length > 0 ? (
                  <p className="break-words text-ink-muted">
                    {D.files}: {d.files.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
