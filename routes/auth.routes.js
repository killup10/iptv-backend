// routes/auth.routes.js
import express from "express";
import { register, login, logout } from "../controllers/auth.controller.js";
import { authenticateToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", authenticateToken, logout);

export default router;
