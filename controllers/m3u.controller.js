import fs from "fs";
import Video from "../models/Video.js";

export const uploadM3U = async (req, res) => {
  try {
    const { section = "pelicula" } = req.body;
    const file = req.file || req.files?.file;

    if (!file) {
      return res.status(400).json({ error: "Archivo M3U no proporcionado." });
    }

    const rawData = file.buffer.toString("utf-8");
    const lines = rawData.split(/\r?\n/);

    const entries = [];
    let currentEntry = {};

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#EXTINF:')) {
        if (currentEntry.title && currentEntry.url) {
          if (!currentEntry.group) currentEntry.group = 'General';
          entries.push(currentEntry);
        }
        currentEntry = { title: trimmedLine.split(',').pop().trim() };
      } else if (trimmedLine.startsWith('#EXTGRP:')) {
        if (currentEntry.title) {
          currentEntry.group = trimmedLine.substring(8).trim();
        }
      } else if (trimmedLine && !trimmedLine.startsWith('#')) {
        if (currentEntry.title) {
          currentEntry.url = trimmedLine;
          if (!currentEntry.group) currentEntry.group = 'General';
          entries.push(currentEntry);
          currentEntry = {};
        }
      }
    }
    if (currentEntry.title && currentEntry.url) {
      if (!currentEntry.group) currentEntry.group = 'General';
      entries.push(currentEntry);
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

    const contentGroups = {};
    entries.forEach(entry => {
      const groupTitle = entry.group;
      if (!contentGroups[groupTitle]) {
        contentGroups[groupTitle] = [];
      }
      contentGroups[groupTitle].push(entry);
    });

    let contentAdded = 0;
    let episodesAdded = 0;

    for (const groupTitle in contentGroups) {
      let video = await Video.findOne({ title: groupTitle, tipo: section });
      let isNewContent = false;

      if (!video) {
        video = new Video({
          title: groupTitle,
          tipo: section,
          subtipo: section,
          requiresPlan: section === 'pelicula' ? ["estandar"] : ["cinefilo", "premium"],
          description: `Contenido '${groupTitle}' importado desde M3U.`,
          active: true,
          seasons: [],
        });
        isNewContent = true;
      }

      for (const episode of contentGroups[groupTitle]) {
        const seasonMatch = episode.title.match(/S(\d{1,2})E(\d{1,3})/i);
        let seasonNumber, episodeNumber;

        if (seasonMatch) {
          seasonNumber = parseInt(seasonMatch[1], 10);
          episodeNumber = parseInt(seasonMatch[2], 10);
        } else {
          const epMatch = episode.title.match(/(?:EP|E)(\d+)/i);
          seasonNumber = 1;
          episodeNumber = epMatch ? parseInt(epMatch[1], 10) : undefined;
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
            episodeNumber: episodeNumber,
            duration: "0:00",
            description: "",
          });
          episodesAdded++;
        }
      }
      
      video.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
      video.seasons.forEach(s => s.chapters.sort((a, b) => a.episodeNumber - b.episodeNumber));

      if (isNewContent) contentAdded++;
      await video.save();
    }

    return res.json({ message: `Contenido (${section}) procesado.`, contentAdded, episodesAdded });

  } catch (error) {
    console.error("Error al procesar archivo M3U:", error);
    return res.status(500).json({ error: "Error procesando el archivo M3U." });
  }
};
