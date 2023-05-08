import { app } from "./app";
import { port } from "./config";
import { ChartCrone } from "./crones/syncChartCrone";
import { initMongo } from "./services/mongoService";
import { supportedResolutions } from "./constants";

initMongo()
  .then(() => new ChartCrone(supportedResolutions).start())
  .then(() => console.log("✅ Sync chart crone started"))
  .then(() =>
    app.listen(port ?? 5000, () => {
      console.log("🚀 Server ready at: http://localhost:" + port);
    })
  );
