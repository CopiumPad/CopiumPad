import {
  isAuthRetryableFetchError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
  type User,
} from "@supabase/supabase-js";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type AuthState = {
  user: User | null;
  isReady: boolean;
  error: string | null;
};

export type AuthClient = {
  auth: {
    getUser: () => Promise<{ data: { user: User | null }; error: AuthError | null }>;
    onAuthStateChange: (
      callback: (event: AuthChangeEvent, session: Session | null) => void,
    ) => unknown;
  };
};

// Also the prerender snapshot, so no user-scoped query ever starts on the server.
export const PENDING_AUTH_STATE: AuthState = { user: null, isReady: false, error: null };

const MISSING_SESSION_MESSAGE = "Auth session missing!";

function isSameUser(left: User | null, right: User | null): boolean {
  return left?.id === right?.id && left?.email === right?.email;
}

/**
 * The single owner of auth state. The local session makes the app ready without a
 * network call; `getUser()` then validates it in the background. RLS verifies the
 * JWT on every query, so the local session only decides what the UI shows.
 */
export function createAuthStore(getClient: () => AuthClient | null) {
  let state = PENDING_AUTH_STATE;
  let isStarted = false;
  // Counts user changes once ready, so a slow getUser() cannot undo a newer sign-in or sign-out.
  let authGeneration = 0;
  const listeners = new Set<() => void>();

  function setState(next: AuthState) {
    if (state.isReady === next.isReady && state.error === next.error && isSameUser(state.user, next.user)) {
      return;
    }
    state = next;
    listeners.forEach((listener) => listener());
  }

  function validateSession(client: AuthClient) {
    const generation = authGeneration;
    client.auth.getUser().then(({ data, error }) => {
      if (generation !== authGeneration) return;
      if (error && isAuthRetryableFetchError(error)) {
        // A network failure says nothing about the session, so keep the user signed in.
        setState({ ...state, isReady: true });
        return;
      }
      const message = error && error.message !== MISSING_SESSION_MESSAGE ? error.message : null;
      setState({ user: data.user, isReady: true, error: message });
    }).catch((authError: unknown) => {
      if (generation !== authGeneration) return;
      setState({
        ...state,
        isReady: true,
        error: authError instanceof Error ? authError.message : "Could not load account.",
      });
    });
  }

  function start() {
    if (isStarted) return;
    isStarted = true;

    const client = getClient();
    if (client === null) {
      setState({ user: null, isReady: true, error: null });
      return;
    }

    client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (state.isReady && state.user?.id !== user?.id) authGeneration += 1;
      setState({ user, isReady: true, error: null });
    });
    validateSession(client);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const authStore = createAuthStore(() =>
  isSupabaseConfigured() ? createSupabaseBrowserClient() : null,
);
