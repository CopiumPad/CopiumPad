import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Holding } from "@/lib/finance/portfolio";
import { clearOtherUsers, queryKeys } from "@/lib/queries/keys";
import {
  fetchPositions,
  isSavableHolding,
  PORTFOLIO_STORAGE_KEY,
  removeHolding,
  removePositionMutationOptions,
  restoreHolding,
  savePositionMutationOptions,
  upsertHolding,
} from "@/lib/queries/positions";
import { deferred, fakeSupabase, memoryStorage } from "@/lib/queries/test-utils";

const USER_ID = "user-1";
const KEY = queryKeys.positions(USER_ID);
const voo: Holding = { symbol: "VOO", name: "Vanguard", quantity: "1", averageCost: "400" };
const qqq: Holding = { symbol: "QQQ", name: "Invesco", quantity: "2", averageCost: "300" };
const btc: Holding = { symbol: "BTC-USD", name: "Bitcoin", quantity: "3", averageCost: "500" };

function setup(respond: Parameters<typeof fakeSupabase>[0], canRefetch?: () => boolean) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { networkMode: "always" } } });
  const supabase = fakeSupabase(respond);
  queryClient.setQueryData(KEY, [voo, qqq]);
  const deps = { queryClient, getClient: () => supabase.client, userId: USER_ID, canRefetch };
  return {
    queryClient,
    calls: supabase.calls,
    save: new MutationObserver(queryClient, savePositionMutationOptions(deps)),
    newSave: () => new MutationObserver(queryClient, savePositionMutationOptions(deps)),
    remove: new MutationObserver(queryClient, removePositionMutationOptions(deps)),
    holdings: () => queryClient.getQueryData<Holding[]>(KEY),
  };
}

describe("holding list helpers", () => {
  it("replaces a held symbol in place and appends a new one", () => {
    const edited = { ...voo, quantity: "9" };
    expect(upsertHolding([voo, qqq], edited)).toEqual([edited, qqq]);
    expect(upsertHolding([voo], qqq)).toEqual([voo, qqq]);
  });

  it("removes by symbol", () => {
    expect(removeHolding([voo, qqq], "VOO")).toEqual([qqq]);
  });

  it("restores at the original index without duplicating", () => {
    expect(restoreHolding([qqq, btc], voo, 1)).toEqual([qqq, voo, btc]);
    expect(restoreHolding([voo, qqq], voo, 1)).toEqual([voo, qqq]);
  });

  it("only allows finite, non-negative values to be saved", () => {
    expect(isSavableHolding(voo)).toBe(true);
    expect(isSavableHolding({ ...voo, quantity: "" })).toBe(false);
    expect(isSavableHolding({ ...voo, averageCost: "abc" })).toBe(false);
    expect(isSavableHolding({ ...voo, quantity: "-1" })).toBe(false);
  });
});

describe("fetchPositions", () => {
  it("stringifies numeric columns", async () => {
    const { client } = fakeSupabase(() => ({
      data: [{ symbol: "VOO", name: "Vanguard", quantity: 1.5, cost_basis: 400 }],
    }));

    const holdings = await fetchPositions(client, USER_ID, memoryStorage({ [`${PORTFOLIO_STORAGE_KEY}_cloud_migrated`]: "true" }));

    expect(holdings).toEqual([{ symbol: "VOO", name: "Vanguard", quantity: "1.5", averageCost: "400" }]);
  });

  it("throws query errors so the error boundary can show them", async () => {
    const { client } = fakeSupabase(() => ({ error: { message: "denied" } }));
    await expect(fetchPositions(client, USER_ID, memoryStorage())).rejects.toThrow("denied");
  });

  it("imports legacy localStorage positions once, then reloads", async () => {
    let selects = 0;
    const { client, calls } = fakeSupabase((call) => {
      if (call.method === "upsert") return {};
      selects += 1;
      return { data: selects === 1 ? [] : [{ symbol: "AAPL", name: "Apple", quantity: "1", cost_basis: "100" }] };
    });
    const storage = memoryStorage({
      [PORTFOLIO_STORAGE_KEY]: JSON.stringify([{ symbol: " aapl ", name: "Apple", quantity: "1", averageCost: "100" }]),
    });

    const holdings = await fetchPositions(client, USER_ID, storage);

    expect(holdings.map((holding) => holding.symbol)).toEqual(["AAPL"]);
    expect(calls.map((call) => call.method)).toEqual(["select", "upsert", "select"]);
    expect(calls[1].args[0]).toEqual([{ user_id: USER_ID, symbol: "AAPL", name: "Apple", quantity: "1", cost_basis: "100" }]);
    expect(storage.getItem(PORTFOLIO_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(`${PORTFOLIO_STORAGE_KEY}_cloud_migrated`)).toBe("true");
  });

  it("does not import again after migrating", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: [] }));
    const storage = memoryStorage({
      [PORTFOLIO_STORAGE_KEY]: JSON.stringify([voo]),
      [`${PORTFOLIO_STORAGE_KEY}_cloud_migrated`]: "true",
    });

    await fetchPositions(client, USER_ID, storage);

    expect(calls.map((call) => call.method)).toEqual(["select"]);
  });

  it("does not mark the migration done when the import fails", async () => {
    const { client } = fakeSupabase((call) =>
      call.method === "upsert" ? { error: { message: "write failed" } } : { data: [] });
    const storage = memoryStorage({ [PORTFOLIO_STORAGE_KEY]: JSON.stringify([voo]) });

    await expect(fetchPositions(client, USER_ID, storage)).rejects.toThrow("write failed");

    expect(storage.getItem(PORTFOLIO_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(`${PORTFOLIO_STORAGE_KEY}_cloud_migrated`)).toBeNull();
  });
});

