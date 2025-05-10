import Video from "../models/video.model.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

export const getVideos = async (req, res) => {
  try {
    const videos = await Video.find();
    res.json(videos);
  } catch (error) {
    console.error("Error al obtener videos:", error);
    res.status(500).json({ error: "Error al obtener videos" });
  }
};

export const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: "Video no encontrado" });
    }
    res.json(video);
  } catch (error) {
    console.error("Error al obtener video:", error);
    res.status(500).json({ error: "Error al obtener video" });
  }
};

export const createVideo = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      url,
      thumbnail,
      tipo,
      customThumbnail
    } = req.body;

    if (!titulo || !url) {
      return res.status(400).json({ error: "Título y URL son obligatorios" });
    }

    let playableUrl = url;

    if (url.includes("dropbox.com/s/") && !url.includes("dl.dropboxusercontent.com")) {
      playableUrl = url.replace("www.dropbox.com/s/", "dl.dropboxusercontent.com/s/");
    }

    if (playableUrl.includes("dropbox") && !playableUrl.includes("raw=1")) {
      playableUrl = playableUrl.includes("?")
        ? playableUrl + "&raw=1"
        : playableUrl + "?raw=1";
    }

    let finalThumbnail = thumbnail;
if (!thumbnail) {
  finalThumbnail = await getTMDBThumbnail(titulo);
}

const newVideo = new Video({
  titulo,
  descripcion: descripcion || "",
  url: playableUrl,
  thumbnail: finalThumbnail || "https://via.placeholder.com/300x170?text=Video",
  tipo: tipo || "movie",
  usuario: req.user?.id,
});

    const savedVideo = await newVideo.save();
    res.status(201).json({ video: savedVideo });
  } catch (error) {
    console.error("Error al crear video:", error);
    res.status(500).json({ error: "Error al crear video" });
  }
};

export const deleteVideo = async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) {
      return res.status(404).json({ error: "Video no encontrado" });
    }
    res.json({ message: "Video eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar video:", error);
    res.status(500).json({ error: "Error al eliminar video" });
  }
};
