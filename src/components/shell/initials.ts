/**
 * Avatar initials from the session's display name/username: first character
 * of the first two word chunks (split on space, hyphen, underscore or dot),
 * uppercased. "e2e-admin" -> "EA", "Jane Doe" -> "JD", "viewer" -> "V".
 */
export function initialsFrom(name: string): string {
  const chunks = name
    .split(/[\s\-_.]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks
    .slice(0, 2)
    .map((chunk) => (chunk[0] ?? "").toUpperCase())
    .join("");
}
