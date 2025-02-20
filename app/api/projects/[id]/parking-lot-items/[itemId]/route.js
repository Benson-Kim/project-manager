// app/api/projects/[id]/parking-lot-items/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateParkingLotItem } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  getHandler,
  updateHandler,
  deleteHandler,
} = createModuleApiHandlers({
  modelName: "ParkingLotItem",
  resourceType: ResourceTypes.PARKING_LOT_ITEM,
  validateData: validateParkingLotItem,
  
  
  
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;