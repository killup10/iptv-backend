import axios from 'axios';
import mongoose from 'mongoose';
import Video from '../models/Video.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Configurar __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false, limit: null };
  for (const a of args) {
    if (a === '--dry-run' || a === '-n') out.dryRun = true;
    const m = a.match(/^--limit=(\d+)$/);
    if (m) out.limit = parseInt(m[1], 10);
  }
  return out;
}

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
  const { dryRun, limit } = parseArgs();
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGO_URI not found in .env');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not set in .env');

    console.log(`updateTMDBInfo_limited - Connecting to MongoDB (${dryRun ? 'dry-run' : 'apply'})`);
    await mongoose.connect(mongoUri, { connectTimeoutMS: 10000 });
    console.log('Connected to MongoDB');

    const query = {
      $or: [
        { tmdbRating: { $exists: false } },
        { tmdbRating: null },
        { tmdbRating: '' }
      ]
    };

    const cursor = Video.find(query).cursor();
    let processed = 0;
    for await (const video of cursor) {
      if (limit && processed >= limit) break;
      processed++;
      const title = video.title || video.name || '';
      if (!title) {
        console.log(`#${processed} - Skipping video without title _id=${video._id}`);
        continue;
      }

      console.log(`#${processed} - Searching TMDB for: ${title}`);
      const tm = await searchTMDB(title);
      if (!tm) {
        console.log(`  -> No TMDB match for '${title}'`);
        continue;
      }

      const rating = tm.vote_average ?? null;
      const posterPath = tm.poster_path ? `https://image.tmdb.org/t/p/w500${tm.poster_path}` : (tm.backdrop_path ? `https://image.tmdb.org/t/p/w500${tm.backdrop_path}` : null);

      const updates = {};
      if ((video.tmdbRating === undefined || video.tmdbRating === null || video.tmdbRating === '') && rating != null) updates.tmdbRating = rating;
      if ((!video.thumbnail || video.thumbnail === '') && posterPath) updates.thumbnail = posterPath;
      if ((!video.tmdbThumbnail || video.tmdbThumbnail === '') && posterPath) updates.tmdbThumbnail = posterPath;

      if (Object.keys(updates).length === 0) {
        console.log(`  -> Nothing to update for '${title}'. rating=${rating}`);
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] Would update _id=${video._id} title='${title}' with:`, updates);
      } else {
        try {
          await Video.updateOne({ _id: video._id }, { $set: updates });
          console.log(`Updated _id=${video._id} title='${title}' with:`, updates);
        } catch (uErr) {
          console.error(`Failed to update _id=${video._id}:`, uErr.message);
        }
      }
      // Be polite with TMDB
      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`Finished processing ${processed} candidate(s).`);
  } catch (err) {
    console.error('Error in updateTMDBInfo_limited:', err.message);
  } finally {
    try { await mongoose.disconnect(); } catch (e) {}
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
