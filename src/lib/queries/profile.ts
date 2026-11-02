import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queryKeys } from "@/lib/queries/keys";

export type Profile = { username: string; avatar_url: string | null };

export async function fetchProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Profile | null;
}

export function profileQueryOptions(getClient: () => SupabaseClient, userId: string) {
  return queryOptions({
    queryKey: queryKeys.profile(userId),
    queryFn: () => fetchProfile(getClient(), userId),
  });
}
