# CopiumPad 💊

> Institutional-grade copium for retail traders.  
> Kill your broken Google Sheets with real-time portfolio tracking and scenario simulation.

## Tech Stack
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- decimal.js
- TanStack Query

## Supabase Setup
1. Create a Supabase project and copy `.env.example` to `.env.local`. Set the project URL and anon key.
2. Run `supabase/schema.sql` in the Supabase SQL Editor to create the profile and position tables, RLS policies, and the public `avatars` bucket.
3. In Supabase Authentication, enable email OTP/magic links and add `http://localhost:3000/auth/confirm`, `http://localhost:3001/auth/confirm`, plus your deployed `/auth/confirm` URL to the allowed redirect URLs.
4. Start the app with `pnpm dev`. Signing in imports any existing `copiumpad_positions` browser data once for the first account, then positions are stored in that account's Supabase rows.
