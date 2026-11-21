/** Brings the first control marked invalid inside `root` into view and focus; false when there is none. */
export function focusFirstInvalid(root: ParentNode | null | undefined): boolean {
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid]');
  if (!target) return false;
  target.scrollIntoView({ block: "center" });
  target.focus({ preventScroll: true });
  return true;
}
