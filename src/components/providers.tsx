"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useAuthUser } from "@/hooks/useAuthUser";
import { clearOtherUsers } from "@/lib/queries/keys";
import { prefetchDashboard } from "@/lib/queries/prefetch";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
        networkMode: "always",
      },
      mutations: { networkMode: "always" },
    },
  });
}

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

function AuthQuerySync() {
  const queryClient = useQueryClient();
  const { user, isReady } = useAuthUser();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isReady) return;
    clearOtherUsers(queryClient, userId);
    if (userId !== null) void prefetchDashboard(queryClient, createSupabaseBrowserClient, userId);
  }, [isReady, queryClient, userId]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <AuthQuerySync />
      {children}
    </QueryClientProvider>
  );
}
