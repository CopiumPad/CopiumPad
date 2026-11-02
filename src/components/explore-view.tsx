"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChartLine,
  ExternalLink,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  formatCompactNumber,
  formatPercent,
  formatSignedUsd,
} from "@/lib/finance/money";
import type { QuoteSnapshot } from "@/lib/finance/portfolio";
import { ScrollWindow, TAP } from "@/components/ui/motion";

const EXPLORE_STORAGE_KEY = "copiumpad_explore_symbols";

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

type QuotesResponse = {
  success: boolean;
  data?: Array<QuoteSnapshot & { price: number; changePercent: number }>;
  error?: string;
};

type ExploreViewProps = {
  routeSymbol: string | null;
  onReturnToWatchlist: () => void;
};

function formatPrice(quote: QuoteSnapshot): string {
  return Number(quote.price).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMetric(value: number | null | undefined): string {
  return value == null
    ? "Not available"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatMarketCap(value: number | null | undefined): string {
  return value == null ? "Not available" : formatCompactNumber(value);
}

function isCrypto(quote: QuoteSnapshot): boolean {
  return quote.quoteType?.toUpperCase().startsWith("CRYPTO") ?? false;
}

export function ExploreView({ routeSymbol, onReturnToWatchlist }: ExploreViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [exploredSymbols, setExploredSymbols] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<QuoteSnapshot[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(EXPLORE_STORAGE_KEY);
      const storedSymbols = stored ? JSON.parse(stored) : [];
      const normalizedRouteSymbol = routeSymbol?.trim().toUpperCase();
      const nextSymbols = Array.isArray(storedSymbols)
        ? storedSymbols.filter((symbol): symbol is string => typeof symbol === "string")
        : [];
      if (normalizedRouteSymbol && !nextSymbols.includes(normalizedRouteSymbol)) {
        nextSymbols.push(normalizedRouteSymbol);
      }
      setExploredSymbols(nextSymbols);
      setSelectedSymbol(normalizedRouteSymbol ?? nextSymbols[0] ?? null);
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [routeSymbol]);

  useEffect(() => {
    if (isHydrated) {
      window.localStorage.setItem(EXPLORE_STORAGE_KEY, JSON.stringify(exploredSymbols));
    }
  }, [exploredSymbols, isHydrated]);

  useEffect(() => {
    const quoteSymbols = [...new Set(selectedSymbol ? [...exploredSymbols, selectedSymbol] : exploredSymbols)];
    if (!isHydrated || quoteSymbols.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoadingQuotes(true);
      setQuoteError(null);
      fetch(`/api/quotes?symbols=${encodeURIComponent(quoteSymbols.join(","))}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as QuotesResponse;
          if (!response.ok || !payload.success || payload.data === undefined) {
            throw new Error(payload.error ?? "Failed to fetch explored quotes");
          }
          setQuotes(payload.data.map((quote) => ({ ...quote, price: quote.price.toString(), changePercent: quote.changePercent.toString() })));
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setQuoteError(error instanceof Error ? error.message : "Failed to fetch explored quotes");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoadingQuotes(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [exploredSymbols, isHydrated, selectedSymbol]);

  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.symbol.toUpperCase() === selectedSymbol?.toUpperCase()) ?? null,
    [quotes, selectedSymbol],
  );

  async function searchAssets(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
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
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : "Failed to search assets");
    } finally {
      setIsSearching(false);
    }
  }

  function viewAsset(symbol: string) {
    setSelectedSymbol(symbol);
  }

  function addToExplore(symbol: string) {
    setExploredSymbols((current) => (current.includes(symbol) ? current : [...current, symbol]));
    setSelectedSymbol(symbol);
  }

  function removeFromExplore(symbol: string) {
    setExploredSymbols((current) => current.filter((item) => item !== symbol));
    setSelectedSymbol((current) => (current === symbol ? null : current));
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:h-[32rem] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <Search className="size-3.5" aria-hidden />
            Search securities and crypto
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">Find your next rabbit hole.</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Search by ticker, company, or crypto name. View an asset now or add it to your comparison set.</p>
          <form onSubmit={searchAssets} className="mt-5 flex gap-2">
            <input
              aria-label="Search securities and crypto"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="AAPL, DBS, BTC-USD..."
              className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary"
            />
            <motion.button whileTap={TAP} type="submit" disabled={isSearching} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-60">
              {isSearching ? "Searching..." : "Search"}
            </motion.button>
          </form>
          {searchError ? <p className="mt-2 text-xs text-rose-400">{searchError}</p> : null}
          {searchResults.length > 0 ? (
            <ScrollWindow className="mt-4 max-h-64 divide-y divide-border rounded-xl border border-border bg-background lg:max-h-none lg:min-h-0 lg:flex-1">
              {searchResults.map((result) => {
                const isAdded = exploredSymbols.includes(result.symbol);
                return (
                  <div key={`${result.symbol}-${result.exchange}`} className="flex items-center gap-3 px-3 py-3">
                    <motion.button whileTap={TAP} type="button" onClick={() => viewAsset(result.symbol)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-mono tabular-nums text-sm text-zinc-100">{result.symbol}</span>
                      <span className="block truncate text-xs text-zinc-500">{result.name}</span>
                      <span className="mt-1 block text-[10px] uppercase tracking-wider text-zinc-600">{result.exchange} · {result.type}</span>
                    </motion.button>
                    <motion.button whileTap={TAP} type="button" onClick={() => addToExplore(result.symbol)} disabled={isAdded} className="shrink-0 rounded-xl border border-input px-2 py-1.5 text-xs text-zinc-300 transition hover:border-primary hover:text-primary disabled:cursor-default disabled:text-primary">
                      {isAdded ? "Added" : "Compare"}
                    </motion.button>
                  </div>
                );
              })}
            </ScrollWindow>
          ) : null}
        </div>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="explored-assets-heading">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <h2 id="explored-assets-heading" className="text-sm font-medium tracking-wide text-zinc-200">Explore set</h2>
              <p className="mt-1 text-xs text-zinc-500">Your saved market comparisons</p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {isLoadingQuotes ? <RefreshCw role="status" aria-label="Refreshing explored quotes" className="size-3.5 animate-spin text-primary" /> : null}
              <span className="rounded-full border border-border px-2 py-1 font-mono text-xs tabular-nums text-zinc-500">{exploredSymbols.length} assets</span>
            </span>
          </div>
          {exploredSymbols.length === 0 ? (
            <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-zinc-500 lg:h-auto lg:min-h-0 lg:flex-1">Search for an asset to start comparing markets.</div>
          ) : (
            <ScrollWindow className="h-80 divide-y divide-border lg:h-auto lg:min-h-0 lg:flex-1">
              {exploredSymbols.map((symbol) => {
                const quote = quotes.find((item) => item.symbol === symbol);
                const isSelected = selectedSymbol === symbol;
                return (
                  <div key={symbol} className={`row-glow flex items-center gap-3 px-6 py-5 ${isSelected ? "bg-primary/5" : ""}`}>
                    <motion.button whileTap={TAP} type="button" onClick={() => setSelectedSymbol(symbol)} className="min-w-0 flex-1 text-left">
                      <span className="block font-mono tabular-nums text-sm font-medium text-zinc-100">{symbol}</span>
                      <span className="block truncate text-xs text-zinc-500">{quote?.name ?? "Loading quote..."}</span>
                    </motion.button>
                    {quote ? <span className={Number(quote.changePercent) >= 0 ? "font-mono tabular-nums text-xs text-emerald-400" : "font-mono tabular-nums text-xs text-rose-400"}>{formatPercent(quote.changePercent)}</span> : null}
                    <motion.button whileTap={TAP} type="button" onClick={() => removeFromExplore(symbol)} className="rounded-xl p-1.5 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-400" aria-label={`Remove ${symbol} from Explore`}><X className="size-4" aria-hidden /></motion.button>
                  </div>
                );
              })}
            </ScrollWindow>
          )}
        </section>
      </section>

      {quoteError ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{quoteError}</p> : null}
      {selectedQuote ? (
        <section className="rounded-2xl border border-border bg-card" aria-live="polite">
          <div className="flex flex-col gap-4 border-b border-border px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-mono tabular-nums text-2xl font-semibold text-zinc-100">{selectedQuote.symbol}</h2>
                <span className="rounded-xl border border-input px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">{selectedQuote.quoteType ?? "SECURITY"}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">{selectedQuote.name}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-zinc-600">{selectedQuote.exchange ?? "Unknown market"} · {selectedQuote.currency ?? "USD"}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-mono tabular-nums text-2xl text-zinc-50">{formatPrice(selectedQuote)} <span className="text-sm text-zinc-500">{selectedQuote.currency}</span></p>
              <p className={`mt-1 inline-flex items-center gap-1 font-mono text-sm tabular-nums ${Number(selectedQuote.changePercent) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {Number(selectedQuote.changePercent) >= 0 ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}
                {formatSignedUsd(selectedQuote.changePercent)}%
              </p>
            </div>
          </div>
          <div className="px-6 py-6">
            {isCrypto(selectedQuote) ? (
              <p className="rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-zinc-400">Fundamental metrics are not available for crypto assets.</p>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-background/60 p-3"><dt className="text-xs text-zinc-500">P/E ratio</dt><dd className="mt-1 font-mono tabular-nums text-sm text-zinc-100">{formatMetric(selectedQuote.trailingPE)}</dd></div>
                <div className="rounded-xl border border-border bg-background/60 p-3"><dt className="text-xs text-zinc-500">Forward P/E</dt><dd className="mt-1 font-mono tabular-nums text-sm text-zinc-100">{formatMetric(selectedQuote.forwardPE)}</dd></div>
                <div className="rounded-xl border border-border bg-background/60 p-3"><dt className="text-xs text-zinc-500">Market cap</dt><dd className="mt-1 font-mono tabular-nums text-sm text-zinc-100">{formatMarketCap(selectedQuote.marketCap)}</dd></div>
                <div className="rounded-xl border border-border bg-background/60 p-3"><dt className="text-xs text-zinc-500">52-week range</dt><dd className="mt-1 font-mono tabular-nums text-sm text-zinc-100">{selectedQuote.fiftyTwoWeekLow == null || selectedQuote.fiftyTwoWeekHigh == null ? "Not available" : `${selectedQuote.fiftyTwoWeekLow} - ${selectedQuote.fiftyTwoWeekHigh}`}</dd></div>
              </dl>
            )}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-border bg-card p-6"><ChartLine className="size-4 text-primary" aria-hidden /><h2 className="mt-3 text-sm font-medium text-zinc-200">Market details</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Keep the dashboard clean while you investigate individual assets here.</p></article>
        <article className="rounded-2xl border border-border bg-card p-6"><TrendingUp className="size-4 text-primary" aria-hidden /><h2 className="mt-3 text-sm font-medium text-zinc-200">Compare quickly</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Save several symbols and move between their live quotes in one view.</p></article>
        <article className="rounded-2xl border border-border bg-card p-6"><ExternalLink className="size-4 text-primary" aria-hidden /><h2 className="mt-3 text-sm font-medium text-zinc-200">Portfolio stays focused</h2><p className="mt-1 text-xs leading-5 text-zinc-500"><motion.button whileTap={TAP} type="button" onClick={onReturnToWatchlist} className="text-primary hover:text-primary">Return to Watchlists</motion.button> when you are ready to manage holdings.</p></article>
      </section>
    </div>
  );
}
