import { z } from "zod";
import { formText, type FormValues } from "@/components/ui/data-view/datasheet";
import { listChoice } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import type { ParkingLotItemRow } from "./parking-lot-item";

/**
 * ParkingLot form contract — ONE schema shared by the client Sheet form
 * (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for optional fields.
 */

export const parkingLotItemFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  parkingLotItem: z.string().trim().min(1, messages.parkingLot.itemRequired).max(255),
  stakeholderId: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  /** Managed list (ADR-0022): the proc checks the value against the live options. */
  status: listChoice,
  followUpActions: z.preprocess(
    (v) => (v === "" || v == null ? null : String(v).trim()),
    z.string().max(4000).nullable(),
  ),
  owner: z.preprocess(
    (v) => (v === "" || v == null ? null : String(v).trim()),
    z.string().max(255).nullable(),
  ),
});

export type ParkingLotItemFormValues = z.output<typeof parkingLotItemFormSchema>;

export const updateParkingLotItemFormSchema = parkingLotItemFormSchema.extend({
  parkingLotItemId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateParkingLotItemFormValues = z.output<typeof updateParkingLotItemFormSchema>;

/** An item as the update form's values — what a datasheet cell edit sends (ADR-0023). */
export function parkingLotItemFormValues(row: ParkingLotItemRow): FormValues {
  return {
    parkingLotItemId: String(row.ParkingLotItemId),
    rowVer: String(row.RowVer),
    projectId: String(row.ProjectId),
    parkingLotItem: formText(row.ParkingLotItem),
    stakeholderId: formText(row.StakeholderId),
    status: formText(row.Status),
    followUpActions: formText(row.FollowUpActions),
    owner: formText(row.Owner),
  };
}
