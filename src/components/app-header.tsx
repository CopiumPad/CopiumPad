"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AccountMenu } from "@/components/account-menu";

export type AppView = "table" | "visualization" | "explore";

type AppHeaderProps = {
  activeView: AppView;
  onViewChange?: (view: Exclude<AppView, "explore">) => void;
};

const VIEWS: { id: AppView; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "visualization", label: "Visualization" },
  { id: "explore", label: "Explore" },
];

export function AppHeader({ activeView, onViewChange }: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="flex flex-col gap-5 border-b border-zinc-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
      <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="CopiumPad home">
        <Image src="/icon.jpg" alt="CopiumPad logo" width={42} height={42} priority className="size-10 rounded-md border border-zinc-800 object-cover" />
        <span className="min-w-0">
          <span className="block text-lg font-semibold leading-5 text-zinc-50">CopiumPad</span>
          <span className="mt-1 block truncate text-xs text-zinc-500">Portfolio intelligence, minus the spreadsheets.</span>
        </span>
      </Link>

      <div className="flex flex-wrap items-center gap-3 lg:ml-auto lg:justify-end">
        <nav aria-label="Main navigation" className="flex rounded-full border border-zinc-800 bg-zinc-900/70 p-1">
          {VIEWS.map((view) => {
            const isActive = activeView === view.id;
            function selectView() {
              if (view.id === "explore") return;
              if (onViewChange) {
                onViewChange(view.id);
                return;
              }
              router.push(`/?view=${view.id}`);
            }
            const className = "relative z-0 inline-flex min-h-9 items-center justify-center rounded-full px-3.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100 sm:px-4";
            const label = (
              <>
                {isActive ? <motion.span layoutId="copiumpad-nav-active" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 -z-10 rounded-full bg-emerald-400" /> : null}
                <span className={isActive ? "text-zinc-950" : ""}>{view.label}</span>
              </>
            );

            return view.id === "explore" ? (
              <Link key={view.id} href="/explore" aria-current={isActive ? "page" : undefined} className={className}>
                {label}
              </Link>
            ) : (
              <button key={view.id} type="button" aria-pressed={isActive} onClick={selectView} className={className}>
                {label}
              </button>
            );
          })}
        </nav>
        <AccountMenu />
      </div>
    </header>
  );
}