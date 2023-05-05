import { initMongo } from "../src/services/mongoService";
import { Trade } from "../src/models/Trade";
import { supportedResolutions, TOKENS_BY_SYMBOL } from "../src/constants";
import BN from "../src/utils/BN";
import dayjs from "dayjs";
import { roundDateToCandleUnix, roundUnixToCandleUnix } from "../src/utils/roundDateToCandleUnix";
import { getPeriodInSeconds } from "../src/services/udf";
import { Candle } from "../src/models/Candle";
import { getTrades } from "../src/crones/syncChartCrone";

describe("test", () => {
  beforeAll(() => initMongo());
  it("candle interval test", async () => {
    const now = dayjs();
    const res = supportedResolutions.map((period) => {
      const unixUp = roundDateToCandleUnix(now, "up", period);
      const unixDown = roundDateToCandleUnix(now, "down", period);
      if (unixUp === 0 || unixDown === 0) return;
      return {
        period,
        "candle start": {
          time: dayjs(unixDown * 1000).format("ddd DD-MMM HH:mm:ss.SSS"),
          unix: unixDown,
        },
        "now         ": {
          time: now.format("ddd DD-MMM HH:mm:ss.SSS"),
          unix: now.unix(),
        },
        "candle end  ": {
          time: dayjs(unixUp * 1000).format("ddd DD-MMM HH:mm:ss.SSS"),
          unix: unixUp,
        },
      };
    });
    console.log(res);
  });
});

describe("Trades normalize", () => {
  beforeAll(() => initMongo());
  it("Normalize chart BTC/USDC", async () => {
    const trades = await Trade.find({});
    let res = trades
      .filter(
        ({ asset0, asset1 }) =>
          [asset0, asset1].includes(TOKENS_BY_SYMBOL.BTC.assetId) &&
          [asset0, asset1].includes(TOKENS_BY_SYMBOL.USDC.assetId)
      )
      .map((trade) => ({
        id: trade.id,
        price:
          trade.asset0 === TOKENS_BY_SYMBOL.BTC.assetId &&
          trade.asset1 === TOKENS_BY_SYMBOL.USDC.assetId
            ? BN.formatUnits(trade.amount1, 6).div(BN.formatUnits(trade.amount0)).toNumber()
            : BN.formatUnits(trade.amount0, 6).div(BN.formatUnits(trade.amount1)).toNumber(),
      }))
      .filter((trade) => trade.price > 30000 || trade.price < 25000);
    console.log(res);
    await Trade.deleteMany({ _id: { $in: res.map(({ id }) => id) } });
  }, 500000);
});

//----------------------------------------------------------------------------------------

const resolution = "30";
const market = "BTC/USDC";
describe("Migrate", () => {
  beforeAll(() => initMongo());
  it("Migrate trades to candles", async () => {
    const [firstTrade, lastTrade] = await Promise.all([
      Trade.find().sort({ timestamp: 1 }).limit(1),
      Trade.find().sort({ timestamp: -1 }).limit(1),
    ]).then((res) => res.map((arr) => arr[0]));
    if (firstTrade == null || lastTrade == null) throw new Error("Cannot find trades");
    const lastCandle = await Candle.find().sort({ t: -1 }).limit(1);
    if (lastCandle[0] != null) {
      firstTrade.timestamp = roundUnixToCandleUnix(lastCandle[0].t, "up", resolution) + 1;
    }
    let i = 0;
    while (true) {
      const offset = getPeriodInSeconds(resolution) * i;
      const from = roundUnixToCandleUnix(firstTrade.timestamp, "down", resolution) + offset;
      const to = roundUnixToCandleUnix(firstTrade.timestamp, "up", resolution) + offset;
      if (from > lastTrade.timestamp || to > dayjs().unix()) break;
      const trades = await getTrades(market, from, to);
      const candle = { t: 0, o: 0, c: 0, h: 0, l: 0, v: 0, resolution };
      const prices = trades.map((t: any) => t.price.toNumber());

      const sum = trades.reduce((amount, { amount0 }) => amount.plus(amount0), BN.ZERO);
      candle.t = +(trades[0]?.timestamp ?? from);
      prices.length > 0 && (candle.o = prices[0]);
      prices.length > 0 && (candle.c = prices[prices.length - 1]);
      prices.length > 0 && (candle.h = Math.max(...prices));
      prices.length > 0 && (candle.l = Math.min(...prices));
      candle.v = sum.toNumber();
      await Candle.create(candle);
      console.log(
        dayjs(from * 1000).format("DD-MMM HH:mm:ss.SSS"),
        "-",
        dayjs(to * 1000).format("DD-MMM HH:mm:ss.SSS"),
        candle
      );

      i++;
    }
  }, 500000);
});
