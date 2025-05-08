// src/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js"; // 👈 Importa la función

const router = express.Router();

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/* ---------------------- 1. SUBIR ARCHIVO .M3U ----------------------- */
router.post("/upload-m3u", verifyToken, upload.single("file"), async (req, res) => {
  const entries = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream });

  let currentTitle = "";
  let currentLogo = "";
  let currentGroup = "";

  for await (const line of rl) {
    if (line.startsWith("#EXTINF")) {
      const titleMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo="(.*?)"/);
      const groupMatch = line.match(/group-title="(.*?)"/);

      currentTitle = titleMatch ? titleMatch[1] : "Sin título";
      currentLogo = logoMatch ? logoMatch[1] : "";
      currentGroup = groupMatch ? groupMatch[1] : "";
    } else if (line.startsWith("http")) {
      // Si el M3U trae logo úsalo, si no busca en TMDB
      const thumbnail = currentLogo || (await getTMDBThumbnail(currentTitle));
      const video = new Video({
        title: currentTitle,
        logo: thumbnail,
        group: currentGroup,
        url: line,
        tipo: "canal",
      });
      await video.save();
      entries.push(video);
    }
  }

  // Borra el archivo subido del servidor
  fs.unlinkSync(req.file.path);
  res.json({ message: "Archivo M3U procesado", entries });
});

/* -------------------- 2. SUBIR VIDEO MANUAL (DROPBOX, etc) ------------------ */
router.post("/upload-link", verifyToken, async (req, res) => {
  const { title, url, tipo = "pelicula", thumbnail = "", group = "" } = req.body;
  if (!title || !url) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  // Si no nos mandaron thumbnail, lo obtenemos de TMDB
  const autoThumbnail = thumbnail || (await getTMDBThumbnail(title));
  const video = new Video({
    title,
    url,
    tipo,
    thumbnail: autoThumbnail,
    group,
  });

  await video.save();
  res.json({ message: "Video VOD guardado correctamente", video });
});

/* -------------------------- 3. LISTAR VIDEOS -------------------------- */
router.get("/", verifyToken, async (req, res) => {
  const videos = await Video.find().sort({ createdAt: -1 });
  res.json(videos);
});

export default router;
