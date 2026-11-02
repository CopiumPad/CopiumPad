"use client";

import { useSyncExternalStore } from "react";
import { authStore, PENDING_AUTH_STATE, type AuthState } from "@/lib/supabase/auth-store";

export function useAuthUser(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, () => PENDING_AUTH_STATE);
}
