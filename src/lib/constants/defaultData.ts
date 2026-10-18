import type { Holding, PortfolioAction } from "@/lib/finance/portfolio";

export const DEFAULT_POSITIONS: readonly Holding[] = [
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", quantity: "12", averageCost: "433.33" },
  { symbol: "BTC-USD", name: "Bitcoin USD", quantity: "0.35", averageCost: "63714.29" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", quantity: "5", averageCost: "390" },
];

export const DEFAULT_ACTIONS: readonly PortfolioAction[] = [
  {
    id: "demo-voo-initial",
    timestamp: Date.UTC(2025, 9, 1, 14, 0),
    assetId: "VOO",
    category: "ETF",
    quantity: "10",
    price: "420",
    direction: "BUY",
    isInitialBaseline: true,
  },
  {
    id: "demo-qqq-initial",
    timestamp: Date.UTC(2025, 9, 4, 14, 0),
    assetId: "QQQ",
    category: "ETF",
    quantity: "6",
    price: "390",
    direction: "BUY",
    isInitialBaseline: true,
  },
  {
    id: "demo-bitcoin-initial",
    timestamp: Date.UTC(2025, 9, 7, 14, 0),
    assetId: "BTC-USD",
    category: "Crypto",
    quantity: "0.25",
    price: "60000",
    direction: "BUY",
    isInitialBaseline: true,
  },
  {
    id: "demo-voo-buy",
    timestamp: Date.UTC(2025, 10, 12, 14, 0),
    assetId: "VOO",
    category: "ETF",
    quantity: "2",
    price: "500",
    direction: "BUY",
  },
  {
    id: "demo-bitcoin-buy",
    timestamp: Date.UTC(2025, 10, 22, 14, 0),
    assetId: "BTC-USD",
    category: "Crypto",
    quantity: "0.1",
    price: "73000",
    direction: "BUY",
  },
  {
    id: "demo-qqq-sale",
    timestamp: Date.UTC(2025, 11, 2, 14, 0),
    assetId: "QQQ",
    category: "ETF",
    quantity: "1",
    price: "425",
    direction: "SELL",
  },
];