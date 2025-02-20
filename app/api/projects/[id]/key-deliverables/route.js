// app/api/projects/[id]/key-deliverables/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateKeyDeliverable } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "KeyDeliverable",
  resourceType: ResourceTypes.KEY_DELIVERABLE,
  validateData: validateKeyDeliverable,
  
  
  
});

export const GET = listHandler;
export const POST = createHandler;