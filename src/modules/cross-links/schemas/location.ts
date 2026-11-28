import { z } from "zod";

/**
 * Canonical closed allowlist of linkable / note-anchorable work screens (ADR-0074).
 * Raw URLs are NEVER persisted in SQL or passed into <Link href>.
 */
export const CROSS_LINK_MODULES = [
  "dashboard",
  "reports",
  "project-overview",
  "objectives",
  "requirements",
  "deliverables",
  "deliverables-canvas",
  "deliverables-gantt",
  "stakeholders",
  "stakeholders-matrix",
  "responsibility",
  "suppliers",
  "keywords",
  "daily-activity",
  "todo",
  "calendar",
  "questions-answers",
  "parking-lot",
  "assumptions-constraints",
  "risks-issues",
  "decisions",
  "whiteboard",
  "bpmn",
  "meetings",
  "board",
  "checklists",
  "note",
  "financials-budget",
  "financials-monitoring",
  "financials-documents",
  "financials-settings",
  "financials-project-math",
  "financials-sheet",
] as const;

export type CrossLinkModuleKey = (typeof CROSS_LINK_MODULES)[number];

export const CROSS_LINK_ANCHOR_KINDS = ["page", "section", "record", "subrecord"] as const;
export type CrossLinkAnchorKind = (typeof CROSS_LINK_ANCHOR_KINDS)[number];

export const STICKY_COLORS = ["yellow", "blue", "green", "orange", "purple", "gray"] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export const CROSS_LINK_MAX_PER_LOCATION = 25;
export const CROSS_LINK_MAX_PER_PROJECT = 500;
export const PAGE_NOTE_MAX_PER_LOCATION = 20;
export const PAGE_NOTE_MAX_PER_PROJECT = 500;
export const CROSS_LINK_LIST_LIMIT = 200;

export const MAX_LINK_TITLE_LEN = 120;
export const MAX_LINK_NOTE_LEN = 500;
export const MAX_PAGE_NOTE_LEN = 1000;
export const MAX_ENDPOINT_LABEL_LEN = 120;

export const ANCHOR_KEY_REGEX = /^[a-z0-9:_-]{1,80}$/;

const positiveInt = z.number().int().positive();

export interface LocationAnchor {
  moduleKey: CrossLinkModuleKey;
  projectId: number | null;
  entityId: number | null;
  subEntityId: number | null;
  anchorKind: CrossLinkAnchorKind;
  anchorKey: string | null;
}

type ModuleShapeRule = {
  project: "null" | "required" | "nullable";
  entity: "null" | "optional" | "required";
  subEntity: "null" | "optional";
  /** For workspace modules (board, note, meetings, etc.), ?entity/path picks one open item. */
  workspaceScoped?: boolean;
  /** Table rows on this page are sub-entities of the page entity, not entities of their own. */
  rowsAreSubEntities?: boolean;
};

