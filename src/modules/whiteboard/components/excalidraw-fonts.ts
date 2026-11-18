const SOURCE_SEPARATOR = /,\s*(?=url\()/;
const SOURCE_URL = /url\(\s*["']?([^"')\s]+)/;

type FontFaceHost = {
  FontFace?: typeof FontFace;
  location: { origin: string };
};

function isSameOrigin(part: string, origin: string): boolean {
  const href = SOURCE_URL.exec(part)?.[1];
  if (!href) return true;
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}

export function selfHostedSources(
  source: string | BufferSource,
  origin: string,
): string | BufferSource {
  if (typeof source !== "string") return source;
  const kept = source.split(SOURCE_SEPARATOR).filter((part) => isSameOrigin(part, origin));
  return kept.length > 0 ? kept.join(", ") : source;
}

export function installSelfHostedFonts(host: FontFaceHost): void {
  const Native = host.FontFace;
  if (typeof Native !== "function" || "selfHosted" in Native) return;
  const origin = host.location.origin;
  host.FontFace = class SelfHostedFontFace extends Native {
    static readonly selfHosted = true;
    constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
      super(family, selfHostedSources(source, origin), descriptors);
    }
  };
}
