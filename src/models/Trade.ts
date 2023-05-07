import mongoose, { Document } from "mongoose";
import { TOKENS_BY_SYMBOL } from "../constants";
import BN from "../utils/BN";

export interface ITrade {
  asset0: string;
  amount0: string;
  asset1: string;
  amount1: string;
  timestamp: number;
}

export type TradeDocument = Document & ITrade;

const TradeSchema = new mongoose.Schema({
  asset0: { type: String, required: true },
  amount0: { type: String, required: true },
  asset1: { type: String, required: true },
  amount1: { type: String, required: true },
  timestamp: { type: Number, required: true },
});

export const getTrades = async (symbol: string, from: number, to: number) => {
  const [symbol0, symbol1] = symbol.split("/");
  const asset0 = TOKENS_BY_SYMBOL[symbol0];
  const asset1 = TOKENS_BY_SYMBOL[symbol1];
  const conditions = {
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
  };
  return Trade.find(conditions).then((tradeDocuments) =>
    tradeDocuments.map((t) => ({
      ...t.toObject(),
      price:
        t.asset0 === asset0.assetId
          ? BN.formatUnits(t.amount1, asset1.decimals).div(
              BN.formatUnits(t.amount0 === "0" ? 1 : t.amount0, asset0.decimals)
            )
          : BN.formatUnits(t.amount0, asset1.decimals).div(
              BN.formatUnits(t.amount1 === "0" ? 1 : t.amount1, asset0.decimals)
            ),
    }))
  );
};

export const Trade = mongoose.model<TradeDocument>("Trade", TradeSchema);
