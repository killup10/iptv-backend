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

function computeRating(rawObj) {
  const v = rawObj;
  const raw = (typeof v.tmdbRating === 'number' ? v.tmdbRating :
    (v.rating ?? v.vote_average ?? v.ranking ?? v.rankingLabel ?? v.ratingText ?? v.displayRating ?? v.rating_tmdb ?? null));
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return Number(raw).toFixed(1);
  if (typeof raw === 'string' && raw.trim() !== '' && raw.toLowerCase() !== 'null') return raw;
  if (!isNaN(Number(raw))) return Number(raw).toFixed(1);
  return null;
}

async function run() {
  console.log('Connecting to', uri.startsWith('mongodb+srv') ? 'MongoDB Atlas' : uri);
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  // Find documents missing ratingDisplay but possibly having rating info
  const candidates = await Video.find({
    $or: [
      { ratingDisplay: { $exists: false } },
      { ratingDisplay: null },
      { ratingDisplay: '' }
    ]
  }).lean().limit(1000);

  console.log(`Found ${candidates.length} documents to inspect.`);
  let updated = 0;
  const examples = [];

  for (const c of candidates) {
    const rd = computeRating(c);
    if (rd !== null) {
      const res = await Video.updateOne({ _id: c._id }, { $set: { ratingDisplay: rd } });
      if (res.modifiedCount && res.modifiedCount > 0) {
        updated++;
        if (examples.length < 10) examples.push({ _id: c._id.toString(), title: c.title || c.name, ratingDisplay: rd });
      }
    }
  }

  console.log(`Updated ${updated} documents with ratingDisplay.`);
  if (examples.length > 0) {
    console.log('Examples of updates:');
    for (const e of examples) console.log('- ', e);
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
