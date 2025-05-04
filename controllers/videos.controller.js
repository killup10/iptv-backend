import Video from "../models/Video.js";

export const listVideos = async (req, res) => {
  const videos = await Video.find().sort({ createdAt: -1 });

  const mapped = videos.map(video => ({
    _id: video._id,
    titulo: video.title,
    tipo: "vod",
    thumbnail: video.logo || "https://via.placeholder.com/300x150.png?text=Video",
    videoUrl: video.url
  }));

  res.json(mapped);
};