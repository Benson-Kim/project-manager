"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { isAllowedLocalPath, type OpenLocalPathResult } from "@/lib/rich-text/links";
import { messages } from "@/lib/messages";

type DesktopBridge = { openLocalPath?: (path: string) => Promise<OpenLocalPathResult> };

function desktopOpener() {
  return (window as Window & { desktop?: DesktopBridge }).desktop?.openLocalPath;
}

/** Reports the outcome in a toast and never throws. */
export async function copyLocalPath(
  path: string,
  toast: ReturnType<typeof useToast>["toast"],
): Promise<boolean> {
  try {
    // navigator.clipboard is undefined on a plain-http page, so this can throw.
    await navigator.clipboard.writeText(path);
  } catch {
    toast({ variant: "error", title: messages.richText.localPathCopyFailed });
    return false;
  }
  toast({ variant: "success", title: messages.richText.localPathCopied });
  return true;
}

type LocalPathActions = {
  open: DesktopBridge["openLocalPath"];
  showPath: (path: string) => void;
  fail: (title: string) => void;
};

function activates(event: Event): boolean {
  const { button, key, repeat } = event as Partial<MouseEvent & KeyboardEvent>;
  return event.type === "click" ? button === 0 : key === "Enter" && !repeat;
}

/** A click or Enter on a folder link outside an editor opens it, or shows it on the web. */
export function activateLocalPathLink(
  event: Event,
  { open, showPath, fail }: LocalPathActions,
): void {
  const target = event.target as Partial<Element> | null;
  if (!activates(event) || !target?.closest) return;
  const anchor = target.closest("a[data-local-path]");
  if (!anchor || anchor.closest("[contenteditable='true']")) return;
  event.preventDefault();
  const path = anchor.getAttribute("data-local-path") ?? "";
  const refused = () => fail(messages.richText.localPathRefused);
  if (anchor.hasAttribute("href") || !isAllowedLocalPath(path)) return refused();
  if (!open) return showPath(path);
  open(path).then((result) => {
    if (result.ok) return;
    if (result.reason === "notFound") fail(messages.richText.localPathNotFound);
    else refused();
  }, refused);
}

/**
 * Folder links in read-only rich text (ADR-0075). One document listener, because
 * the note view renders sanitised HTML on the server. The desktop app opens the
 * folder; the web build shows the path to copy. Links inside an editor do nothing.
 */
export function LocalPathLinkHandler() {
  const { toast } = useToast();
  const [webPath, setWebPath] = useState<string | null>(null);

  useEffect(() => {
    const onActivate = (event: Event) =>
      activateLocalPathLink(event, {
        open: desktopOpener(),
        showPath: setWebPath,
        fail: (title) => toast({ variant: "error", title }),
      });
    document.addEventListener("click", onActivate);
    document.addEventListener("keydown", onActivate);
    return () => {
      document.removeEventListener("click", onActivate);
      document.removeEventListener("keydown", onActivate);
    };
  }, [toast]);

  const close = () => setWebPath(null);
  const copy = async (path: string) => {
    if (await copyLocalPath(path, toast)) close();
  };

  return (
    <Dialog
      open={webPath !== null}
      onOpenChange={(open) => (open ? undefined : close())}
      title={messages.richText.localPathTitle}
    >
      {webPath !== null ? (
        <div className="flex flex-col gap-4">
          <p className="font-mono text-sm break-all select-all" data-testid="local-path-value">
            {webPath}
          </p>
          <DialogActions onCancel={close}>
            <Button onClick={() => void copy(webPath)}>{messages.richText.localPathCopy}</Button>
          </DialogActions>
        </div>
      ) : null}
    </Dialog>
  );
}
