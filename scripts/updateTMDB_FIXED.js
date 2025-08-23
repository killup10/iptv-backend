#!/usr/bin/env node
import axios from 'axios';
import mongoose from 'mongoose';
import Video from '../models/Video.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function searchTMDB(title) {
  if (!TMDB_API_KEY) return null;
  try {
    const q = encodeURIComponent(title);
    const url = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${q}&language=es-ES`;
    const res = await axios.get(url, { timeout: 15000 });
    const data = res.data;
    if (data?.results?.length) {
      const validItem = data.results.find(it => (it.media_type === 'movie' || it.media_type === 'tv') && (it.poster_path || it.backdrop_path));
      return validItem || null;
    }
    return null;
  } catch (err) {
    console.warn(`TMDB search failed for '${title}':`, err.message);
    return null;
  }
}

async function main() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGO_URI not found in .env');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not set in .env');

    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(mongoUri, { connectTimeoutMS: 10000 });
    console.log('Connected to MongoDB');

    const BATCH_SIZE = 50;
    let keepProcessing = true;
    let totalProcessed = 0;
    let batchNum = 1;

    while(keepProcessing) {
        console.log(`\n--- Processing Batch #${batchNum} ---`);
        const videosToUpdate = await Video.find({
            $or: [
                { tmdbRating: { $exists: false } },
                { tmdbRating: null },
                { tmdbRating: '' },
                { tmdbThumbnail: { $exists: false } },
                { tmdbThumbnail: null },
                { tmdbThumbnail: '' },
            ]
        }).limit(BATCH_SIZE);

        if (videosToUpdate.length === 0) {
            console.log("No more videos to update. Process complete.");
            keepProcessing = false;
            continue;
        }

        console.log(`Found ${videosToUpdate.length} videos in this batch to process.`);

        for (const video of videosToUpdate) {
            const title = video.title || video.name || '';
            const updates = {};

            if (title) {
                console.log(`- Searching TMDB for: ${title}`);
                const tmdbData = await searchTMDB(title);
                
                // *** LÓGICA CORREGIDA PARA ROMPER EL BUCLE ***
                if (tmdbData) {
                    // Si se encuentra, se asigna el puntaje (o null si no viene)
                    updates.tmdbRating = tmdbData.vote_average ?? null;
                    // Y se asigna la carátula (o null si no viene)
                    updates.tmdbThumbnail = tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : null;
                } else {
                    // Si no se encuentra en TMDB, se marcan ambos campos como null para no volver a buscarlo.
                    updates.tmdbRating = null;
                    updates.tmdbThumbnail = null;
                }
            } else {
                // Si no tiene título, se marcan ambos campos como null.
                updates.tmdbRating = null;
                updates.tmdbThumbnail = null;
            }
            
            await Video.updateOne({ _id: video._id }, { $set: updates });
            totalProcessed++;
            console.log(`  -> Processed _id=${video._id} title='${title}'`);
            
            await new Promise(r => setTimeout(r, 400));
        }
        batchNum++;
    }

    console.log(`\n🎉 --- TMDB UPDATE COMPLETE --- 🎉`);
    console.log(`Total videos processed: ${totalProcessed}`);

  } catch (err) {
    console.error('Error in updateTMDB_FIXED:', err.message);
  } finally {
    try { await mongoose.disconnect(); } catch (e) {}
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });