import { cache } from "react";
import { getProjectById } from "@/modules/projects/repository/projects";

/**
 * Request-scoped cached project fetch (ADR-0018): the nested layout and the
 * section page both render in parallel and both need the project — React
 * cache() dedupes to ONE usp_Project_GetById call per request.
 */
export const getProjectCached = cache(getProjectById);
