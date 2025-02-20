// app/api/projects/[id]/projects/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateProject } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "Project",
  resourceType: ResourceTypes.PROJECT,
  validateData: validateProject,
  
  
  
});

export const GET = listHandler;
export const POST = createHandler;