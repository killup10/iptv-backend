#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import Video from '../models/Video.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/teamg';

// Tu función para calcular el rating (sin cambios)
function computeRating(rawObj) {
  const v = rawObj;
  const candidates = {
    tmdb: typeof v.tmdbRating === 'number' ? v.tmdbRating : null,
    rating: v.rating ?? null,
    vote_average: v.vote_average ?? null,
    ranking: v.ranking ?? null,
    rankingLabel: v.rankingLabel ?? null,
    ratingText: v.ratingText ?? null,
    displayRating: v.displayRating ?? null,
    rating_tmdb: v.rating_tmdb ?? null,
  };

  const textual = [candidates.rankingLabel, candidates.ratingText, candidates.displayRating].find(x => typeof x === 'string' && x && x.trim() !== '' && x.toLowerCase() !== 'null');
  if (textual) return { display: String(textual).trim(), label: String(textual).trim() };

  const numeric = candidates.tmdb ?? candidates.rating ?? candidates.vote_average ?? candidates.ranking ?? candidates.rating_tmdb;
  if (numeric !== undefined && numeric !== null && numeric !== '') {
    const num = Number(numeric);
    if (!Number.isNaN(num)) return { display: Number(num).toFixed(1), label: null };
    if (!isNaN(Number(String(numeric)))) return { display: Number(String(numeric)).toFixed(1), label: null };
  }
  return { display: null, label: null };
}

async function run() {
  console.log('Connecting to', uri.startsWith('mongodb+srv') ? 'MongoDB Atlas' : uri);
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  const BATCH_SIZE = 200;
  let totalUpdated = 0;
  let totalMarked = 0;
  let keepProcessing = true;
  let batchNum = 1;

  console.log(`Starting update process in batches of ${BATCH_SIZE}...`);

  while (keepProcessing) {
    console.log(`\n--- Processing Batch #${batchNum} ---`);
    
    const candidates = await Video.find({
      $or: [
        { ratingDisplay: { $exists: false } },
        { ratingDisplay: { $eq: '' } } // Buscamos solo los que no hemos tocado
      ]
    }).lean().limit(BATCH_SIZE);

    if (candidates.length === 0) {
      console.log("No more documents to update. Finishing process.");
      keepProcessing = false;
      continue;
    }

    console.log(`Found ${candidates.length} documents in this batch.`);
    let batchUpdatedCount = 0;

    for (const c of candidates) {
      const rd = computeRating(c);
      
      // *** CAMBIO CLAVE AQUÍ ***
      if (rd && (rd.display !== null || rd.label !== null)) {
        // Si encontramos rating, lo actualizamos
        const toSet = {};
        if (rd.display !== null) toSet.ratingDisplay = rd.display;
        if (rd.label !== null) toSet.ratingLabel = rd.label;
        const res = await Video.updateOne({ _id: c._id }, { $set: toSet });
        if (res.modifiedCount > 0) {
          batchUpdatedCount++;
        }
      } else {
        // Si NO encontramos rating, marcamos el campo como null para no volver a buscarlo
        await Video.updateOne({ _id: c._id }, { $set: { ratingDisplay: null } });
        totalMarked++;
      }
    }

    console.log(`Updated ${batchUpdatedCount} documents in this batch.`);
    totalUpdated += batchUpdatedCount;
    batchNum++;

    if (candidates.length < BATCH_SIZE) {
      keepProcessing = false;
    }
  }

  console.log(`\n🎉 --- UPDATE COMPLETE --- 🎉`);
  console.log(`Total documents updated with a rating: ${totalUpdated}`);
  console.log(`Total documents marked as 'no rating available': ${totalMarked}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error('Error:', err); process.exit(1); });