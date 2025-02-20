// app/api/projects/[id]/suppliers/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateSupplier } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  getHandler,
  updateHandler,
  deleteHandler,
} = createModuleApiHandlers({
  modelName: "Supplier",
  resourceType: ResourceTypes.SUPPLIER,
  validateData: validateSupplier,
  
  
  
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;