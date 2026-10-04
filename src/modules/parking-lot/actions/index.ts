"use server";

import { action } from "@/lib/action";
import {
  createParkingLotItem,
  deleteParkingLotItem,
  updateParkingLotItem,
} from "../repository/parking-lot-items";
import { parkingLotItemFormSchema, updateParkingLotItemFormSchema } from "../schemas/parking-lot-item-form";
import { deleteParkingLotItemInput } from "../schemas/parking-lot-item";

/**
 * Create a parking lot item (RBAC parking-lot:create — Admin + PM + Contributor;
 * audited in-proc). Contributor can create per CONTRIBUTOR_WRITE_MODULES.
 */
export const createParkingLotItemAction = action({
  name: "parking-lot.create",
  schema: parkingLotItemFormSchema,
  permission: "parking-lot:create",
  handler: (input, ctx) =>
    createParkingLotItem(input, ctx.session.userId, ctx.session.role),
});

/**
 * Update a parking lot item (RBAC parking-lot:update — Admin + PM + Contributor;
 * audited in-proc).
 */
export const updateParkingLotItemAction = action({
  name: "parking-lot.update",
  schema: updateParkingLotItemFormSchema,
  permission: "parking-lot:update",
  handler: (input, ctx) =>
    updateParkingLotItem(input, ctx.session.userId, ctx.session.role),
});

/**
 * Soft-delete a parking lot item (RBAC parking-lot:delete — Admin + PM only;
 * audited in-proc).
 */
export const deleteParkingLotItemAction = action({
  name: "parking-lot.delete",
  schema: deleteParkingLotItemInput,
  permission: "parking-lot:delete",
  handler: async (input, ctx) => {
    await deleteParkingLotItem(
      input.parkingLotItemId,
      input.rowVer,
      ctx.session.userId,
      ctx.session.role,
    );
    return { parkingLotItemId: input.parkingLotItemId };
  },
});
