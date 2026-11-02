"use client";

import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppHeader, type AppView } from "@/components/app-header";
import { PortfolioDashboard } from "@/components/portfolio-dashboard";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { DashboardSkeleton } from "@/components/skeletons";
import { useAuthUser } from "@/hooks/useAuthUser";

export default function Home() {
  const { user, isReady, error: authError } = useAuthUser();
  const [activeView, setActiveView] = useState<AppView>("table");
  const [selectedExploreSymbol, setSelectedExploreSymbol] = useState<string | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    function syncRouteState() {
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get("view");
      const symbol = params.get("symbol")?.trim().toUpperCase() ?? null;
      if (requestedView === "table" || requestedView === "visualization" || requestedView === "explore") {
        setActiveView(requestedView);
      } else if (symbol) {
        setActiveView("explore");
      }
      setSelectedExploreSymbol(symbol);
    }
    syncRouteState();
    window.addEventListener("popstate", syncRouteState);
    return () => window.removeEventListener("popstate", syncRouteState);
  }, []);

  function changeView(view: AppView) {
    setActiveView(view);
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    if (view !== "explore") params.delete("symbol");
    else if (selectedExploreSymbol) params.set("symbol", selectedExploreSymbol);
    window.history.pushState(null, "", `/?${params.toString()}`);
  }

  function openExploreSymbol(symbol: string) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    setSelectedExploreSymbol(normalizedSymbol);
    setActiveView("explore");
    const params = new URLSearchParams({ view: "explore", symbol: normalizedSymbol });
    window.history.pushState(null, "", `/?${params.toString()}`);
  }

  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: "easeOut" }} className="min-h-full bg-background font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <AppHeader
          activeView={activeView}
          onViewChange={changeView}
          isLoginOpen={isLoginOpen}
          onLoginOpenChange={setIsLoginOpen}
        />

        {isReady ? (
          <QueryErrorBoundary key={userId ?? "guest"}>
            <Suspense fallback={<DashboardSkeleton />}>
              <PortfolioDashboard
                userId={userId}
                authError={authError}
                activeView={activeView}
                selectedExploreSymbol={selectedExploreSymbol}
                onViewChange={changeView}
                onOpenExploreSymbol={openExploreSymbol}
                onRequestSignIn={() => setIsLoginOpen(true)}
              />
            </Suspense>
          </QueryErrorBoundary>
        ) : <DashboardSkeleton />}
      </div>
    </motion.main>
  );
}
