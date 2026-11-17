import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { messages } from "@/lib/messages";
import { stakeholderCsvRows, type StakeholderExportRow } from "../export";

const M = messages.stakeholders.export;

const row: StakeholderExportRow = {
  FirstName: '=HYPERLINK("http://x")',
  LastName: null,
  DepartmentOrganization: "Ops",
  OrgTitle: null,
  ProjectRole: "Sponsor",
  EmailAddress: "a@example.test",
  PhoneNumber: null,
  Mobile: null,
  EngagementLevel: "Supportive",
  CommunicationPreference: "Email",
  CommunicationPurpose: "Status",
  CommunicationFrequency: "Weekly",
  KeyMessageStrategy: "Keep, informed",
  AdditionalNotes: null,
};

describe("stakeholderCsvRows", () => {
  it("puts the heading first and carries the communication plan", () => {
    const [heading, cells] = stakeholderCsvRows([row]);
    expect(heading).toContain(M.communicationPreference);
    expect(heading).toContain(M.communicationFrequency);
    expect(heading).toHaveLength(cells.length);
    expect(cells[heading.indexOf(M.communicationFrequency)]).toBe("Weekly");
  });

  it("writes a safe CSV: formulas neutralised, blanks empty, commas quoted", () => {
    const lines = toCsv(stakeholderCsvRows([row])).split("\r\n");
    expect(lines[1].startsWith(`"'=HYPERLINK(""http://x"")"`)).toBe(true);
    expect(lines[1]).toContain(',"Keep, informed",');
    expect(lines[1].endsWith(",")).toBe(true);
  });
});
