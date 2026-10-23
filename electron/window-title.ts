/**
 * A desktop window's title: the page's own title without the app name the web pages append
 * for browser tabs, since the app's sidebar already names it. Many pages carry it twice (their
 * own "— Project Manager" plus the " · Project Manager" of src/app/layout.tsx), so every
 * trailing copy goes. A page without a title of its own shows the app name.
 */
export function windowTitle(pageTitle: string, appName: string): string {
  const name = appName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const short = pageTitle.replace(new RegExp(`(?:\\s*[·•|\\-–—]\\s*${name})+\\s*$`), "").trim();
  return short || appName;
}
