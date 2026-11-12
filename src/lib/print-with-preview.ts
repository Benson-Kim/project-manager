type DesktopBridge = { printPreview?: () => Promise<void> };

/**
 * The desktop app shows the printed pages in a preview window first; a browser opens its own
 * print dialog, which already previews. Print-fit listeners get beforeprint/afterprint either way.
 */
export async function printWithPreview(): Promise<void> {
  const bridge = (window as Window & { desktop?: DesktopBridge }).desktop;
  if (!bridge?.printPreview) {
    window.print();
    return;
  }
  let previewed = false;
  window.dispatchEvent(new Event("beforeprint"));
  try {
    await bridge.printPreview();
    previewed = true;
  } catch {
    previewed = false;
  } finally {
    window.dispatchEvent(new Event("afterprint"));
  }
  if (!previewed) window.print();
}
