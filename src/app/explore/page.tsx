"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChartLine,
  ExternalLink,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppHeader } from "@/components/app-header";
import {
  formatCompactNumber,
  formatPercent,
  formatSignedUsd,
} from "@/lib/finance/money";
import type { QuoteSnapshot } from "@/lib/finance/portfolio";

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

export default function ExplorePage() {
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
      const querySymbol = new URLSearchParams(window.location.search).get("symbol");
      const normalizedQuerySymbol = querySymbol?.trim().toUpperCase();
      const nextSymbols = Array.isArray(storedSymbols)
        ? storedSymbols.filter((symbol): symbol is string => typeof symbol === "string")
        : [];
      if (normalizedQuerySymbol && !nextSymbols.includes(normalizedQuerySymbol)) {
        nextSymbols.push(normalizedQuerySymbol);
      }
      setExploredSymbols(nextSymbols);
      setSelectedSymbol(normalizedQuerySymbol ?? nextSymbols[0] ?? null);
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: "easeOut" }} className="min-h-full bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <AppHeader activeView="explore" />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-emerald-400">
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
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400"
              />
              <button type="submit" disabled={isSearching} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60">
                {isSearching ? "Searching..." : "Search"}
              </button>
            </form>
            {searchError ? <p className="mt-2 text-xs text-red-400">{searchError}</p> : null}
            {searchResults.length > 0 ? (
              <div className="mt-4 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-950">
                {searchResults.map((result) => {
                  const isAdded = exploredSymbols.includes(result.symbol);
                  return (
                    <div key={`${result.symbol}-${result.exchange}`} className="flex items-center gap-3 px-3 py-3">
                      <button type="button" onClick={() => viewAsset(result.symbol)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-mono text-sm text-zinc-100">{result.symbol}</span>
                        <span className="block truncate text-xs text-zinc-500">{result.name}</span>
                        <span className="mt-1 block text-[10px] uppercase tracking-wider text-zinc-600">{result.exchange} · {result.type}</span>
                      </button>
                      <button type="button" onClick={() => addToExplore(result.symbol)} disabled={isAdded} className="shrink-0 rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-400 hover:text-emerald-300 disabled:cursor-default disabled:text-emerald-400">
                        {isAdded ? "Added" : "Compare"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40" aria-labelledby="explored-assets-heading">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 id="explored-assets-heading" className="text-sm font-medium tracking-wide text-zinc-200">Explore set</h2>
                <p className="mt-1 text-xs text-zinc-500">Your saved market comparisons</p>
              </div>
              <span className="rounded-full border border-zinc-800 px-2 py-1 text-xs text-zinc-500">{exploredSymbols.length} assets</span>
            </div>
            {exploredSymbols.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-zinc-500">Search for an asset to start comparing markets.</div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {exploredSymbols.map((symbol) => {
                  const quote = quotes.find((item) => item.symbol === symbol);
                  const isSelected = selectedSymbol === symbol;
                  return (
                    <div key={symbol} className={`flex items-center gap-3 px-5 py-4 ${isSelected ? "bg-emerald-400/5" : ""}`}>
                      <button type="button" onClick={() => setSelectedSymbol(symbol)} className="min-w-0 flex-1 text-left">
                        <span className="block font-mono text-sm font-medium text-zinc-100">{symbol}</span>
                        <span className="block truncate text-xs text-zinc-500">{quote?.name ?? "Loading quote..."}</span>
                      </button>
                      {quote ? <span className={Number(quote.changePercent) >= 0 ? "font-mono text-xs text-emerald-400" : "font-mono text-xs text-red-400"}>{formatPercent(quote.changePercent)}</span> : null}
                      <button type="button" onClick={() => removeFromExplore(symbol)} className="rounded-md p-1.5 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-400" aria-label={`Remove ${symbol} from Explore`}><X className="size-4" aria-hidden /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        {quoteError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{quoteError}</p> : null}
        {isLoadingQuotes ? <p className="text-sm text-zinc-500">Refreshing explored quotes...</p> : null}
        {selectedQuote ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40" aria-live="polite">
            <div className="flex flex-col gap-4 border-b border-zinc-800 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-mono text-2xl font-semibold text-zinc-100">{selectedQuote.symbol}</h2>
                  <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">{selectedQuote.quoteType ?? "SECURITY"}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{selectedQuote.name}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-zinc-600">{selectedQuote.exchange ?? "Unknown market"} · {selectedQuote.currency ?? "USD"}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-mono text-2xl text-zinc-50">{formatPrice(selectedQuote)} <span className="text-sm text-zinc-500">{selectedQuote.currency}</span></p>
                <p className={`mt-1 inline-flex items-center gap-1 text-sm ${Number(selectedQuote.changePercent) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {Number(selectedQuote.changePercent) >= 0 ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}
                  {formatSignedUsd(selectedQuote.changePercent)}%
                </p>
              </div>
            </div>
            <div className="px-5 py-5">
              {isCrypto(selectedQuote) ? (
                <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">Fundamental metrics are not available for crypto assets.</p>
              ) : (
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"><dt className="text-xs text-zinc-500">P/E ratio</dt><dd className="mt-1 font-mono text-sm text-zinc-100">{formatMetric(selectedQuote.trailingPE)}</dd></div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"><dt className="text-xs text-zinc-500">Forward P/E</dt><dd className="mt-1 font-mono text-sm text-zinc-100">{formatMetric(selectedQuote.forwardPE)}</dd></div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"><dt className="text-xs text-zinc-500">Market cap</dt><dd className="mt-1 font-mono text-sm text-zinc-100">{formatMarketCap(selectedQuote.marketCap)}</dd></div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"><dt className="text-xs text-zinc-500">52-week range</dt><dd className="mt-1 font-mono text-sm text-zinc-100">{selectedQuote.fiftyTwoWeekLow == null || selectedQuote.fiftyTwoWeekHigh == null ? "Not available" : `${selectedQuote.fiftyTwoWeekLow} - ${selectedQuote.fiftyTwoWeekHigh}`}</dd></div>
                </dl>
              )}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"><ChartLine className="size-4 text-emerald-400" aria-hidden /><h2 className="mt-3 text-sm font-medium text-zinc-200">Market details</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Keep the dashboard clean while you investigate individual assets here.</p></article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"><TrendingUp className="size-4 text-emerald-400" aria-hidden /><h2 className="mt-3 text-sm font-medium text-zinc-200">Compare quickly</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Save several symbols and move between their live quotes in one view.</p></article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"><ExternalLink className="size-4 text-emerald-400" aria-hidden /><h2 className="mt-3 text-sm font-medium text-zinc-200">Portfolio stays focused</h2><p className="mt-1 text-xs leading-5 text-zinc-500"><Link href="/" className="text-emerald-400 hover:text-emerald-300">Return to Watchlists</Link> when you are ready to manage holdings.</p></article>
        </section>
      </div>
    </motion.main>
  );
}
