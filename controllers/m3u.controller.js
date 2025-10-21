import fs from "fs";
import Video from "../models/Video.js";

export const uploadM3U = async (req, res) => {
  try {
    const { section = "pelicula" } = req.body;
    const file = req.file || req.files?.file;

    if (!file) {
      return res.status(400).json({ error: "Archivo M3U no proporcionado." });
    }

    const rawData = file.buffer?.toString("utf-8") || fs.readFileSync(file.path, "utf-8");
    const lines = rawData.split(/\r?\n/);

    const entries = [];
    let currentGroup = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith("#EXTGRP:")) {
        currentGroup = line.substring(8).trim();
      } else if (line.startsWith("#EXTINF:")) {
        const title = line.split(",").pop().trim();
        // Find the next non-empty line for the URL
        let url = "";
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim()) {
                url = lines[j].trim();
                i = j; // Move the outer loop cursor forward
                break;
            }
        }

        if (url && url.startsWith("http")) {
          entries.push({ title, url, group: currentGroup });
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

      const subcategoria = entry.group;
      let tipoFinal = section;
      let subtipoFinal = section;
      let planFinal = [];

      if (section === "pelicula") {
        planFinal = ["estandar"];
      } else {
        planFinal = ["cinefilo", "premium"];
      }

      if (section === "serie" && subcategoria) {
        if (subcategoria.toLowerCase() === "anime") {
          tipoFinal = "anime";
          subtipoFinal = "anime";
        }
      }

      const newVideo = new Video({
        title: entry.title,
        url: entry.url,
        tipo: tipoFinal,
        subtipo: section !== "pelicula" ? subtipoFinal : undefined,
        subcategoria: (section !== "pelicula" && tipoFinal !== "anime") ? subcategoria : undefined,
        requiresPlan: planFinal,
        description: "Importado desde archivo M3U",
        logo: "",
        isFeatured: false,
        active: true,
        seasons: section !== "pelicula" ? [] : undefined
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
