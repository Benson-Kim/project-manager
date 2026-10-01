import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * ParkingLot form contract — ONE schema shared by the client Sheet form
 * (blur + submit validation over FormData strings) and the server actions.
 * FormData values are strings — "" → null for optional fields;
 * checkbox "on"/absent → boolean.
 */

export const parkingLotItemFormSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  parkingLotItem: z
    .string()
    .trim()
    .min(1, messages.parkingLot.itemRequired)
    .max(255),
  stakeholderId: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.number().int().positive().nullable(),
    ),
  isStrikethrough: z.preprocess(
    (v) => v === "on" || v === true || v === "true",
    z.boolean(),
  ),
});

export type ParkingLotItemFormValues = z.output<typeof parkingLotItemFormSchema>;

export const updateParkingLotItemFormSchema = parkingLotItemFormSchema.extend({
  parkingLotItemId: z.coerce.number().int().positive(),
  rowVer: z.coerce.number().int().nonnegative(),
});

export type UpdateParkingLotItemFormValues = z.output<typeof updateParkingLotItemFormSchema>;
