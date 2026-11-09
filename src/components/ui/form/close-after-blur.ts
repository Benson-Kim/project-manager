/** A blurred field waits this long before closing its list, so a click on an option lands first. */
const BLUR_CLOSE_MS = 100;

/**
 * Closes a field's list once a blur has settled, unless the field has the focus back by then: a
 * click on a chip's × and straight back into the field would otherwise shut the list it reopened.
 */
export function closeAfterBlur(field: HTMLElement, close: () => void): void {
  setTimeout(() => {
    if (field.ownerDocument.activeElement === field) return;
    close();
  }, BLUR_CLOSE_MS);
}
