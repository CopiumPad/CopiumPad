import type { AuthChangeEvent, AuthError, Session, User } from "@supabase/supabase-js";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createAuthStore, type AuthClient } from "@/lib/supabase/auth-store";

type GetUserResult = { data: { user: User | null }; error: AuthError | null };

function userWith(id: string): User {
  return { id, email: `${id}@example.com` } as User;
}

function sessionFor(user: User): Session {
  return { user } as Session;
}

function fakeClient() {
  let resolveGetUser: (result: GetUserResult) => void = () => undefined;
  let rejectGetUser: (reason: unknown) => void = () => undefined;
  let emit: (session: Session | null) => void = () => undefined;
  const client: AuthClient = {
    auth: {
      getUser: () => new Promise((resolve, reject) => {
        resolveGetUser = resolve;
        rejectGetUser = reject;
      }),
      onAuthStateChange: (callback) => {
        emit = (session) => callback("INITIAL_SESSION" as AuthChangeEvent, session);
        return {};
      },
    },
  };
  return {
    client,
    emit: (session: Session | null) => emit(session),
    resolveGetUser: async (result: GetUserResult) => {
      resolveGetUser(result);
      await Promise.resolve();
      await Promise.resolve();
    },
    rejectGetUser: async (reason: unknown) => {
      rejectGetUser(reason);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("createAuthStore", () => {
  it("is not ready before anything subscribes", () => {
    const store = createAuthStore(() => null);
    expect(store.getSnapshot().isReady).toBe(false);
  });

  it("becomes a ready guest when Supabase is not configured", () => {
    const store = createAuthStore(() => null);
    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual({ user: null, isReady: true, error: null });
  });

  it("is ready from the local session before getUser resolves", () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    store.subscribe(() => undefined);

    const user = userWith("user-1");
    fake.emit(sessionFor(user));

    expect(store.getSnapshot()).toEqual({ user, isReady: true, error: null });
  });

  it("does not notify when a late getUser confirms the same user", async () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    const listener = vi.fn();
    store.subscribe(listener);

    const user = userWith("user-1");
    fake.emit(sessionFor(user));
    const snapshot = store.getSnapshot();
    listener.mockClear();

    await fake.resolveGetUser({ data: { user: userWith("user-1") }, error: null });

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(snapshot);
  });

  it("does not notify when a token refresh delivers a new object for the same user", () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    const listener = vi.fn();
    store.subscribe(listener);

    fake.emit(sessionFor(userWith("user-1")));
    listener.mockClear();
    fake.emit(sessionFor(userWith("user-1")));

    expect(listener).not.toHaveBeenCalled();
  });

  it("emits a guest state on sign-out", () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    store.subscribe(() => undefined);

    fake.emit(sessionFor(userWith("user-1")));
    fake.emit(null);

    expect(store.getSnapshot()).toEqual({ user: null, isReady: true, error: null });
  });

  it("ignores a getUser result that started before a sign-out", async () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    store.subscribe(() => undefined);

    fake.emit(sessionFor(userWith("user-1")));
    fake.emit(null);
    await fake.resolveGetUser({ data: { user: userWith("user-1") }, error: null });

    expect(store.getSnapshot().user).toBeNull();
  });

  it("signs out a session the server rejects", async () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    store.subscribe(() => undefined);

    fake.emit(sessionFor(userWith("user-1")));
    await fake.resolveGetUser({ data: { user: null }, error: { message: "User not found" } as AuthError });

    expect(store.getSnapshot()).toEqual({ user: null, isReady: true, error: "User not found" });
  });

  it("treats a missing session as a guest without an error", async () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    store.subscribe(() => undefined);

    await fake.resolveGetUser({ data: { user: null }, error: { message: "Auth session missing!" } as AuthError });

    expect(store.getSnapshot()).toEqual({ user: null, isReady: true, error: null });
  });

  it("keeps the user signed in when validation fails on the network", async () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    store.subscribe(() => undefined);

    const user = userWith("user-1");
    fake.emit(sessionFor(user));
    await fake.resolveGetUser({
      data: { user: null },
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });

    expect(store.getSnapshot().user).toBe(user);
  });

  it("surfaces a thrown getUser error and still becomes ready", async () => {
    const fake = fakeClient();
    const store = createAuthStore(() => fake.client);
    store.subscribe(() => undefined);

    await fake.rejectGetUser(new Error("boom"));

    expect(store.getSnapshot()).toEqual({ user: null, isReady: true, error: "boom" });
  });
});
