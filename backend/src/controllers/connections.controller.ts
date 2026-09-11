import { Response } from "express";
import { z } from "zod";
import { FinancialConnection } from "../models/FinancialConnection";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { getProvider, listProviders } from "../services/providers";
import { runProviderSync } from "../services/syncEngine.service";

export const listConnections = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const connections = await FinancialConnection.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ connections });
});

// Providers not yet connected by this user, so the UI can offer "Connect" for each real option
// without hardcoding what's available — today that's only the dev-only mock provider.
export const listAvailableProviders = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const existing = await FinancialConnection.find({ userId: req.userId }).select("provider");
  const connectedIds = new Set(existing.map((c) => c.provider));
  const available = listProviders()
    .filter((p) => !connectedIds.has(p.id))
    .map((p) => ({ id: p.id, isMockData: p.isMockData }));
  res.json({ providers: available });
});

const createSchema = z.object({ provider: z.string().min(1) });

export const createConnection = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createSchema.parse(req.body);

  let provider;
  try {
    provider = getProvider(body.provider);
  } catch {
    throw new HttpError(400, `Unknown provider: ${body.provider}`);
  }

  const existing = await FinancialConnection.findOne({ userId: req.userId, provider: body.provider });
  if (existing && existing.status === "connected") {
    throw new HttpError(409, "This provider is already connected");
  }

  const { connectionId, status } = await provider.connect(req.userId!);

  const connection = await FinancialConnection.findOneAndUpdate(
    { userId: req.userId, provider: body.provider },
    { $set: { userId: req.userId, provider: body.provider, status, providerConnectionId: connectionId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ connection });
});

export const syncConnection = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const connection = await FinancialConnection.findOne({ _id: req.params.id, userId: req.userId });
  if (!connection) throw new HttpError(404, "Connection not found");
  if (connection.status === "disconnected") throw new HttpError(409, "Reconnect this account before syncing");

  try {
    const { job } = await runProviderSync(req.userId!, connection.provider);
    res.json({ job });
  } catch {
    throw new HttpError(502, "Sync failed");
  }
});

export const reconnectConnection = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const connection = await FinancialConnection.findOne({ _id: req.params.id, userId: req.userId });
  if (!connection) throw new HttpError(404, "Connection not found");

  const provider = getProvider(connection.provider);
  const { connectionId, status } = await provider.connect(req.userId!);

  connection.status = status;
  connection.providerConnectionId = connectionId;
  await connection.save();

  res.json({ connection });
});

export const disconnectConnection = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const connection = await FinancialConnection.findOne({ _id: req.params.id, userId: req.userId });
  if (!connection) throw new HttpError(404, "Connection not found");

  const provider = getProvider(connection.provider);
  if (connection.providerConnectionId) {
    await provider.disconnect(connection.providerConnectionId);
  }

  connection.status = "disconnected";
  connection.providerConnectionId = null;
  await connection.save();

  res.json({ connection });
});
