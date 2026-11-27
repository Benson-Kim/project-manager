import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/rich-text/sanitize";
import { countImages, dropsImages, prefersClipboardHtml } from "../clipboard-images";

const excelHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>td{mso-number-format:General}</style></head><body><!--StartFragment--><table><tr><td>Budget</td><td>1200</td></tr></table><!--EndFragment--></body></html>`;
const wordHtml = `<html><head><xml><o:DocumentProperties></o:DocumentProperties></xml><style>p.MsoNormal{margin:0}</style></head><body><!--StartFragment--><p class="MsoNormal">Site visit notes</p><p class="MsoNormal"><img src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png"></p><!--EndFragment--></body></html>`;
const chromeCopyImage = `<html><body><!--StartFragment--><img src="https://example.com/chart.png"/><!--EndFragment--></body></html>`;
const wordPictureOnly = `<html><head><style>p{margin:0}</style></head><body><!--StartFragment--><p class="MsoNormal">&nbsp;<img src="file:///C:/clip_image001.png"><o:p></o:p></p><!--EndFragment--></body></html>`;

describe("prefersClipboardHtml", () => {
  it("pastes an Excel table as HTML even when a picture of it is on the clipboard", () => {
    expect(prefersClipboardHtml(excelHtml)).toBe(true);
  });

  it("pastes Word text as HTML even when a picture of it is on the clipboard", () => {
    expect(prefersClipboardHtml(wordHtml)).toBe(true);
  });

  it("uploads a copied picture that has no HTML", () => {
    expect(prefersClipboardHtml("")).toBe(false);
  });

  it("uploads a copied picture whose HTML is only the image", () => {
    expect(prefersClipboardHtml(chromeCopyImage)).toBe(false);
    expect(prefersClipboardHtml(wordPictureOnly)).toBe(false);
  });

  it("ignores markup that shows no text", () => {
    expect(prefersClipboardHtml(`<meta charset="utf-8"><span> </span>`)).toBe(false);
  });
});

describe("dropsImages", () => {
  it("flags pictures that point at other places", () => {
    expect(dropsImages(wordHtml, sanitizeRichText)).toBe(true);
    expect(dropsImages(chromeCopyImage, sanitizeRichText)).toBe(true);
  });

  it("keeps pictures already stored in the app", () => {
    const stored = `<p>Plan</p><img src="/api/files/42?owner=daily-activity">`;
    expect(countImages(stored)).toBe(1);
    expect(dropsImages(stored, sanitizeRichText)).toBe(false);
  });

  it("says nothing when the paste has no pictures", () => {
    expect(dropsImages(excelHtml, sanitizeRichText)).toBe(false);
  });
});
