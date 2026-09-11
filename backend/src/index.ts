import { env } from "./config/env";
import { connectDb } from "./db/connect";
import { seedSystemCategories } from "./db/seedCategories";
import { createApp } from "./app";
import { logger } from "./utils/logger";

async function main() {
  await connectDb();
  await seedSystemCategories();

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`Money OS backend listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  logger.error("Fatal error during startup", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
