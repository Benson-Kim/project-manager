import { ipcRenderer } from "electron";
import { LICENCE_CHANNELS } from "../ipc-channels";
import { consentChoices, nameAllowed } from "./consent";
import { reasonText, statusText, type LicenceView } from "./licence-text";

type Reply = { ok: true } | { ok: false; reason: string };

const call = <T = Reply>(channel: string, input?: unknown): Promise<T> =>
  ipcRenderer.invoke(channel, input).catch(() => ({ ok: false, reason: "failed" }));

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const say = (text: string) => (byId("message").textContent = text);
const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

async function refresh(): Promise<void> {
  const view = await call<LicenceView | Reply>(LICENCE_CHANNELS.state);
  if (!("status" in view)) return void say(reasonText("failed"));
  byId("status").textContent = statusText(view);
  byId("reconnect").hidden = view.status !== "reconnect";
  byId("start").hidden = view.kind !== null;
}

function onSubmit(
  id: string,
  run: (data: FormData, form: HTMLFormElement) => Promise<string | null>,
): void {
  const form = byId<HTMLFormElement>(id);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    if (button?.disabled) return;
    if (button) button.disabled = true;
    say("");
    run(new FormData(form), form)
      .then((text) => text !== null && say(text))
      .catch(() => say(reasonText("failed")))
      .finally(() => button && (button.disabled = false));
  });
}

async function settled(reply: Reply, done: string): Promise<string> {
  if (!reply.ok) return reasonText(reply.reason);
  await refresh();
  return done;
}

function wireActivation(): void {
  onSubmit("trial-email", async (data) => {
    const reply = await call(LICENCE_CHANNELS.trialRequest, { email: value(data, "email") });
    if (!reply.ok) return reasonText(reply.reason);
    byId("trial-code").hidden = false;
    byId("trial-code-input").focus();
    return "We've sent a code to that email.";
  });
  onSubmit("trial-code", async (data) => {
    const email = value(new FormData(byId<HTMLFormElement>("trial-email")), "email");
    const reply = await call(LICENCE_CHANNELS.trialVerify, { email, code: value(data, "code") });
    return settled(reply, "Your trial has started.");
  });
  onSubmit("redeem", async (data) =>
    settled(
      await call(LICENCE_CHANNELS.redeem, { code: value(data, "code") }),
      "The app is activated.",
    ),
  );
  byId("reconnect").addEventListener("click", () => {
    say("");
    void call(LICENCE_CHANNELS.reconnect)
      .then(refresh)
      .then(() => byId("reconnect").hidden || say(reasonText("offline")));
  });
}

function wireFeedback(): void {
  onSubmit("feedback-form", async (data, form) => {
    const reply = await call(LICENCE_CHANNELS.feedbackSend, { body: value(data, "body") });
    if (!reply.ok) return reasonText(reply.reason);
    form.reset();
    return "Thanks. Your feedback was sent.";
  });
  const consent = byId<HTMLFormElement>("consent");
  const nameTick = consent.elements.namedItem("name") as HTMLInputElement;
  const syncNameTick = () => {
    const data = new FormData(consent);
    nameTick.disabled = !nameAllowed({
      testimonial: data.get("testimonial") !== null,
      quote: value(data, "quote"),
    });
    if (nameTick.disabled) nameTick.checked = false;
  };
  consent.addEventListener("input", syncNameTick);
  syncNameTick();
  onSubmit("consent", async (data) => {
    const result = consentChoices({
      testimonial: data.get("testimonial") !== null,
      named: data.get("name") !== null,
      quote: value(data, "quote"),
      displayName: value(data, "displayName"),
    });
    if ("error" in result) return result.error;
    for (const choice of result.choices) {
      const reply = await call(LICENCE_CHANNELS.feedbackConsent, choice);
      if (!reply.ok) return reasonText(reply.reason);
    }
    return "Saved.";
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const feedback = new URLSearchParams(location.search).get("view") === "feedback";
  byId("activation").hidden = feedback;
  byId("feedback").hidden = !feedback;
  if (feedback) wireFeedback();
  else {
    wireActivation();
    void refresh();
  }
});
