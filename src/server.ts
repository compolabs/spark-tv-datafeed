import { app } from "./app";
import { port } from "./config";
import { initSyncChartCrone } from "./crones/syncChartCrone";
import { initMongo } from "./services/mongoService";

initMongo()
  .then(() => initSyncChartCrone().then(() => console.log("✅ Sync chart crone started")))
  .then(() =>
    app.listen(port ?? 5000, () => {
      console.log("🚀 Server ready at: http://localhost:" + port);
    })
  );
