import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { messages } from "@/lib/messages";
import { auth } from "@/lib/auth/provider";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";

import { PageHeader } from "@/components/ui/page-header";
import { SupplierSheet } from "@/modules/suppliers/components/supplier-sheet";
import { SuppliersView } from "@/modules/suppliers/components/suppliers-view";
import { getSupplierById, listSuppliers } from "@/modules/suppliers/repository/suppliers";
import { supplierFiltersSchema } from "@/modules/suppliers/schemas/supplier";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.suppliers.title} — ${messages.app.name}`,
};

/**
 * Suppliers list (module #7): project-scoped section under
 * /projects/[id]/suppliers ; DataView + search, detail/edit in the
 * URL-synced Sheet (?id=<n> | ?id=new, ADR-0010). Default sort: earliest
 * contract end first (requirements row 74 — contract-end visibility).
 */
export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.requireSession();
  const { id } = await params;
  const projectId = parseProjectId(id);
  if (projectId === null) notFound();

  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const listParams = parseListParams(raw);
  const effectiveParams = {
    ...listParams,
    sort: listParams.sort ?? "ContractEndDate",
  };

  const filtersParsed = supplierFiltersSchema.safeParse(flat);
  const filters = filtersParsed.success ? filtersParsed.data : {};

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const [rows, preferredView, selectedRaw, allows] = await Promise.all([
    orNotFound(listSuppliers(effectiveParams, session.userId, projectId, filters)),
    getViewPreference(session.userId, "suppliers").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getSupplierById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
  ]);

  // A deep link to a supplier from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("suppliers:create");
  const canEdit = allows("suppliers:update");
  const canDelete = allows("suppliers:delete");
  const filtersActive = Boolean(effectiveParams.q || filters.rating);

  const newHref = buildNewEntityHref(`/projects/${projectId}/suppliers`, flat);
  // Toolbar link carries the testid used by Playwright; the empty-state copy
  // intentionally omits it to avoid a strict-mode violation (two identical
  // testids when the list is empty and both render simultaneously).
  const newSupplierToolbarLink = (
    <Link
      href={newHref}
      data-testid="new-supplier"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.suppliers.newSupplier}
    </Link>
  );
  const newSupplierEmptyLink = (
    <Link
      href={newHref}
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.suppliers.newSupplier}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.suppliers.title}
        action={canCreate ? newSupplierToolbarLink : undefined}
      />
      <div className="mt-3 flex flex-col flex-1">
        <SuppliersView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newSupplierAction={canCreate ? newSupplierEmptyLink : undefined}
        />
      </div>
      <SupplierSheet
        supplier={selected}
        isNew={isNew && canCreate}
        projectId={projectId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
