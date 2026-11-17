import type { CsvCell } from "@/lib/csv";
import { messages } from "@/lib/messages";
import type { StakeholderRow } from "./schemas/stakeholder";

/**
 * The stakeholder register, communication plan included, as rows for a CSV
 * file. COLUMNS is the one place a column is declared, so the heading and the
 * cells cannot drift apart. Formula-looking text is made safe by toCsv, not here.
 */

const M = messages.stakeholders.export;

export type StakeholderExportRow = Pick<
  StakeholderRow,
  | "FirstName"
  | "LastName"
  | "DepartmentOrganization"
  | "OrgTitle"
  | "ProjectRole"
  | "EmailAddress"
  | "PhoneNumber"
  | "Mobile"
  | "EngagementLevel"
  | "CommunicationPreference"
  | "CommunicationPurpose"
  | "CommunicationFrequency"
  | "KeyMessageStrategy"
  | "AdditionalNotes"
>;

interface Column {
  header: string;
  cell: (row: StakeholderExportRow) => CsvCell;
}

const COLUMNS: readonly Column[] = [
  { header: M.firstName, cell: (r) => r.FirstName },
  { header: M.lastName, cell: (r) => r.LastName },
  { header: M.organization, cell: (r) => r.DepartmentOrganization },
  { header: M.orgTitle, cell: (r) => r.OrgTitle },
  { header: M.projectRole, cell: (r) => r.ProjectRole },
  { header: M.email, cell: (r) => r.EmailAddress },
  { header: M.phone, cell: (r) => r.PhoneNumber },
  { header: M.mobile, cell: (r) => r.Mobile },
  { header: M.engagementLevel, cell: (r) => r.EngagementLevel },
  { header: M.communicationPreference, cell: (r) => r.CommunicationPreference },
  { header: M.communicationPurpose, cell: (r) => r.CommunicationPurpose },
  { header: M.communicationFrequency, cell: (r) => r.CommunicationFrequency },
  { header: M.keyMessageStrategy, cell: (r) => r.KeyMessageStrategy },
  { header: M.notes, cell: (r) => r.AdditionalNotes },
];

export function stakeholderCsvRows(rows: readonly StakeholderExportRow[]): CsvCell[][] {
  return [COLUMNS.map((c) => c.header), ...rows.map((row) => COLUMNS.map((c) => c.cell(row)))];
}
