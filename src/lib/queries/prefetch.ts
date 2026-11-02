import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alertsQueryOptions } from "@/lib/queries/alerts";
import { positionsQueryOptions } from "@/lib/queries/positions";
import { profileQueryOptions } from "@/lib/queries/profile";

/** Starts every per-user read together. Failures surface where each query is rendered. */
export async function prefetchDashboard(
  queryClient: QueryClient,
  getClient: () => SupabaseClient,
  userId: string,
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery(positionsQueryOptions(getClient, userId)),
    queryClient.prefetchQuery(profileQueryOptions(getClient, userId)),
    queryClient.prefetchQuery(alertsQueryOptions(getClient, userId)),
  ]);
}
