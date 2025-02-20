// app/api/projects/[id]/assumption-constraints/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateAssumptionConstraint } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "AssumptionConstraint",
  resourceType: ResourceTypes.ASSUMPTION_CONSTRAINT,
  validateData: validateAssumptionConstraint,
  
  
  
});

export const GET = listHandler;
export const POST = createHandler;