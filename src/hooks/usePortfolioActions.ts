"use client";

import { useCallback, useEffect, useState } from "react";
import { toDecimal } from "@/lib/finance/money";
import type { AssetCategory, PortfolioAction } from "@/lib/finance/portfolio";

export const PORTFOLIO_ACTIONS_STORAGE_KEY = "copiumpad_actions";

function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === "string" && (
    ["Crypto", "US Market", "SG Market", "ETF", "Other"].includes(value) ||
    /^[A-Z]{2} Market$/.test(value)
  );
}

function isPortfolioAction(value: unknown): value is PortfolioAction {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    !Number.isFinite(candidate.timestamp) ||
    typeof candidate.assetId !== "string" ||
    !isAssetCategory(candidate.category) ||
    typeof candidate.quantity !== "string" ||
    typeof candidate.price !== "string" ||
    (candidate.direction !== "BUY" && candidate.direction !== "SELL") ||
    (candidate.isInitialBaseline !== undefined && typeof candidate.isInitialBaseline !== "boolean")
  ) return false;

  try {
    return toDecimal(candidate.quantity).isPositive() && toDecimal(candidate.price).isPositive();
  } catch {
    return false;
  }
}

function readActions(): PortfolioAction[] {
  try {
    const stored = window.localStorage.getItem(PORTFOLIO_ACTIONS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isPortfolioAction) : [];
  } catch {
    return [];
  }
}

export function usePortfolioActions() {
  const [actions, setActions] = useState<PortfolioAction[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActions(readActions());
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const addActions = useCallback((newActions: PortfolioAction[]) => {
    setActions((current) => {
      const next = [...current, ...newActions].sort((left, right) => left.timestamp - right.timestamp);
      window.localStorage.setItem(PORTFOLIO_ACTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeAction = useCallback((id: string) => {
    setActions((current) => {
      const next = current.filter((action) => action.id !== id);
      window.localStorage.setItem(PORTFOLIO_ACTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { actions, isHydrated, addActions, removeAction };
}