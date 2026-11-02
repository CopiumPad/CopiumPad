"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChartLine,
  Pencil,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  formatPercent,
  formatSignedUsd,
  toDecimal,
  type DecimalInput,
} from "@/lib/finance/money";
import {
  markPosition,
  portfolioTotals,
  type Holding,
  type PositionMark,
  type QuoteSnapshot,
} from "@/lib/finance/portfolio";
import { PositionDialog } from "@/components/position-dialog";
import { PortfolioVisualization } from "@/components/portfolio-visualization";
import { ExploreView } from "@/components/explore-view";
import { usePortfolioStorage } from "@/hooks/usePortfolioStorage";
import { usePortfolioActions } from "@/hooks/usePortfolioActions";
import type { AppView } from "@/components/app-header";
import { SkeletonBlock } from "@/components/skeletons";
import { ScrollWindow } from "@/components/ui/motion";
import { DEFAULT_ACTIONS } from "@/lib/constants/defaultData";
import { isValidHoldingValue } from "@/lib/queries/positions";

type QuoteDto = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  usdRate: number | null;
  currency: string;
  exchange: string;
  region: string | null;
  quoteType: string;
  trailingPE: number | null;
  forwardPE: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  error?: boolean;
};

type QuotesResponse = {
  success: boolean;
  data?: QuoteDto[];
  displayCurrency?: string;
  displayCurrencyUsdRate?: number | null;
  error?: string;
};

type SearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

type SearchResponse = {
  success: boolean;
  data?: SearchResult[];
  error?: string;
};

type WatchlistCluster = {
  key: string;
  label: string;
  positions: PositionMark[];
};

function watchlistClusterFor(quote: QuoteSnapshot | undefined): { key: string; label: string } {
  const quoteType = quote?.quoteType?.toUpperCase() ?? "";
  if (quoteType.startsWith("CRYPTO")) {
    return { key: "crypto", label: "Crypto" };
  }

  const label = quote?.exchange?.trim() || "Other markets";
  return { key: label.toLowerCase(), label };
}

function pnlClassName(value: DecimalInput | null): string {
  if (value === null) {
    return "text-zinc-500";
  }

  const amount = toDecimal(value);
  if (amount.isPositive()) {
    return "text-emerald-400";
  }
  if (amount.isNegative()) {
    return "text-rose-400";
  }
  return "text-zinc-400";
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF",
  CNY: "CN¥",
  EUR: "€",
  GBP: "£",
  HKD: "HK$",
  JPY: "¥",
  SGD: "S$",
  USD: "$",
};

const DISPLAY_CURRENCIES = ["USD", "SGD", "CNY", "GBP", "EUR", "HKD", "TWD"] as const;

