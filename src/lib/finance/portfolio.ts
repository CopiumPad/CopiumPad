import Decimal from "decimal.js";
import {
  dayPnl,
  marketValue,
  returnPercent,
  sumDecimals,
  toDecimal,
  unrealizedPnl,
  type DecimalInput,
} from "./money";

export type Holding = {
  symbol: string;
  name: string;
  quantity: string;
  averageCost: string;
};

export type AssetCategory = "Crypto" | "US Market" | "SG Market" | "ETF" | "Other" | `${string} Market`;
export type ActionDirection = "BUY" | "SELL";

export type PortfolioAction = {
  id: string;
  timestamp: number;
  assetId: string;
  category: AssetCategory;
  quantity: string;
  price: string;
  direction: ActionDirection;
  isInitialBaseline?: boolean;
};

export type QuoteSnapshot = {
  symbol: string;
  name: string;
  price: DecimalInput;
  changePercent: DecimalInput;
  usdRate?: DecimalInput | null;
  error?: boolean;
  currency?: string;
  exchange?: string;
  region?: string | null;
  quoteType?: string;
  trailingPE?: number | null;
  forwardPE?: number | null;
  marketCap?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
};

export type PositionMark = {
  symbol: string;
  name: string;
  quantity: string;
  averageCost: string;
  livePrice: Decimal | null;
  currency: string | null;
  usdRate: Decimal | null;
  changePercent: Decimal | null;
  quoteError: boolean;
  marketValue: Decimal | null;
  marketValueUsd: Decimal | null;
  unrealizedPnl: Decimal | null;
  unrealizedPnlUsd: Decimal | null;
  unrealizedPnlPercent: Decimal | null;
  dayPnl: Decimal | null;
  dayPnlUsd: Decimal | null;
};

export type PortfolioTotals = {
  totalValue: Decimal;
  netUnrealizedPnl: Decimal;
  netUnrealizedPnlPercent: Decimal;
  dayPnl: Decimal;
  dayReturnPercent: Decimal;
};

export function categoryForQuote(quote: QuoteSnapshot | undefined): AssetCategory {
  if (quote === undefined) return "Other";
  const quoteType = quote.quoteType?.toUpperCase() ?? "";
  if (quoteType.includes("CRYPTO")) return "Crypto";
  if (quoteType === "ETF") return "ETF";
  const region = quote.region?.trim().toUpperCase();
  if (!region) return "Other";
  if (region === "US") return "US Market";
  if (region === "SG") return "SG Market";
  return `${region} Market`;
}

export function allocationBreakdown(
  positions: readonly PositionMark[],
  quotes: readonly QuoteSnapshot[],
) {
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
  const marked = positions.flatMap((position) => {
    if (position.marketValueUsd === null || position.marketValueUsd.isNegative()) return [];
    return [{
      symbol: position.symbol,
      name: position.name,
      category: categoryForQuote(quoteBySymbol.get(position.symbol.toUpperCase())),
      value: position.marketValueUsd,
    }];
  });
  const total = sumDecimals(marked.map((position) => position.value));

  return marked.map((position) => ({
    ...position,
    weight: total.isZero() ? new Decimal(0) : position.value.div(total).times(100),
  }));
}

export function quantityAfterActions(
  actions: readonly PortfolioAction[],
  assetId: string,
  timestamp = Number.POSITIVE_INFINITY,
): Decimal {
  return [...actions]
    .filter((action) => action.assetId.toUpperCase() === assetId.toUpperCase() && action.timestamp <= timestamp)
    .sort((left, right) => left.timestamp - right.timestamp)
    .reduce((quantity, action) => {
      const amount = toDecimal(action.quantity);
      if (action.isInitialBaseline) return amount;
      return action.direction === "BUY" ? quantity.plus(amount) : quantity.minus(amount);
    }, new Decimal(0));
}

export function markPosition(
  holding: Holding,
  quote: QuoteSnapshot | undefined,
): PositionMark {
  const quoteError = quote === undefined || quote.error === true;
  const livePrice =
    quoteError || quote === undefined ? null : toDecimal(quote.price);
  const usdRate =
    quote?.usdRate == null
      ? quote?.currency === undefined || quote.currency.toUpperCase() === "USD"
        ? new Decimal(1)
        : null
      : toDecimal(quote.usdRate);
  const hasMark = livePrice !== null && !livePrice.isZero();

  if (!hasMark || livePrice === null || quote === undefined) {
    return {
      symbol: holding.symbol,
      name: quote?.name ?? holding.name,
      quantity: holding.quantity,
      averageCost: holding.averageCost,
      livePrice: livePrice,
      currency: quote?.currency ?? null,
      usdRate,
      changePercent: quoteError || quote === undefined ? null : toDecimal(quote.changePercent),
      quoteError: quoteError || livePrice === null || livePrice.isZero(),
      marketValue: null,
      marketValueUsd: null,
      unrealizedPnl: null,
      unrealizedPnlUsd: null,
      unrealizedPnlPercent: null,
      dayPnl: null,
      dayPnlUsd: null,
    };
  }

  const changePercent = toDecimal(quote.changePercent);
  const localMarketValue = marketValue(holding.quantity, livePrice);
  const localUnrealizedPnl = unrealizedPnl(
    holding.quantity,
    holding.averageCost,
    livePrice,
  );
  const localDayPnl = dayPnl(holding.quantity, livePrice, changePercent);

  return {
    symbol: holding.symbol,
    name: quote.name || holding.name,
    quantity: holding.quantity,
    averageCost: holding.averageCost,
    livePrice,
    currency: quote.currency ?? null,
    usdRate,
    changePercent,
    quoteError: false,
    marketValue: localMarketValue,
    marketValueUsd: usdRate === null ? null : localMarketValue.times(usdRate),
    unrealizedPnl: localUnrealizedPnl,
    unrealizedPnlUsd: usdRate === null ? null : localUnrealizedPnl.times(usdRate),
    unrealizedPnlPercent: returnPercent(livePrice, holding.averageCost),
    dayPnl: localDayPnl,
    dayPnlUsd: usdRate === null ? null : localDayPnl.times(usdRate),
  };
}

export function portfolioTotals(positions: readonly PositionMark[]): PortfolioTotals {
  const marked = positions.filter(
    (
      position,
    ): position is PositionMark & {
      marketValue: Decimal;
      marketValueUsd: Decimal;
      usdRate: Decimal;
      unrealizedPnl: Decimal;
      unrealizedPnlUsd: Decimal;
      dayPnl: Decimal;
      dayPnlUsd: Decimal;
    } =>
      position.marketValue !== null &&
      position.marketValueUsd !== null &&
      position.unrealizedPnl !== null &&
      position.unrealizedPnlUsd !== null &&
      position.dayPnl !== null &&
      position.dayPnlUsd !== null
  );

  const totalValue = sumDecimals(marked.map((position) => position.marketValueUsd));
  const netUnrealizedPnl = sumDecimals(
    marked.map((position) => position.unrealizedPnlUsd),
  );
  const dayPnlTotal = sumDecimals(marked.map((position) => position.dayPnlUsd));
  const previousValue = totalValue.minus(dayPnlTotal);
  const costBasis = sumDecimals(
    marked.map((position) =>
      marketValue(position.quantity, position.averageCost).times(position.usdRate),
    ),
  );

  return {
    totalValue,
    netUnrealizedPnl,
    netUnrealizedPnlPercent: returnPercent(totalValue, costBasis),
    dayPnl: dayPnlTotal,
    dayReturnPercent: returnPercent(totalValue, previousValue),
  };
}
