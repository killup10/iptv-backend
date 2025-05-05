// routes/m3u.routes.js
import express from "express";
import { uploadM3U, listM3U, getM3UContent } from "../controllers/m3u.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// Subir un archivo M3U
router.post("/upload", verifyToken, uploadM3U);

// Listar archivos M3U
router.get("/list", verifyToken, listM3U);

// Ver contenido de un archivo M3U
router.get("/view/:fileName", verifyToken, getM3UContent);

export default router;