function formatAssetCurrency(value: DecimalInput, currency = "USD"): string {
  const code = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `;
  return `${symbol}${Number(toDecimal(value).toString()).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMaybeAssetCurrency(
  value: DecimalInput | null,
  currency?: string,
): string {
  return value === null ? "—" : formatAssetCurrency(value, currency);
}

function formatMaybeSignedUsd(value: DecimalInput | null): string {
  return value === null ? "—" : formatSignedUsd(value);
}

function formatMaybePercent(value: DecimalInput | null): string {
  return value === null ? "—" : formatPercent(value);
}

type PortfolioDashboardProps = {
  userId: string | null;
  authError: string | null;
  activeView: AppView;
  selectedExploreSymbol: string | null;
  onViewChange: (view: AppView) => void;
  onOpenExploreSymbol: (symbol: string) => void;
  onRequestSignIn: () => void;
};

export function PortfolioDashboard({
  userId,
  authError,
  activeView,
  selectedExploreSymbol,
  onViewChange,
  onOpenExploreSymbol,
  onRequestSignIn: requestSignIn,
}: PortfolioDashboardProps) {
  const {
    positions: holdings,
    isAuthenticated,
    error: storageError,
    addPosition,
    removePosition,
    updatePosition,
    draftPosition,
    commitPosition,
  } = usePortfolioStorage(userId);
  const portfolioError = storageError ?? authError;
  const { actions: storedActions, isHydrated: areActionsHydrated, addActions, removeAction } = usePortfolioActions();
  const [quotes, setQuotes] = useState<QuoteSnapshot[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [displayCurrencyUsdRate, setDisplayCurrencyUsdRate] = useState<number | null>(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isPositionDialogOpen, setIsPositionDialogOpen] = useState(false);
  const [positionDialogInitial, setPositionDialogInitial] = useState<Partial<Holding>>({});

  const actions = useMemo(
    () => isAuthenticated ? (areActionsHydrated ? storedActions : []) : [...DEFAULT_ACTIONS],
    [areActionsHydrated, isAuthenticated, storedActions],
  );
  const visibleActionsHydrated = isAuthenticated ? areActionsHydrated : true;

  const quoteSymbols = useMemo(
    () => [...new Set(holdings.map((holding) => holding.symbol.toUpperCase()))].join(","),
    [holdings],
  );

  const loadQuotes = useCallback(async (signal?: AbortSignal) => {
    if (!quoteSymbols) {
      setQuotes([]);
      setLastUpdated(null);
      setIsRefreshing(false);
      return;
    }

    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/quotes?symbols=${encodeURIComponent(quoteSymbols)}&currency=${displayCurrency}`,
        { signal },
      );

      if (!response.ok) {
        throw new Error(`Quotes request failed (${response.status})`);
      }

      const payload = (await response.json()) as QuotesResponse;
      if (!payload.success || payload.data === undefined) {
        throw new Error(payload.error ?? "Failed to fetch quotes");
      }

      const snapshots: QuoteSnapshot[] = payload.data.map((quote) => ({
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price.toString(),
        changePercent: quote.changePercent.toString(),
        usdRate: quote.usdRate?.toString() ?? null,
        currency: quote.currency,
        exchange: quote.exchange,
        region: quote.region,
        error: quote.error,
        quoteType: quote.quoteType,
        trailingPE: quote.trailingPE,
        forwardPE: quote.forwardPE,
        marketCap: quote.marketCap,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      }));

      setQuotes(snapshots);
      setDisplayCurrencyUsdRate(
        payload.displayCurrency === displayCurrency
          ? payload.displayCurrencyUsdRate ?? null
          : null,
      );
      setLastUpdated(
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to fetch quotes",
      );
    } finally {
      if (!signal?.aborted) {
        setIsRefreshing(false);
      }
    }
  }, [displayCurrency, quoteSymbols]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadQuotes(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadQuotes]);

  const positions = useMemo(() => {
    const quotesBySymbol = new Map(
      quotes.map((quote) => [quote.symbol.toUpperCase(), quote]),
    );

    return holdings.map((holding) =>
      markPosition(
        {
          ...holding,
          quantity: isValidHoldingValue(holding.quantity) ? holding.quantity : "0",
          averageCost: isValidHoldingValue(holding.averageCost)
            ? holding.averageCost
            : "0",
        },
        quotesBySymbol.get(holding.symbol.toUpperCase()),
      ),
    );
  }, [holdings, quotes]);

  const totals = useMemo(() => portfolioTotals(positions), [positions]);
  const hasMarks = positions.some((position) => position.marketValueUsd !== null);
  const isLoadingMarks = isRefreshing && !hasMarks;
  const displayedTotalValue =
    hasMarks && displayCurrencyUsdRate !== null
      ? totals.totalValue.div(displayCurrencyUsdRate)
      : null;
  const watchlistClusters = useMemo<WatchlistCluster[]>(() => {
    const quotesBySymbol = new Map(
      quotes.map((quote) => [quote.symbol.toUpperCase(), quote]),
    );
    const clusters = new Map<string, WatchlistCluster>();

    for (const position of positions) {
      const cluster = watchlistClusterFor(
        quotesBySymbol.get(position.symbol.toUpperCase()),
      );
      const existing = clusters.get(cluster.key);
      if (existing) {
        existing.positions.push(position);
      } else {
        clusters.set(cluster.key, {
          ...cluster,
          positions: [position],
        });
      }
    }

    return [...clusters.values()];
  }, [positions, quotes]);
  const isSearchPanelOpen = searchError !== null || searchResults.length > 0 || (hasSearched && !isSearching);

  function quoteFor(symbol: string): QuoteSnapshot | undefined {
    return quotes.find((quote) => quote.symbol.toUpperCase() === symbol.toUpperCase());
  }

  function countryFlag(region: string | null | undefined, quoteType?: string): string {
    if (quoteType === "CRYPTOCURRENCY" || region === null || region === undefined) {
      return "🌐";
    }

    const countryCode = region.toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return "🌐";
    }

    return String.fromCodePoint(
      ...countryCode.split("").map((letter) => 127397 + letter.charCodeAt(0)),
    );
  }

  function removeHolding(symbol: string) {
    if (!isAuthenticated) {
      requestSignIn();
      return;
    }
    removePosition(symbol);
  }

  async function searchAssets(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as SearchResponse;
      if (!response.ok || !payload.success || payload.data === undefined) {
        throw new Error(payload.error ?? "Failed to search assets");
      }
      setSearchResults(payload.data);
      setHasSearched(true);
    } catch (error) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError(error instanceof Error ? error.message : "Failed to search assets");
    } finally {
      setIsSearching(false);
    }
  }

  function dismissSearch() {
    setSearchResults([]);
    setHasSearched(false);
    setSearchError(null);
  }

  function selectSearchResult(result: SearchResult) {
    if (!isAuthenticated) {
      requestSignIn();
      return;
    }
    setPositionDialogInitial({ symbol: result.symbol, name: result.name });
    setIsPositionDialogOpen(true);
    setSearchQuery("");
    dismissSearch();
  }

  function openNewPositionDialog() {
    if (!isAuthenticated) {
      requestSignIn();
      return;
    }
    setPositionDialogInitial({});
    setIsPositionDialogOpen(true);
  }

  function openEditPositionDialog(holding: Holding) {
    if (!isAuthenticated) {
      requestSignIn();
      return;
    }
    setPositionDialogInitial(holding);
    setIsPositionDialogOpen(true);
  }

  function savePosition(position: Holding) {
    if (!isAuthenticated) {
      requestSignIn();
      return;
    }
    if (holdings.some((holding) => holding.symbol === position.symbol)) {
      updatePosition(position);
    } else {
      addPosition(position);
    }
  }

  return (
    <>
        {errorMessage !== null ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {errorMessage}
          </p>
        ) : null}
        {portfolioError ? <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{portfolioError}</p> : null}
        {!isAuthenticated ? <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-zinc-300">Currently displaying default data, sign in to edit</p> : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <Wallet className="size-3.5" aria-hidden />
                Total Portfolio Value
                <select
                  aria-label="Portfolio display currency"
                  value={displayCurrency}
                  onChange={(event) => {
                    const nextCurrency = event.target.value;
                    setDisplayCurrency(nextCurrency);
                    setDisplayCurrencyUsdRate(nextCurrency === "USD" ? 1 : null);
                  }}
                  className="rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium tracking-normal text-zinc-200 outline-none transition focus:border-primary"
                >
                  {DISPLAY_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              {hasMarks ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${
                    toDecimal(totals.dayPnl).isNegative()
                      ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  }`}
                >
                  {toDecimal(totals.dayPnl).isNegative() ? (
                    <ArrowDownRight className="size-3" aria-hidden />
                  ) : (
                    <ArrowUpRight className="size-3" aria-hidden />
                  )}
                  {formatSignedUsd(totals.dayPnl)} (
                  {formatPercent(totals.dayReturnPercent)})
                </span>
              ) : (
                <span className="text-xs text-zinc-500">
                  {isRefreshing ? "Loading…" : "No marks"}
                </span>
              )}
            </div>
            {isLoadingMarks ? <SkeletonBlock className="mt-4 h-9 w-40" /> : (
              <p className="mt-4 font-mono text-3xl font-semibold tracking-tight text-zinc-50">
                {displayedTotalValue === null
                  ? "—"
                  : formatAssetCurrency(displayedTotalValue, displayCurrency)}
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              {lastUpdated === null
                ? "Waiting for live quotes"
                : `Last print ${lastUpdated}`}
            </p>
          </article>

          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <ChartLine className="size-3.5" aria-hidden />
              Net Unrealized PnL
            </div>
            {isLoadingMarks ? <SkeletonBlock className="mt-4 h-9 w-40" /> : (
              <p
                className={`mt-4 font-mono text-3xl font-semibold ${pnlClassName(hasMarks ? totals.netUnrealizedPnl : null)}`}
              >
                {hasMarks ? formatSignedUsd(totals.netUnrealizedPnl) : "—"}
              </p>
            )}
            <p className={`mt-2 text-sm ${pnlClassName(hasMarks ? totals.netUnrealizedPnlPercent : null)}`}>
              {hasMarks
                ? formatPercent(totals.netUnrealizedPnlPercent)
                : "vs. book cost"}
            </p>
          </article>

          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <TrendingUp className="size-3.5" aria-hidden />
              Day&apos;s Return
            </div>
            {isLoadingMarks ? <SkeletonBlock className="mt-4 h-9 w-40" /> : (
              <p
                className={`mt-4 font-mono text-3xl font-semibold ${pnlClassName(hasMarks ? totals.dayPnl : null)}`}
              >
                {hasMarks ? formatSignedUsd(totals.dayPnl) : "—"}
              </p>
            )}
            <p className={`mt-2 text-sm ${pnlClassName(hasMarks ? totals.dayReturnPercent : null)}`}>
              {hasMarks ? formatPercent(totals.dayReturnPercent) : "session P&L"}
            </p>
          </article>
        </section>

        <AnimatePresence mode="wait" initial={false}>
        {activeView === "table" ? <motion.section key="table" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2, ease: "easeOut" }} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-medium tracking-wide text-zinc-200">
                Watchlist
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Live marks for your selected markets
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={openNewPositionDialog}
                title={isAuthenticated ? "Add holding" : "Sign in to add holdings"}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/85"
              >
                Add holding
              </button>
              <button
                type="button"
                onClick={() => void loadQuotes()}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden />
                Refresh Quotes
              </button>
            </div>
          </div>
          <div className="border-b border-border px-5 py-4">
            <div className="relative max-w-2xl" onKeyDown={(event) => { if (event.key === "Escape") dismissSearch(); }}>
              <form onSubmit={searchAssets} className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
                  <input
                    aria-label="Search assets to add to Watchlists"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      dismissSearch();
                    }}
                    placeholder="Search ticker, company, or crypto..."
                    className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary"
                  />
                </div>
                <button type="submit" disabled={isSearching} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </form>
              {isSearchPanelOpen ? (
                <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-input bg-popover shadow-2xl shadow-black">
                  <div className="flex items-center justify-between gap-3 border-b border-border py-1.5 pl-3 pr-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500">Search results</span>
                    <button type="button" onClick={dismissSearch} aria-label="Close search results" className="rounded-md p-1 text-zinc-500 transition hover:bg-accent hover:text-zinc-100">
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  {searchError !== null ? <p className="px-3 py-3 text-xs text-rose-400">{searchError}</p> : null}
                  {searchResults.length > 0 ? (
                    <ScrollWindow className="max-h-64 divide-y divide-border">
                      {searchResults.map((result) => {
                        const alreadyHeld = holdings.some((holding) => holding.symbol.toUpperCase() === result.symbol.toUpperCase());
                        return (
                          <button
                            key={`${result.symbol}-${result.exchange}`}
                            type="button"
                            onClick={() => selectSearchResult(result)}
                            disabled={alreadyHeld}
                            className="flex w-full items-center justify-between gap-4 px-3 py-3 text-left transition hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-sm text-zinc-100">{result.symbol}</span>
                              <span className="block truncate text-xs text-zinc-500">{result.name}</span>
                            </span>
                            <span className="shrink-0 text-right text-xs text-zinc-500">
                              <span className="block">{result.exchange} · {result.type}</span>
                              {alreadyHeld ? <span className="mt-1 block text-primary">In Watchlists</span> : <span className="mt-1 block text-primary">Add holding</span>}
                            </span>
                          </button>
                        );
                      })}
                    </ScrollWindow>
                  ) : null}
                  {searchResults.length === 0 && searchError === null ? (
                    <p className="px-3 py-3 text-xs text-zinc-500">No matching assets found.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <ScrollWindow className="h-window-main">
            <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-sm [&_td]:border-b [&_td]:border-border [&_th]:border-b [&_th]:border-border">
              <thead className="sticky top-0 z-20 bg-card text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Symbol / Name</th>
                  <th className="px-5 py-3 font-medium">Avg Cost</th>
                  <th className="px-5 py-3 font-medium">Live Price</th>
                  <th className="px-5 py-3 font-medium">Qty</th>
                  <th className="px-5 py-3 font-medium">Market Value</th>
                  <th className="px-5 py-3 font-medium text-right">
                    Unrealized PnL
                  </th>
                  <th className="px-5 py-3 font-medium"> </th>
                </tr>
              </thead>
              {watchlistClusters.map((cluster) => (
                <tbody key={cluster.key} className="font-mono text-[13px]">
                  <tr className="bg-background">
                    <th colSpan={7} className="px-5 py-2 text-left font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
                      {cluster.label}
                      <span className="ml-2 text-zinc-600">{cluster.positions.length}</span>
                    </th>
                  </tr>
                  {cluster.positions.map((position) => (
                    <tr key={position.symbol} className="hover:bg-accent">
                    <td className="px-5 py-4">
                      <Link
                        href={`/?view=explore&symbol=${encodeURIComponent(position.symbol)}`}
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                          event.preventDefault();
                          onOpenExploreSymbol(position.symbol);
                        }}
                        className="group text-left"
                        aria-label={`View details for ${position.symbol}`}
                      >
                        <span className="flex items-center gap-1.5 font-sans font-medium text-zinc-100">
                          <span
                            className="text-base leading-none"
                            role="img"
                            aria-label={`${quoteFor(position.symbol)?.region ?? "Unknown"} market`}
                          >
                            {countryFlag(quoteFor(position.symbol)?.region, quoteFor(position.symbol)?.quoteType)}
                          </span>
                          {position.symbol}
                        </span>
                        <span className="block font-sans text-xs text-zinc-500 group-hover:text-zinc-300">
                          {position.name}
                        </span>
                        {quoteFor(position.symbol) !== undefined ? (
                          <span className="mt-1 inline-flex rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-wider text-zinc-500">
                            {quoteFor(position.symbol)?.exchange ?? "Unknown market"} · {quoteFor(position.symbol)?.currency ?? "USD"}
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      <input
                        aria-label={`${position.symbol} average cost`}
                        type="text"
                        inputMode="decimal"
                        readOnly={!isAuthenticated}
                        onClick={() => { if (!isAuthenticated) requestSignIn(); }}
                        onBlur={() => commitPosition(position.symbol)}
                        value={holdings.find((holding) => holding.symbol === position.symbol)?.averageCost ?? ""}
                        onChange={(event) => {
                          if (!isAuthenticated) {
                            requestSignIn();
                            return;
                          }
                          const averageCost = event.target.value;
                          const holding = holdings.find((item) => item.symbol === position.symbol);
                          if (holding) draftPosition({ ...holding, averageCost });
                        }}
                        className="w-28 rounded-md border border-input bg-background px-2 py-1 font-mono text-sm text-zinc-100 outline-none transition focus:border-primary"
                      />
                      <span className="ml-2 text-xs text-zinc-600">{quoteFor(position.symbol)?.currency ?? "USD"}</span>
                    </td>
                    <td className="px-5 py-4 text-zinc-100">
                      {isLoadingMarks ? <SkeletonBlock className="h-4 w-20" /> : formatMaybeAssetCurrency(position.livePrice, quoteFor(position.symbol)?.currency)}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      <input
                        aria-label={`${position.symbol} quantity`}
                        type="text"
                        inputMode="decimal"
                        readOnly={!isAuthenticated}
                        onClick={() => { if (!isAuthenticated) requestSignIn(); }}
                        onBlur={() => commitPosition(position.symbol)}
                        value={holdings.find((holding) => holding.symbol === position.symbol)?.quantity ?? ""}
                        onChange={(event) => {
                          if (!isAuthenticated) {
                            requestSignIn();
                            return;
                          }
                          const quantity = event.target.value;
                          const holding = holdings.find((item) => item.symbol === position.symbol);
                          if (holding) draftPosition({ ...holding, quantity });
                        }}
                        className="w-24 rounded-md border border-input bg-background px-2 py-1 font-mono text-sm text-zinc-100 outline-none transition focus:border-primary"
                      />
                    </td>
                    <td className="px-5 py-4 text-zinc-100">
                      {isLoadingMarks ? <SkeletonBlock className="h-4 w-24" /> : formatMaybeAssetCurrency(position.marketValue, quoteFor(position.symbol)?.currency)}
                    </td>
                    <td
                      className={`px-5 py-4 text-right font-medium ${pnlClassName(position.unrealizedPnl)}`}
                    >
                      {isLoadingMarks ? <SkeletonBlock className="ml-auto h-8 w-20" /> : (
                        <>
                          <div>{formatMaybeSignedUsd(position.unrealizedPnl)}</div>
                          <div className="text-xs font-normal">
                            {formatMaybePercent(position.unrealizedPnlPercent)}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => openEditPositionDialog(holdings.find((holding) => holding.symbol === position.symbol) ?? position)} aria-label={`Edit ${position.symbol}`} className="rounded-md p-1.5 text-zinc-500 transition hover:bg-accent hover:text-primary">
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button type="button" onClick={() => removeHolding(position.symbol)} aria-label={`Remove ${position.symbol}`} className="rounded-md p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-400">
                          <X className="size-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                  ))}
                </tbody>
              ))}
              {positions.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-sm text-zinc-500">No holdings yet. Search above or add one to start tracking.</td>
                  </tr>
                </tbody>
              ) : null}
            </table>
          </ScrollWindow>
        </motion.section> : activeView === "visualization" ? (
          <motion.div key="visualization" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2, ease: "easeOut" }}>
            <PortfolioVisualization
              positions={positions}
              quotes={quotes}
              actions={actions}
              displayCurrency={displayCurrency}
              displayCurrencyUsdRate={displayCurrencyUsdRate}
              isRefreshing={isRefreshing}
              isActionsHydrated={visibleActionsHydrated}
              isAuthenticated={isAuthenticated}
              onRequestSignIn={requestSignIn}
              onAddActions={addActions}
              onRemoveAction={removeAction}
            />
          </motion.div>
        ) : (
          <motion.div key="explore" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2, ease: "easeOut" }}>
            <ExploreView
              routeSymbol={selectedExploreSymbol}
              onReturnToWatchlist={() => onViewChange("table")}
            />
          </motion.div>
        )}
        </AnimatePresence>
      <PositionDialog
        open={isAuthenticated && isPositionDialogOpen}
        initialPosition={positionDialogInitial}
        onOpenChange={setIsPositionDialogOpen}
        onSubmit={savePosition}
      />
    </>
  );
}
