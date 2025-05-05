import m3uRoutes from "./routes/m3u.routes.js";
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import { verifyToken } from "./middlewares/verifyToken.js";
import videosRoutes from "./routes/videos.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminContentRoutes from "./routes/adminContent.routes.js";

dotenv.config();

const app = express(); // 🔥 ESTA LÍNEA DEBE IR ANTES de usar `app.use(...)`

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas API
app.get("/", (req, res) => {
  res.send("Servidor backend IPTV activo 🚀");
});

app.use("/api/auth", (req, res, next) => {
  console.log("↪️ Auth route hit:", req.method, req.originalUrl);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/m3u", m3uRoutes);
app.use("/api/admin-content", adminContentRoutes); // ✅ Ahora sí está en el lugar correcto

// Conexión a MongoDB
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB conectado");
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Error al conectar MongoDB:", err);
  });
