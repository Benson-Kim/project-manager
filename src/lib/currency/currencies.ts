import { REGION_CURRENCY, ZONE_REGION } from "./currency-data.generated";

/**
 * Currencies for the financials module (ADR-0051). The list is not held here:
 * it comes from the platform's ICU data through Intl, so it follows whatever
 * currencies the runtime knows and needs no maintenance. Only the two tables
 * Intl does not expose are generated (./currency-data.generated).
 *
 * Symbols resolve under a FIXED locale, like src/lib/format.ts and the layout's
 * date format: a figure must read the same on the server and in every browser,
 * or it would drift on hydration and between two people reading one budget.
 */

/** The stored value meaning "show no currency symbol" — the default (client decision, PDF p.33). */
export const NO_CURRENCY = "";

/** The locale symbols and names resolve under, so output never varies by viewer. */
const SYMBOL_LOCALE = "en";

export interface Currency {
  /** ISO 4217 alphabetic code, e.g. "USD". */
  code: string;
  /** The currency's name in SYMBOL_LOCALE, e.g. "US Dollar". */
  name: string;
  /** Its narrow symbol ("$"), or the code itself when ICU has no symbol for it ("KES"). */
  symbol: string;
}

/** An ISO 4217 code by shape. Deliberately not a check against Intl: see currencyOrNone. */
export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

/**
 * A stored value as it may be used: a well-shaped code, else NO_CURRENCY.
 *
 * The shape is the gate, not membership of Intl.supportedValuesOf: that list
 * differs between Node's ICU build and a browser's, so a code stored on one
 * machine must not become invalid on another. An unknown code still renders —
 * currencySymbol falls back to the code itself.
 */
export function currencyOrNone(value: string | null | undefined): string {
  return value && isCurrencyCode(value) ? value : NO_CURRENCY;
}

const symbols = new Map<string, string>();

/** The symbol to put in front of an amount; "" for NO_CURRENCY, the code when ICU has no symbol. */
export function currencySymbol(code: string | null | undefined): string {
  const currency = currencyOrNone(code);
  if (currency === NO_CURRENCY) return "";
  const cached = symbols.get(currency);
  if (cached !== undefined) return cached;
  let symbol = currency;
  try {
    const parts = new Intl.NumberFormat(SYMBOL_LOCALE, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    symbol = parts.find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    // An unknown code: the code itself reads correctly in front of the amount.
  }
  symbols.set(currency, symbol);
  return symbol;
}

let listed: Currency[] | null = null;

/**
 * Every currency the runtime knows, by name. Built from Intl, so it updates
 * with the platform's ICU data and is never hand-maintained (user decision).
 */
export function listCurrencies(): Currency[] {
  if (listed) return listed;
  const names = new Intl.DisplayNames([SYMBOL_LOCALE], { type: "currency" });
  listed = Intl.supportedValuesOf("currency")
    .map((code) => ({ code, name: names.of(code) ?? code, symbol: currencySymbol(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, SYMBOL_LOCALE));
  return listed;
}

/**
 * The currency of a region ("KE" -> "KES"), or NO_CURRENCY when it has none
 * (Antarctica) or the region is unknown.
 */
export function currencyOfRegion(region: string | null | undefined): string {
  return region ? currencyOrNone(REGION_CURRENCY[region.toUpperCase()]) : NO_CURRENCY;
}

/**
 * The currency to offer first, from where the user actually is: their IANA time
 * zone, falling back to their language tag's region. No network call, no IP
 * lookup and no permission prompt — the zone is the honest location signal,
 * since a language tag is a language preference (an en-US desktop in Nairobi
 * would otherwise be offered US dollars).
 *
 * NO_CURRENCY when nothing resolves. Call it from a client component only: it
 * reads the viewer's environment, so it must never decide what is rendered on
 * the server.
 */
export function suggestedCurrency(): string {
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  const byZone = currencyOfRegion(ZONE_REGION[resolved.timeZone]);
  if (byZone !== NO_CURRENCY) return byZone;
  return currencyOfRegion(new Intl.Locale(resolved.locale).region);
}
