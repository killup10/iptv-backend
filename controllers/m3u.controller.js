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
        let url = "";
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && lines[j].trim().startsWith("http")) {
            url = lines[j].trim();
            i = j;
            break;
          }
        }
        if (url) {
          entries.push({ title, url, group: currentGroup || "General" });
        }
      }
    }

    if (section === "pelicula") {
      let added = 0;
      let duplicates = 0;
      for (const entry of entries) {
        const exists = await Video.findOne({ url: entry.url });
        if (exists) {
          duplicates++;
          continue;
        }
        const newVideo = new Video({
          title: entry.title,
          url: entry.url,
          tipo: "pelicula",
          requiresPlan: ["estandar"],
          description: "Importado desde archivo M3U",
          active: true,
        });
        await newVideo.save();
        added++;
      }
      return res.json({ message: "Películas procesadas.", added, duplicates });
    }

    // Lógica para series
    const series = {};
    entries.forEach(entry => {
      const seriesTitle = entry.group;
      if (!series[seriesTitle]) {
        series[seriesTitle] = [];
      }
      series[seriesTitle].push(entry);
    });

    let seriesAdded = 0;
    let episodesAdded = 0;

    for (const seriesTitle in series) {
      let video = await Video.findOne({ title: seriesTitle, tipo: "serie" });
      let isNewSeries = false;
      if (!video) {
        video = new Video({
          title: seriesTitle,
          tipo: "serie",
          subtipo: "serie",
          requiresPlan: ["cinefilo", "premium"],
          description: `Serie ${seriesTitle} importada desde M3U.`,
          active: true,
          seasons: [],
        });
        isNewSeries = true;
      }

      for (const episode of series[seriesTitle]) {
        const seasonMatch = episode.title.match(/S(\d{1,2})E(\d{1,3})/i);
        let seasonNumber, episodeNumber;

        if (seasonMatch) {
          seasonNumber = parseInt(seasonMatch[1], 10);
          episodeNumber = parseInt(seasonMatch[2], 10);
        } else {
          const epMatch = episode.title.match(/EP(\d+)/i);
          seasonNumber = 1;
          episodeNumber = epMatch ? parseInt(epMatch[1], 10) : video.seasons.reduce((acc, s) => acc + s.chapters.length, 1) + 1;
        }

        let season = video.seasons.find(s => s.seasonNumber === seasonNumber);
        if (!season) {
          season = { seasonNumber, title: `Temporada ${seasonNumber}`, chapters: [] };
          video.seasons.push(season);
        }

        const chapterExists = season.chapters.some(c => c.url === episode.url || c.title.trim().toLowerCase() === episode.title.trim().toLowerCase());
        if (!chapterExists) {
          season.chapters.push({
            title: episode.title,
            url: episode.url,
            duration: "0:00",
            description: "",
          });
          episodesAdded++;
        }
      }
      
      if (isNewSeries) seriesAdded++;
      await video.save();
    }

    return res.json({ message: "Series procesadas.", seriesAdded, episodesAdded });

  } catch (error) {
    console.error("Error al procesar archivo M3U:", error);
    return res.status(500).json({ error: "Error procesando el archivo M3U." });
  }
};
