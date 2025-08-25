// iptv-backend/routes/channels.routes.js
import express from "express";
import multer from "multer";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import {
    getPublicChannels,
    getChannelByIdForUser,
    getChannelFilterSections, // Para los botones de filtro
    getAllChannelsAdmin,
    createChannelAdmin,
    updateChannelAdmin,
    deleteChannelAdmin,
    processM3UAdmin
} from "../controllers/channel.controller.js";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/octet-stream",
      "audio/mpegurl",
      "application/vnd.apple.mpegurl",
      "application/x-mpegURL",
      "text/plain"
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.m3u') || file.originalname.endsWith('.m3u8')) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de archivo no permitido. Solo .m3u o .m3u8."), false);
    }
  },
});

// --- RUTAS PARA USUARIOS ---
router.get("/list", getPublicChannels); 
router.get("/id/:id", verifyToken, getChannelByIdForUser);
router.get("/sections", getChannelFilterSections); // Para los botones de filtro

// --- RUTAS SOLO PARA ADMINISTRADORES ---
router.get("/admin/list", verifyToken, isAdmin, getAllChannelsAdmin);
router.post("/admin", verifyToken, isAdmin, createChannelAdmin);
router.put("/admin/:id", verifyToken, isAdmin, updateChannelAdmin);
router.delete("/admin/:id", verifyToken, isAdmin, deleteChannelAdmin);
router.post("/admin/process-m3u", verifyToken, isAdmin, upload.single('m3uFile'), processM3UAdmin);

export default router;