export const adminHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Modulus testers</title></head>
<body>
<h1>Modulus testers</h1>
<form id="auth"><label>Admin token <input id="token" type="password" autocomplete="off" required minlength="32"></label> <button>Load testers</button></form>
<p id="status" role="status"></p>
<p><button id="issue-free" type="button">Issue free licence code</button> <button id="issue-full" type="button">Issue full licence code</button> <output id="issued"></output></p>
<table><thead><tr><th>Email</th><th>Kind</th><th>Started</th><th>Expires</th><th>Feedback</th><th>Testimonial</th><th>Name</th><th>Actions</th></tr></thead><tbody id="rows"></tbody></table>
<h2 id="feedback-title"></h2><ul id="feedback"></ul>
<script src="/admin.js"></script>
</body>
</html>`;

interface Consent {
  kind: "testimonial" | "name";
  granted: boolean;
  quote: string;
  displayName: string | null;
}

interface Tester {
  licence: { licenceId: string; kind: string; startsAt: number; expiresAt: number | null };
  email: string | null;
  feedbackCount: number;
  consents: Consent[];
}

export function adminScript(): void {
  let token = "";
  const byId = (id: string) => document.getElementById(id) as HTMLElement;
  const status = byId("status");
  const day = (ms: number | null) =>
    ms === null ? "never" : new Date(ms).toISOString().slice(0, 10);
  const say = (text: string) => {
    status.textContent = text;
  };
  const addCell = (row: HTMLTableRowElement, text: string) => {
    row.insertCell().textContent = text;
  };
  const makeButton = (label: string, onClick: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.addEventListener("click", onClick);
    return element;
  };
  const makeConfirmButton = (label: string, onConfirm: () => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disarm = () => {
      clearTimeout(timer);
      timer = undefined;
      element.textContent = label;
    };
    const element = makeButton(label, () => {
      if (timer === undefined) {
        element.textContent = `${label}: click again to confirm`;
        timer = setTimeout(disarm, 5000);
        return;
      }
      disarm();
      onConfirm();
    });
    return element;
  };
  const consentText = (consents: Consent[], kind: Consent["kind"]) => {
    const consent = consents.find((c) => c.kind === kind);
    if (!consent || !consent.granted) return "no";
    return kind === "name" ? `yes: ${consent.displayName ?? ""}` : `yes: ${consent.quote}`;
  };

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as T;
  }

  async function run(task: () => Promise<void>) {
    try {
      await task();
    } catch (error) {
      say(error instanceof Error ? error.message : "Request failed");
    }
  }

  async function showFeedback(tester: Tester) {
    const { feedback } = await post<{
      feedback: { appVersion: string; body: string; at: number }[];
    }>("/v1/admin/feedback", { licenceId: tester.licence.licenceId });
    byId("feedback-title").textContent =
      `Feedback from ${tester.email ?? tester.licence.licenceId}`;
    const list = byId("feedback");
    list.replaceChildren(
      ...feedback.map((item) => {
        const entry = document.createElement("li");
        entry.textContent = `${day(item.at)} (${item.appVersion}): ${item.body}`;
        return entry;
      }),
    );
  }

  async function load() {
    const { testers } = await post<{ testers: Tester[] }>("/v1/admin/testers", {});
    const body = byId("rows") as HTMLTableSectionElement;
    body.replaceChildren();
    for (const tester of testers) {
      const row = body.insertRow();
      addCell(row, tester.email ?? "(redeem code)");
      addCell(row, tester.licence.kind);
      addCell(row, day(tester.licence.startsAt));
      addCell(row, day(tester.licence.expiresAt));
      addCell(row, String(tester.feedbackCount));
      addCell(row, consentText(tester.consents, "testimonial"));
      addCell(row, consentText(tester.consents, "name"));
      const actions = row.insertCell();
      actions.append(
        makeButton("Feedback", () => void run(() => showFeedback(tester))),
        makeConfirmButton("Make free", () => void run(() => convert(tester, "free"))),
        makeConfirmButton("Make full", () => void run(() => convert(tester, "full"))),
      );
    }
    say(`${testers.length} licences`);
  }

  async function convert(tester: Tester, kind: "free" | "full") {
    await post("/v1/admin/convert", { licenceId: tester.licence.licenceId, kind });
    await load();
  }

  async function issue(kind: "free" | "full") {
    const { code } = await post<{ code: string }>("/v1/admin/issue", { kind });
    byId("issued").textContent = `${kind} licence code: ${code}`;
  }

  byId("auth").addEventListener("submit", (event) => {
    event.preventDefault();
    token = (byId("token") as HTMLInputElement).value;
    void run(load);
  });
  byId("issue-free").addEventListener("click", () => void run(() => issue("free")));
  byId("issue-full").addEventListener("click", () => void run(() => issue("full")));
}
