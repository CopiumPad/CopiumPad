"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  allocationBreakdown,
  buildPortfolioTimeline,
  categoryForQuote,
  sortByValue,
  type PortfolioAction,
  type PositionMark,
  type PortfolioPriceHistory,
  type QuoteSnapshot,
  type SortDirection,
} from "@/lib/finance/portfolio";
import { sumDecimals, toDecimal } from "@/lib/finance/money";
import { AllocationPieChart } from "@/components/allocation-pie-chart";
import { PortfolioActionDialog } from "@/components/portfolio-action-dialog";
import { PortfolioLineChart } from "@/components/portfolio-line-chart";
import { ScrollWindow, TAP } from "@/components/ui/motion";

type PortfolioVisualizationProps = {
  positions: PositionMark[];
  quotes: QuoteSnapshot[];
  actions: PortfolioAction[];
  displayCurrency: string;
  displayCurrencyUsdRate: number | null;
  isRefreshing: boolean;
  isActionsHydrated: boolean;
  isAuthenticated: boolean;
  onRequestSignIn: () => void;
  onAddActions: (actions: PortfolioAction[]) => void;
  onRemoveAction: (id: string) => void;
};

const CATEGORY_COLORS = ["#5fa800", "#3b82f6", "#c98300", "#e0509f", "#8b5cf6", "#0d9488"];

const RANK_OPTIONS: { direction: SortDirection; label: string }[] = [
  { direction: "desc", label: "Big → Small" },
  { direction: "asc", label: "Small → Big" },
];

function formatValue(value: ReturnType<typeof toDecimal>, currency: string, usdRate: number | null): string {
  if (usdRate === null || usdRate <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value.div(usdRate).toNumber());
}

function actionDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

