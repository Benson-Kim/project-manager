/** The down arrow of dropdowns (nav groups, comboboxes); rotates when open. */
export function Chevron({ open = false }: { open?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-(--duration-fast) ${open ? "rotate-180" : ""}`}
    >
      <polyline points="2,4 6,8 10,4" />
    </svg>
  );
}
