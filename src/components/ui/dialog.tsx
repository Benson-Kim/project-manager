"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { isToastInteraction } from "./toast";
import { useCallback, useRef } from "react";
import { messages } from "@/lib/messages";

/**
 * The ONE overlay engine : Radix Dialog. Two skins —
 * <Dialog> (centred, small content like confirmations) and <Sheet>
 * (bottom sheet < md / right side panel >= md, for record detail/edit,
 * ADR-0010). Focus trapping, Esc and overlay click come from Radix; focus
 * return to the opener is handled here (useReturnFocusToOpener) because the
 * wrappers are controlled and have no Radix Trigger. Modules compose these;
 * they never import Radix directly.
 */
interface OverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One-sentence consequence/description; rendered under the title. */
  description?: string;
  children?: React.ReactNode;
}

function Overlay() {
  return (
    <RadixDialog.Overlay className="fixed inset-0 z-(--z-dialog) bg-black/50 transition-opacity duration-(--duration-base)" />
  );
}

/**
 * Focus return for CONTROLLED overlays (STANDARDS §8): Radix only restores
 * focus to its own <Dialog.Trigger>, which these wrappers do not use (openers
 * are arbitrary buttons, list rows, URL state). Capture the opener when focus
 * moves into the overlay and put focus back on close.
 */
function useReturnFocusToOpener() {
  const openerRef = useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = useCallback(() => {
    // Fires before focus moves into the content — activeElement is the opener.
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    // preventDefault stops Radix focusing its (absent) Trigger.
    event.preventDefault();
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}

/** Closing or using a toast (e.g. a due to-do alarm) must not dismiss an open sheet or dialog. */
function keepOpenForToasts(event: CustomEvent<{ originalEvent: Event }>) {
  if (isToastInteraction(event)) event.preventDefault();
}

function CloseButton() {
  return (
    <RadixDialog.Close
      aria-label={messages.actions.close}
      className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken"
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </RadixDialog.Close>
  );
}

/** `wide`: room for a small grid (e.g. the team's permission matrix); default is 480px. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: OverlayProps & { wide?: boolean }) {
  const focusReturn = useReturnFocusToOpener();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <RadixDialog.Content
          {...focusReturn}
          onInteractOutside={keepOpenForToasts}
          aria-describedby={description ? undefined : undefined}
          className={`fixed top-1/2 left-1/2 z-(--z-dialog) w-[calc(100vw-2rem)] ${wide ? "max-w-[720px]" : "max-w-[480px]"} -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-4 shadow-xl`}
        >
          <RadixDialog.Title className="pr-11 text-base font-semibold text-ink">
            {title}
          </RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          <CloseButton />
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * A non-modal panel at a fixed spot on the page, e.g. under a datasheet cell
 * (ADR-0023): no overlay, the page stays usable. Esc calls onEscape; a click
 * or focus outside calls onOutside with what was touched (Access commits a
 * cell when you leave it). Focus returns to the opener unless it left the
 * panel for something else on the page.
 */
export function AnchoredPanel({
  open,
  title,
  style,
  onEscape,
  onOutside,
  testId,
  children,
}: {
  open: boolean;
  /** Accessible name (visually hidden). */
  title: string;
  /** Fixed position and size in viewport px. */
  style: React.CSSProperties;
  onEscape: () => void;
  onOutside: (target: Node | null) => void;
  testId?: string;
  children: React.ReactNode;
}) {
  const openerRef = useRef<HTMLElement | null>(null);
  const leftRef = useRef(false);
  return (
    <RadixDialog.Root open={open} modal={false}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          aria-describedby={undefined}
          data-testid={testId}
          style={style}
          onOpenAutoFocus={() => {
            openerRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            leftRef.current = false;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!leftRef.current) openerRef.current?.focus();
            openerRef.current = null;
          }}
          onFocus={() => {
            leftRef.current = false;
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onEscape();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
            if (isToastInteraction(event)) return;
            leftRef.current = true;
            onOutside(event.detail.originalEvent.target as Node | null);
          }}
          className="fixed z-(--z-dialog) flex flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-xl"
        >
          <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: OverlayProps & {
  /** 640 px instead of 480 px from md up, for a sheet that carries a panel beside its form. */
  wide?: boolean;
}) {
  const focusReturn = useReturnFocusToOpener();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Overlay />
        <RadixDialog.Content
          {...focusReturn}
          onInteractOutside={keepOpenForToasts}
          className={`fixed inset-x-0 bottom-0 z-(--z-dialog) max-h-[85dvh] overflow-y-auto rounded-t-lg border-t border-line bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-xl md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:max-w-full md:rounded-none md:border-t-0 md:border-l ${wide ? "md:w-[640px]" : "md:w-[480px]"}`}
        >
          <RadixDialog.Title className="pr-11 text-base font-semibold text-ink">
            {title}
          </RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-sm text-ink-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          <CloseButton />
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
