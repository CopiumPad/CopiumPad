import type { SupabaseClient } from "@supabase/supabase-js";

export type FakeCall = { table: string; method: string; args: unknown[] };
type FakeResult = { data?: unknown; error?: { message: string } | null };
type FakeResponder = (call: FakeCall) => FakeResult | Promise<FakeResult>;

/**
 * A stand-in for the Supabase query builder. The call that decides the result is the
 * first verb on the table (select, upsert or delete); `respond` answers when awaited.
 */
export function fakeSupabase(respond: FakeResponder) {
  const calls: FakeCall[] = [];
  const client = {
    from(table: string) {
      let verb: FakeCall | null = null;
      const builder = {
        select: (...args: unknown[]) => record("select", args),
        upsert: (...args: unknown[]) => record("upsert", args),
        delete: (...args: unknown[]) => record("delete", args),
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => builder,
        then<T>(onFulfilled: (result: { data: unknown; error: { message: string } | null }) => T) {
          return Promise.resolve(respond(verb as FakeCall))
            .then((result) => onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
        },
      };
      function record(method: string, args: unknown[]) {
        verb = { table, method, args };
        calls.push(verb);
        return builder;
      }
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

export function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

export function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
