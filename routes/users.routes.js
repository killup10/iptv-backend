// routes/users.routes.js
import express from "express";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import User from "../models/User.js";

const router = express.Router();

// Agregar item a Mi Lista
router.post("/my-list/add", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId, tipo, title, thumbnail, description } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: "itemId is required" });
    }

    console.log(`[MyList] Adding item ${itemId} to user ${userId}'s list`);

    // Buscar el usuario
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Inicializar myList si no existe
    if (!user.myList) {
      user.myList = [];
    }

    // Verificar si el item ya está en la lista
    const itemExists = user.myList.some(item => 
      item.itemId === itemId || item.itemId.toString() === itemId.toString()
    );

    if (itemExists) {
      console.log(`[MyList] Item ${itemId} already in user's list`);
      return res.status(409).json({ message: "Item already in your list" });
    }

    // Agregar item a la lista
    user.myList.push({
      itemId,
      tipo: tipo || 'movie',
      title,
      thumbnail,
      description,
      addedAt: new Date()
    });

    // Guardar usuario
    await user.save();

    console.log(`[MyList] Item ${itemId} added successfully`);
    res.json({ 
      message: "Item added to your list",
      myListCount: user.myList.length 
    });

  } catch (error) {
    console.error("[MyList] Error adding item:", error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener Mi Lista
router.get("/my-list", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`[MyList] Fetching list for user ${userId}`);

    // Buscar el usuario y seleccionar solo la lista
    const user = await User.findById(userId).select("myList");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Obtener IDs de items
    const itemIds = (user.myList || []).map(item => item.itemId);

    if (itemIds.length === 0) {
      console.log(`[MyList] User's list is empty`);
      return res.json({ items: [] });
    }

    // Importar modelo Video dinámicamente
    const { default: Video } = await import("../models/Video.js");

    // Buscar los videos correspondientes
    const videos = await Video.find({ 
      $or: [
        { _id: { $in: itemIds } },
        { id: { $in: itemIds } }
      ]
    }).select("_id id title name thumbnail description tipo itemType rating releaseYear");

    console.log(`[MyList] Found ${videos.length} items in user's list`);

    res.json({ items: videos });

  } catch (error) {
    console.error("[MyList] Error fetching list:", error);
    res.status(500).json({ error: error.message });
  }
});

// Remover item de Mi Lista
router.post("/my-list/remove/:itemId", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    console.log(`[MyList] Removing item ${itemId} from user ${userId}'s list`);

    // Buscar el usuario
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remover el item de la lista
    const initialLength = user.myList ? user.myList.length : 0;
    user.myList = (user.myList || []).filter(item => 
      item.itemId !== itemId && item.itemId.toString() !== itemId.toString()
    );

    if (user.myList.length === initialLength) {
      console.log(`[MyList] Item ${itemId} not found in user's list`);
      return res.status(404).json({ error: "Item not found in your list" });
    }

    // Guardar usuario
    await user.save();

    console.log(`[MyList] Item ${itemId} removed successfully`);
    res.json({ 
      message: "Item removed from your list",
      myListCount: user.myList.length 
    });

  } catch (error) {
    console.error("[MyList] Error removing item:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
