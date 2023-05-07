import { schedule } from "node-cron";
import { getTrades, Trade } from "../models/Trade";
import { Candle } from "../models/Candle";
import { roundUnixToCandleUnix } from "../utils/roundDateToCandleUnix";
import { getPeriodInSeconds } from "../services/udf";
import dayjs from "dayjs";
import BN from "../utils/BN";

const market = "BTC/USDC";
export const initSyncChartCrone = async () => {
  const scheduledJobFunction = schedule("*/30 * * * *", () => syncChartCrone(market, "30"));
  scheduledJobFunction.start();
};

export const syncChartCrone = async (market: string, resolution: string) => {
  const [firstTrade, lastTrade] = await Promise.all([
    Trade.find().sort({ timestamp: 1 }).limit(1),
    Trade.find().sort({ timestamp: -1 }).limit(1),
  ]).then((res) => res.map((arr) => arr[0]));
  if (firstTrade == null || lastTrade == null) throw new Error("Cannot find trades");
  const lastCandle = await Candle.find({ resolution }).sort({ t: -1 }).limit(1); //TODO SYMBOL
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
};
