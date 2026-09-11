import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createCategory, listCategories } from "../controllers/categories.controller";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);
categoriesRouter.get("/", listCategories);
categoriesRouter.post("/", createCategory);
