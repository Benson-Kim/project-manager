/**
 * A tax profile is stored as a rate and the years it changes from (ADR-0029:
 * each step applies from its fiscal year on). The settings show it as one rate
 * per fiscal year instead; these turn one form into the other, rates as typed
 * percentages.
 */

export interface RateStep {
  fromFiscalYear: number;
  rate: string;
}

/** The rate in force each year of `years`. */
export function ratesByYear(rate: string, steps: readonly RateStep[], years: readonly number[]) {
  const ordered = [...steps].sort((a, b) => a.fromFiscalYear - b.fromFiscalYear);
  return years.map((year) => ordered.filter((s) => s.fromFiscalYear <= year).at(-1)?.rate ?? rate);
}

/** The first year's rate, and a step for each later year whose rate differs from the year before. */
export function stepsFromRates(
  years: readonly number[],
  rates: readonly string[],
): { rate: string; steps: RateStep[] } {
  const steps: RateStep[] = [];
  for (let i = 1; i < years.length; i++) {
    if (rates[i]!.trim() !== rates[i - 1]!.trim()) {
      steps.push({ fromFiscalYear: years[i]!, rate: rates[i]! });
    }
  }
  return { rate: rates[0] ?? "0", steps };
}

/** Whether every year has the same rate. */
export function sameEveryYear(rates: readonly string[]): boolean {
  return rates.every((r) => r.trim() === rates[0]?.trim());
}