export const CROSS_LINK_MODULE_RULES: Record<CrossLinkModuleKey, ModuleShapeRule> = {
  dashboard: { project: "null", entity: "null", subEntity: "null" },
  reports: { project: "null", entity: "null", subEntity: "null" },
  "project-overview": { project: "required", entity: "null", subEntity: "null" },
  objectives: { project: "required", entity: "optional", subEntity: "null" },
  requirements: { project: "required", entity: "optional", subEntity: "null" },
  deliverables: { project: "required", entity: "optional", subEntity: "null" },
  "deliverables-canvas": {
    project: "required",
    entity: "optional",
    subEntity: "optional",
    workspaceScoped: true,
  },
  "deliverables-gantt": { project: "required", entity: "optional", subEntity: "null" },
  stakeholders: { project: "required", entity: "optional", subEntity: "null" },
  "stakeholders-matrix": { project: "required", entity: "optional", subEntity: "null" },
  responsibility: { project: "required", entity: "optional", subEntity: "null" },
  suppliers: { project: "required", entity: "optional", subEntity: "null" },
  keywords: { project: "required", entity: "optional", subEntity: "null" },
  "daily-activity": { project: "nullable", entity: "optional", subEntity: "null" },
  todo: { project: "nullable", entity: "optional", subEntity: "null" },
  calendar: { project: "required", entity: "optional", subEntity: "null" },
  "questions-answers": { project: "required", entity: "optional", subEntity: "null" },
  "parking-lot": { project: "required", entity: "optional", subEntity: "null" },
  "assumptions-constraints": { project: "required", entity: "optional", subEntity: "null" },
  "risks-issues": { project: "required", entity: "optional", subEntity: "null" },
  decisions: { project: "required", entity: "optional", subEntity: "null" },
  whiteboard: { project: "required", entity: "optional", subEntity: "null", workspaceScoped: true },
  bpmn: { project: "required", entity: "optional", subEntity: "null", workspaceScoped: true },
  meetings: {
    project: "required",
    entity: "optional",
    subEntity: "optional",
    workspaceScoped: true,
  },
  board: {
    project: "nullable",
    entity: "optional",
    subEntity: "optional",
    workspaceScoped: true,
  },
  checklists: {
    project: "required",
    entity: "optional",
    subEntity: "optional",
    workspaceScoped: true,
    rowsAreSubEntities: true,
  },
  note: {
    project: "nullable",
    entity: "optional",
    subEntity: "optional",
    workspaceScoped: true,
  },
  "financials-budget": {
    project: "required",
    entity: "optional",
    subEntity: "optional",
    workspaceScoped: true,
  },
  "financials-monitoring": {
    project: "required",
    entity: "optional",
    subEntity: "null",
    workspaceScoped: true,
  },
  "financials-documents": {
    project: "required",
    entity: "optional",
    subEntity: "null",
    workspaceScoped: true,
  },
  "financials-settings": {
    project: "required",
    entity: "optional",
    subEntity: "null",
    workspaceScoped: true,
  },
  "financials-project-math": { project: "required", entity: "null", subEntity: "null" },
  "financials-sheet": {
    project: "required",
    entity: "required",
    subEntity: "null",
    workspaceScoped: true,
  },
};

export function normalizeAnchorKey(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return ANCHOR_KEY_REGEX.test(trimmed) ? trimmed : null;
}

export const locationAnchorSchema = z
  .object({
    moduleKey: z.enum(CROSS_LINK_MODULES),
    projectId: positiveInt.nullable(),
    entityId: positiveInt.nullable(),
    subEntityId: positiveInt.nullable(),
    anchorKind: z.enum(CROSS_LINK_ANCHOR_KINDS),
    anchorKey: z.string().regex(ANCHOR_KEY_REGEX).nullable(),
  })
  .superRefine((loc, ctx) => {
    const rule = CROSS_LINK_MODULE_RULES[loc.moduleKey];
    if (rule.project === "null" && loc.projectId !== null) {
      ctx.addIssue({ code: "custom", path: ["projectId"], message: "ProjectId must be null" });
    }
    if (rule.project === "required" && loc.projectId === null) {
      ctx.addIssue({ code: "custom", path: ["projectId"], message: "ProjectId is required" });
    }
    if (rule.entity === "null" && loc.entityId !== null) {
      ctx.addIssue({ code: "custom", path: ["entityId"], message: "EntityId must be null" });
    }
    if (rule.entity === "required" && loc.entityId === null) {
      ctx.addIssue({ code: "custom", path: ["entityId"], message: "EntityId is required" });
    }
    if (rule.subEntity === "null" && loc.subEntityId !== null) {
      ctx.addIssue({ code: "custom", path: ["subEntityId"], message: "SubEntityId must be null" });
    }
    if (loc.subEntityId !== null && loc.entityId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["subEntityId"],
        message: "SubEntityId requires EntityId",
      });
    }
  });

/**
 * Builds a safe relative Next.js href from an allowlisted LocationAnchor and SQL-resolved liveProjectId.
 * Never consumes raw URLs or external origins (ADR-0074).
 */
