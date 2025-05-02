import Video from "../models/Video.js";

export const listVideos = async (req, res) => {
  const videos = await Video.find().sort({ createdAt: -1 });
  res.json({ videos });
};

export const uploadVideo = async (req, res) => {
  const { title, url } = req.body;
  if (!title || !url) return res.status(400).json({ error: "Faltan datos" });
  const video = await new Video({ title, url }).save();
  res.json({ video });
};
