"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { AuthChangeEvent, AuthError, Session, User } from "@supabase/supabase-js";
import { EditProfileModal } from "@/components/EditProfileModal";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Profile = { username: string; avatar_url: string | null };

export function AccountMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isReady, setIsReady] = useState(() => !isSupabaseConfigured());
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createSupabaseBrowserClient();
    let active = true;
    void supabase.auth.getUser().then(({ data }: { data: { user: User | null }; error: AuthError | null }) => {
      if (active) {
        setUser(data.user);
        setIsReady(true);
      }
    }).catch(() => {
      if (active) setIsReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null,
    ) => {
      setUser(session?.user ?? null);
      if (!session?.user) setProfile(null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void createSupabaseBrowserClient().from("profiles").select("username, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }: { data: Profile | null }) => {
        if (active && data) setProfile(data);
      });
    return () => { active = false; };
  }, [user]);

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSending(true);
    try {
      const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (signInError) throw signInError;
      setNotice("Check your email for a secure sign-in link.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send the sign-in link.");
    } finally {
      setIsSending(false);
    }
  }

  async function signOut() {
    const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  if (!isSupabaseConfigured()) {
    return <span className="text-xs text-amber-300">Supabase not configured</span>;
  }

  return (
    <>
      {!isReady ? <span className="text-xs text-zinc-500">Loading account…</span> : user ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setIsProfileOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800">
            {profile?.avatar_url ? <Image src={profile.avatar_url} alt="" width={20} height={20} unoptimized className="size-5 rounded-full object-cover" /> : null}
            {profile?.username || user.email || "Complete profile"}
          </button>
          <button type="button" onClick={() => void signOut()} className="text-xs text-zinc-400 hover:text-zinc-100">Sign out</button>
          {isProfileOpen ? <EditProfileModal userId={user.id} initialUsername={profile?.username ?? ""} initialAvatarUrl={profile?.avatar_url ?? null} onClose={() => setIsProfileOpen(false)} onSaved={(username, avatarUrl) => setProfile({ username, avatar_url: avatarUrl })} /> : null}
        </div>
      ) : (
        <button type="button" onClick={() => { setError(null); setNotice(null); setIsLoginOpen(true); }} className="rounded-md border border-emerald-400/60 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-400/10">Sign in / Sign up</button>
      )}
      {isLoginOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section aria-labelledby="account-login-title" aria-modal="true" className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" role="dialog">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="account-login-title" className="text-lg font-semibold text-zinc-100">Sign in or create account</h2><p className="mt-1 text-sm text-zinc-400">We&apos;ll email you a secure one-time link.</p></div>
              <button type="button" onClick={() => setIsLoginOpen(false)} aria-label="Close sign-in dialog" className="text-xl leading-none text-zinc-500 hover:text-zinc-200">×</button>
            </div>
            <form onSubmit={sendMagicLink} className="mt-5 space-y-4">
              <label className="block text-sm text-zinc-300">Email
                <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400" />
              </label>
              {notice ? <p role="status" className="text-sm text-emerald-300">{notice}</p> : null}
              {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
              <button type="submit" disabled={isSending} className="w-full rounded-md bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-500 disabled:opacity-60">{isSending ? "Sending…" : "Email me a sign-in link"}</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}