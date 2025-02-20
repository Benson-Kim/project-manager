// app/api/projects/[id]/projects/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateProject } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  getHandler,
  updateHandler,
  deleteHandler,
} = createModuleApiHandlers({
  modelName: "Project",
  resourceType: ResourceTypes.PROJECT,
  validateData: validateProject,
  
  
  
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;