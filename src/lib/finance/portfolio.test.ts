import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { dayPnl, returnPercent } from "./money";
import {
  allocationBreakdown,
  buildPortfolioTimeline,
  categoryForQuote,
  markPosition,
  parseDateInputValue,
  portfolioTotals,
  quantityAfterActions,
  toDateInputValue,
  type Holding,
  type PortfolioAction,
} from "./portfolio";

const voo: Holding = {
  symbol: "VOO",
  name: "Vanguard S&P 500 ETF",
  quantity: "50",
  averageCost: "450",
};

describe("returnPercent", () => {
  it("computes (price - avg) / avg * 100", () => {
    expect(returnPercent("495", "450").equals(new Decimal("10"))).toBe(true);
  });
});

describe("dayPnl", () => {
  it("backs out previous close from Yahoo percent points", () => {
    const pnl = dayPnl("10", "101", "1");
    expect(pnl.equals(new Decimal("10"))).toBe(true);
  });
});

describe("markPosition + portfolioTotals", () => {
  it("rolls up market value, unrealized PnL, and day's return", () => {
    const position = markPosition(voo, {
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      price: "495",
      changePercent: "1",
    });

    expect(position.marketValue?.equals(new Decimal("24750"))).toBe(true);
    expect(position.unrealizedPnl?.equals(new Decimal("2250"))).toBe(true);
    expect(position.unrealizedPnlPercent?.equals(new Decimal("10"))).toBe(true);

    const expectedDayPnl = new Decimal("50").times("495").times("0.01").div("1.01");
    expect(position.dayPnl?.equals(expectedDayPnl)).toBe(true);

    const totals = portfolioTotals([position]);
    expect(totals.totalValue.equals(new Decimal("24750"))).toBe(true);
    expect(totals.netUnrealizedPnl.equals(new Decimal("2250"))).toBe(true);
    expect(totals.dayPnl.equals(expectedDayPnl)).toBe(true);
    expect(
      totals.dayReturnPercent.toDecimalPlaces(2).equals(new Decimal("1")),
    ).toBe(true);
  });

  it("converts non-USD positions before rolling up portfolio totals", () => {
    const singaporePosition = markPosition(
      { symbol: "D05.SI", name: "DBS", quantity: "10", averageCost: "100" },
      {
        symbol: "D05.SI",
        name: "DBS",
        price: "110",
        changePercent: "0",
        currency: "SGD",
        usdRate: "0.74",
      },
    );
    const usPosition = markPosition(
      { symbol: "VOO", name: "VOO", quantity: "1", averageCost: "100" },
      {
        symbol: "VOO",
        name: "VOO",
        price: "100",
        changePercent: "0",
        currency: "USD",
        usdRate: "1",
      },
    );

    const totals = portfolioTotals([singaporePosition, usPosition]);

    expect(totals.totalValue.equals(new Decimal("914"))).toBe(true);
    expect(totals.netUnrealizedPnl.equals(new Decimal("74"))).toBe(true);
    expect(totals.netUnrealizedPnlPercent.toDecimalPlaces(2).equals(new Decimal("8.81"))).toBe(true);
  });
});

describe("allocation categories and action replay", () => {
  it("uses quote metadata for cross-market allocation categories", () => {
    expect(categoryForQuote({ symbol: "BTC-USD", name: "Bitcoin", price: "1", changePercent: "0", quoteType: "CRYPTOCURRENCY" })).toBe("Crypto");
    expect(categoryForQuote({ symbol: "D05.SI", name: "DBS", price: "1", changePercent: "0", region: "SG" })).toBe("SG Market");
    expect(categoryForQuote({ symbol: "7203.T", name: "Toyota", price: "1", changePercent: "0", region: "JP" })).toBe("JP Market");
    expect(categoryForQuote(undefined)).toBe("Other");
  });

  it("computes market-value allocation weights without floating-point money math", () => {
    const first = markPosition(voo, { symbol: "VOO", name: "VOO", price: "100", changePercent: "0", currency: "USD", region: "US" });
    const second = markPosition({ symbol: "B", name: "B", quantity: "1", averageCost: "50" }, { symbol: "B", name: "B", price: "100", changePercent: "0", currency: "USD", region: "US" });
    const rows = allocationBreakdown([first, second], []);

    expect(rows[0].weight.toFixed(2)).toBe("98.04");
    expect(rows[1].weight.toFixed(2)).toBe("1.96");
  });

  it("replays buys, sells, and baseline resets in timestamp order", () => {
    const actions: PortfolioAction[] = [
      { id: "buy", timestamp: 1, assetId: "VOO", category: "US Market", quantity: "5", price: "100", direction: "BUY" },
      { id: "sell", timestamp: 2, assetId: "VOO", category: "US Market", quantity: "2", price: "110", direction: "SELL" },
      { id: "baseline", timestamp: 3, assetId: "VOO", category: "US Market", quantity: "10", price: "120", direction: "BUY", isInitialBaseline: true },
      { id: "next-buy", timestamp: 4, assetId: "VOO", category: "US Market", quantity: "1.25", price: "125", direction: "BUY" },
    ];

    expect(quantityAfterActions(actions, "VOO", 2).toString()).toBe("3");
    expect(quantityAfterActions(actions, "voo").toString()).toBe("11.25");
  });

  it("builds a sanitized, discontinuity-aware portfolio timeline", () => {
    const positions = [
      markPosition(voo, { symbol: "VOO", name: "VOO", price: "100", changePercent: "0", currency: "USD", region: "US" }),
    ];
    const actions: PortfolioAction[] = [
      { id: "baseline", timestamp: 5_000, assetId: "VOO", category: "US Market", quantity: "10", price: "100", direction: "BUY", isInitialBaseline: true },
      { id: "buy", timestamp: 10_000, assetId: "VOO", category: "US Market", quantity: "2", price: "100", direction: "BUY" },
    ];

    const timeline = buildPortfolioTimeline(actions, positions, [{ symbol: "VOO", name: "Vanguard S&P 500 ETF", price: "100", changePercent: "0", currency: "USD", region: "US" }]);

    expect(timeline).toHaveLength(3);
    expect(timeline[0].isDiscontinuous).toBe(true);
    expect(Number.isFinite(timeline[0].totalValue)).toBe(true);
    expect(Number.isFinite(timeline[1].totalValue)).toBe(true);
    expect(timeline[1].timestamp).toBe(10_000);
    expect(parseDateInputValue("2026-09-29")).toBe(new Date("2026-09-29T12:00:00").getTime());
    expect(toDateInputValue(new Date("2026-09-29T12:00:00").getTime())).toBe("2026-09-29");
  });
});
