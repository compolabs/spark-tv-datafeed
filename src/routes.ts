import { Router } from "express";
// import * as orderController from "./controllers/orderController";
// import * as tradeController from "./controllers/tradeController";
import * as twController from "./controllers/twController";

const router = Router();

router.get("/", (req, res) => res.send("Server is alive 👌"));

router.get("/config", twController.getConfig);
router.get("/time", twController.getTime);
router.get("/symbols", twController.getSymbols);
router.get("/history", twController.getHistory);

export { router };