export function buildLocationHref(location: LocationAnchor, liveProjectId?: number | null): string {
  const effectiveProjectId = liveProjectId !== undefined ? liveProjectId : location.projectId;
  const checked = locationAnchorSchema.parse({ ...location, projectId: effectiveProjectId });
  const p = checked.projectId;
  const e = checked.entityId;
  const sub = checked.subEntityId;

  let path = "/";
  switch (checked.moduleKey) {
    case "dashboard":
      path = "/";
      break;
    case "reports":
      path = "/reports";
      break;
    case "project-overview":
      path = `/projects/${p}`;
      break;
    case "objectives":
      path = `/projects/${p}/objectives${e ? `?id=${e}` : ""}`;
      break;
    case "requirements":
      path = `/projects/${p}/requirements${e ? `?id=${e}` : ""}`;
      break;
    case "deliverables":
      path = `/projects/${p}/deliverables${e ? `?d=${e}` : ""}`;
      break;
    case "deliverables-canvas": {
      const params = new URLSearchParams();
      if (e) params.set("canvas", String(e));
      if (sub) params.set("inspect", String(sub));
      const qs = params.toString();
      path = `/projects/${p}/deliverables/canvas${qs ? `?${qs}` : ""}`;
      break;
    }
    case "deliverables-gantt":
      path = `/projects/${p}/deliverables/gantt?view=gantt${e ? `&d=${e}` : ""}`;
      break;
    case "stakeholders":
      path = `/projects/${p}/stakeholders${e ? `?id=${e}` : ""}`;
      break;
    case "stakeholders-matrix":
      path = `/projects/${p}/stakeholders/matrix`;
      break;
    case "responsibility":
      path = `/projects/${p}/responsibility`;
      break;
    case "suppliers":
      path = `/projects/${p}/suppliers${e ? `?id=${e}` : ""}`;
      break;
    case "keywords":
      path = `/projects/${p}/keywords${e ? `?id=${e}` : ""}`;
      break;
    case "daily-activity":
      path = `${p ? `/projects/${p}/daily-activities` : "/daily-activities"}${e ? `?id=${e}` : ""}`;
      break;
    case "todo":
      path = `${p ? `/projects/${p}/todos` : "/todo"}${e ? `?id=${e}` : ""}`;
      break;
    case "calendar":
      path = `/projects/${p}/calendar`;
      break;
    case "questions-answers":
      path = `/projects/${p}/questions-answers${e ? `?id=${e}` : ""}`;
      break;
    case "parking-lot":
      path = `/projects/${p}/parking-lot${e ? `?id=${e}` : ""}`;
      break;
    case "assumptions-constraints":
      path = `/projects/${p}/assumptions-constraints${e ? `?id=${e}` : ""}`;
      break;
    case "risks-issues":
      path = `/projects/${p}/risks-issues${e ? `?id=${e}` : ""}`;
      break;
    case "decisions":
      path = `/projects/${p}/decisions${e ? `?id=${e}` : ""}`;
      break;
    case "whiteboard":
      path = `/projects/${p}/whiteboard${e ? `?board=${e}` : ""}`;
      break;
    case "bpmn":
      path = `/projects/${p}/bpmn${e ? `?diagram=${e}` : ""}`;
      break;
    case "meetings":
      path = e ? `/projects/${p}/meetings/${e}` : `/projects/${p}/meetings`;
      break;
    case "board":
      path = e
        ? p
          ? `/projects/${p}/boards/${e}`
          : `/boards/${e}`
        : p
          ? `/projects/${p}/boards`
          : "/boards";
      break;
    case "checklists":
      path = `/projects/${p}/checklists${e ? `?checklist=${e}` : ""}`;
      break;
    case "note":
      path = e
        ? p
          ? `/projects/${p}/notes/${e}`
          : `/notes/${e}`
        : p
          ? `/projects/${p}/notes`
          : "/notes";
      break;
    case "financials-budget":
      path = `/projects/${p}/financials/budget${e ? `?f=${e}` : ""}`;
      break;
    case "financials-monitoring":
      path = `/projects/${p}/financials/monitoring${e ? `?f=${e}` : ""}`;
      break;
    case "financials-documents":
      path = `/projects/${p}/financials/documents${e ? `?f=${e}` : ""}`;
      break;
    case "financials-settings":
      path = `/projects/${p}/financials/settings${e ? `?f=${e}` : ""}`;
      break;
    case "financials-project-math":
      path = `/projects/${p}/financials/project-math`;
      break;
    case "financials-sheet":
      path = `/projects/${p}/financials/${e}`;
      break;
  }

  return checked.anchorKey ? `${path}#cl-${checked.anchorKey}` : path;
}

