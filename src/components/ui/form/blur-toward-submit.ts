/**
 * Focus leaving a field for this form's own submit button. The submit validates
 * the whole form, and an error shown on the way would move the button out from
 * under the click.
 */
export function blursTowardSubmit(form: HTMLFormElement, next: EventTarget | null): boolean {
  const control = next as { type?: unknown; form?: unknown } | null;
  return control?.type === "submit" && control.form === form;
}
