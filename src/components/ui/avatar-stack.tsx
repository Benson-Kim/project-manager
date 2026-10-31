import { initialsFrom } from "@/components/shell/initials";

/** Each person once, the names drawn as avatars, and how many more hide behind "+N". */
export function stackOf(
  names: readonly string[],
  max: number,
): { all: string[]; shown: string[]; more: number } {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const limit = Math.max(1, Math.trunc(max));
  const shown = unique.length > limit ? unique.slice(0, limit - 1) : unique;
  return { all: unique, shown, more: unique.length - shown.length };
}

/** A steady hue per name, so one person keeps one colour on every small avatar. */
export function avatarHue(name: string): number {
  return ([...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) * 37) % 360;
}

/** Saturation and lightness of a small avatar: dark enough for white initials on every hue (4.5:1). */
export const AVATAR_SL = { saturation: 50, lightness: 30 } as const;

export function avatarFill(name: string): string {
  return `hsl(${avatarHue(name)} ${AVATAR_SL.saturation}% ${AVATAR_SL.lightness}%)`;
}

const SIZES = {
  md: {
    avatar: "-ml-1.5 size-6 bg-accent-soft text-[10px] font-semibold text-accent-strong first:ml-0",
    more: "-ml-1.5 size-6 text-[10px] font-semibold",
    empty: "text-xs",
  },
  sm: {
    avatar: "-ml-1 size-[22px] text-[10px] font-bold text-white first:ml-0",
    more: "-ml-1 size-[22px] text-[10px] font-bold",
    empty: "text-[10px]",
  },
} as const;

/**
 * Overlapping initials for the people on an item; an empty list says `emptyLabel`
 * ("Unassigned") out loud rather than drawing nothing. `sm` is the Gantt card's
 * small stack, each person in their own colour.
 */
export function AvatarStack({
  names,
  emptyLabel,
  max = 3,
  size = "md",
}: {
  names: readonly string[];
  emptyLabel: string;
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const { all, shown, more } = stackOf(names, max);
  const look = SIZES[size];
  if (all.length === 0) {
    return <span className={`${look.empty} text-ink-muted italic`}>{emptyLabel}</span>;
  }
  const everyone = all.join(", ");
  return (
    <span role="img" aria-label={everyone} title={everyone} className="inline-flex items-center">
      {shown.map((name) => (
        <span
          key={name}
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-full border-2 border-surface print:[print-color-adjust:exact] ${look.avatar}`}
          style={size === "sm" ? { background: avatarFill(name) } : undefined}
        >
          {initialsFrom(name)}
        </span>
      ))}
      {more > 0 ? (
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-full border-2 border-surface bg-surface-sunken text-ink-muted ${look.more}`}
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}
