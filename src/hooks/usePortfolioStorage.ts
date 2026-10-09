"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Holding } from "@/lib/finance/portfolio";
import type { AuthChangeEvent, AuthError, Session, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const PORTFOLIO_STORAGE_KEY = "copiumpad_positions";
const LEGACY_MIGRATION_KEY = `${PORTFOLIO_STORAGE_KEY}_cloud_migrated`;

function normalizePosition(position: Holding): Holding {
  return { ...position, symbol: position.symbol.trim().toUpperCase() };
}

function isHolding(value: unknown): value is Holding {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.symbol === "string" && typeof candidate.name === "string" &&
    typeof candidate.quantity === "string" && typeof candidate.averageCost === "string";
}

function readLegacyPositions(): Holding[] {
  try {
    const stored = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isHolding).map(normalizePosition) : [];
  } catch {
    return [];
  }
}

export function usePortfolioStorage() {
  const [positions, setPositions] = useState<Holding[]>([]);
  const [isHydrated, setIsHydrated] = useState(() => !isSupabaseConfigured());
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }
    const supabase = createSupabaseBrowserClient();
    let active = true;
    void supabase.auth.getUser().then(({
      data,
      error: authError,
    }: { data: { user: User | null }; error: AuthError | null }) => {
      if (!active) return;
      if (authError) setError(authError.message);
      else setError(null);
      currentUserId.current = data.user?.id ?? null;
      setPositions([]);
      setIsHydrated(data.user === null);
      setUserId(data.user?.id ?? null);
      setIsAuthReady(true);
    }).catch((authError: unknown) => {
      if (!active) return;
      setError(authError instanceof Error ? authError.message : "Could not load account.");
      setPositions([]);
      setIsHydrated(true);
      setIsAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null,
    ) => {
      const nextUserId = session?.user.id ?? null;
      if (currentUserId.current !== nextUserId) {
        currentUserId.current = nextUserId;
        setError(null);
        setPositions([]);
        setIsHydrated(nextUserId === null);
      }
      setUserId(nextUserId);
      setIsAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!isAuthReady) return;
    if (!userId || !isSupabaseConfigured()) return;

    const supabase = createSupabaseBrowserClient();
    async function loadPositions() {
      const { data, error: queryError } = await supabase
        .from("positions")
        .select("symbol, name, quantity, cost_basis")
        .eq("user_id", userId)
        .order("created_at");
      if (queryError) throw queryError;

      let rows = data ?? [];
      if (rows.length === 0 && window.localStorage.getItem(LEGACY_MIGRATION_KEY) !== "true") {
        const legacyPositions = readLegacyPositions();
        if (legacyPositions.length > 0) {
          const { error: migrationError } = await supabase.from("positions").upsert(
            legacyPositions.map((position) => ({
              user_id: userId,
              symbol: position.symbol,
              name: position.name,
              quantity: position.quantity,
              cost_basis: position.averageCost,
            })),
            { onConflict: "user_id,symbol" },
          );
          if (migrationError) throw migrationError;
          const { data: migratedRows, error: reloadError } = await supabase
            .from("positions")
            .select("symbol, name, quantity, cost_basis")
            .eq("user_id", userId)
            .order("created_at");
          if (reloadError) throw reloadError;
          rows = migratedRows ?? [];
        }
        window.localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
        window.localStorage.setItem(LEGACY_MIGRATION_KEY, "true");
      }

      if (active) {
        setPositions(rows.map((row: { symbol: string; name: string; quantity: number | string; cost_basis: number | string }) => ({
          symbol: row.symbol,
          name: row.name,
          quantity: String(row.quantity),
          averageCost: String(row.cost_basis),
        })));
      }
    }

    void loadPositions().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load positions.");
    }).finally(() => {
      if (active) setIsHydrated(true);
    });
    return () => { active = false; };
  }, [isAuthReady, userId]);

  const savePosition = useCallback(async (position: Holding) => {
    if (!userId || !isSupabaseConfigured()) {
      setError("Sign in to save positions to your account.");
      return;
    }
    const normalized = normalizePosition(position);
    const { error: saveError } = await createSupabaseBrowserClient().from("positions").upsert({
      user_id: userId,
      symbol: normalized.symbol,
      name: normalized.name,
      quantity: normalized.quantity,
      cost_basis: normalized.averageCost,
    }, { onConflict: "user_id,symbol" });
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setError(null);
    setPositions((current) => current.some((item) => item.symbol === normalized.symbol)
      ? current.map((item) => item.symbol === normalized.symbol ? normalized : item)
      : [...current, normalized]);
  }, [userId]);

  const removePosition = useCallback(async (symbol: string) => {
    if (!userId || !isSupabaseConfigured()) return;
    const normalizedSymbol = symbol.trim().toUpperCase();
    const { error: deleteError } = await createSupabaseBrowserClient().from("positions")
      .delete().eq("user_id", userId).eq("symbol", normalizedSymbol);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setError(null);
    setPositions((current) => current.filter((position) => position.symbol !== normalizedSymbol));
  }, [userId]);

  const updatePosition = savePosition;
  const addPosition = savePosition;

  return { positions, isHydrated, isAuthenticated: userId !== null, error, addPosition, removePosition, updatePosition };
}