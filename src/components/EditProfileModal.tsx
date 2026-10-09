"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type EditProfileModalProps = {
  userId: string;
  initialUsername: string;
  initialAvatarUrl: string | null;
  onClose: () => void;
  onSaved: (username: string, avatarUrl: string | null) => void;
};

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function EditProfileModal({
  userId,
  initialUsername,
  initialAvatarUrl,
  onClose,
  onSaved,
}: EditProfileModalProps) {
  const [username, setUsername] = useState(initialUsername);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => () => {
    if (avatarUrl?.startsWith("blob:")) URL.revokeObjectURL(avatarUrl);
  }, [avatarUrl]);

  function chooseAvatar(file: File | undefined) {
    setError(null);
    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!(file.type in AVATAR_TYPES)) {
      setAvatarFile(null);
      setAvatarUrl(initialAvatarUrl);
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarFile(null);
      setAvatarUrl(initialAvatarUrl);
      setError("Avatar images must be 2 MB or smaller.");
      return;
    }
    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername || normalizedUsername.length > 15) {
      setError("Username is required and must be 15 characters or fewer.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      let nextAvatarUrl = initialAvatarUrl;
      if (avatarFile) {
        const extension = AVATAR_TYPES[avatarFile.type];
        const path = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });
        if (uploadError) throw uploadError;
        nextAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        username: normalizedUsername,
        avatar_url: nextAvatarUrl,
        updated_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;
      onSaved(normalizedUsername, nextAvatarUrl);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <section aria-labelledby="edit-profile-title" aria-modal="true" className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="edit-profile-title" className="text-lg font-semibold text-zinc-100">Edit profile</h2>
            <p className="mt-1 text-sm text-zinc-400">Your profile is private to your account.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close profile editor" className="text-xl leading-none text-zinc-500 hover:text-zinc-200">×</button>
        </div>
        <form onSubmit={saveProfile} className="mt-6 space-y-4">
          <label className="block text-sm text-zinc-300">Username
            <input autoFocus required maxLength={15} value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400" />
            <span className="mt-1 block text-right text-xs text-zinc-500">{username.length}/15</span>
          </label>
          <div>
            <span className="block text-sm text-zinc-300">Avatar</span>
            <div className="mt-2 flex items-center gap-3">
              {avatarUrl ? <Image src={avatarUrl} alt="Avatar preview" width={48} height={48} unoptimized className="size-12 rounded-full border border-zinc-700 object-cover" /> : <div className="size-12 rounded-full border border-zinc-700 bg-zinc-800" />}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseAvatar(event.target.files?.[0])} className="min-w-0 text-xs text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:text-zinc-200 hover:file:bg-zinc-700" />
            </div>
            <p className="mt-1 text-xs text-zinc-500">JPG, PNG, or WebP. Maximum 2 MB.</p>
          </div>
          {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
            <button type="submit" disabled={isSaving} className="rounded-md bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-500 disabled:opacity-60">{isSaving ? "Saving…" : "Save profile"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}