// app/api/projects/[id]/questions-answers/route.js
import { createModuleApiHandlers } from "@/lib/moduleApiHandler";
import { validateQuestionAnswer } from "@/lib/moduleValidators";
import { ResourceTypes } from "@/lib/newpermissions";

const {
  listHandler,
  createHandler,
} = createModuleApiHandlers({
  modelName: "QuestionAnswer",
  resourceType: ResourceTypes.QUESTION_ANSWER,
  validateData: validateQuestionAnswer,
  
  
  
});

export const GET = listHandler;
export const POST = createHandler;