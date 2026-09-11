import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createConnection,
  disconnectConnection,
  listAvailableProviders,
  listConnections,
  reconnectConnection,
  syncConnection,
} from "../controllers/connections.controller";

export const connectionsRouter = Router();

connectionsRouter.use(requireAuth);
connectionsRouter.get("/", listConnections);
connectionsRouter.get("/available-providers", listAvailableProviders);
connectionsRouter.post("/", createConnection);
connectionsRouter.post("/:id/sync", syncConnection);
connectionsRouter.post("/:id/reconnect", reconnectConnection);
connectionsRouter.delete("/:id", disconnectConnection);
