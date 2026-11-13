import { messages } from "@/lib/messages";
import type { responsibilityFramework } from "../schemas/responsibility-frameworks";

type Framework = ReturnType<typeof responsibilityFramework>;

const TONES = [
  "bg-tone-blue-soft! text-tone-blue-ink!",
  "bg-tone-green-soft! text-tone-green-ink!",
  "bg-tone-orange-soft! text-tone-orange-ink!",
  "bg-tone-purple-soft! text-tone-purple-ink!",
  "bg-tone-yellow-soft! text-tone-yellow-ink!",
  "bg-tone-red-soft! text-tone-red-ink!",
  "bg-tone-gray-soft! text-tone-gray-ink!",
] as const;

/** The colour a role takes wherever it shows, by its place in its framework; none when no role. */
export function roleTone(framework: Framework, code: string | null): string {
  const index = framework.roles.findIndex((role) => role.code === code);
  return index < 0 ? "" : TONES[index % TONES.length];
}

/** The framework's roles as coloured tags, the key to the matrix's cells. */
export function RoleChips({ framework }: { framework: Framework }) {
  return (
    <ul aria-label={messages.responsibility.legend} className="flex flex-wrap gap-1">
      {framework.roles.map((role) => (
        <li
          key={role.code}
          className={`rounded-full px-2 py-0.5 text-[11px] ${roleTone(framework, role.code)}`}
        >
          <span className="font-semibold">{role.abbrev}</span> {role.label}
        </li>
      ))}
    </ul>
  );
}
