import type { QueryClient } from "@tanstack/react-query";

// Every key carries the owner at index 1, which is what clearOtherUsers relies on.
export const queryKeys = {
  positions: (userId: string | null) => ["positions", userId] as const,
  alerts: (userId: string) => ["alerts", userId] as const,
  profile: (userId: string) => ["profile", userId] as const,
};

export function clearOtherUsers(queryClient: QueryClient, userId: string | null) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[1] !== userId });
}
