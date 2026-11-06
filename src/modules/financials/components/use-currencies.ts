import { useSyncExternalStore } from "react";
import {
  NO_CURRENCY,
  type Currency,
  listCurrencies,
  suggestedCurrency,
} from "@/lib/currency/currencies";

/** Nothing to subscribe to: neither the zone nor the runtime's list changes while this is open. */
const noSubscription = () => () => {};

const NO_CURRENCIES: Currency[] = [];

/**
 * The currency to offer first, resolved on the client only: it reads the
 * viewer's time zone, which the server cannot know, so deciding it during
 * render would differ between the two and drift on hydration. The server
 * snapshot is "no symbol", and React swaps in the real one after hydrating.
 */
export function useSuggestedCurrency() {
  return useSyncExternalStore(noSubscription, suggestedCurrency, () => NO_CURRENCY);
}

/**
 * Every currency the runtime knows, resolved on the client only, for the reason
 * the suggestion is. Intl's currencies come from the runtime's own ICU build
 * and the builds disagree: Node 22 lists 162, Chrome 139 lists 159, and they
 * name ZWL differently. A list rendered on the server therefore cannot be
 * hydrated, and React answers a mismatch by discarding the form and rendering
 * it again, which loses a currency already chosen in it. The server snapshot is
 * empty; the names arrive with hydration.
 */
export function useCurrencies() {
  return useSyncExternalStore(noSubscription, listCurrencies, () => NO_CURRENCIES);
}
