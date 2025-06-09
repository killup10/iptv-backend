import fs from "fs";
import Video from "../models/Video.js";

export const uploadM3U = async (req, res) => {
  try {
    const { section = "pelicula", subcategoria } = req.body;
    const file = req.file || req.files?.file;

    if (!file) {
      return res.status(400).json({ error: "Archivo M3U no proporcionado." });
    }

    const rawData = file.buffer?.toString("utf-8") || fs.readFileSync(file.path, "utf-8");
    const lines = rawData.split(/\r?\n/);

    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("#EXTINF")) {
        const nextLine = lines[i + 1] || "";
        if (nextLine.startsWith("http")) {
          const title = line.split(",").pop().trim();
          const url = nextLine.trim();
          entries.push({ title, url });
        }
      }
    }

    let added = 0;
    let duplicates = 0;

    for (const entry of entries) {
      const exists = await Video.findOne({ title: entry.title });
      if (exists) {
        duplicates++;
        continue;
      }

      const newVideo = new Video({
        title: entry.title,
        url: entry.url,
        tipo: section,
        subtipo: section === "serie" ? "serie" : undefined,
        subcategoria: section === "serie" ? subcategoria : undefined,
        description: "Importado desde archivo M3U",
        logo: "",
        isFeatured: false,
        active: true,
        chapters: section !== "pelicula" ? [] : undefined
      });
      await newVideo.save();
      added++;
    }

    return res.json({ message: "Archivo procesado.", added, duplicates });
  } catch (error) {
    console.error("Error al procesar archivo M3U:", error);
    return res.status(500).json({ error: "Error procesando el archivo M3U." });
  }
};
