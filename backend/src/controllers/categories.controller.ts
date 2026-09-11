import { Response } from "express";
import { z } from "zod";
import { Category } from "../models/Category";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";

const createCategorySchema = z.object({
  name: z.string().min(1),
  parentCategory: z.string().nullable().optional(),
  merchantRules: z.array(z.string()).default([]),
});

export const listCategories = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const categories = await Category.find({ $or: [{ userId: req.userId }, { isSystem: true }] }).sort({ name: 1 });
  res.json({ categories });
});

export const createCategory = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = createCategorySchema.parse(req.body);
  const category = await Category.create({ ...body, userId: req.userId, isSystem: false });
  res.status(201).json({ category });
});
