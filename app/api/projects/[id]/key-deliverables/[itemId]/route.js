// app/api/projects/[id]/key-deliverables/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateKeyDeliverable } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  getHandler,
  updateHandler,
  deleteHandler,
} = createModuleApiHandlers({
  modelName: "KeyDeliverable",
  resourceType: ResourceTypes.KEY_DELIVERABLE,
  validateData: validateKeyDeliverable,
  
  
  
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;