export function PortfolioVisualization({
  positions,
  quotes,
  actions,
  displayCurrency,
  displayCurrencyUsdRate,
  isRefreshing,
  isActionsHydrated,
  isAuthenticated,
  onRequestSignIn,
  onAddActions,
  onRemoveAction,
}: PortfolioVisualizationProps) {
  const [categorized, setCategorized] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PortfolioPriceHistory[]>([]);

  const historySymbols = useMemo(
    () => [...new Set(positions.map((position) => position.symbol.toUpperCase()))].sort(),
    [positions],
  );
  const allocations = useMemo(() => allocationBreakdown(positions, quotes), [positions, quotes]);
  const totalValue = useMemo(() => sumDecimals(allocations.map((item) => item.value)), [allocations]);
  const categories = useMemo(() => {
    const grouped = new Map<string, typeof allocations>();
    for (const allocation of allocations) {
      const bucket = grouped.get(allocation.category) ?? [];
      bucket.push(allocation);
      grouped.set(allocation.category, bucket);
    }
    return [...grouped.entries()].map(([category, members]) => ({
      category,
      members,
      value: sumDecimals(members.map((item) => item.value)),
      weight: totalValue.isZero() ? toDecimal(0) : sumDecimals(members.map((item) => item.value)).div(totalValue).times(100),
    }));
  }, [allocations, totalValue]);

  function setInitialPoint() {
    if (!isAuthenticated) {
      onRequestSignIn();
      return;
    }
    if (positions.length === 0 || positions.some((position) => position.livePrice === null)) return;
    const confirmed = window.confirm("Setting an initial baseline will mark a break in historical continuous tracking. Existing prior transactions will be retained, but continuity will show a chart discontinuity.");
    if (!confirmed) return;
    const timestamp = Date.now();
    onAddActions(positions.map((position) => {
      const quote = quotes.find((item) => item.symbol.toUpperCase() === position.symbol.toUpperCase());
      return {
        id: globalThis.crypto?.randomUUID?.() ?? `${timestamp}-${position.symbol}`,
        timestamp,
        assetId: position.symbol,
        category: categoryForQuote(quote),
        quantity: position.quantity,
        price: position.livePrice?.toString() ?? "0",
        direction: "BUY" as const,
        isInitialBaseline: true,
      };
    }));
  }

  function confirmRemove(action: PortfolioAction) {
    if (!isAuthenticated) {
      onRequestSignIn();
      return;
    }
    if (!window.confirm("Are you sure you want to remove this transaction? This will recalculate historical portfolio holdings and line chart values.")) return;
    onRemoveAction(action.id);
  }

  function openActionDialog() {
    if (!isAuthenticated) {
      onRequestSignIn();
      return;
    }
    setIsActionDialogOpen(true);
  }

  const quoteNames = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote.name]));
  // Colors are fixed before ranking so a row keeps its color, and its pie slice, when the order changes.
  const displayRows = (categorized
    ? categories.map((row) => ({
        key: row.category,
        label: row.category,
        members: row.members,
        value: row.value,
        weight: row.weight,
      }))
    : allocations.map((row) => ({
        key: row.symbol,
        label: `${row.symbol} · ${row.name}`,
        members: [row],
        value: row.value,
        weight: row.weight,
      }))
  ).map((row, index) => ({ ...row, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }));
  const rankedRows = sortByValue(displayRows, sortDirection, (row) => row.key);
  useEffect(() => {
    if (!isActionsHydrated || actions.length === 0 || historySymbols.length === 0) return;

    const firstActionTimestamp = Math.min(...actions.map((action) => action.timestamp));
    const from = Math.max(0, firstActionTimestamp - 7 * 24 * 60 * 60 * 1000);
    const controller = new AbortController();

    fetch(`/api/history?symbols=${encodeURIComponent(historySymbols.join(","))}&from=${from}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`History request failed (${response.status})`);
        return response.json() as Promise<{ success: boolean; data?: PortfolioPriceHistory[] }>;
      })
      .then((payload) => setPriceHistory(payload.success ? payload.data ?? [] : []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setPriceHistory([]);
      });

    return () => controller.abort();
  }, [actions, historySymbols, isActionsHydrated]);

  const chartPoints = useMemo(
    () => buildPortfolioTimeline(actions, positions, quotes, priceHistory),
    [actions, positions, quotes, priceHistory],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Asset allocation</h2>
            <p className="mt-1 text-xs text-zinc-500">Current marked value, weighted across assets with available quotes.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Rank allocations" className="flex rounded-2xl border border-input p-0.5">
              {RANK_OPTIONS.map((option) => {
                const isActive = sortDirection === option.direction;
                return (
                  <motion.button whileTap={TAP} key={option.direction} type="button" aria-pressed={isActive} onClick={() => setSortDirection(option.direction)} className="relative z-0 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100">
                    {isActive ? <motion.span layoutId="allocation-rank-active" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 -z-10 rounded-xl bg-primary" /> : null}
                    <span className={isActive ? "text-primary-foreground" : ""}>{option.label}</span>
                  </motion.button>
                );
              })}
            </div>
            <motion.button whileTap={TAP} type="button" aria-pressed={categorized} onClick={() => {
              setCategorized((current) => !current);
              setExpandedCategory(null);
            }} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${categorized ? "border-primary/60 bg-primary/10 text-primary" : "border-input text-zinc-300 hover:bg-accent"}`}>
              {categorized ? "Show assets" : "Categorize"}
            </motion.button>
          </div>
        </div>
        {allocations.length === 0 || totalValue.isZero() ? (
          <p className="flex h-[24rem] items-center justify-center px-6 text-center text-sm text-zinc-500">Allocation appears when live quotes are available.</p>
        ) : (
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-2 lg:items-center">
            <AllocationPieChart
              rows={displayRows.map((row) => ({
                key: row.key,
                label: row.label,
                chartLabel: categorized ? row.label : row.key,
                value: row.value,
                weight: row.weight,
                color: row.color,
              }))}
              currency={displayCurrency}
              usdRate={displayCurrencyUsdRate}
            />
            <ScrollWindow className="h-80 space-y-1 pr-3 lg:h-[22rem]">
              {rankedRows.map((row, index) => {
                const isExpanded = categorized && expandedCategory === row.key;
                return (
                  <motion.div key={row.key} layout="position" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: "easeOut", delay: Math.min(index, 8) * 0.035, layout: { duration: 0.28, ease: "easeInOut" } }} className="row-glow rounded-xl px-3 py-4">
                    <motion.button whileTap={categorized ? TAP : undefined} type="button" onClick={() => categorized && setExpandedCategory(isExpanded ? null : row.key)} disabled={!categorized} aria-expanded={categorized ? isExpanded : undefined} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 text-left ${categorized ? "cursor-pointer" : "cursor-default"}`}>
                      <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-200">
                        <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
                        <span className="truncate">{categorized ? row.label : <><span className="font-mono tabular-nums">{row.key}</span> <span className="text-zinc-500">{row.members[0]?.name}</span></>}</span>
                        {categorized ? (isExpanded ? <ChevronDown className="size-3.5 text-zinc-500" aria-hidden /> : <ChevronRight className="size-3.5 text-zinc-500" aria-hidden />) : null}
                      </span>
                      <span className="text-right font-mono tabular-nums text-xs text-zinc-300">{formatValue(row.value, displayCurrency, displayCurrencyUsdRate)} <span className="ml-2 text-zinc-500">{row.weight.toDecimalPlaces(2).toFixed(2)}%</span></span>
                      <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(0, Math.min(row.weight.toNumber(), 100))}%`, backgroundColor: row.color }} />
                      </span>
                    </motion.button>
                    {categorized && isExpanded ? (
                      <div className="ml-4 mt-3 space-y-2 border-l border-border pl-4">
                        {sortByValue(row.members, sortDirection, (member) => member.symbol).map((member) => (
                          <div key={member.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs">
                            <span className="truncate text-zinc-400">{member.name} <span className="font-mono tabular-nums text-zinc-600">{member.symbol}</span></span>
                            <span className="font-mono tabular-nums text-zinc-400">{formatValue(member.value, displayCurrency, displayCurrencyUsdRate)} · {member.weight.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </motion.div>
                );
              })}
            </ScrollWindow>
          </div>
        )}
        <div className="flex justify-between border-t border-border px-6 py-3.5 text-xs text-zinc-500">
          <span>Marked total</span>
          <span className="font-mono tabular-nums text-zinc-300">{formatValue(totalValue, displayCurrency, displayCurrencyUsdRate)}</span>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Portfolio tracking</h2>
            <p className="mt-1 text-xs text-zinc-500">{isRefreshing ? "Updating live marks…" : "Latest value is based on current market quotes."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <motion.button whileTap={TAP} type="button" onClick={openActionDialog} disabled={!isActionsHydrated || positions.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-input px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-accent disabled:opacity-50"><Plus className="size-3.5" aria-hidden />Add an action</motion.button>
            <motion.button whileTap={TAP} type="button" onClick={setInitialPoint} disabled={isAuthenticated && (!isActionsHydrated || positions.length === 0 || positions.some((position) => position.livePrice === null))} className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50">Set initial point</motion.button>
          </div>
        </div>
        <div className="grid gap-5 px-6 py-7 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-border bg-background/30 p-3 text-center">
            {chartPoints.length === 0 ? (
              <>
                <h3 className="text-sm font-medium text-zinc-300">No portfolio actions recorded yet.</h3>
                <p className="mt-2 max-w-lg text-xs leading-5 text-zinc-500">No portfolio actions recorded yet. Add an action or set an initial baseline.</p>
              </>
            ) : (
              <PortfolioLineChart points={chartPoints} currency={displayCurrency} displayCurrencyUsdRate={displayCurrencyUsdRate} />
            )}
          </div>
          <div className="flex flex-col justify-center border-l border-border pl-5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Current marked value</span>
            <span className="mt-2 font-mono tabular-nums text-2xl font-semibold text-zinc-100">{formatValue(totalValue, displayCurrency, displayCurrencyUsdRate)}</span>
            <span className="mt-2 font-mono text-xs tabular-nums text-zinc-500">{allocations.length} assets with available marks</span>
          </div>
        </div>
      </section>

      <details className="group rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
          <span>
            <span className="block text-sm font-medium text-zinc-100">Action history</span>
            <span className="mt-1 block text-xs text-zinc-500">{isActionsHydrated ? `${actions.length} recorded ${actions.length === 1 ? "entry" : "entries"}` : "Loading action history"}; separate from watchlist holdings</span>
          </span>
          <ChevronDown className="size-4 text-zinc-500 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-border">
          {!isActionsHydrated ? <p className="flex h-80 items-center justify-center px-6 text-center text-sm text-zinc-500">Loading action history…</p> : actions.length === 0 ? <p className="flex h-80 items-center justify-center px-6 text-center text-sm text-zinc-500">No actions recorded. Set an initial point to establish a starting quantity.</p> : (
            <ScrollWindow className="h-80">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-xs [&_td]:border-b [&_td]:border-border [&_th]:border-b [&_th]:border-border">
                <thead className="sticky top-0 z-20 bg-card text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="px-6 py-3.5 font-medium">Date</th><th className="px-6 py-3.5 font-medium">Asset</th><th className="px-6 py-3.5 font-medium">Type</th><th className="px-6 py-3.5 font-medium">Quantity</th><th className="px-6 py-3.5 font-medium">Price</th><th className="px-6 py-3.5" /></tr></thead>
                <tbody>
                  {[...actions].sort((left, right) => right.timestamp - left.timestamp).map((action) => (
                    <tr key={action.id} className="row-glow">
                      <td className="whitespace-nowrap px-6 py-3.5 font-mono tabular-nums text-zinc-400">{actionDate(action.timestamp)}</td>
                      <td className="px-6 py-3.5"><span className="font-mono tabular-nums text-zinc-200">{action.assetId}</span><span className="ml-2 text-zinc-500">{quoteNames.get(action.assetId.toUpperCase()) ?? ""}</span></td>
                      <td className="px-6 py-3.5"><span className={action.isInitialBaseline ? "text-sky-300" : action.direction === "BUY" ? "text-emerald-400" : "text-amber-300"}>{action.isInitialBaseline ? "INITIAL POINT" : action.direction}</span></td>
                      <td className="px-6 py-3.5 font-mono tabular-nums text-zinc-300">{action.quantity}</td>
                      <td className="px-6 py-3.5 font-mono tabular-nums text-zinc-300">{action.price}</td>
                      <td className="px-6 py-3.5 text-right"><motion.button whileTap={TAP} type="button" onClick={() => confirmRemove(action)} aria-label={`Delete ${action.assetId} ${action.direction} action`} className="rounded-xl p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="size-3.5" aria-hidden /></motion.button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollWindow>
          )}
        </div>
      </details>

      <PortfolioActionDialog
        open={isAuthenticated && isActionDialogOpen}
        positions={positions}
        quotes={quotes}
        actions={actions}
        onClose={() => setIsActionDialogOpen(false)}
        onSubmit={(action) => {
          if (!isAuthenticated) {
            onRequestSignIn();
            return;
          }
          onAddActions([action]);
        }}
      />
    </div>
  );
}