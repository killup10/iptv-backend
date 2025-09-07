// iptv-backend/routes/collection.routes.js
import express from "express";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import {
  createCollection,
  getCollections,
  addItemsToCollection,
  removeItemsFromCollection,
  deleteCollection
} from "../controllers/collection.controller.js";

const router = express.Router();

// Public route to get all collections
router.get("/collections", getCollections);

// Admin routes
router.post("/collections", verifyToken, isAdmin, createCollection);
router.put("/collections/:id/items", verifyToken, isAdmin, addItemsToCollection);
router.delete("/collections/:id/items", verifyToken, isAdmin, removeItemsFromCollection);
router.delete("/collections/:id", verifyToken, isAdmin, deleteCollection);

export default router;
