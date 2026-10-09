"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarClock, CircleDollarSign, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AlertType = "price" | "deposit";
type AlertRecord = {
  id: string;
  type: AlertType;
  target_symbol: string | null;
  target_price: number | string | null;
  target_time: string | null;
  custom_message: string;
  is_triggered: boolean;
  created_at: string;
};

type NotificationModalProps = {
  userId: string;
  onClose: () => void;
};

const MAX_MESSAGE_LENGTH = 50;

function localDateTimeMin(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function NotificationModal({ userId, onClose }: NotificationModalProps) {
  const [activeType, setActiveType] = useState<AlertType>("price");
  const [symbol, setSymbol] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient()
      .from("alerts")
      .select("id, type, target_symbol, target_price, target_time, custom_message, is_triggered, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data, error: queryError }: { data: AlertRecord[] | null; error: Error | null }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else setAlerts(data ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load alerts.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function saveAlert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = customMessage.trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      setError("Enter a message of 50 characters or fewer.");
      return;
    }

    let alertData: {
      type: AlertType;
      target_symbol: string | null;
      target_price: string | null;
      target_time: string | null;
    };
    if (activeType === "price") {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const price = Number(targetPrice);
      if (!normalizedSymbol || !Number.isFinite(price) || price <= 0) {
        setError("Enter an asset ticker and a target price greater than zero.");
        return;
      }
      alertData = {
        type: "price",
        target_symbol: normalizedSymbol,
        target_price: targetPrice.trim(),
        target_time: null,
      };
    } else {
      const timestamp = new Date(targetTime).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        setError("Choose a future date and time.");
        return;
      }
      alertData = {
        type: "deposit",
        target_symbol: null,
        target_price: null,
        target_time: new Date(timestamp).toISOString(),
      };
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: insertError } = await createSupabaseBrowserClient()
        .from("alerts")
        .insert({
          ...alertData,
          user_id: userId,
          custom_message: message,
          is_triggered: false,
        })
        .select("id, type, target_symbol, target_price, target_time, custom_message, is_triggered, created_at")
        .single();
      if (insertError) throw insertError;
      setAlerts((current) => [data as AlertRecord, ...current].slice(0, 8));
      setCustomMessage("");
      setNotice("Alert saved. Email will be sent when it is triggered.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this alert.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4" role="presentation">
      <section aria-labelledby="notification-modal-title" aria-modal="true" className="my-auto w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-400"><Bell className="size-4" aria-hidden /><span className="text-[10px] font-semibold uppercase tracking-wider">Notifications &amp; Alerts</span></div>
            <h2 id="notification-modal-title" className="mt-2 text-lg font-semibold text-zinc-50">Create an alert</h2>
            <p className="mt-1 text-xs text-zinc-500">Alerts are delivered to your account email.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close notifications" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"><X className="size-4" aria-hidden /></button>
        </div>

        <div className="px-5 pt-5 sm:px-6">
          <div role="tablist" aria-label="Alert type" className="grid grid-cols-2 rounded-md border border-zinc-800 bg-zinc-950 p-1">
            <button type="button" role="tab" aria-selected={activeType === "price"} onClick={() => { setActiveType("price"); setError(null); setNotice(null); }} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded px-3 text-xs font-medium transition ${activeType === "price" ? "bg-emerald-400 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}><CircleDollarSign className="size-4" aria-hidden />Price Alert</button>
            <button type="button" role="tab" aria-selected={activeType === "deposit"} onClick={() => { setActiveType("deposit"); setError(null); setNotice(null); }} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded px-3 text-xs font-medium transition ${activeType === "deposit" ? "bg-emerald-400 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}><CalendarClock className="size-4" aria-hidden />Deposit Alert</button>
          </div>

          <form onSubmit={saveAlert} className="space-y-4 py-5">
            {activeType === "price" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-300">Asset ticker
                  <input required maxLength={20} autoCapitalize="characters" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="AAPL or BTC-USD" className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400" />
                </label>
                <label className="block text-xs font-medium text-zinc-300">Target price
                  <input required type="number" min="0.00000001" step="any" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder="185.00" className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm tabular-nums text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400" />
                </label>
              </div>
            ) : (
              <label className="block text-xs font-medium text-zinc-300">Deposit date and time
                <input required type="datetime-local" min={localDateTimeMin()} value={targetTime} onChange={(event) => setTargetTime(event.target.value)} className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-400 [color-scheme:dark]" />
              </label>
            )}

            <label className="block text-xs font-medium text-zinc-300">Custom email message
              <textarea required maxLength={MAX_MESSAGE_LENGTH} rows={2} value={customMessage} onChange={(event) => setCustomMessage(event.target.value.slice(0, MAX_MESSAGE_LENGTH))} placeholder="Your alert message..." className="mt-1.5 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400" />
              <span className="mt-1 block text-right font-mono text-[10px] tabular-nums text-zinc-500">{customMessage.length}/{MAX_MESSAGE_LENGTH}</span>
            </label>

            {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
            {notice ? <p role="status" className="text-xs text-emerald-300">{notice}</p> : null}
            <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <button type="button" onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Close</button>
              <button type="submit" disabled={isSaving} className="rounded-md bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving…" : "Save alert"}</button>
            </div>
          </form>
        </div>

        <div className="border-t border-zinc-800 px-5 py-4 sm:px-6">
          <h3 className="text-xs font-medium text-zinc-300">Recent alerts</h3>
          {isLoading ? <p className="mt-3 text-xs text-zinc-500">Loading alerts…</p> : alerts.length === 0 ? <p className="mt-3 text-xs text-zinc-500">No alerts configured.</p> : (
            <ul className="mt-2 divide-y divide-zinc-800">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-zinc-200">{alert.type === "price" ? `${alert.target_symbol} · ${alert.target_price}` : `Deposit · ${alert.target_time ? new Date(alert.target_time).toLocaleString() : "Time not set"}`}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{alert.custom_message}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] ${alert.is_triggered ? "text-emerald-400" : "text-zinc-500"}`}>{alert.is_triggered ? "Triggered" : "Pending"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}