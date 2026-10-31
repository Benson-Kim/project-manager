/** One choice out of a few, as pressed buttons in a joined group. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  testId,
  compact = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  testId: string;
  /** Toolbar height (32 px) instead of a form field's. */
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex rounded-md border border-line ${className ?? ""}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          data-testid={`${testId}-${option.value}`}
          onClick={() => onChange(option.value)}
          className={`cursor-pointer text-sm font-medium first:rounded-l-md last:rounded-r-md ${
            compact ? "min-h-8 px-3" : "min-h-10 px-4"
          } ${
            value === option.value
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:bg-surface-raised"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
