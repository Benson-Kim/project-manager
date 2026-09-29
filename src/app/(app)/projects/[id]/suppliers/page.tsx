import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { can } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { SupplierSheet } from "@/modules/suppliers/components/supplier-sheet";
import { SuppliersView } from "@/modules/suppliers/components/suppliers-view";
import { getSupplierById, listSuppliers } from "@/modules/suppliers/repository/suppliers";
import { supplierFiltersSchema } from "@/modules/suppliers/schemas/supplier";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
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

  const [rows, preferredView, selectedRaw] = await Promise.all([
    listSuppliers(effectiveParams, session.userId, projectId, filters),
    getViewPreference(session.userId, "suppliers").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? getSupplierById(selectedId, session.userId).catch((err) => {
          if (err instanceof AppError && err.code === "NOT_FOUND") return null;
          throw err;
        })
      : Promise.resolve(null),
  ]);

  // A deep link to a supplier from another project is treated as not found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = can(session.role, "suppliers:create");
  const canEdit = can(session.role, "suppliers:update");
  const canDelete = can(session.role, "suppliers:delete");
  const filtersActive = Boolean(effectiveParams.q || filters.rating);

  const newSupplierLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/suppliers`, flat)}
      data-testid="new-supplier"
      className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent"
    >
      {messages.suppliers.newSupplier}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={messages.suppliers.title}
        action={canCreate ? newSupplierLink : undefined}
      />
      <div className="mt-3 flex flex-col flex-1">
        <SuppliersView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newSupplierAction={canCreate ? newSupplierLink : undefined}
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
