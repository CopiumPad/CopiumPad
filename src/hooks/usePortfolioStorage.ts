"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { DEFAULT_POSITIONS } from "@/lib/constants/defaultData";
import type { Holding } from "@/lib/finance/portfolio";
import { queryKeys } from "@/lib/queries/keys";
import {
  isSavableHolding,
  normalizePosition,
  positionsQueryOptions,
  removePositionMutationOptions,
  savePositionMutationOptions,
  upsertHolding,
} from "@/lib/queries/positions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const EDIT_DEBOUNCE_MS = 400;

type PendingEdit = { holding: Holding; timer: number | null };
type PositionsKey = ReturnType<typeof queryKeys.positions>;

function guestPositions(): Holding[] {
  return [...DEFAULT_POSITIONS];
}

/** Render with a `key` per user: mutation options are bound to `userId` for the mount. */
export function usePortfolioStorage(userId: string | null) {
  const queryClient = useQueryClient();
  const [pendingEdits] = useState(() => new Map<string, PendingEdit>());
  const queryKey = useMemo(() => queryKeys.positions(userId), [userId]);

  const { data: positions, error: loadError } = useSuspenseQuery<Holding[], Error, Holding[], PositionsKey>(userId === null
    ? { queryKey, queryFn: guestPositions, initialData: guestPositions, staleTime: Infinity }
    : positionsQueryOptions(createSupabaseBrowserClient, userId));

  const mutationDeps = {
    queryClient,
    getClient: createSupabaseBrowserClient,
    userId: userId ?? "",
    canRefetch: () => pendingEdits.size === 0,
  };
  const { mutate: save, error: saveError } = useMutation(savePositionMutationOptions(mutationDeps));
  const { mutate: remove, error: removeError } = useMutation(removePositionMutationOptions(mutationDeps));

  const savePosition = useCallback((position: Holding) => {
    if (userId !== null) save(position);
  }, [save, userId]);

  const removePosition = useCallback((symbol: string) => {
    if (userId !== null) remove(symbol);
  }, [remove, userId]);

  /** Sends the pending edit for a symbol, or reverts it to the saved value if it is invalid. */
  const commitPosition = useCallback((symbol: string) => {
    const edit = pendingEdits.get(symbol);
    if (edit === undefined) return;
    if (edit.timer !== null) window.clearTimeout(edit.timer);
    pendingEdits.delete(symbol);
    if (isSavableHolding(edit.holding)) save(edit.holding);
    else void queryClient.invalidateQueries({ queryKey });
  }, [pendingEdits, queryClient, queryKey, save]);

  /** Shows an inline edit on every keystroke, and writes once typing pauses. */
  const draftPosition = useCallback((position: Holding) => {
    if (userId === null) return;
    const holding = normalizePosition(position);
    void queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<Holding[]>(queryKey, (current = []) => upsertHolding(current, holding));

    const existing = pendingEdits.get(holding.symbol);
    if (existing?.timer != null) window.clearTimeout(existing.timer);
    const edit: PendingEdit = {
      holding,
      timer: window.setTimeout(() => {
        edit.timer = null;
        if (isSavableHolding(holding)) commitPosition(holding.symbol);
      }, EDIT_DEBOUNCE_MS),
    };
    pendingEdits.set(holding.symbol, edit);
  }, [commitPosition, pendingEdits, queryClient, queryKey, userId]);

  useEffect(() => () => {
    [...pendingEdits.keys()].forEach((symbol) => commitPosition(symbol));
  }, [commitPosition, pendingEdits]);

  return {
    positions,
    isAuthenticated: userId !== null,
    error: saveError?.message ?? removeError?.message ?? loadError?.message ?? null,
    addPosition: savePosition,
    updatePosition: savePosition,
    removePosition,
    draftPosition,
    commitPosition,
  };
}
