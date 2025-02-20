// app/api/projects/[id]/questions-answers/[itemId]/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateQuestionAnswer } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  getHandler,
  updateHandler,
  deleteHandler,
} = createModuleApiHandlers({
  modelName: "QuestionAnswer",
  resourceType: ResourceTypes.QUESTION_ANSWER,
  validateData: validateQuestionAnswer,
  
  
  
});

export const GET = getHandler;
export const PUT = updateHandler;
export const DELETE = deleteHandler;