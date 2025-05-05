// routes/m3u.routes.js
import express from "express";
import { createM3u, getM3uLists } from "../controllers/m3u.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

router.post("/", verifyToken, createM3u);
router.get("/", verifyToken, getM3uLists);

export default router;