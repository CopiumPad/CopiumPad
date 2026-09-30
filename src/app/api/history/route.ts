import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();
const SYMBOL_PATTERN = /^[A-Z0-9^=._-]{1,32}$/;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbols = [...new Set((searchParams.get("symbols") ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean))];
  const from = Number(searchParams.get("from"));

  if (symbols.length === 0 || symbols.length > 30 || symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol))) {
    return NextResponse.json({ success: false, error: "Invalid symbols" }, { status: 400 });
  }
  if (!Number.isFinite(from) || from < 0 || from > Date.now()) {
    return NextResponse.json({ success: false, error: "Invalid start date" }, { status: 400 });
  }

  const data = await Promise.all(symbols.map(async (symbol) => {
    try {
      const result = await yahooFinance.chart(symbol, {
        period1: Math.floor(from / 1000),
        interval: "1d",
      });
      return {
        symbol,
        points: result.quotes.flatMap((quote) => (
          quote.close === null || !Number.isFinite(quote.close)
            ? []
            : [{ timestamp: quote.date.getTime(), price: quote.close }]
        )),
      };
    } catch (error) {
      console.error(`Error fetching historical prices for ${symbol}:`, error);
      return { symbol, points: [] };
    }
  }));

  return NextResponse.json({ success: true, data });
}