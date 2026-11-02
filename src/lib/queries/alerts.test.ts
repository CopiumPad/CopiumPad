import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  deleteAlertMutationOptions,
  prependAlert,
  RECENT_ALERT_LIMIT,
  removeAlertFromList,
  type AlertRecord,
} from "@/lib/queries/alerts";
import { queryKeys } from "@/lib/queries/keys";
import { deferred, fakeSupabase } from "@/lib/queries/test-utils";

const USER_ID = "user-1";
const KEY = queryKeys.alerts(USER_ID);

function alertWith(id: string): AlertRecord {
  return {
    id,
    type: "price",
    target_symbol: "VOO",
    target_price: "500",
    target_time: null,
    custom_message: "Check it",
    is_triggered: false,
    created_at: "2026-11-02T00:00:00Z",
  };
}

const [first, second, third] = ["a", "b", "c"].map(alertWith);

function setup(respond: Parameters<typeof fakeSupabase>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { networkMode: "always" } } });
  const supabase = fakeSupabase(respond);
  queryClient.setQueryData(KEY, [first, second, third]);
  const options = deleteAlertMutationOptions({ queryClient, getClient: () => supabase.client, userId: USER_ID });
  return {
    queryClient,
    options,
    remove: new MutationObserver(queryClient, options),
    alerts: () => queryClient.getQueryData<AlertRecord[]>(KEY),
  };
}

describe("alert list helpers", () => {
  it("prepends a new alert and keeps the list at the limit", () => {
    const full = Array.from({ length: RECENT_ALERT_LIMIT }, (_, index) => alertWith(`old-${index}`));
    const next = prependAlert(full, first);
    expect(next).toHaveLength(RECENT_ALERT_LIMIT);
    expect(next[0]).toBe(first);
  });

  it("removes by id", () => {
    expect(removeAlertFromList([first, second], "a")).toEqual([second]);
  });
});

describe("deleteAlertMutationOptions", () => {
  it("removes the alert before the write finishes", async () => {
    const gate = deferred<{ error: null }>();
    const { remove, alerts } = setup(() => gate.promise);

    const pending = remove.mutate("b");
    await vi.waitFor(() => expect(alerts()).toEqual([first, third]));

    gate.resolve({ error: null });
    await pending;
  });

  it("puts the alert back in its original position on failure", async () => {
    const { remove, alerts } = setup(() => ({ error: { message: "denied" } }));

    await expect(remove.mutate("b")).rejects.toThrow("denied");

    expect(alerts()).toEqual([first, second, third]);
  });

  it("keeps a concurrent delete when another one fails", async () => {
    const gate = deferred<{ error: { message: string } | null }>();
    let requests = 0;
    const { queryClient, options, alerts } = setup(() => {
      requests += 1;
      return requests === 1 ? gate.promise : { error: null };
    });

    const failing = new MutationObserver(queryClient, options).mutate("a");
    await vi.waitFor(() => expect(requests).toBe(1));
    await new MutationObserver(queryClient, options).mutate("b");
    gate.resolve({ error: { message: "denied" } });

    await expect(failing).rejects.toThrow("denied");

    expect(alerts()).toEqual([first, third]);
  });

  it("refetches to refill the list once deletes finish", async () => {
    const { remove, queryClient } = setup(() => ({}));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await remove.mutate("b");

    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });
});
