"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  allocationBreakdown,
  buildPortfolioTimeline,
  categoryForQuote,
  type PortfolioAction,
  type PositionMark,
  type QuoteSnapshot,
} from "@/lib/finance/portfolio";
import { sumDecimals, toDecimal } from "@/lib/finance/money";
import { AllocationPieChart } from "@/components/allocation-pie-chart";
import { PortfolioActionDialog } from "@/components/portfolio-action-dialog";
import { PortfolioLineChart } from "@/components/portfolio-line-chart";

type PortfolioVisualizationProps = {
  positions: PositionMark[];
  quotes: QuoteSnapshot[];
  actions: PortfolioAction[];
  displayCurrency: string;
  displayCurrencyUsdRate: number | null;
  isRefreshing: boolean;
  isActionsHydrated: boolean;
  onAddActions: (actions: PortfolioAction[]) => void;
  onRemoveAction: (id: string) => void;
};

const CATEGORY_COLORS = ["#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#a3e635", "#fb7185"];

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
  onAddActions,
  onRemoveAction,
}: PortfolioVisualizationProps) {
  const [categorized, setCategorized] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
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
    if (!window.confirm("Are you sure you want to remove this transaction? This will recalculate historical portfolio holdings and line chart values.")) return;
    onRemoveAction(action.id);
  }

  const quoteNames = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote.name]));
  const displayRows = categorized
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
      }));
  const chartPoints = useMemo(() => buildPortfolioTimeline(actions, positions, quotes), [actions, positions, quotes]);

  return (
    <div className="space-y-5">
      <section className="border border-zinc-800 bg-zinc-900/40">
        <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Asset allocation</h2>
            <p className="mt-1 text-xs text-zinc-500">Current marked value, weighted across assets with available quotes.</p>
          </div>
          <button type="button" aria-pressed={categorized} onClick={() => {
            setCategorized((current) => !current);
            setExpandedCategory(null);
          }} className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition ${categorized ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
            {categorized ? "Show assets" : "Categorize"}
          </button>
        </div>
        {allocations.length === 0 || totalValue.isZero() ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">Allocation appears when live quotes are available.</p>
        ) : (
          <div className="space-y-5 px-5 py-5">
            <AllocationPieChart
              rows={displayRows.map((row, index) => ({
                key: row.key,
                label: row.label,
                value: row.value,
                weight: row.weight,
                color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
              }))}
              currency={displayCurrency}
              usdRate={displayCurrencyUsdRate}
            />
            <div className="divide-y divide-zinc-800/80">
              {displayRows.map((row, index) => {
                const isExpanded = categorized && expandedCategory === row.key;
                return (
                  <div key={row.key} className="allocation-row-enter py-4" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                    <button type="button" onClick={() => categorized && setExpandedCategory(isExpanded ? null : row.key)} disabled={!categorized} aria-expanded={categorized ? isExpanded : undefined} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 text-left ${categorized ? "cursor-pointer" : "cursor-default"}`}>
                      <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-200">
                        <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                        <span className="truncate">{row.label}</span>
                        {categorized ? (isExpanded ? <ChevronDown className="size-3.5 text-zinc-500" aria-hidden /> : <ChevronRight className="size-3.5 text-zinc-500" aria-hidden />) : null}
                      </span>
                      <span className="text-right font-mono text-xs text-zinc-300">{formatValue(row.value, displayCurrency, displayCurrencyUsdRate)} <span className="ml-2 text-zinc-500">{row.weight.toDecimalPlaces(2).toFixed(2)}%</span></span>
                      <span className="col-span-2 h-1.5 overflow-hidden bg-zinc-800">
                        <span className="block h-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(0, Math.min(row.weight.toNumber(), 100))}%`, backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                      </span>
                    </button>
                    {categorized && isExpanded ? (
                      <div className="ml-4 mt-3 space-y-2 border-l border-zinc-800 pl-4">
                        {row.members.map((member) => (
                          <div key={member.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs">
                            <span className="truncate text-zinc-400">{member.name} <span className="text-zinc-600">{member.symbol}</span></span>
                            <span className="font-mono text-zinc-400">{formatValue(member.value, displayCurrency, displayCurrencyUsdRate)} · {member.weight.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex justify-between border-t border-zinc-800 px-5 py-3 text-xs text-zinc-500">
          <span>Marked total</span>
          <span className="font-mono text-zinc-300">{formatValue(totalValue, displayCurrency, displayCurrencyUsdRate)}</span>
        </div>
      </section>

      <section className="border border-zinc-800 bg-zinc-900/40">
        <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Portfolio tracking</h2>
            <p className="mt-1 text-xs text-zinc-500">{isRefreshing ? "Updating live marks…" : "Latest value is based on current market quotes."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setIsActionDialogOpen(true)} disabled={!isActionsHydrated || positions.length === 0} className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"><Plus className="size-3.5" aria-hidden />Add an action</button>
            <button type="button" onClick={setInitialPoint} disabled={!isActionsHydrated || positions.length === 0 || positions.some((position) => position.livePrice === null)} className="rounded-md bg-emerald-400 px-3 py-2 text-xs font-medium text-zinc-950 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">Set initial point</button>
          </div>
        </div>
        <div className="grid gap-5 px-5 py-6 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 text-center">
            {chartPoints.length === 0 ? (
              <>
                <h3 className="text-sm font-medium text-zinc-300">No portfolio actions recorded yet.</h3>
                <p className="mt-2 max-w-lg text-xs leading-5 text-zinc-500">No portfolio actions recorded yet. Add an action or set an initial baseline.</p>
              </>
            ) : (
              <PortfolioLineChart points={chartPoints} currency={displayCurrency} displayCurrencyUsdRate={displayCurrencyUsdRate} />
            )}
          </div>
          <div className="flex flex-col justify-center border-l border-zinc-800 pl-5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Current marked value</span>
            <span className="mt-2 font-mono text-2xl font-semibold text-zinc-100">{formatValue(totalValue, displayCurrency, displayCurrencyUsdRate)}</span>
            <span className="mt-2 text-xs text-zinc-500">{allocations.length} assets with available marks</span>
          </div>
        </div>
      </section>

      <details className="group border border-zinc-800 bg-zinc-900/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <span>
            <span className="block text-sm font-medium text-zinc-100">Action history</span>
            <span className="mt-1 block text-xs text-zinc-500">{isActionsHydrated ? `${actions.length} recorded ${actions.length === 1 ? "entry" : "entries"}` : "Loading action history"}; separate from watchlist holdings</span>
          </span>
          <ChevronDown className="size-4 text-zinc-500 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-zinc-800">
          {!isActionsHydrated ? <p className="px-5 py-8 text-center text-sm text-zinc-500">Loading action history…</p> : actions.length === 0 ? <p className="px-5 py-8 text-center text-sm text-zinc-500">No actions recorded. Set an initial point to establish a starting quantity.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Asset</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Quantity</th><th className="px-5 py-3 font-medium">Price</th><th className="px-5 py-3" /></tr></thead>
                <tbody className="divide-y divide-zinc-800">
                  {[...actions].sort((left, right) => right.timestamp - left.timestamp).map((action) => (
                    <tr key={action.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-zinc-400">{actionDate(action.timestamp)}</td>
                      <td className="px-5 py-3"><span className="font-mono text-zinc-200">{action.assetId}</span><span className="ml-2 text-zinc-500">{quoteNames.get(action.assetId.toUpperCase()) ?? ""}</span></td>
                      <td className="px-5 py-3"><span className={action.isInitialBaseline ? "text-sky-300" : action.direction === "BUY" ? "text-emerald-400" : "text-amber-300"}>{action.isInitialBaseline ? "INITIAL POINT" : action.direction}</span></td>
                      <td className="px-5 py-3 font-mono text-zinc-300">{action.quantity}</td>
                      <td className="px-5 py-3 font-mono text-zinc-300">{action.price}</td>
                      <td className="px-5 py-3 text-right"><button type="button" onClick={() => confirmRemove(action)} aria-label={`Delete ${action.assetId} ${action.direction} action`} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-3.5" aria-hidden /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <PortfolioActionDialog
        open={isActionDialogOpen}
        positions={positions}
        quotes={quotes}
        actions={actions}
        onClose={() => setIsActionDialogOpen(false)}
        onSubmit={(action) => onAddActions([action])}
      />
    </div>
  );
}