import { queryOptions, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queryKeys } from "@/lib/queries/keys";

export type AlertType = "price" | "deposit";
export type AlertRecord = {
  id: string;
  type: AlertType;
  target_symbol: string | null;
  target_price: number | string | null;
  target_time: string | null;
  custom_message: string;
  is_triggered: boolean;
  created_at: string;
};

export const ALERT_COLUMNS = "id, type, target_symbol, target_price, target_time, custom_message, is_triggered, created_at";
export const RECENT_ALERT_LIMIT = 8;

export async function fetchAlerts(client: SupabaseClient, userId: string): Promise<AlertRecord[]> {
  const { data, error } = await client
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_ALERT_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as AlertRecord[];
}

export function alertsQueryOptions(getClient: () => SupabaseClient, userId: string) {
  return queryOptions({
    queryKey: queryKeys.alerts(userId),
    queryFn: () => fetchAlerts(getClient(), userId),
    // `is_triggered` changes outside this app, so reopening the modal checks sooner.
    staleTime: 30_000,
  });
}

export function prependAlert(alerts: readonly AlertRecord[], alert: AlertRecord): AlertRecord[] {
  return [alert, ...alerts].slice(0, RECENT_ALERT_LIMIT);
}

export function removeAlertFromList(alerts: readonly AlertRecord[], id: string): AlertRecord[] {
  return alerts.filter((alert) => alert.id !== id);
}

export function restoreAlert(alerts: readonly AlertRecord[], alert: AlertRecord, index: number): AlertRecord[] {
  if (alerts.some((item) => item.id === alert.id)) return [...alerts];
  return [...alerts.slice(0, index), alert, ...alerts.slice(index)];
}

type DeleteContext = { alert: AlertRecord; index: number } | null;

export function deleteAlertMutationOptions({ queryClient, getClient, userId }: {
  queryClient: QueryClient;
  getClient: () => SupabaseClient;
  userId: string;
}): MutationOptions<void, Error, string, DeleteContext> {
  const queryKey = queryKeys.alerts(userId);
  return {
    mutationKey: queryKey,
    mutationFn: async (id) => {
      const { error } = await getClient().from("alerts").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const current = queryClient.getQueryData<AlertRecord[]>(queryKey) ?? [];
      const index = current.findIndex((alert) => alert.id === id);
      if (index === -1) return null;
      queryClient.setQueryData<AlertRecord[]>(queryKey, removeAlertFromList(current, id));
      return { alert: current[index], index };
    },
    onError: (_error, _id, context) => {
      if (context) {
        queryClient.setQueryData<AlertRecord[]>(queryKey, (current = []) =>
          restoreAlert(current, context.alert, context.index));
      }
    },
    // Refills the list from older alerts past the limit once deletes have finished.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: queryKey }) === 1) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}
