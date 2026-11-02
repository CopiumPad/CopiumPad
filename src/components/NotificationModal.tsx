"use client";

import { Suspense, useEffect, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Bell, CalendarClock, CircleDollarSign, Trash2, X } from "lucide-react";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { AlertListSkeleton } from "@/components/skeletons";
import {
  ALERT_COLUMNS,
  alertsQueryOptions,
  deleteAlertMutationOptions,
  prependAlert,
  type AlertRecord,
  type AlertType,
} from "@/lib/queries/alerts";
import { queryKeys } from "@/lib/queries/keys";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

function RecentAlerts({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: alerts } = useSuspenseQuery(alertsQueryOptions(createSupabaseBrowserClient, userId));
  const { mutate: deleteAlert, error } = useMutation(deleteAlertMutationOptions({
    queryClient,
    getClient: createSupabaseBrowserClient,
    userId,
  }));

  return (
    <>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-400">{error.message}</p> : null}
      {alerts.length === 0 ? <p className="mt-3 text-xs text-zinc-500">No alerts configured.</p> : (
        <ul className="mt-2 divide-y divide-border">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-mono tabular-nums text-xs text-zinc-200">{alert.type === "price" ? `${alert.target_symbol} · ${alert.target_price}` : `Deposit · ${alert.target_time ? new Date(alert.target_time).toLocaleString() : "Time not set"}`}</p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">{alert.custom_message}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-[10px] ${alert.is_triggered ? "text-primary" : "text-zinc-500"}`}>{alert.is_triggered ? "Triggered" : "Pending"}</span>
                <button type="button" onClick={() => deleteAlert(alert.id)} aria-label={`Delete alert: ${alert.custom_message}`} className="rounded-xl p-1 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="size-3.5" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NotificationModal({ userId, onClose }: NotificationModalProps) {
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = useState<AlertType>("price");
  const [symbol, setSymbol] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        .select(ALERT_COLUMNS)
        .single();
      if (insertError) throw insertError;
      queryClient.setQueryData<AlertRecord[]>(queryKeys.alerts(userId), (current = []) => prependAlert(current, data as AlertRecord));
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
      <section aria-labelledby="notification-modal-title" aria-modal="true" className="my-auto w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-primary"><Bell className="size-4" aria-hidden /><span className="text-[10px] font-semibold uppercase tracking-wider">Notifications &amp; Alerts</span></div>
            <h2 id="notification-modal-title" className="mt-2 text-lg font-semibold text-zinc-50">Create an alert</h2>
            <p className="mt-1 text-xs text-zinc-500">Alerts are delivered to your account email.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close notifications" className="rounded-xl p-1.5 text-zinc-500 hover:bg-accent hover:text-zinc-100"><X className="size-4" aria-hidden /></button>
        </div>

        <div className="px-5 pt-5 sm:px-6">
          <div role="tablist" aria-label="Alert type" className="grid grid-cols-2 rounded-xl border border-border bg-background p-1">
            <button type="button" role="tab" aria-selected={activeType === "price"} onClick={() => { setActiveType("price"); setError(null); setNotice(null); }} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition ${activeType === "price" ? "bg-primary text-primary-foreground" : "text-zinc-400 hover:text-zinc-100"}`}><CircleDollarSign className="size-4" aria-hidden />Price Alert</button>
            <button type="button" role="tab" aria-selected={activeType === "deposit"} onClick={() => { setActiveType("deposit"); setError(null); setNotice(null); }} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition ${activeType === "deposit" ? "bg-primary text-primary-foreground" : "text-zinc-400 hover:text-zinc-100"}`}><CalendarClock className="size-4" aria-hidden />Deposit Alert</button>
          </div>

          <form onSubmit={saveAlert} className="space-y-4 py-5">
            {activeType === "price" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-300">Asset ticker
                  <input required maxLength={20} autoCapitalize="characters" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="AAPL or BTC-USD" className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono tabular-nums text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary" />
                </label>
                <label className="block text-xs font-medium text-zinc-300">Target price
                  <input required type="number" min="0.00000001" step="any" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder="185.00" className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono text-sm tabular-nums text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary" />
                </label>
              </div>
            ) : (
              <label className="block text-xs font-medium text-zinc-300">Deposit date and time
                <input required type="datetime-local" min={localDateTimeMin()} value={targetTime} onChange={(event) => setTargetTime(event.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-mono tabular-nums text-sm text-zinc-100 outline-none focus:border-primary [color-scheme:dark]" />
              </label>
            )}

            <label className="block text-xs font-medium text-zinc-300">Custom email message
              <textarea required maxLength={MAX_MESSAGE_LENGTH} rows={2} value={customMessage} onChange={(event) => setCustomMessage(event.target.value.slice(0, MAX_MESSAGE_LENGTH))} placeholder="Your alert message..." className="mt-1.5 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary" />
              <span className="mt-1 block text-right font-mono text-[10px] tabular-nums text-zinc-500">{customMessage.length}/{MAX_MESSAGE_LENGTH}</span>
            </label>

            {error ? <p role="alert" className="text-xs text-rose-400">{error}</p> : null}
            {notice ? <p role="status" className="text-xs text-primary">{notice}</p> : null}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" onClick={onClose} className="rounded-xl border border-input px-3 py-2 text-xs text-zinc-300 hover:bg-accent">Close</button>
              <button type="submit" disabled={isSaving} className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:cursor-wait disabled:opacity-60">{isSaving ? "Saving…" : "Save alert"}</button>
            </div>
          </form>
        </div>

        <div className="border-t border-border px-5 py-4 sm:px-6">
          <h3 className="text-xs font-medium text-zinc-300">Recent alerts</h3>
          <QueryErrorBoundary>
            <Suspense fallback={<AlertListSkeleton />}>
              <RecentAlerts userId={userId} />
            </Suspense>
          </QueryErrorBoundary>
        </div>
      </section>
    </div>
  );
}