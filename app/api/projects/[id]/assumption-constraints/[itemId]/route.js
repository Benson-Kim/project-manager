// app/api/projects/[id]/assumption-constraints/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateAssumptionConstraint } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  getHandler,
  updateHandler,
  deleteHandler,
} = createModuleApiHandlers({
  modelName: "AssumptionConstraint",
  resourceType: ResourceTypes.ASSUMPTION_CONSTRAINT,
  validateData: validateAssumptionConstraint,
  
  
  
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;