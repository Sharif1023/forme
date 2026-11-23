import { config, validateRuntimeConfig } from "./config.mjs";
import { createApp } from "./app.mjs";
import { closePool } from "./db/pool.mjs";
import { releaseExpiredReservations } from "./orders.mjs";
import { startTryOnWorker, stopTryOnWorker } from "./tryon.mjs";

validateRuntimeConfig();
startTryOnWorker();
const app = createApp();
const server = app.listen(
  config.port,
  process.env.API_HOST || (config.production ? "0.0.0.0" : "127.0.0.1"),
  () => console.log(`FORME API ready on port ${config.port}.`),
);
const cleanup = setInterval(
  () =>
    releaseExpiredReservations().catch((error) =>
      console.error(
        JSON.stringify({ task: "reservation_cleanup", code: error.code || "CLEANUP_FAILED" }),
      ),
    ),
  60000,
);
cleanup.unref();
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  clearInterval(cleanup);
  stopTryOnWorker();
  server.close(() => closePool().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
