// routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/*
 * 1. Subir archivo .M3U y crear entradas como canales
 */
router.post(
  "/upload-m3u",
  verifyToken,
  isAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      const entries = [];
      const rl = readline.createInterface({ input: fs.createReadStream(req.file.path) });
      let currentTitle = "", currentLogo = "", currentGroup = "";

      for await (const line of rl) {
        if (line.startsWith("#EXTINF")) {
          currentTitle = (line.match(/,(.*)$/) || [])[1] || "Sin título";
          currentLogo = (line.match(/tvg-logo="(.*?)"/) || [])[1] || "";
          currentGroup = (line.match(/group-title="(.*?)"/) || [])[1] || "";
        } else if (line.startsWith("http")) {
          const thumbnail = currentLogo || (await getTMDBThumbnail(currentTitle)) || "";
          const video = await Video.create({
            title: currentTitle,
            url: line,
            tipo: "canal",
            group: currentGroup,
            thumbnail,
          });
          entries.push({
            id: video._id,
            title: video.title,
            thumbnail: video.thumbnail,
            url: video.url,
            group: video.group,
            tipo: video.tipo,
          });
        }
      }

      fs.unlinkSync(req.file.path);
      res.json({ message: "Archivo M3U procesado", entries });
    } catch (error) {
      console.error("Error procesando M3U:", error);
      res.status(500).json({ error: "Error al procesar M3U" });
    }
  }
);

/*
 * 2. Subir video manual (VOD) con enlace externo
 */
router.post("/upload-link", verifyToken, isAdmin, async (req, res) => {
  try {
    const { title, url, tipo = "pelicula", thumbnail = "", group = "" } = req.body;
    if (!title || !url) return res.status(400).json({ error: "Faltan datos" });

    const autoThumb = thumbnail || (await getTMDBThumbnail(title)) || "";
    const video = await Video.create({ title, url, tipo, group, thumbnail: autoThumb });

    res.json({
      message: "Video VOD guardado correctamente",
      video: {
        id: video._id,
        title: video.title,
        thumbnail: video.thumbnail,
        url: video.url,
        tipo: video.tipo,
        group: video.group,
      },
    });
  } catch (error) {
    console.error("Error guardando VOD:", error);
    res.status(500).json({ error: "Error al guardar video VOD" });
  }
});

/*
 * 3. Listar todos los videos (VOD y canales)
 */
router.get("/", verifyToken, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    const data = videos.map(v => ({
      id: v._id,
      title: v.title,
      thumbnail: v.thumbnail || "",
      url: v.url,
      tipo: v.tipo,
      group: v.group || "",
    }));
    res.json(data);
  } catch (error) {
    console.error("Error al listar videos:", error);
    res.status(500).json({ error: "Error al obtener videos" });
  }
});

export default router;
