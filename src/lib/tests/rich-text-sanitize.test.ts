import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { htmlToPlainText, legacyFontSizeToPt, sanitizeRichText } from "../rich-text/sanitize";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "a",
  "span",
]);
const ALLOWED_ATTRIBUTES = new Set(["href", "rel", "style", "colspan", "rowspan"]);

/** Every tag and attribute in sanitised output is on the ADR-0025 allow-list. */
function expectOnlyAllowedMarkup(html: string) {
  for (const [, tag, attributes] of html.matchAll(/<\/?([a-z0-9]+)([^>]*)>/gi)) {
    expect(ALLOWED_TAGS, `tag <${tag}> in ${html}`).toContain(tag.toLowerCase());
    for (const [, name] of attributes.matchAll(/\s([a-z-]+)=/gi)) {
      expect(ALLOWED_ATTRIBUTES, `attribute ${name} in ${html}`).toContain(name.toLowerCase());
    }
  }
}

/**
 * XSS corpus: OWASP XSS Filter Evasion Cheat Sheet vectors that apply to an
 * HTML allow-list (scripts, event handlers, URL schemes and their encodings,
 * CSS, embedded documents, mutation-XSS shapes), plus style injection into
 * the properties we keep.
 */
const XSS_VECTORS = [
  "<script>alert('XSS')</script>",
  "<SCRIPT SRC=http://xss.rocks/xss.js></SCRIPT>",
  '<SCRIPT/XSS SRC="http://xss.rocks/xss.js"></SCRIPT>',
  '<<SCRIPT>alert("XSS");//\\<</SCRIPT>',
  "<SCRIPT SRC=http://xss.rocks/xss.js?< B >",
  '</TITLE><SCRIPT>alert("XSS");</SCRIPT>',
  "<IMG SRC=\"javascript:alert('XSS');\">",
  "<IMG SRC=JaVaScRiPt:alert('XSS')>",
  '<IMG """><SCRIPT>alert("XSS")</SCRIPT>">',
  "<IMG SRC=# onmouseover=\"alert('xxs')\">",
  '<IMG SRC=/ onerror="alert(String.fromCharCode(88,83,83))"></img>',
  '<img src=x onerror="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041">',
  '<a onmouseover="alert(document.cookie)">xxs link</a>',
  "<a href=\"javascript:alert('XSS')\">click</a>",
  "<a href=\"JaVaScRiPt:alert('XSS')\">click</a>",
  "<a href=\"jav&#x09;ascript:alert('XSS');\">tab</a>",
  "<a href=\"jav&#x0A;ascript:alert('XSS');\">newline</a>",
  "<a href=\" &#14;  javascript:alert('XSS');\">control</a>",
  '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">decimal</a>',
  '<a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)">hex</a>',
  '<a href="vbscript:msgbox(1)">vb</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">data</a>',
  '<a href="//evil.example/x">protocol-relative</a>',
  '<a href="https://ok.example" target="_blank" onclick="alert(1)">ok</a>',
  "<BODY ONLOAD=alert('XSS')>",
  "<BODY BACKGROUND=\"javascript:alert('XSS')\">",
  "<svg/onload=alert('XSS')>",
  "<svg><script>alert(1)</script></svg>",
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
  "<STYLE>@import'http://xss.rocks/xss.css';</STYLE>",
  "<STYLE>li {list-style-image: url(\"javascript:alert('XSS')\");}</STYLE><UL><LI>XSS</br>",
  "<DIV STYLE=\"background-image: url(javascript:alert('XSS'))\">bg</DIV>",
  "<DIV STYLE=\"width: expression(alert('XSS'));\">expr</DIV>",
  '<span style="font-family: expression(alert(1))">x</span>',
  '<span style="font-family: x; background:url(javascript:alert(1))">x</span>',
  '<span style="font-family: a\';}body{background:url(//evil)}">x</span>',
  '<span style="font-size: 12pt; position: fixed; top: 0">x</span>',
  '<p style="text-align: center; behavior: url(x.htc)">x</p>',
  '<META HTTP-EQUIV="refresh" CONTENT="0;url=javascript:alert(\'XSS\');">',
  "<IFRAME SRC=\"javascript:alert('XSS');\"></IFRAME>",
  "<iframe src=http://xss.rocks/scriptlet.html <",
  "<TABLE BACKGROUND=\"javascript:alert('XSS')\"><TR><TD BACKGROUND=\"javascript:alert('XSS')\">c</TD></TR></TABLE>",
  '<OBJECT TYPE="text/x-scriptlet" DATA="http://xss.rocks/scriptlet.html"></OBJECT>',
  '<EMBED SRC="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">',
  '<INPUT TYPE="IMAGE" SRC="javascript:alert(\'XSS\');">',
  '<form action="javascript:alert(1)"><button>go</button></form>',
  "<!--[if gte IE 4]><SCRIPT>alert('XSS');</SCRIPT><![endif]-->",
  '<p title="</p><img src=x onerror=alert(1)>">t</p>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  "<template><img src=x onerror=alert(1)></template>",
  '<base href="javascript:alert(1)//">',
  '<link rel="stylesheet" href="http://evil.example/x.css">',
  '<td colspan="2 onmouseover=alert(1)">c</td>',
];

