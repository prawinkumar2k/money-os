import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export async function connectDb(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);
  const connection = await mongoose.connect(uri);
  logger.info(`MongoDB connected: ${connection.connection.host}/${connection.connection.name}`);
  return connection;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
