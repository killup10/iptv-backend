import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";

const router = express.Router();

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Endpoint para subir un archivo M3U
router.post("/upload-m3u", verifyToken, upload.single("file"), async (req, res) => {
  const entries = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream });

  let currentTitle = '';
  let currentLogo = '';
  let currentGroup = '';

  for await (const line of rl) {
    if (line.startsWith('#EXTINF')) {
      const titleMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo="(.*?)"/);
      const groupMatch = line.match(/group-title="(.*?)"/);

      currentTitle = titleMatch ? titleMatch[1] : 'Sin título';
      currentLogo = logoMatch ? logoMatch[1] : '';
      currentGroup = groupMatch ? groupMatch[1] : '';
    } else if (line.startsWith('http')) {
      const video = new Video({
        title: currentTitle,
        logo: currentLogo,
        group: currentGroup,
        url: line,
      });
      await video.save();
      entries.push(video);
    }
  }

  fs.unlinkSync(req.file.path);
  res.json({ entries });
});

// Endpoint para listar todos los videos
router.get("/", verifyToken, async (req, res) => {
  const videos = await Video.find().sort({ createdAt: -1 });
  res.json(videos);
});

// Endpoint de catálogo ejemplo
router.get("/catalogo", (req, res) => {
  const contenidoEjemplo = [
    {
      _id: "1",
      titulo: "Película 4K en Dropbox",
      tipo: "pelicula",
      thumbnail: "https://via.placeholder.com/300x150.png?text=4K+Movie",
      videoUrl: "https://www.dropbox.com/s/XXXXXX/tu-pelicula.mp4?raw=1",
    },
    {
      _id: "2",
      titulo: "Canales IPTV",
      tipo: "m3u",
      thumbnail: "https://via.placeholder.com/300x150.png?text=IPTV",
      videoUrl: "https://www.dropbox.com/s/XXXXXX/lista.m3u?raw=1",
    },
  ];
  res.json(contenidoEjemplo);
});

export default router;
