/**
 * The certificate subjects resources/app-update.yml trusts for update installers (ADR-0034),
 * read from the YAML electron-builder writes: one inline value, or a block list.
 */
export function trustedPublishers(feed: string): string[] {
  const lines = feed.split(/\r?\n/);
  const at = lines.findIndex((l) => /^publisherName:/.test(l));
  if (at < 0) return [];
  const inline = lines[at].slice("publisherName:".length).trim();
  if (inline) return [unquote(inline)];
  const items: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (!item) break;
    items.push(unquote(item[1].trim()));
  }
  return items;
}

function unquote(text: string): string {
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text) as string;
    } catch {
      return text.slice(1, -1);
    }
  }
  return text;
}

/** electron-updater refused a downloaded installer: not signed by a trusted publisher. */
export function isSignatureRefusal(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "ERR_UPDATER_INVALID_SIGNATURE";
}
