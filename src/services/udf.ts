import { ITrade, Trade } from "../models/Trade";
import { TOKENS_BY_SYMBOL } from "../constants";
import BN from "../utils/BN";

class UDFError extends Error {}

class SymbolNotFound extends UDFError {}

class InvalidResolution extends UDFError {}

type TSymbol = {
  symbol: string;
  ticker: string;
  name: string;
  full_name: string;
  description: string;
  currency_code: string;
};

const supportedResolutions = [
  "1",
  "3",
  "5",
  "15",
  "30",
  "60",
  "120",
  "240",
  "360",
  "480",
  "720",
  "1D",
  "3D",
  "1W",
  "1M",
];

export const symbols = ["ETH", "BTC", "USDC", "UNI", "LINK", "COMP"].reduce(
  (acc, symbol0, _, arr) => {
    const batch = arr
      .filter((symbol1) => symbol1 !== symbol0)
      .map((symbol1) => ({
        symbol: `${symbol0}/${symbol1}`,
        ticker: `${symbol0}/${symbol1}`,
        name: `${symbol0}/${symbol1}`,
        full_name: `${symbol0}/${symbol1}`,
        description: `${symbol0} / ${symbol1}`,
        currency_code: symbol1,
        exchange: "SPARK",
        listed_exchange: "SPARK",
        type: "crypto",
        session: "24x7",
        timezone: "UTC",
        minmovement: 1,
        minmov: 1,
        minmovement2: 0,
        minmov2: 0,
        // pricescale: pricescale(symbol),
        supported_resolutions: supportedResolutions,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        data_status: "streaming",
      }));
    return [...acc, ...batch];
  },
  [] as Array<TSymbol>
);

export default class UDF {
  constructor() {}

  config() {
    return {
      exchanges: [
        {
          value: "SPARK",
          name: "Spark",
          desc: "Spark",
        },
      ],
      symbols_types: [
        {
          value: "crypto",
          name: "Cryptocurrency",
        },
      ],
      supported_resolutions: supportedResolutions,
      supports_search: true,
      supports_group_request: false,
      supports_marks: false,
      supports_timescale_marks: false,
      supports_time: true,
    };
  }

  /**
   * Symbol resolve.
   * @param {string} input Symbol name or ticker.
   * @returns {object} Symbol.
   */
  symbol(input: string) {
    const comps = input.split(":");
    const s = (comps.length > 1 ? comps[1] : input).toUpperCase();
    const symbol = symbols.find(({ symbol }) => symbol === s);
    if (symbol != null) return symbol;

    throw new SymbolNotFound();
  }

  /**
   * Bars.
   * @param {string} symbol_str - Symbol name or ticker.
   * @param {number} from - Unix timestamp (UTC) of leftmost required bar.
   * @param {number} to - Unix timestamp (UTC) of rightmost required bar.
   * @param {string} resolution
   */
  async history(symbol_str: string, from: number, to: number, resolution: string) {
    const symbol = symbols.find((s) => s.symbol === symbol_str);
    if (symbol == null) throw new SymbolNotFound();
    const [assetSymbol0, assetSymbol1] = symbol.symbol.split("/");

    const RESOLUTIONS_INTERVALS_MAP: Record<string, string> = {
      "1": "1m",
      "3": "3m",
      "5": "5m",
      "15": "15m",
      "30": "30m",
      "60": "1h",
      "120": "2h",
      "240": "4h",
      "360": "6h",
      "480": "8h",
      "720": "12h",
      D: "1d",
      "1D": "1d",
      "3D": "3d",
      W: "1w",
      "1W": "1w",
      M: "1M",
      "1M": "1M",
    };

    const interval = RESOLUTIONS_INTERVALS_MAP[resolution];
    if (!interval) throw new InvalidResolution();

    const asset0 = TOKENS_BY_SYMBOL[assetSymbol0];
    const asset1 = TOKENS_BY_SYMBOL[assetSymbol1];
    const trades = await Trade.find({
      $or: [
        {
          asset0: asset0.assetId,
          asset1: asset1.assetId,
          timestamp: { $gt: from, $lt: to },
        },
        {
          asset0: asset1.assetId,
          asset1: asset0.assetId,
          timestamp: { $gt: from, $lt: to },
        },
      ],
    }).then((tradeDocuments) =>
      tradeDocuments.map((t) => ({
        ...t.toObject(),
        price:
          t.asset0 === asset0.assetId
            ? BN.formatUnits(t.amount1, asset1.decimals).div(
                BN.formatUnits(t.amount0, asset0.decimals)
              )
            : BN.formatUnits(t.amount0, asset1.decimals).div(
                BN.formatUnits(t.amount1, asset0.decimals)
              ),
      }))
    );

    return generateKlinesBackend(trades, resolution, from, to);
  }
}

type TKlines = {
  s: "ok" | "no_data";
  o: Array<number>;
  h: Array<number>;
  l: Array<number>;
  c: Array<number>;
  v: Array<number>;
  t: Array<number>;
};

function generateKlinesBackend(trades: ITrade[], period: string, from: number, to: number) {
  const sorted = trades.slice().sort((a, b) => (+a.timestamp < +b.timestamp ? -1 : 1));
  const result: TKlines = { s: "no_data", t: [], c: [], o: [], h: [], l: [], v: [] };
  if (sorted.length == 0) return result;
  let start = from;
  while (true) {
    const end = +start + getPeriodInSeconds(period);
    const batch = sorted.filter(({ timestamp }) => +timestamp >= start && +timestamp <= end);
    if (batch.length > 0) {
      if (result.s === "no_data") result.s = "ok";
      const prices = batch.map((t: any) => t.price.toNumber());
      const sum = batch.reduce((amount, { amount0 }) => amount.plus(amount0), BN.ZERO);
      result.t.push(+batch[0].timestamp);
      result.o.push(prices[0]);
      result.c.push(prices[prices.length - 1]);
      result.h.push(Math.max(...prices));
      result.l.push(Math.min(...prices));
      result.v.push(sum.toNumber());
    }
    start = end;
    if (start > +sorted[sorted.length - 1].timestamp) break;
  }
  result.t[result.t.length - 1] = to;
  return result;
}

function getPeriodInSeconds(period: string): number {
  const map: Record<string, number> = {
    "1": 60,
    "3": 3 * 60,
    "5": 5 * 60,
    "15": 15 * 60,
    "30": 30 * 60,
    "60": 60 * 60,
    "120": 2 * 60 * 60,
    "240": 4 * 60 * 60,
    "360": 6 * 60 * 60,
    "480": 8 * 60 * 60,
    "720": 12 * 60 * 60,
    D: 24 * 60 * 60,
    "1D": 24 * 60 * 60,
    "3D": 3 * 24 * 60 * 60,
    W: 7 * 24 * 60 * 60,
    "1W": 7 * 24 * 60 * 60,
    M: 30 * 24 * 60 * 60,
    "1M": 30 * 24 * 60 * 60,
  };
  if (map[period] != null) {
    return map[period];
  } else {
    throw new Error(`Invalid period: ${period}`);
  }
}
