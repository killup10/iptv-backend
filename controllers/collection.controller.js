// iptv-backend/controllers/collection.controller.js
import Collection from '../models/Collection.js';
import mongoose from 'mongoose';

/**
 * @desc Create a new collection
 * @route POST /api/collections
 * @access Private/Admin
 */
export const createCollection = async (req, res, next) => {
  const { name, itemsModel } = req.body;
  const createdBy = req.user.id; // Assuming user ID is available in req.user

  if (!name || !itemsModel) {
    return res.status(400).json({ error: 'Name and itemsModel are required.' });
  }

  try {
    const collection = await Collection.create({
      name,
      itemsModel,
      createdBy,
    });
    res.status(201).json(collection);
  } catch (error) {
    console.error("Error in CTRL:createCollection:", error.message);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A collection with this name already exists.' });
    }
    next(error);
  }
};

/**
 * @desc Get all collections
 * @route GET /api/collections
 * @access Public
 */
export const getCollections = async (req, res, next) => {
  try {
    const collections = await Collection.find().populate('items').sort({ createdAt: -1 });
    res.json(collections);
  } catch (error) {
    console.error("Error in CTRL:getCollections:", error.message);
    next(error);
  }
};

/**
 * @desc Add items to a collection
 * @route PUT /api/collections/:id/items
 * @access Private/Admin
 */
export const addItemsToCollection = async (req, res, next) => {
  const { id } = req.params;
  const { items } = req.body; // Expecting an array of item IDs

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid collection ID.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items must be a non-empty array.' });
  }

  try {
    const collection = await Collection.findById(id);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found.' });
    }

    // Add only items that are not already in the collection
    const itemsToAdd = items.filter(item => !collection.items.includes(item));
    
    collection.items.push(...itemsToAdd);
    await collection.save();
    
    res.json(collection);
  } catch (error) {
    console.error("Error in CTRL:addItemsToCollection:", error.message);
    next(error);
  }
};

/**
 * @desc Remove items from a collection
 * @route DELETE /api/collections/:id/items
 * @access Private/Admin
 */
export const removeItemsFromCollection = async (req, res, next) => {
    const { id } = req.params;
    const { items } = req.body; // Expecting an array of item IDs
  
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }
  
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items must be a non-empty array.' });
    }
  
    try {
      const collection = await Collection.findById(id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found.' });
      }
  
      collection.items = collection.items.filter(item => !items.includes(item.toString()));
      await collection.save();
      
      res.json(collection);
    } catch (error) {
      console.error("Error in CTRL:removeItemsFromCollection:", error.message);
      next(error);
    }
};


/**
 * @desc Delete a collection
 * @route DELETE /api/collections/:id
 * @access Private/Admin
 */
export const deleteCollection = async (req, res, next) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    try {
        const collection = await Collection.findByIdAndDelete(id);

        if (!collection) {
            return res.status(404).json({ error: 'Collection not found.' });
        }

        res.json({ message: 'Collection deleted successfully.' });
    } catch (error) {
        console.error("Error in CTRL:deleteCollection:", error.message);
        next(error);
    }
};
