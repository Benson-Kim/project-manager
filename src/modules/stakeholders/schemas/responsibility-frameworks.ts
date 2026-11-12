export type ResponsibilityRowKind = "WbsItem" | "Decision";

export const RESPONSIBILITY_FRAMEWORK_CODES = [
  "RACI",
  "DACI",
  "RAPID",
  "DARE",
  "RASCI",
  "RACI_VS",
  "ARPA",
  "MOCHA",
  "RATSI",
] as const;

export type ResponsibilityFrameworkCode = (typeof RESPONSIBILITY_FRAMEWORK_CODES)[number];

export interface ResponsibilityRole {
  readonly code: string;
  readonly abbrev: string;
  readonly label: string;
  readonly onePerRow: boolean;
  readonly requiredPerRow: boolean;
  readonly isAssigneeRole: boolean;
}

export interface ResponsibilityFramework {
  readonly code: ResponsibilityFrameworkCode;
  readonly label: string;
  readonly defaultRowKind: ResponsibilityRowKind;
  readonly roles: readonly ResponsibilityRole[];
}

type RoleFlag = "one" | "required" | "assignee";

function role(
  code: string,
  abbrev: string,
  label: string,
  ...flags: RoleFlag[]
): ResponsibilityRole {
  return {
    code,
    abbrev,
    label,
    onePerRow: flags.includes("one"),
    requiredPerRow: flags.includes("required"),
    isAssigneeRole: flags.includes("assignee"),
  };
}

const RESPONSIBLE = role("RESPONSIBLE", "R", "Responsible", "required", "assignee");
const ACCOUNTABLE = role("ACCOUNTABLE", "A", "Accountable", "one", "required");
const CONSULTED = role("CONSULTED", "C", "Consulted");
const INFORMED = role("INFORMED", "I", "Informed");

export const RESPONSIBILITY_FRAMEWORKS: readonly ResponsibilityFramework[] = [
  {
    code: "RACI",
    label: "RACI",
    defaultRowKind: "WbsItem",
    roles: [RESPONSIBLE, ACCOUNTABLE, CONSULTED, INFORMED],
  },
  {
    code: "DACI",
    label: "DACI",
    defaultRowKind: "Decision",
    roles: [
      role("DRIVER", "D", "Driver", "one", "required", "assignee"),
      role("APPROVER", "A", "Approver", "one", "required"),
      role("CONTRIBUTOR", "C", "Contributor"),
      INFORMED,
    ],
  },
  {
    code: "RAPID",
    label: "RAPID",
    defaultRowKind: "Decision",
    roles: [
      role("RECOMMEND", "R", "Recommend"),
      role("AGREE", "A", "Agree"),
      role("PERFORM", "P", "Perform", "assignee"),
      role("INPUT", "I", "Input"),
      role("DECIDE", "D", "Decide", "one", "required"),
    ],
  },
  {
    code: "DARE",
    label: "DARE",
    defaultRowKind: "Decision",
    roles: [
      role("DECIDER", "D", "Decider", "required"),
      role("ADVISOR", "A", "Advisor"),
      role("RECOMMENDER", "R", "Recommender"),
      role("EXECUTION", "E", "Execution", "assignee"),
    ],
  },
  {
    code: "RASCI",
    label: "RASCI",
    defaultRowKind: "WbsItem",
    roles: [RESPONSIBLE, ACCOUNTABLE, role("SUPPORT", "S", "Support"), CONSULTED, INFORMED],
  },
  {
    code: "RACI_VS",
    label: "RACI-VS",
    defaultRowKind: "WbsItem",
    roles: [
      RESPONSIBLE,
      ACCOUNTABLE,
      CONSULTED,
      INFORMED,
      role("VERIFIER", "V", "Verifier"),
      role("SIGN_OFF", "S", "Sign-off"),
    ],
  },
  {
    code: "ARPA",
    label: "ARPA",
    defaultRowKind: "WbsItem",
    roles: [
      role("ACCOUNTABLE", "A", "Accountable", "one", "required"),
      role("RESPONSIBLE", "R", "Responsible", "assignee"),
      role("PARTICIPANT", "P", "Participant"),
      role("ADVISOR", "Ad", "Advisor"),
    ],
  },
  {
    code: "MOCHA",
    label: "MOCHA",
    defaultRowKind: "WbsItem",
    roles: [
      role("MANAGER", "M", "Manager", "one", "required"),
      role("OWNER", "O", "Owner", "one", "required", "assignee"),
      CONSULTED,
      role("HELPER", "H", "Helper"),
      role("APPROVER", "A", "Approver", "one"),
    ],
  },
  {
    code: "RATSI",
    label: "RATSI",
    defaultRowKind: "WbsItem",
    roles: [
      role("RESPONSIBLE", "R", "Responsible", "required"),
      role("AUTHORITY", "A", "Authority", "one", "required"),
      role("TASK", "T", "Task", "assignee"),
      role("SUPPORT", "S", "Support"),
      INFORMED,
    ],
  },
];

const BY_CODE = new Map(RESPONSIBILITY_FRAMEWORKS.map((f) => [f.code, f]));

export function isResponsibilityFrameworkCode(value: string): value is ResponsibilityFrameworkCode {
  return BY_CODE.has(value as ResponsibilityFrameworkCode);
}

export function responsibilityFramework(
  code: ResponsibilityFrameworkCode,
): ResponsibilityFramework {
  const framework = BY_CODE.get(code);
  if (!framework) throw new Error(`Unknown responsibility framework: ${code}`);
  return framework;
}

export function assigneeRole(framework: ResponsibilityFramework): ResponsibilityRole {
  const found = framework.roles.find((r) => r.isAssigneeRole);
  if (!found) throw new Error(`Framework ${framework.code} has no assignee role`);
  return found;
}

export function frameworkRole(
  framework: ResponsibilityFramework,
  roleCode: string,
): ResponsibilityRole | undefined {
  return framework.roles.find((r) => r.code === roleCode);
}
