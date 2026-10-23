import { PageHeader } from "@/components/ui/page-header";
import { messages } from "@/lib/messages";

const moduleKeys = Object.keys(messages.home.modules) as Array<keyof typeof messages.home.modules>;

export default function Home() {
  return (
    <>
      <PageHeader title={messages.app.name} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {moduleKeys.map((key) => (
          <li key={key} className="rounded-lg border border-line bg-surface-raised p-4">
            <h2 className="text-sm font-semibold text-ink">{messages.home.modules[key]}</h2>
            <p className="mt-1 text-xs text-ink-muted">{messages.home.branch(key)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