describe("savePositionMutationOptions", () => {
  it("shows a new holding before the write finishes", async () => {
    const gate = deferred<{ error: null }>();
    const { save, holdings } = setup(() => gate.promise);

    const pending = save.mutate(btc);
    await vi.waitFor(() => expect(holdings()).toEqual([voo, qqq, btc]));

    gate.resolve({ error: null });
    await pending;
    expect(holdings()).toEqual([voo, qqq, btc]);
  });

  it("normalizes the symbol in both the cache and the write", async () => {
    const { save, holdings, calls } = setup(() => ({}));

    await save.mutate({ ...btc, symbol: " btc-usd " });

    expect(holdings()?.at(-1)?.symbol).toBe("BTC-USD");
    expect(calls[0].args[0]).toMatchObject({ user_id: USER_ID, symbol: "BTC-USD", cost_basis: "500" });
  });

  it("does not refetch after success, so typed text like 1.50 is kept", async () => {
    const { save, queryClient } = setup(() => ({}));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await save.mutate({ ...voo, averageCost: "1.50" });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("removes a new holding when the write fails", async () => {
    const { save, holdings } = setup(() => ({ error: { message: "denied" } }));

    await expect(save.mutate(btc)).rejects.toThrow("denied");

    expect(holdings()).toEqual([voo, qqq]);
  });

  it("restores only the failed holding", async () => {
    const gate = deferred<{ error: { message: string } }>();
    const { save, queryClient, holdings } = setup(() => gate.promise);

    const pending = save.mutate({ ...voo, quantity: "9" });
    await vi.waitFor(() => expect(holdings()?.[0].quantity).toBe("9"));
    queryClient.setQueryData<Holding[]>(KEY, (current = []) => upsertHolding(current, { ...qqq, quantity: "7" }));

    gate.resolve({ error: { message: "denied" } });
    await expect(pending).rejects.toThrow("denied");

    expect(holdings()).toEqual([voo, { ...qqq, quantity: "7" }]);
  });

  it("refetches after a failure unless unsaved edits exist", async () => {
    const failing = setup(() => ({ error: { message: "denied" } }));
    const invalidate = vi.spyOn(failing.queryClient, "invalidateQueries");
    await expect(failing.save.mutate(btc)).rejects.toThrow("denied");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });

    const editing = setup(() => ({ error: { message: "denied" } }), () => false);
    const skipped = vi.spyOn(editing.queryClient, "invalidateQueries");
    await expect(editing.save.mutate(btc)).rejects.toThrow("denied");
    expect(skipped).not.toHaveBeenCalled();
  });

  it("sends writes one at a time, in order", async () => {
    const gates = [deferred<{ error: null }>(), deferred<{ error: null }>()];
    const sent: unknown[] = [];
    const { newSave, holdings } = setup((call) => {
      sent.push((call.args[0] as { quantity: string }).quantity);
      return gates[sent.length - 1].promise;
    });
    const [first, second] = [newSave(), newSave()];

    const firstWrite = first.mutate({ ...voo, quantity: "5" });
    const secondWrite = second.mutate({ ...voo, quantity: "6" });
    await vi.waitFor(() => expect(sent).toEqual(["5"]));

    gates[0].resolve({ error: null });
    await vi.waitFor(() => expect(sent).toEqual(["5", "6"]));
    gates[1].resolve({ error: null });
    await Promise.all([firstWrite, secondWrite]);

    expect(holdings()?.[0].quantity).toBe("6");
  });
});

describe("removePositionMutationOptions", () => {
  it("removes the holding before the write finishes", async () => {
    const gate = deferred<{ error: null }>();
    const { remove, holdings } = setup(() => gate.promise);

    const pending = remove.mutate(" voo ");
    await vi.waitFor(() => expect(holdings()).toEqual([qqq]));

    gate.resolve({ error: null });
    await pending;
    expect(holdings()).toEqual([qqq]);
  });

  it("puts the holding back in its original position on failure", async () => {
    const { remove, holdings } = setup(() => ({ error: { message: "denied" } }));

    await expect(remove.mutate("VOO")).rejects.toThrow("denied");

    expect(holdings()).toEqual([voo, qqq]);
  });
});

describe("clearOtherUsers", () => {
  it("drops another user's data and keeps the current user's", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.positions("user-1"), [voo]);
    queryClient.setQueryData(queryKeys.alerts("user-1"), []);
    queryClient.setQueryData(queryKeys.positions("user-2"), [qqq]);

    clearOtherUsers(queryClient, "user-2");

    expect(queryClient.getQueryData(queryKeys.positions("user-1"))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.alerts("user-1"))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.positions("user-2"))).toEqual([qqq]);
  });

  it("drops every user's data on sign-out", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.positions("user-1"), [voo]);

    clearOtherUsers(queryClient, null);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
