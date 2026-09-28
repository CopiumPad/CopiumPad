"use client";

import { useEffect, useRef, useState } from "react";
import { toDecimal } from "@/lib/finance/money";
import type { PositionMark, QuoteSnapshot } from "@/lib/finance/portfolio";
import {
  categoryForQuote,
  quantityAfterActions,
  type ActionDirection,
  type PortfolioAction,
} from "@/lib/finance/portfolio";

type PortfolioActionDialogProps = {
  open: boolean;
  positions: PositionMark[];
  quotes: QuoteSnapshot[];
  actions: PortfolioAction[];
  onClose: () => void;
  onSubmit: (action: PortfolioAction) => void;
};

function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function positiveDecimal(value: string): boolean {
  const normalized = value.trim();
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) && toDecimal(normalized).isPositive();
}

export function PortfolioActionDialog({
  open,
  positions,
  quotes,
  actions,
  onClose,
  onSubmit,
}: PortfolioActionDialogProps) {
  const [assetId, setAssetId] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<ActionDirection>("BUY");
  const [error, setError] = useState<string | null>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    if (!open) {
      hasOpened.current = false;
      return;
    }
    if (hasOpened.current) return;
    const timer = window.setTimeout(() => {
      hasOpened.current = true;
      setAssetId(positions[0]?.symbol ?? "");
      setTimestamp(localDateTimeValue(new Date()));
      setQuantity("");
      setPrice(positions[0]?.livePrice?.toString() ?? "");
      setDirection("BUY");
      setError(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, positions]);

  if (!open) return null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const position = positions.find((item) => item.symbol.toUpperCase() === assetId.trim().toUpperCase());
    const actionTimestamp = new Date(timestamp).getTime();
    if (!position || !Number.isFinite(actionTimestamp) || !positiveDecimal(quantity) || !positiveDecimal(price)) {
      setError("Choose a tracked asset and enter a valid time, positive quantity, and positive price.");
      return;
    }

    if (direction === "SELL") {
      const currentQuantity = quantityAfterActions(actions, position.symbol, actionTimestamp);
      if (currentQuantity.lessThan(quantity)) {
        setError(`This sale exceeds the available tracked quantity of ${currentQuantity.toString()}. Set an initial point first if this holding predates your action history.`);
        return;
      }
    }

    const quote = quotes.find((item) => item.symbol.toUpperCase() === position.symbol.toUpperCase());
    onSubmit({
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: actionTimestamp,
      assetId: position.symbol,
      category: categoryForQuote(quote),
      quantity: quantity.trim(),
      price: price.trim(),
      direction,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <div aria-labelledby="action-dialog-title" aria-modal="true" className="w-full max-w-lg border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="action-dialog-title" className="text-lg font-semibold text-zinc-100">Add portfolio action</h2>
            <p className="mt-1 text-sm text-zinc-500">Actions are stored separately from manually managed holdings.</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close dialog">×</button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-zinc-300">Date &amp; time
            <input required type="datetime-local" value={timestamp} onChange={(event) => setTimestamp(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400" />
          </label>
          <label className="block text-sm text-zinc-300">Asset
            <input required list="portfolio-action-assets" value={assetId} onChange={(event) => {
              const nextAssetId = event.target.value;
              setAssetId(nextAssetId);
              const mark = positions.find((item) => item.symbol.toUpperCase() === nextAssetId.toUpperCase());
              if (mark?.livePrice) setPrice(mark.livePrice.toString());
            }} placeholder="Search tracked assets" className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-400" />
            <datalist id="portfolio-action-assets">
              {positions.map((item) => <option key={item.symbol} value={item.symbol}>{item.name}</option>)}
            </datalist>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-zinc-300">Quantity
              <input required inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="1.25" className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-400" />
            </label>
            <label className="block text-sm text-zinc-300">Execution price
              <input required inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="125.00" className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-400" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-4">
            <fieldset>
              <legend className="mb-2 text-sm text-zinc-300">Direction</legend>
              <div className="inline-flex border border-zinc-700 bg-zinc-950 p-1" aria-label="Action direction">
                {(["BUY", "SELL"] as const).map((option) => (
                  <button key={option} type="button" aria-pressed={direction === option} onClick={() => setDirection(option)} className={`px-4 py-1.5 text-xs font-semibold ${direction === option ? "bg-emerald-400 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}>{option}</button>
                ))}
              </div>
            </fieldset>
            <span className="text-xs text-zinc-500">Prices use the asset&apos;s quote currency.</span>
          </div>
          {error !== null ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
            <button type="submit" className="rounded-md bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-500">Save action</button>
          </div>
        </form>
      </div>
    </div>
  );
}