const modules = [
  { name: "Projects", key: "projects", desc: "Charter, framework & search" },
  { name: "Stakeholders", key: "stakeholders", desc: "Contacts, roles & engagement" },
  { name: "Suppliers", key: "suppliers", desc: "Contracts & contacts" },
  { name: "Keywords", key: "acronyms", desc: "Acronyms & definitions" },
  {
    name: "Key Deliverables",
    key: "key-deliverables",
    desc: "Requirements, deadlines & Gantt",
  },
  { name: "Objectives", key: "objectives", desc: "Measurable outcomes" },
  { name: "Meetings", key: "meetings", desc: "Minutes, agenda & action items" },
  { name: "Q&A", key: "questions-answers", desc: "Interview questions & answers" },
  {
    name: "Assumptions & Constraints",
    key: "assumptions-constraints",
    desc: "With impact & status",
  },
  { name: "Risks & Issues", key: "risks-issues", desc: "Probability, impact & mitigation" },
  { name: "Notes", key: "notes", desc: "Rich text with tabs & tables" },
  {
    name: "IT Resource Planning",
    key: "it-resource-planning",
    desc: "Security, infra, training…",
  },
  { name: "Financials", key: "financials", desc: "MSSS document workflow & budget" },
  { name: "Parking Lot", key: "parking-lot", desc: "Items, owners & follow-ups" },
  { name: "Daily Activities", key: "daily-activities", desc: "Status, requester & time spent" },
  { name: "To-Do & Alerts", key: "todo-alerts", desc: "Dynamic list with snoozeable alerts" },
  { name: "Reports", key: "reports", desc: "Printable & downloadable" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Project Manager</h1>
        <p className="mt-1 text-sm opacity-70">
          Rebuild of the Access project-management system — foundation scaffold. Module screens
          arrive per feature branch (see docs/PLAN.md).
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <li
            key={m.key}
            className="rounded-xl border border-black/10 p-4 transition hover:shadow-md dark:border-white/15"
          >
            <h2 className="font-semibold">{m.name}</h2>
            <p className="mt-1 text-sm opacity-70">{m.desc}</p>
            <p className="mt-2 text-xs opacity-50">feature/{m.key}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
