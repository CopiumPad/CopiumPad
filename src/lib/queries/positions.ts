import { queryOptions, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Holding } from "@/lib/finance/portfolio";
import { queryKeys } from "@/lib/queries/keys";

export const PORTFOLIO_STORAGE_KEY = "copiumpad_positions";
const LEGACY_MIGRATION_KEY = `${PORTFOLIO_STORAGE_KEY}_cloud_migrated`;
const POSITION_COLUMNS = "symbol, name, quantity, cost_basis";

type LegacyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PositionRow = {
  symbol: string;
  name: string;
  quantity: number | string;
  cost_basis: number | string;
};

export function normalizePosition(position: Holding): Holding {
  return { ...position, symbol: position.symbol.trim().toUpperCase() };
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function isValidHoldingValue(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function isSavableHolding(holding: Holding): boolean {
  return isValidHoldingValue(holding.quantity) && isValidHoldingValue(holding.averageCost);
}

/** Replaces the holding with the same symbol, or appends it, matching `created_at` order. */
export function upsertHolding(holdings: readonly Holding[], holding: Holding): Holding[] {
  return holdings.some((item) => item.symbol === holding.symbol)
    ? holdings.map((item) => item.symbol === holding.symbol ? holding : item)
    : [...holdings, holding];
}

export function removeHolding(holdings: readonly Holding[], symbol: string): Holding[] {
  return holdings.filter((holding) => holding.symbol !== symbol);
}

export function restoreHolding(holdings: readonly Holding[], holding: Holding, index: number): Holding[] {
  if (holdings.some((item) => item.symbol === holding.symbol)) return [...holdings];
  return [...holdings.slice(0, index), holding, ...holdings.slice(index)];
}

function isHolding(value: unknown): value is Holding {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.symbol === "string" && typeof candidate.name === "string" &&
    typeof candidate.quantity === "string" && typeof candidate.averageCost === "string";
}

function readLegacyPositions(storage: LegacyStorage): Holding[] {
  try {
    const stored = storage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isHolding).map(normalizePosition) : [];
  } catch {
    return [];
  }
}

function toHolding(row: PositionRow): Holding {
  return {
    symbol: row.symbol,
    name: row.name,
    quantity: String(row.quantity),
    averageCost: String(row.cost_basis),
  };
}

async function selectPositions(client: SupabaseClient, userId: string): Promise<PositionRow[]> {
  const { data, error } = await client
    .from("positions")
    .select(POSITION_COLUMNS)
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as PositionRow[];
}

export async function fetchPositions(
  client: SupabaseClient,
  userId: string,
  storage: LegacyStorage,
): Promise<Holding[]> {
  let rows = await selectPositions(client, userId);

  if (rows.length === 0 && storage.getItem(LEGACY_MIGRATION_KEY) !== "true") {
    const legacyPositions = readLegacyPositions(storage);
    if (legacyPositions.length > 0) {
      const { error } = await client.from("positions").upsert(
        legacyPositions.map((position) => ({
          user_id: userId,
          symbol: position.symbol,
          name: position.name,
          quantity: position.quantity,
          cost_basis: position.averageCost,
        })),
        { onConflict: "user_id,symbol" },
      );
      if (error) throw new Error(error.message);
      rows = await selectPositions(client, userId);
    }
    storage.removeItem(PORTFOLIO_STORAGE_KEY);
    storage.setItem(LEGACY_MIGRATION_KEY, "true");
  }

  return rows.map(toHolding);
}

export function positionsQueryOptions(getClient: () => SupabaseClient, userId: string) {
  return queryOptions({
    queryKey: queryKeys.positions(userId),
    queryFn: () => fetchPositions(getClient(), userId, window.localStorage),
  });
}

type PositionMutationDeps = {
  queryClient: QueryClient;
  getClient: () => SupabaseClient;
  userId: string;
  /** False while unsaved edits exist, which a refetch would overwrite. */
  canRefetch?: () => boolean;
};

function positionsMutationDefaults(userId: string) {
  return {
    mutationKey: queryKeys.positions(userId),
    // Writes for one account run in order, so a slow request cannot overwrite a newer one.
    scope: { id: `positions:${userId}` },
  };
}

function refetchAfterFailure({ queryClient, userId, canRefetch }: PositionMutationDeps) {
  const queryKey = queryKeys.positions(userId);
  const isLastMutation = queryClient.isMutating({ mutationKey: queryKey }) === 1;
  if (isLastMutation && (canRefetch?.() ?? true)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

type SaveContext = { symbol: string; previous: Holding | undefined };

export function savePositionMutationOptions(
  deps: PositionMutationDeps,
): MutationOptions<void, Error, Holding, SaveContext> {
  const { queryClient, getClient, userId } = deps;
  const queryKey = queryKeys.positions(userId);
  return {
    ...positionsMutationDefaults(userId),
    mutationFn: async (position) => {
      const normalized = normalizePosition(position);
      const { error } = await getClient().from("positions").upsert({
        user_id: userId,
        symbol: normalized.symbol,
        name: normalized.name,
        quantity: normalized.quantity,
        cost_basis: normalized.averageCost,
      }, { onConflict: "user_id,symbol" });
      if (error) throw new Error(error.message);
    },
    onMutate: async (position) => {
      const normalized = normalizePosition(position);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Holding[]>(queryKey)
        ?.find((holding) => holding.symbol === normalized.symbol);
      queryClient.setQueryData<Holding[]>(queryKey, (current = []) => upsertHolding(current, normalized));
      return { symbol: normalized.symbol, previous };
    },
    // The saved value is already in the cache. Refetching after success would rewrite
    // what the user is typing, because `numeric` turns "1.50" into 1.5.
    onError: (_error, _position, context) => {
      if (context) {
        queryClient.setQueryData<Holding[]>(queryKey, (current = []) => context.previous
          ? upsertHolding(current, context.previous)
          : removeHolding(current, context.symbol));
      }
      refetchAfterFailure(deps);
    },
  };
}

type RemoveContext = { holding: Holding; index: number } | null;

export function removePositionMutationOptions(
  deps: PositionMutationDeps,
): MutationOptions<void, Error, string, RemoveContext> {
  const { queryClient, getClient, userId } = deps;
  const queryKey = queryKeys.positions(userId);
  return {
    ...positionsMutationDefaults(userId),
    mutationFn: async (symbol) => {
      const { error } = await getClient().from("positions")
        .delete().eq("user_id", userId).eq("symbol", normalizeSymbol(symbol));
      if (error) throw new Error(error.message);
    },
    onMutate: async (symbol) => {
      const normalizedSymbol = normalizeSymbol(symbol);
      await queryClient.cancelQueries({ queryKey });
      const current = queryClient.getQueryData<Holding[]>(queryKey) ?? [];
      const index = current.findIndex((holding) => holding.symbol === normalizedSymbol);
      if (index === -1) return null;
      queryClient.setQueryData<Holding[]>(queryKey, removeHolding(current, normalizedSymbol));
      return { holding: current[index], index };
    },
    onError: (_error, _symbol, context) => {
      if (context) {
        queryClient.setQueryData<Holding[]>(queryKey, (current = []) =>
          restoreHolding(current, context.holding, context.index));
      }
      refetchAfterFailure(deps);
    },
  };
}
