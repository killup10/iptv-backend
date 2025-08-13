import mongoose from "mongoose";
import Video from "../models/Video.js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "iptv-backend/.env") });

const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/your-db-name";

async function removeAnimeSubcategories() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Conectado a la base de datos.");

    // Buscar videos tipo anime o serie con subtipo anime que tengan subcategoria definida
    const filter = {
      $or: [
        { tipo: "anime" },
        { tipo: "serie", subtipo: "anime" }
      ],
      subcategoria: { $exists: true, $ne: null }
    };

    const update = {
      $unset: { subcategoria: "" }
    };

    const result = await Video.updateMany(filter, update);

    console.log(`Se actualizaron ${result.modifiedCount} documentos para eliminar subcategoría.`);

    await mongoose.disconnect();
    console.log("Desconectado de la base de datos.");
  } catch (error) {
    console.error("Error al eliminar subcategorías de animes:", error);
    process.exit(1);
  }
}

removeAnimeSubcategories();
