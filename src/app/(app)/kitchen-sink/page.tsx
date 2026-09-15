import { notFound } from "next/navigation";
import { KitchenSink } from "./kitchen-sink";

/**
 * Dev-only gallery exercising every shared primitive — the surface for the
 * foundation Playwright + axe suite. Excluded from production (404).
 */
export const metadata = { title: "Kitchen sink" };

export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === "production" && process.env.E2E !== "1") {
    notFound();
  }
  return <KitchenSink />;
}
