import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// 26.09.05: Instantiate client here
const yf = new YahooFinance();

function marketRegion(quote: {
  exchange?: string;
  fullExchangeName?: string;
  currency?: string;
  quoteType?: string;
}): string | null {
  if (quote.quoteType === "CRYPTOCURRENCY") {
    return null;
  }

  const exchange = `${quote.exchange ?? ""} ${quote.fullExchangeName ?? ""}`.toLowerCase();
  const exchangeRegions: Array<[RegExp, string]> = [
    [/singapore|\bsgx\b|\bses\b/, "SG"],
    [/hong kong|\bhkg\b|\bhkex\b/, "HK"],
    [/tokyo|japan exchange|\bjpx\b|\btyo\b/, "JP"],
    [/london|\blse\b|\blon\b/, "GB"],
    [/toronto|\btsx\b|\btor\b/, "CA"],
    [/frankfurt|\bfra\b/, "DE"],
    [/paris|euronext paris|\bpar\b/, "FR"],
    [/amsterdam|\bams\b/, "NL"],
    [/milan|\bmil\b/, "IT"],
    [/zurich|\bsix\b|\bebs\b/, "CH"],
    [/australia|sydney|\basx\b/, "AU"],
    [/india|\bbse\b|\bnse\b/, "IN"],
    [/shanghai|\bshh\b|shenzhen|\bshz\b/, "CN"],
    [/korea|\bksc\b|\bkospi\b/, "KR"],
    [/taiwan|\btai\b/, "TW"],
    [/brazil|\bsao\b|b3 /, "BR"],
    [/nyse|nasdaq|cboe|\bnyq\b|\bnms\b|\bngm\b|\bpcx\b/, "US"],
  ];

  for (const [pattern, region] of exchangeRegions) {
    if (pattern.test(exchange)) {
      return region;
    }
  }

  const currencyRegions: Record<string, string> = {
    AUD: "AU",
    CAD: "CA",
    CHF: "CH",
    CNY: "CN",
    EUR: "EU",
    GBP: "GB",
    HKD: "HK",
    INR: "IN",
    JPY: "JP",
    KRW: "KR",
    SGD: "SG",
    TWD: "TW",
    USD: "US",
  };

  return quote.currency === undefined ? null : currencyRegions[quote.currency] ?? null;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get("symbols") || "VOO,QQQ,BTC-USD";
  const displayCurrency = (searchParams.get("currency") || "USD").trim().toUpperCase();
    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  
    try {
      const quotes = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const quote = await yf.quote(symbol);
            return {
              symbol,
              name: quote.shortName || quote.longName || symbol,
              price: quote.regularMarketPrice ?? 0,
              changePercent: quote.regularMarketChangePercent ?? 0,
              currency: quote.currency || "USD",
              exchange: quote.fullExchangeName || quote.exchange || "Unknown market",
              region: marketRegion(quote),
              quoteType: quote.quoteType || "UNKNOWN",
              trailingPE: quote.trailingPE ?? null,
              forwardPE: quote.forwardPE ?? null,
              marketCap: quote.marketCap ?? null,
              fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
              fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
            };
          } catch (err) {
            console.error(`Error fetching quote for ${symbol}:`, err);
            return {
              symbol,
              name: symbol,
              price: 0,
              changePercent: 0,
              currency: "USD",
              exchange: "Unknown market",
              region: null,
              quoteType: "UNKNOWN",
              trailingPE: null,
              forwardPE: null,
              marketCap: null,
              fiftyTwoWeekHigh: null,
              fiftyTwoWeekLow: null,
              error: true,
            };
          }
        })
      );

      const currencies = [...new Set([...quotes.map((quote) => quote.currency), displayCurrency])];
      const usdRates = new Map<string, number | null>([["USD", 1]]);
      await Promise.all(
        currencies
          .filter((currency) => currency !== "USD")
          .map(async (currency) => {
            try {
              const fxQuote = await yf.quote(`${currency}USD=X`);
              usdRates.set(currency, fxQuote.regularMarketPrice ?? null);
            } catch (err) {
              console.error(`Error fetching USD conversion for ${currency}:`, err);
              usdRates.set(currency, null);
            }
          }),
      );

      const quotesWithUsdRates = quotes.map((quote) => ({
        ...quote,
        usdRate: usdRates.get(quote.currency) ?? null,
      }));
  
      return NextResponse.json({
        success: true,
        data: quotesWithUsdRates,
        displayCurrency,
        displayCurrencyUsdRate: usdRates.get(displayCurrency) ?? null,
      });
    } catch (error) {
      console.error("API error:", error);
      return NextResponse.json({ success: false, error: "Failed to fetch quotes" }, { status: 500 });
    }
  }

export async function searchQuotes(query: string) {
  const result = await yf.search(query, {
    quotesCount: 8,
    newsCount: 0,
  });

  return result.quotes
    .filter(
      (quote) =>
        "symbol" in quote &&
        "isYahooFinance" in quote &&
        quote.quoteType === "EQUITY" ||
        quote.quoteType === "ETF" ||
        quote.quoteType === "CRYPTOCURRENCY",
    )
    .map((quote) => ({
      symbol: quote.symbol,
      name: quote.longname || quote.shortname || quote.symbol,
      exchange: quote.exchDisp || quote.exchange,
      type: quote.quoteType,
    }));
}