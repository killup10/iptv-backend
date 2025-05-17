// iptv-backend/routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import multer from "multer";

const router = express.Router();

// Configuración de Multer para subida de archivos .m3u y .m3u8
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "audio/mpegurl" ||
      file.mimetype === "application/vnd.apple.mpegurl" ||
      file.originalname.endsWith(".m3u") ||
      file.originalname.endsWith(".m3u8")
    ) {
      cb(null, true);
    } else {
      cb(
        new Error("Tipo de archivo no permitido. Solo .m3u o .m3u8."),
        false
      );
    }
  },
});

// Rutas para usuarios
router.get("/list", async (req, res) => {
  try {
    let query = { active: true };
    if (req.query.featured === "true") query.isFeatured = true;
    const channels = await Channel.find(query).sort({ name: 1 });

    const data = channels.map((c) => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "",
      url: c.url,
      category: c.category || "GENERAL",
      description: c.description || "",
      requiresPlan: c.requiresPlan || "gplay",
      isFeatured: c.isFeatured || false,
    }));

    res.json(data);
  } catch (err) {
    console.error("Error al obtener canales (/list):", err);
    res.status(500).json({ error: "Error al obtener canales" });
  }
});

router.get("/id/:id", verifyToken, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel)
      return res.status(404).json({ error: "Canal no encontrado" });

    const userPlan = req.user?.plan || "gplay";
    const userRole = req.user?.role;
    const planHierarchy = {
      gplay: 1,
      cinefilo: 2,
      sports: 3,
      premium: 4,
    };

    const channelRequired = planHierarchy[channel.requiresPlan] || 0;
    const userLevel = planHierarchy[userPlan] || 0;

    if (!channel.active && userRole !== "admin") {
      return res
        .status(403)
        .json({ error: "Este canal no está activo actualmente." });
    }

    if (userRole !== "admin" && channelRequired > userLevel) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere plan '${channel.requiresPlan}' o superior. Tu plan es '${userPlan}'.`,
      });
    }

    res.json({
      id: channel._id,
      _id: channel._id,
      name: channel.name,
      url: channel.url,
      logo: channel.logo,
      thumbnail: channel.logo,
      category: channel.category,
      description: channel.description || "",
      active: channel.active,
      isFeatured: channel.isFeatured,
      requiresPlan: channel.requiresPlan,
    });
  } catch (error) {
    console.error("Error al obtener canal por ID:", error);
    res.status(500).json({ error: "Error al obtener el canal" });
  }
});

router.get("/main-sections", verifyToken, async (req, res) => {
  try {
    const userPlan = req.user?.plan || "gplay";
    const userRole = req.user?.role;
    const planHierarchy = {
      gplay: 1,
      cinefilo: 2,
      sports: 3,
      premium: 4,
    };
    const currentLevel = planHierarchy[userPlan] || 0;

    const sections = [
      {
        key: "GPLAY_GENERAL",
        displayName: "Canales GPlay",
        requiresPlan: "gplay",
        categoriesIncluded: [
          "GENERAL",
          "NOTICIAS",
          "INFANTILES",
          "VARIADOS",
          "MUSICA",
          "NOTICIAS BASICAS",
          "INFANTILES BASICOS",
          "ENTRETENIMIENTO GENERAL",
        ],
        order: 1,
        thumbnailSample: "/img/sections/gplay_general.jpg",
      },
      {
        key: "CINEFILO_PLUS",
        displayName: "Cinéfilo Plus",
        requiresPlan: "cinefilo",
        categoriesIncluded: ["PELIS", "SERIES", "CULTURA", "DOCUMENTALES"],
        order: 2,
        thumbnailSample: "/img/sections/cinefilo_plus.jpg",
      },
      {
        key: "SPORTS_TOTAL",
        displayName: "Deportes Total",
        requiresPlan: "sports",
        categoriesIncluded: ["DEPORTES", "EVENTOS DEPORTIVOS"],
        order: 5,
        thumbnailSample: "/img/sections/sports_total.jpg",
      },
      {
        key: "PREMIUM_LOCALES",
        displayName: "Canales Locales (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: ["LOCALES"],
        order: 10,
        thumbnailSample: "/img/sections/premium_locales.jpg",
      },
      {
        key: "PREMIUM_NOVELAS",
        displayName: "Novelas (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: ["NOVELAS"],
        order: 11,
        thumbnailSample: "/img/sections/premium_novelas.jpg",
      },
      {
        key: "PREMIUM_VARIADOS_FULL",
        displayName: "Variados Full (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: ["VARIADOS PREMIUM", "ENTRETENIMIENTO VIP"],
        order: 12,
        thumbnailSample: "/img/sections/premium_variados.jpg",
      },
      {
        key: "PREMIUM_CINE_TOTAL",
        displayName: "Cine Total (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: ["PELIS PREMIUM", "ESTRENOS CINE"],
        order: 13,
        thumbnailSample: "/img/sections/premium_pelis.jpg",
      },
      {
        key: "PREMIUM_INFANTILES_PLUS",
        displayName: "Infantiles Plus (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: ["INFANTILES PREMIUM"],
        order: 14,
        thumbnailSample: "/img/sections/premium_infantiles.jpg",
      },
      {
        key: "PREMIUM_DEPORTES_MAX",
        displayName: "Deportes Max (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: [
          "DEPORTES",
          "DEPORTES PREMIUM",
          "EVENTOS DEPORTIVOS",
          "FUTBOL TOTAL",
        ],
        order: 15,
        thumbnailSample: "/img/sections/premium_deportes.jpg",
      },
      {
        key: "PREMIUM_CULTURA_HD",
        displayName: "Cultura y Documentales HD (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: ["CULTURA PREMIUM", "DOCUMENTALES VIP"],
        order: 16,
        thumbnailSample: "/img/sections/premium_cultura.jpg",
      },
      {
        key: "PREMIUM_INFO_GLOBAL",
        displayName: "Informativos Global (Premium)",
        requiresPlan: "premium",
        categoriesIncluded: [
          "NOTICIAS INTERNACIONALES",
          "FINANZAS",
          "INFORMATIVO",
        ],
        order: 17,
        thumbnailSample: "/img/sections/premium_info.jpg",
      },
    ];

    const filteredSections =
      userRole === "admin"
        ? sections
        : sections.filter(
            (s) => planHierarchy[s.requiresPlan] <= currentLevel
          );

    res.json(filteredSections.sort((a, b) => a.order - b.order));
  } catch (err) {
    console.error("Error al obtener secciones principales:", err);
    res.status(500).json({ error: "Error al obtener secciones" });
  }
});

// Rutas admin
router.get("/admin/list", verifyToken, isAdmin, async (req, res) => {
  try {
    const channels = await Channel.find({}).sort({ name: 1 });
    res.json(
      channels.map((c) => ({
        id: c._id,
        _id: c._id,
        name: c.name,
        url: c.url,
        logo: c.logo,
        category: c.category,
        description: c.description,
        active: c.active,
        isFeatured: c.isFeatured,
        requiresPlan: c.requiresPlan,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  } catch (err) {
    console.error("Error al obtener todos los canales:", err);
    res.status(500).json({ error: "Error al obtener canales" });
  }
});

export default router;
