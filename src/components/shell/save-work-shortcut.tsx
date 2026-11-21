"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { formToSave, isSaveShortcut, type SaveCandidates } from "./save-work";

type DesktopBridge = { onSaveWork?: (listener: () => void) => () => void };

const DIALOG = '[role="dialog"], [role="alertdialog"], dialog[open]';

function shown(el: Element): boolean {
  return el.getClientRects().length > 0;
}

function saveButton(form: HTMLFormElement): HTMLButtonElement | HTMLInputElement | null {
  for (const el of Array.from(form.elements)) {
    if (
      (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) &&
      el.type === "submit" &&
      !el.disabled &&
      shown(el)
    )
      return el;
  }
  return null;
}

function savable(forms: Iterable<HTMLFormElement>): HTMLFormElement[] {
  return Array.from(forms).filter((f) => !f.matches('[role="search"]') && saveButton(f));
}

function candidates(from: Element | null): SaveCandidates<HTMLFormElement> {
  const around = from?.closest("form") ?? null;
  const dialogs = Array.from(document.querySelectorAll(DIALOG)).filter(shown);
  return {
    around: around && savable([around]).length ? around : null,
    dialogs: dialogs.map((d) => savable(d.querySelectorAll("form"))),
    page: savable(document.forms).filter((f) => !f.closest(DIALOG)),
  };
}

/** Ctrl+S, and Save on the desktop app's right-click menu, press the Save button of the form being edited. */
export function SaveWorkShortcut() {
  const { toast } = useToast();

  useEffect(() => {
    let menuTarget: EventTarget | null = null;
    const save = (from: Element | null) => {
      const form = formToSave(candidates(from));
      const button = form && saveButton(form);
      if (form && button) form.requestSubmit(button);
      else toast({ variant: "info", title: messages.app.nothingToSave });
    };
    const onKey = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      save(event.target instanceof Element ? event.target : document.activeElement);
    };
    const onMenu = (event: MouseEvent) => {
      menuTarget = event.target;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onMenu, true);
    const bridge = (window as { desktop?: DesktopBridge }).desktop;
    const stopDesktop = bridge?.onSaveWork?.(() => {
      const from = menuTarget instanceof Element && menuTarget.isConnected ? menuTarget : null;
      save(from ?? document.activeElement);
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onMenu, true);
      stopDesktop?.();
    };
  }, [toast]);

  return null;
}
