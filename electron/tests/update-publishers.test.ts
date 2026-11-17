import { describe, expect, it } from "vitest";
import { isSignatureRefusal, trustedPublishers } from "../update-publishers";

const OLD = "CN=Burton Project Manager, O=Burton";
const NEW = "CN=Elian Digital Solutions LLC, O=Elian Digital Solutions LLC, C=US";

describe("trustedPublishers", () => {
  it("an unsigned build trusts nobody in particular", () => {
    expect(trustedPublishers("provider: github\nowner: acme\nrepo: pm\n")).toEqual([]);
  });

  it("reads the block list electron-builder writes, old and new subject alike", () => {
    const feed = `owner: acme\npublisherName:\n  - ${OLD}\n  - ${NEW}\nrepo: pm\nprovider: github\n`;
    expect(trustedPublishers(feed)).toEqual([OLD, NEW]);
    expect(trustedPublishers(feed.replace(/\n/g, "\r\n"))).toEqual([OLD, NEW]);
  });

  it("unquotes a subject YAML had to quote", () => {
    const feed = `publisherName:\n  - 'CN="Elian, LLC", O=''Q'', C=US'\n  - "CN=A\\u00e9, C=US"\n`;
    expect(trustedPublishers(feed)).toEqual(["CN=\"Elian, LLC\", O='Q', C=US", "CN=Aé, C=US"]);
  });

  it("reads a single inline subject", () => {
    expect(trustedPublishers(`publisherName: ${OLD}\n`)).toEqual([OLD]);
  });
});

describe("isSignatureRefusal", () => {
  it("knows electron-updater's refusal from any other failure", () => {
    expect(
      isSignatureRefusal(Object.assign(new Error("x"), { code: "ERR_UPDATER_INVALID_SIGNATURE" })),
    ).toBe(true);
    expect(isSignatureRefusal(new Error("net::ERR_INTERNET_DISCONNECTED"))).toBe(false);
    expect(isSignatureRefusal(null)).toBe(false);
  });
});
