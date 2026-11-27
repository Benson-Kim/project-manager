"use client";

import { type ComponentType, type FormEvent, useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { currencyOrNone, currencySymbol, NO_CURRENCY } from "@/lib/currency/currencies";
import { messages } from "@/lib/messages";
import { saveProjectMathStateAction } from "../../actions";
import { formatNumber } from "../../calc/project-format";
import type { ProjectMathState } from "../../schemas/project-math-state";
import { QuickCalculator, type QuickCalculatorHandle } from "../quick-calculator";
import { useCurrencies } from "../use-currencies";
import { BusinessCaseCard } from "./business-case-card";
import type { CardProps, Category, UseValue } from "./card-ui";
import { CashFlowCard } from "./cash-flow-card";
import { CostCard } from "./cost-card";
import { DurationCard } from "./duration-card";
import { EarnedValueCard } from "./earned-value-card";
import { EstimateCard } from "./estimate-card";
import { ForecastCard } from "./forecast-card";
import { PercentCard } from "./percent-card";
import { ResourceCard } from "./resource-card";
import { RiskCard } from "./risk-card";

const M = messages.financials.projectMath;

type Filter = Category | "all";

const FILTERS: Filter[] = ["all", "evm", "estimate", "risk", "time", "money"];

const DEFAULT_CURRENCY = "USD";
const CURRENCIES = [DEFAULT_CURRENCY, "CAD", "EUR", "GBP"];

const CARDS: { key: string; category: Category; Card: ComponentType<CardProps> }[] = [
  { key: "earned-value", category: "evm", Card: EarnedValueCard },
  { key: "estimate", category: "estimate", Card: EstimateCard },
  { key: "risk", category: "risk", Card: RiskCard },
  { key: "duration", category: "time", Card: DurationCard },
  { key: "resource", category: "time", Card: ResourceCard },
  { key: "forecast", category: "time", Card: ForecastCard },
  { key: "cost", category: "estimate", Card: CostCard },
  { key: "business-case", category: "money", Card: BusinessCaseCard },
  { key: "cash-flow", category: "money", Card: CashFlowCard },
  { key: "percent", category: "money", Card: PercentCard },
];

interface ProjectMathProps {
  projectId: number;
  currency: string;
  saved: { state: ProjectMathState | null; rowVer: number | null };
  canSave: boolean;
}

/**
 * The project math cards, filtered by category and priced in a picked currency
 * that starts as the project's. "→ Calculator" types a result into the quick
 * calculator's sum. Save keeps the figures for the project; they come back on
 * the next visit.
 */
export function ProjectMath({
  projectId,
  currency: projectCurrency,
  saved,
  canSave,
}: ProjectMathProps) {
  const calculator = useRef<QuickCalculatorHandle>(null);
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const start = projectCurrency === NO_CURRENCY ? DEFAULT_CURRENCY : projectCurrency;
  const [currency, setCurrency] = useState(saved.state?.currency || start);
  const [added, setAdded] = useState<string[]>(saved.state?.added ?? []);
  const base = CURRENCIES.includes(start) ? CURRENCIES : [start, ...CURRENCIES];
  const currencies = [...new Set([...base, ...added, currency])];
  const symbol = currencySymbol(currency);
  const otherCurrencies = useCurrencies().filter((item) => !currencies.includes(item.code));
  const addCurrency = (value: string) => {
    const code = currencyOrNone(value);
    if (code === NO_CURRENCY || currencies.includes(code)) return;
    setAdded((prev) => [...prev, code]);
    setCurrency(code);
  };

  const use: UseValue = (value, label, display) => {
    if (value === null || !Number.isFinite(value)) return;
    calculator.current?.enter(value);
    toast({ variant: "info", title: M.sent(label, display ?? formatNumber(value)) });
  };

  const [startCards, setStartCards] = useState(saved.state?.cards ?? {});
  const [round, setRound] = useState(0);
  const values = useRef<Record<string, unknown>>({ ...startCards });
  const rowVer = useRef(saved.rowVer);
  const [saving, startSaving] = useTransition();

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveProjectMathStateAction({
        projectId,
        state: { currency, added, cards: values.current },
        rowVer: rowVer.current,
      });
      if (result.ok) {
        rowVer.current = result.data.rowVer;
        toast({ variant: "success", title: M.saved });
      } else {
        const conflict = result.error.code === "CONFLICT";
        toast({ variant: "error", title: conflict ? M.conflict : result.error.message });
      }
    });
  };

  const resetCards = () => {
    values.current = {};
    setStartCards({});
    setRound((previous) => previous + 1);
    toast({ variant: "info", title: M.resetDone });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-8 sm:px-6">
      <PageHeader title={M.title} action={<QuickCalculator ref={calculator} />} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={M.filters} className="flex flex-wrap gap-1">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={buttonClass(filter === option ? "primary" : "secondary", "compact")}
            >
              {option === "all" ? M.all : M.categories[option]}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label={M.currency}
          className="ml-auto flex flex-wrap gap-1 max-sm:ml-0"
        >
          {currencies.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={currency === code}
              onClick={() => setCurrency(code)}
              className={buttonClass(currency === code ? "primary" : "secondary", "compact")}
            >
              {code}
            </button>
          ))}
          <select
            aria-label={M.addCurrency}
            value=""
            onChange={(event) => addCurrency(event.target.value)}
            className={buttonClass("secondary", "compact")}
          >
            <option value="">{M.addCurrency}</option>
            {otherCurrencies.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.name}
              </option>
            ))}
          </select>
        </div>
        {canSave && (
          <form onSubmit={save} className="flex gap-1">
            <button
              type="button"
              onClick={resetCards}
              className={buttonClass("secondary", "compact")}
            >
              {M.reset}
            </button>
            <button type="submit" disabled={saving} className={buttonClass("primary", "compact")}>
              {messages.actions.save}
            </button>
          </form>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {CARDS.map(({ key, category, Card }) => (
          <div key={key} hidden={filter !== "all" && filter !== category}>
            <Card
              key={round}
              onUse={use}
              currency={symbol}
              initial={startCards[key]}
              onChange={(cardValues) => {
                values.current[key] = cardValues;
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
