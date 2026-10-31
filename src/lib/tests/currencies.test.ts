import { describe, it, expect } from "vitest";
import {
  NO_CURRENCY,
  currencyOfRegion,
  currencyOrNone,
  currencySymbol,
  isCurrencyCode,
  listCurrencies,
  suggestedCurrency,
} from "../currency/currencies";
import { REGION_CURRENCY, ZONE_REGION } from "../currency/currency-data.generated";

describe("isCurrencyCode", () => {
  it("accepts a three-letter upper-case code", () => {
    expect(isCurrencyCode("USD")).toBe(true);
  });
  it("rejects a lower-case code", () => {
    expect(isCurrencyCode("usd")).toBe(false);
  });
  it("rejects anything that is not three letters", () => {
    expect(isCurrencyCode("US")).toBe(false);
    expect(isCurrencyCode("USDD")).toBe(false);
    expect(isCurrencyCode("US1")).toBe(false);
    expect(isCurrencyCode("")).toBe(false);
  });
});

describe("currencyOrNone", () => {
  it("keeps a well-shaped code", () => {
    expect(currencyOrNone("EUR")).toBe("EUR");
  });
  it("keeps a code the runtime does not know, so a stored value stays usable", () => {
    expect(currencyOrNone("QQQ")).toBe("QQQ");
  });
  it("stores junk as no currency", () => {
    expect(currencyOrNone("not-a-code")).toBe(NO_CURRENCY);
  });
  it("treats null, undefined and empty as no currency", () => {
    expect(currencyOrNone(null)).toBe(NO_CURRENCY);
    expect(currencyOrNone(undefined)).toBe(NO_CURRENCY);
    expect(currencyOrNone("")).toBe(NO_CURRENCY);
  });
});

describe("currencySymbol", () => {
  it("returns the narrow symbol for a major currency", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("GBP")).toBe("£");
  });
  it("falls back to the code when the locale has no narrow symbol", () => {
    expect(currencySymbol("KES")).toBe("KES");
  });
  it("renders an unknown code as itself rather than throwing", () => {
    expect(currencySymbol("QQQ")).toBe("QQQ");
  });
  it("returns an empty string for no currency", () => {
    expect(currencySymbol(NO_CURRENCY)).toBe("");
    expect(currencySymbol(null)).toBe("");
    expect(currencySymbol(undefined)).toBe("");
  });
  it("returns an empty string for a malformed value", () => {
    expect(currencySymbol("usd")).toBe("");
  });
});

describe("listCurrencies", () => {
  it("lists what the runtime knows, sorted by name", () => {
    const list = listCurrencies();
    const names = list.map((currency) => currency.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual(names);
  });
  it("gives every entry a code, a name and a symbol", () => {
    for (const currency of listCurrencies()) {
      expect(isCurrencyCode(currency.code)).toBe(true);
      expect(currency.name.length).toBeGreaterThan(0);
      expect(currency.symbol.length).toBeGreaterThan(0);
    }
  });
  it("is memoized, so a picker re-render does not rebuild it", () => {
    expect(listCurrencies()).toBe(listCurrencies());
  });
});

describe("currencyOfRegion", () => {
  it("maps a region to its currency", () => {
    expect(currencyOfRegion("KE")).toBe("KES");
    expect(currencyOfRegion("US")).toBe("USD");
  });
  it("accepts a lower-case region", () => {
    expect(currencyOfRegion("ke")).toBe("KES");
  });
  it("gives no currency for a region that has none", () => {
    expect(currencyOfRegion("AQ")).toBe(NO_CURRENCY);
  });
  it("gives no currency for an unknown or absent region", () => {
    expect(currencyOfRegion("ZZ")).toBe(NO_CURRENCY);
    expect(currencyOfRegion(null)).toBe(NO_CURRENCY);
  });
});

describe("suggestedCurrency", () => {
  it("returns a usable value in whatever environment it runs in", () => {
    const suggested = suggestedCurrency();
    expect(suggested === NO_CURRENCY || isCurrencyCode(suggested)).toBe(true);
  });
});

describe("the generated tables", () => {
  it("resolves well-known zones through to the right currency", () => {
    const zones: Record<string, string> = {
      "America/Toronto": "CAD",
      "Europe/Paris": "EUR",
      "Africa/Dakar": "XOF",
      "Asia/Tokyo": "JPY",
      "Australia/Sydney": "AUD",
      "America/New_York": "USD",
      "Asia/Kolkata": "INR",
      "Europe/London": "GBP",
      "Africa/Nairobi": "KES",
    };
    for (const [zone, code] of Object.entries(zones)) {
      expect(currencyOfRegion(ZONE_REGION[zone])).toBe(code);
    }
  });
  it("holds only currencies the runtime knows", () => {
    const known = new Set(Intl.supportedValuesOf("currency"));
    const unknown = [...new Set(Object.values(REGION_CURRENCY))].filter((code) => !known.has(code));
    expect(unknown).toEqual([]);
  });
  it("holds only well-shaped codes", () => {
    const malformed = Object.values(REGION_CURRENCY).filter((code) => !isCurrencyCode(code));
    expect(malformed).toEqual([]);
  });
  it("is not truncated", () => {
    expect(Object.keys(REGION_CURRENCY).length).toBeGreaterThanOrEqual(240);
    expect(Object.keys(ZONE_REGION).length).toBeGreaterThanOrEqual(400);
  });
  it("maps every zone to a region, and every region but Antarctica to a currency", () => {
    const zonesWithoutRegion = Object.entries(ZONE_REGION).filter(([, region]) => !region);
    expect(zonesWithoutRegion).toEqual([]);
    const regionsWithoutCurrency = [...new Set(Object.values(ZONE_REGION))].filter(
      (region) => currencyOfRegion(region) === NO_CURRENCY && region !== "AQ",
    );
    expect(regionsWithoutCurrency).toEqual([]);
  });
});
