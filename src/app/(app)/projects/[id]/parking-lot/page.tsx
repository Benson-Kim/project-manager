import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { auth } from "@/lib/auth/provider";
import { flattenSearchParams, parseListParams } from "@/lib/list-params";
import { messages } from "@/lib/messages";
import { getViewPreference } from "@/lib/repositories/view-preference";
import { orNotFound, orNull } from "@/lib/row-access";
import { getProjectPermissions } from "@/modules/projects/repository/project-access";
import { ParkingLotItemSheet } from "@/modules/parking-lot/components/parking-lot-item-sheet";
import { ParkingLotView } from "@/modules/parking-lot/components/parking-lot-view";
import {
  getParkingLotItemById,
  listParkingLotItems,
} from "@/modules/parking-lot/repository/parking-lot-items";
import { buildNewEntityHref, guardProjectScope } from "@/lib/project-page-helpers";
import { parseProjectId } from "../project-id";

export const metadata: Metadata = {
  title: `${messages.parkingLot.title} — ${messages.app.name}`,
};

/**
 * Parking lot list — project-scoped section under
 * /projects/[id]/parking-lot; DataView + search + status filter;
 * detail/edit in the URL-synced Sheet (?id=<n> | ?id=new, ADR-0010).
 * Default sort: ParkingLotItem asc.
 */
export default async function ParkingLotPage({
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
  const effectiveParams = listParams;

  const isNew = flat.id === "new";
  const selectedId = !isNew && flat.id ? Number(flat.id) : null;

  const isStrikethrough =
    flat.status === "resolved" ? true : flat.status === "active" ? false : null;

  const [rows, preferredView, selectedRaw, allows] = await Promise.all([
    orNotFound(
      listParkingLotItems(effectiveParams, session.userId, projectId, { isStrikethrough }),
    ),
    getViewPreference(session.userId, "parking-lot").catch(() => null),
    selectedId && Number.isInteger(selectedId) && selectedId > 0
      ? orNull(getParkingLotItemById(selectedId, session.userId))
      : null,
    getProjectPermissions(projectId, session.userId),
  ]);

  // Cross-project leak guard: deep links to another project's item yield not-found.
  const selected = guardProjectScope(selectedRaw, projectId);

  const totalCount = rows[0]?.TotalCount ?? 0;
  const canCreate = allows("parking-lot:create");
  const canEdit = allows("parking-lot:update");
  const canDelete = allows("parking-lot:delete");
  const filtersActive = Boolean(effectiveParams.q || flat.status);

  const newItemLink = (
    <Link
      href={buildNewEntityHref(`/projects/${projectId}/parking-lot`, flat)}
      data-testid="new-parking-lot-item"
      className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-raised"
    >
      {messages.parkingLot.newItem}
    </Link>
  );

  return (
    <>
      <PageHeader title={messages.parkingLot.title} action={canCreate ? newItemLink : undefined} />
      <div className="mt-3 flex flex-col flex-1">
        <ParkingLotView
          rows={rows}
          totalCount={totalCount}
          page={effectiveParams.page}
          initialView={effectiveParams.view ?? preferredView ?? "grid"}
          filtersActive={filtersActive}
          newItemAction={canCreate ? newItemLink : undefined}
        />
      </div>
      <ParkingLotItemSheet
        key={selected?.ParkingLotItemId ?? (isNew ? "new" : "closed")}
        item={selected}
        isNew={isNew && canCreate}
        projectId={projectId}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