function parsePositiveParam(raw: string | null): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

const PROJECT_SIMPLE_ROUTES: Readonly<Record<string, CrossLinkModuleKey>> = {
  objectives: "objectives",
  requirements: "requirements",
  "stakeholders/matrix": "stakeholders-matrix",
  stakeholders: "stakeholders",
  responsibility: "responsibility",
  suppliers: "suppliers",
  keywords: "keywords",
  calendar: "calendar",
  "questions-answers": "questions-answers",
  "parking-lot": "parking-lot",
  "assumptions-constraints": "assumptions-constraints",
  "risks-issues": "risks-issues",
  decisions: "decisions",
  "financials/project-math": "financials-project-math",
};

/**
 * Parses a relative Next.js route into a page-level LocationAnchor, or null when the route
 * is not in CROSS_LINK_MODULES (login, settings, kitchen-sink, print, projects directory, search).
 */
export function parseLocationFromHref(
  rawPathname: string,
  rawSearch = "",
  defaultEntityId: number | null = null,
): LocationAnchor | null {
  const pathname = (rawPathname.split("#")[0]?.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  const qs = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  const params = new URLSearchParams(qs);
  const queryId = parsePositiveParam(params.get("id"));
  const fallbackEntity = defaultEntityId && defaultEntityId > 0 ? defaultEntityId : null;

  const page = (
    moduleKey: CrossLinkModuleKey,
    projectId: number | null,
    entityId: number | null = null,
    subEntityId: number | null = null,
  ): LocationAnchor => ({
    moduleKey,
    projectId,
    entityId,
    subEntityId,
    anchorKind: "page",
    anchorKey: null,
  });

  if (pathname === "/") return page("dashboard", null);
  if (pathname === "/reports") return page("reports", null);
  if (pathname === "/daily-activities") return page("daily-activity", null, queryId);
  if (pathname === "/todo") return page("todo", null, queryId);
  if (pathname === "/boards") return page("board", null);
  if (pathname === "/notes") return page("note", null);

  const boardOnly = pathname.match(/^\/boards\/([1-9]\d*)$/);
  if (boardOnly) return page("board", null, Number(boardOnly[1]));

  const noteOnly = pathname.match(/^\/notes\/([1-9]\d*)$/);
  if (noteOnly) return page("note", null, Number(noteOnly[1]));

  const projMatch = pathname.match(/^\/projects\/([1-9]\d*)(?:\/(.*))?$/);
  if (!projMatch) return null;
  const projectId = parsePositiveParam(projMatch[1] ?? null);
  if (projectId === null) return null;
  const rest = projMatch[2] ?? "";

  if (!rest) return page("project-overview", projectId);
  if (rest.endsWith("/print")) return null;

  if (rest === "daily-activities") return page("daily-activity", projectId, queryId);
  if (rest === "todos") return page("todo", projectId, queryId);
  if (rest === "deliverables")
    return page("deliverables", projectId, parsePositiveParam(params.get("d")));
  if (rest === "deliverables/gantt") {
    return page("deliverables-gantt", projectId, parsePositiveParam(params.get("d")));
  }
  if (rest === "deliverables/canvas") {
    const canvasId = parsePositiveParam(params.get("canvas")) ?? fallbackEntity;
    const inspectId = canvasId ? parsePositiveParam(params.get("inspect")) : null;
    return page("deliverables-canvas", projectId, canvasId, inspectId);
  }
  if (rest === "whiteboard") {
    return page("whiteboard", projectId, parsePositiveParam(params.get("board")) ?? fallbackEntity);
  }
  if (rest === "bpmn") {
    return page("bpmn", projectId, parsePositiveParam(params.get("diagram")) ?? fallbackEntity);
  }
  if (rest === "checklists") {
    return page(
      "checklists",
      projectId,
      parsePositiveParam(params.get("checklist")) ?? fallbackEntity,
    );
  }
  if (rest === "meetings") return page("meetings", projectId);
  const meetingDetail = rest.match(/^meetings\/([1-9]\d*)$/);
  if (meetingDetail) return page("meetings", projectId, Number(meetingDetail[1]));

  if (rest === "boards") return page("board", projectId);
  const projBoard = rest.match(/^boards\/([1-9]\d*)$/);
  if (projBoard) return page("board", projectId, Number(projBoard[1]));

  if (rest === "notes") return page("note", projectId);
  const projNote = rest.match(/^notes\/([1-9]\d*)$/);
  if (projNote) return page("note", projectId, Number(projNote[1]));

  if (rest === "financials") {
    return page(
      "financials-budget",
      projectId,
      parsePositiveParam(params.get("f")) ?? fallbackEntity,
    );
  }
  const finTab = rest.match(/^financials\/(budget|monitoring|documents|settings)$/);
  if (finTab) {
    return page(
      `financials-${finTab[1]}` as CrossLinkModuleKey,
      projectId,
      parsePositiveParam(params.get("f")) ?? fallbackEntity,
    );
  }
  const finSheet = rest.match(/^financials\/([1-9]\d*)$/);
  if (finSheet) return page("financials-sheet", projectId, Number(finSheet[1]));

  const simple = PROJECT_SIMPLE_ROUTES[rest];
  if (simple) {
    const entity = CROSS_LINK_MODULE_RULES[simple].entity === "optional" ? queryId : null;
    return page(simple, projectId, entity);
  }

  return null;
}

export function isSameEndpoint(a: LocationAnchor, b: LocationAnchor): boolean {
  return (
    a.moduleKey === b.moduleKey &&
    (a.projectId ?? null) === (b.projectId ?? null) &&
    (a.entityId ?? null) === (b.entityId ?? null) &&
    (a.subEntityId ?? null) === (b.subEntityId ?? null) &&
    (a.anchorKey ?? null) === (b.anchorKey ?? null)
  );
}

/**
 * Where a module keeps its rows as subentities (checklists), a row anchor captured as a
 * "record" is stored under the page's entity with the row in SubEntityId. Anything matching
 * a mounted slot has to ask for the same identity, or it finds nothing and the sticky is
 * lost. Leaves `rowsAreSubEntities` the single source for that rule.
 */
export function rowAnchorIdentity(
  moduleKey: CrossLinkModuleKey,
  anchorKind: CrossLinkAnchorKind,
  rowId: number | null,
  pageEntityId: number | null,
  subEntityId: number | null,
): { entityId: number | null; subEntityId: number | null } {
  if (CROSS_LINK_MODULE_RULES[moduleKey].rowsAreSubEntities && anchorKind === "record" && rowId) {
    return { entityId: pageEntityId, subEntityId: rowId };
  }
  return { entityId: rowId, subEntityId };
}

export function isWorkspaceScopedModule(moduleKey: CrossLinkModuleKey): boolean {
  return Boolean(CROSS_LINK_MODULE_RULES[moduleKey].workspaceScoped);
}

export function locationScopeKey(
  loc: Pick<LocationAnchor, "moduleKey" | "projectId" | "entityId">,
): string {
  return `${loc.moduleKey}:${loc.projectId ?? "none"}:${loc.entityId ?? "none"}`;
}
