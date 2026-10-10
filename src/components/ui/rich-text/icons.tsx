/**
 * Inline SVG toolbar icons (STANDARDS §9: no icon font or library). Purely
 * decorative: every button carries its name in aria-label.
 */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UndoIcon = () => (
  <Icon>
    <path d="M5 3 2 6l3 3M2 6h8a4 4 0 0 1 0 8H7" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="m11 3 3 3-3 3m3-3H6a4 4 0 0 0 0 8h3" />
  </Icon>
);

export const BulletListIcon = () => (
  <Icon>
    <path d="M6.5 4H14M6.5 8H14M6.5 12H14" />
    <circle cx="3" cy="4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="3" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="3" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

export const OrderedListIcon = () => (
  <Icon>
    <path d="M6.5 4H14M6.5 8H14M6.5 12H14M2.5 2.75 3.5 2.25v3.5M2.25 10.5a1 1 0 0 1 1.75.6c0 .9-1.75 1.4-1.75 2.4H4" />
  </Icon>
);

const ALIGN_PATHS = {
  left: "M2 3h12M2 6.5h8M2 10h12M2 13.5h8",
  center: "M2 3h12M4 6.5h8M2 10h12M4 13.5h8",
  right: "M2 3h12M6 6.5h8M2 10h12M6 13.5h8",
  justify: "M2 3h12M2 6.5h12M2 10h12M2 13.5h12",
} as const;

export const AlignIcon = ({ align }: { align: keyof typeof ALIGN_PATHS }) => (
  <Icon>
    <path d={ALIGN_PATHS[align]} />
  </Icon>
);

export const LinkIcon = () => (
  <Icon>
    <path d="m6.5 9.5 3-3M7 4.5l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L5.5 8" />
  </Icon>
);

export const TableIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M2 6.5h12M2 10h12M6 3v10M10 3v10" />
  </Icon>
);

export const ClearFormattingIcon = () => (
  <Icon>
    <path d="M3 3.5h7M6.5 3.5v9M10 9l4 4M14 9l-4 4" />
  </Icon>
);