describe("sanitizeRichText — XSS corpus", () => {
  it.each(XSS_VECTORS)("neutralises %s", (vector) => {
    const clean = sanitizeRichText(vector);
    expectOnlyAllowedMarkup(clean);
    expect(clean).not.toMatch(
      /<\s*(script|img|iframe|object|embed|svg|math|style|meta|form|input|base|link|body|template|noscript)/i,
    );
    expect(clean).not.toMatch(/\son[a-z]+\s*=/i);
    expect(clean).not.toMatch(/javascript:|vbscript:|data:|expression\(|url\(|behavior/i);
    expect(clean).not.toContain('href="//');
    // A fixed point: sanitising again changes nothing.
    expect(sanitizeRichText(clean)).toBe(clean);
  });

  it("keeps allowed links and forces rel, dropping target and handlers", () => {
    expect(
      sanitizeRichText('<a href="https://ok.example" target="_blank" onclick="alert(1)">ok</a>'),
    ).toBe('<a href="https://ok.example" rel="noopener noreferrer">ok</a>');
    expect(sanitizeRichText('<a href="mailto:pm@example.com" rel="opener">mail</a>')).toBe(
      '<a href="mailto:pm@example.com" rel="noopener noreferrer">mail</a>',
    );
  });

  it("turns a refused link into plain text", () => {
    expect(sanitizeRichText("<a href=\"javascript:alert('XSS')\">click</a>")).toBe(
      "<span>click</span>",
    );
    expect(sanitizeRichText('<a href="/projects/1">relative</a>')).toBe("<span>relative</span>");
    expect(sanitizeRichText("<a>no address</a>")).toBe("<span>no address</span>");
  });

  it("drops script and style text, keeps the text of other stripped wrappers", () => {
    expect(sanitizeRichText("<p>a<script>alert(1)</script>b</p>")).toBe("<p>ab</p>");
    expect(sanitizeRichText("<p>a<style>p{}</style>b</p>")).toBe("<p>ab</p>");
    expect(sanitizeRichText("<p><code>x</code> <mark>y</mark></p>")).toBe("<p>x y</p>");
  });

  it("escapes text that looks like markup", () => {
    expect(sanitizeRichText("<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>")).toBe(
      "<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>",
    );
  });
});

describe("sanitizeRichText — what the toolbar makes survives", () => {
  it.each([
    "<p>plain</p>",
    "<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s></p>",
    "<h2>one</h2><h3>two</h3><h4>three</h4>",
    "<ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol>",
    "<blockquote><p>quote</p></blockquote>",
    '<p style="text-align:center">c</p><h2 style="text-align:right">r</h2>',
    '<p><span style="font-family:Cambria;font-size:14pt">styled</span></p>',
    '<p><span style="font-family:&quot;Times New Roman&quot;">quoted</span></p>',
    '<p><span style="text-decoration:underline line-through">deco</span></p>',
    '<table><tbody><tr><th colspan="2">h</th></tr><tr><td rowspan="2">a</td><td>b</td></tr></tbody></table>',
    '<p>line<br />break <a href="https://example.com" rel="noopener noreferrer">link</a></p>',
  ])("keeps %s", (html) => {
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("normalises Tiptap's table output", () => {
    const tiptap =
      '<table style="min-width: 75px"><colgroup><col style="min-width: 25px"></colgroup>' +
      '<tbody><tr><th colspan="1" rowspan="1"><p>H</p></th></tr>' +
      '<tr><td colspan="1" rowspan="1" colwidth="100"><p>C</p></td></tr></tbody></table>';
    expect(sanitizeRichText(tiptap)).toBe(
      "<table><tbody><tr><th><p>H</p></th></tr><tr><td><p>C</p></td></tr></tbody></table>",
    );
  });

  it("drops style properties and values the toolbar never makes", () => {
    expect(
      sanitizeRichText('<span style="color:red;font-size:12pt;font-family:Arial(1)">x</span>'),
    ).toBe('<span style="font-size:12pt">x</span>');
    expect(sanitizeRichText('<p style="text-align:middle">x</p>')).toBe("<p>x</p>");
    expect(sanitizeRichText('<td colspan="99">x</td>')).toBe("<td>x</td>");
  });

  it("maps other headings and synonyms onto the editor's tags", () => {
    expect(sanitizeRichText("<h1>a</h1><h5>b</h5><h6>c</h6>")).toBe(
      "<h2>a</h2><h4>b</h4><h4>c</h4>",
    );
    expect(sanitizeRichText("<b>a</b><i>b</i><strike>c</strike><del>d</del>")).toBe(
      "<strong>a</strong><em>b</em><s>c</s><s>d</s>",
    );
  });
});

describe("legacy Access markup", () => {
  it("converts <div> to paragraphs and decodes entities", () => {
    expect(
      sanitizeRichText(
        "<div>Clicking &quot;New Item&quot; in Finanacials takes user to parking lot items</div>",
      ),
    ).toBe('<p>Clicking "New Item" in Finanacials takes user to parking lot items</p>');
  });

  it("converts <font face size> (attributes split over CRLF) to a styled span", () => {
    expect(
      sanitizeRichText(
        '<div>T<u>his </u>field support <strong>rich </strong>text <font\r\nface="Arial Rounded MT Bold" size=5><em>editing</em></font></div>',
      ),
    ).toBe(
      '<p>T<u>his </u>field support <strong>rich </strong>text <span style="font-family:Arial Rounded MT Bold;font-size:18pt"><em>editing</em></span></p>',
    );
  });

  it("keeps a font without usable attributes as a bare span", () => {
    expect(sanitizeRichText('<font face="x;y" size="12" color="red">t</font>')).toBe(
      "<span>t</span>",
    );
  });

  it.each([
    ["1", "8pt"],
    ["3", "12pt"],
    ["5", "18pt"],
    ["7", "36pt"],
    ["+1", "14pt"],
    ["-2", "8pt"],
    ["+9", "36pt"],
    ["0", "8pt"],
  ])("maps <font size=%s> to %s", (size, pt) => {
    expect(legacyFontSizeToPt(size)).toBe(pt);
  });

  it.each([undefined, "", "big", "12", "1.5"])("ignores <font size=%s>", (size) => {
    expect(legacyFontSizeToPt(size)).toBeNull();
  });

  /** Every HTML literal in the seeded Access tables that hold rich text. */
  function seededHtml(): string[] {
    return ["008_meeting.sql", "015_risk_issue.sql", "018_it_resource_item.sql"].flatMap((file) => {
      const sql = readFileSync(`db/seed/${file}`, "utf8").replace(
        /'\s*\+\s*NCHAR\(13\)\s*\+\s*NCHAR\(10\)\s*\+\s*N'/g,
        "\r\n",
      );
      return Array.from(sql.matchAll(/N'((?:[^']|'')*)'/g), (m) => m[1].replace(/''/g, "'")).filter(
        (value) => value.includes("<"),
      );
    });
  }

  it("finds the seeded samples", () => {
    expect(seededHtml().length).toBe(19);
  });

  const words = (text: string) => text.replace(/\s+/g, " ").trim();

  it.each(seededHtml())("converts seeded value %s without losing text", (html) => {
    const clean = sanitizeRichText(html);
    expectOnlyAllowedMarkup(clean);
    expect(clean).not.toMatch(/<\/?(div|font)\b/i);
    const text = html
      .replace(/<[^>]*>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    expect(words(htmlToPlainText(html))).toBe(words(text));
  });
});

describe("htmlToPlainText", () => {
  it("puts blocks on their own lines and decodes entities", () => {
    expect(
      htmlToPlainText(
        '<h2>Title</h2><p>One &amp; <strong>two</strong> &lt;3&gt; "q"</p><ul><li><p>a</p></li><li><p>b</p></li></ul>',
      ),
    ).toBe('Title\nOne & two <3> "q"\na\nb');
  });

  it("separates table cells with tabs and rows with line breaks", () => {
    expect(
      htmlToPlainText(
        "<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>",
      ),
    ).toBe("A\tB\n1\t2");
  });

  it("keeps at most one blank line", () => {
    expect(htmlToPlainText("<p>a</p><p></p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });

  it("turns <br> into a line break and strips scripts", () => {
    expect(htmlToPlainText("<p>a<br>b<script>alert(1)</script></p>")).toBe("a\nb");
  });

  it("is empty for empty documents", () => {
    expect(htmlToPlainText("<p></p>")).toBe("");
    expect(htmlToPlainText("")).toBe("");
  });
});
