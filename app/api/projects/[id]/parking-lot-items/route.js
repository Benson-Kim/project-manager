// app/api/projects/[id]/parking-lot-items/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateParkingLotItem } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "ParkingLotItem",
  resourceType: ResourceTypes.PARKING_LOT_ITEM,
  validateData: validateParkingLotItem,
  
  
  
});

export const GET = listHandler;
export const POST = createHandler;