import { PageHeader } from "@/components/ui/page-header";
import { messages } from "@/lib/messages";

const modules = [
  { name: "Projects", key: "projects" },
  { name: "Stakeholders", key: "stakeholders" },
  { name: "Suppliers", key: "suppliers" },
  { name: "Keywords", key: "keywords" },
  { name: "Key Deliverables", key: "key-deliverables" },
  { name: "Objectives", key: "objectives" },
  { name: "Meetings", key: "meetings" },
  { name: "Q&A", key: "questions-answers" },
  { name: "Assumptions & Constraints", key: "assumptions-constraints" },
  { name: "Risks & Issues", key: "risks-issues" },
  { name: "Notes", key: "notes" },
  { name: "IT Resource Planning", key: "it-resource-planning" },
  { name: "Financials", key: "financials" },
  { name: "Parking Lot", key: "parking-lot" },
  { name: "Daily Activities", key: "daily-activities" },
  { name: "To-Do & Alerts", key: "todo-alerts" },
  { name: "Reports", key: "reports" },
];

export default function Home() {
  return (
    <>
      <PageHeader title={messages.app.name} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <li key={m.key} className="rounded-lg border border-line bg-surface-raised p-4">
            <h2 className="text-sm font-semibold text-ink">{m.name}</h2>
            <p className="mt-1 text-xs text-ink-muted">feature/{m.key}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
