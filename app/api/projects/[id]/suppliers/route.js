// app/api/projects/[id]/suppliers/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateSupplier } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "Supplier",
  resourceType: ResourceTypes.SUPPLIER,
  validateData: validateSupplier,
  
  
  
});

export const GET = listHandler;
export const POST = createHandler;