import type { StickyColor } from "../schemas/location";
import { messages } from "@/lib/messages";

export interface StickyColorStyle {
  label: string;
  surfaceClass: string;
  chipClass: string;
  dotColorVar: string;
}

export const STICKY_COLOR_STYLES: Record<StickyColor, StickyColorStyle> = {
  yellow: {
    label: messages.crossLinks.colors.yellow,
    surfaceClass: "bg-(--tone-yellow-soft) border-(--tone-yellow-ink)/35 text-(--tone-yellow-ink)",
    chipClass: "bg-(--tone-yellow-soft) border-(--tone-yellow-ink)/40 text-(--tone-yellow-ink)",
    dotColorVar: "var(--tone-yellow-ink)",
  },
  blue: {
    label: messages.crossLinks.colors.blue,
    surfaceClass: "bg-(--tone-blue-soft) border-(--tone-blue-ink)/35 text-(--tone-blue-ink)",
    chipClass: "bg-(--tone-blue-soft) border-(--tone-blue-ink)/40 text-(--tone-blue-ink)",
    dotColorVar: "var(--tone-blue-ink)",
  },
  green: {
    label: messages.crossLinks.colors.green,
    surfaceClass: "bg-(--tone-green-soft) border-(--tone-green-ink)/35 text-(--tone-green-ink)",
    chipClass: "bg-(--tone-green-soft) border-(--tone-green-ink)/40 text-(--tone-green-ink)",
    dotColorVar: "var(--tone-green-ink)",
  },
  orange: {
    label: messages.crossLinks.colors.orange,
    surfaceClass: "bg-(--tone-orange-soft) border-(--tone-orange-ink)/35 text-(--tone-orange-ink)",
    chipClass: "bg-(--tone-orange-soft) border-(--tone-orange-ink)/40 text-(--tone-orange-ink)",
    dotColorVar: "var(--tone-orange-ink)",
  },
  purple: {
    label: messages.crossLinks.colors.purple,
    surfaceClass: "bg-(--tone-purple-soft) border-(--tone-purple-ink)/35 text-(--tone-purple-ink)",
    chipClass: "bg-(--tone-purple-soft) border-(--tone-purple-ink)/40 text-(--tone-purple-ink)",
    dotColorVar: "var(--tone-purple-ink)",
  },
  gray: {
    label: messages.crossLinks.colors.gray,
    surfaceClass: "bg-(--tone-gray-soft) border-(--tone-gray-ink)/35 text-(--tone-gray-ink)",
    chipClass: "bg-(--tone-gray-soft) border-(--tone-gray-ink)/40 text-(--tone-gray-ink)",
    dotColorVar: "var(--tone-gray-ink)",
  },
};
