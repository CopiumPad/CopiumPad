"use client";

import { useEffect, useState } from "react";
import type { Holding } from "@/lib/finance/portfolio";

type PositionDraft = Pick<Holding, "symbol" | "name" | "quantity" | "averageCost">;
type PositionDialogProps = {
  open: boolean;
  initialPosition?: Partial<PositionDraft>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (position: Holding) => void;
};

const emptyDraft: PositionDraft = { symbol: "", name: "", quantity: "", averageCost: "" };

function isPositiveNumber(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
}

export function PositionDialog({ open, initialPosition, onOpenChange, onSubmit }: PositionDialogProps) {
  const [draft, setDraft] = useState<PositionDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        setDraft({ ...emptyDraft, ...initialPosition });
        setError(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [initialPosition, open]);

  if (!open) return null;
  const isEditing = initialPosition?.symbol !== undefined;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = draft.symbol.trim().toUpperCase();
    if (!symbol || !isPositiveNumber(draft.quantity) || !isPositiveNumber(draft.averageCost)) {
      setError("Enter a symbol, quantity, and average buy price greater than zero.");
      return;
    }
    onSubmit({ symbol, name: draft.name.trim() || symbol, quantity: draft.quantity.trim(), averageCost: draft.averageCost.trim() });
    onOpenChange(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <div aria-labelledby="position-dialog-title" aria-modal="true" className="w-full max-w-md rounded-xl border border-input bg-card p-6 shadow-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="position-dialog-title" className="text-lg font-semibold text-zinc-100">{isEditing ? "Edit holding" : "Add holding"}</h2>
            <p className="mt-1 text-sm text-zinc-500">Track the position in your local portfolio.</p>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="text-zinc-500 hover:text-zinc-200" aria-label="Close dialog">×</button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-zinc-300">Symbol
            <input autoFocus value={draft.symbol} onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value }))} disabled={isEditing} placeholder="AAPL" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm uppercase text-zinc-100 outline-none focus:border-primary disabled:opacity-60" />
          </label>
          <label className="block text-sm text-zinc-300">Quantity
            <input type="number" min="0" step="any" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="10" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-primary" />
          </label>
          <label className="block text-sm text-zinc-300">Average buy price
            <input type="number" min="0" step="any" value={draft.averageCost} onChange={(event) => setDraft((current) => ({ ...current, averageCost: event.target.value }))} placeholder="150.00" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-primary" />
          </label>
          {error !== null ? <p className="text-sm text-rose-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-input px-3 py-2 text-sm text-zinc-300 hover:bg-accent">Cancel</button>
            <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/85">{isEditing ? "Save changes" : "Add holding"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}