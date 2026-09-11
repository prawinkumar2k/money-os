import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { confirmImport, listImports, previewImport } from "../controllers/import.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isCsv = file.mimetype === "text/csv" || name.endsWith(".csv");
    const isPdf = file.mimetype === "application/pdf" || name.endsWith(".pdf");
    if (!isCsv && !isPdf) {
      return cb(new Error("Only CSV or PDF files are supported"));
    }
    cb(null, true);
  },
});

export const importRouter = Router();

importRouter.use(requireAuth);
importRouter.get("/", listImports);
importRouter.post("/preview", upload.single("file"), previewImport);
importRouter.post("/confirm", confirmImport);
