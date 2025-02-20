// app/api/projects/[id]/financials/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateFinancial } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "Financial",
  resourceType: ResourceTypes.FINANCIAL,
  validateData: validateFinancial,
  
  
  
});

export const GET = listHandler;
export const POST = createHandler;