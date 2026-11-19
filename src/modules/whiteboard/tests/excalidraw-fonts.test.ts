import { describe, expect, it } from "vitest";
import { installSelfHostedFonts, selfHostedSources } from "../components/excalidraw-fonts";

const ORIGIN = "http://localhost:3000";
const LOCAL =
  "url(http://localhost:3000/excalidraw-assets/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2) format('woff2')";
const CDN =
  "url(https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2) format('woff2')";

class FakeFontFace {
  constructor(
    readonly family: string,
    readonly source: string | BufferSource,
    readonly descriptors?: FontFaceDescriptors,
  ) {}
}

function fakeHost() {
  return {
    FontFace: FakeFontFace as unknown as typeof FontFace,
    location: { origin: ORIGIN },
  };
}

describe("selfHostedSources", () => {
  it("drops the CDN fallback and keeps the app's own copy", () => {
    expect(selfHostedSources(`${LOCAL}, ${CDN}`, ORIGIN)).toBe(LOCAL);
  });

  it("keeps relative and quoted same-origin sources", () => {
    const relative = "url('/excalidraw-assets/fonts/a.woff2') format('woff2')";
    expect(selfHostedSources(`${relative}, ${CDN}`, ORIGIN)).toBe(relative);
  });

  it("keeps several same-origin sources in order", () => {
    const second = "url(/excalidraw-assets/fonts/b.woff2) format('woff2')";
    expect(selfHostedSources(`${LOCAL}, ${CDN}, ${second}`, ORIGIN)).toBe(`${LOCAL}, ${second}`);
  });

  it("leaves the source unchanged when nothing is self-hosted", () => {
    expect(selfHostedSources(CDN, ORIGIN)).toBe(CDN);
  });

  it("passes binary sources through", () => {
    const bytes = new ArrayBuffer(4);
    expect(selfHostedSources(bytes, ORIGIN)).toBe(bytes);
  });
});

describe("installSelfHostedFonts", () => {
  it("makes new font faces skip cross-origin sources", () => {
    const host = fakeHost();
    installSelfHostedFonts(host);
    const face = new host.FontFace("Excalifont", `${LOCAL}, ${CDN}`, {
      display: "swap",
    }) as unknown as FakeFontFace;
    expect(face).toBeInstanceOf(FakeFontFace);
    expect(face.source).toBe(LOCAL);
    expect(face.descriptors).toEqual({ display: "swap" });
  });

  it("installs once", () => {
    const host = fakeHost();
    installSelfHostedFonts(host);
    const installed = host.FontFace;
    installSelfHostedFonts(host);
    expect(host.FontFace).toBe(installed);
  });

  it("does nothing where FontFace is missing", () => {
    const host: { FontFace?: typeof FontFace; location: { origin: string } } = {
      location: { origin: ORIGIN },
    };
    installSelfHostedFonts(host);
    expect(host.FontFace).toBeUndefined();
  });
});
