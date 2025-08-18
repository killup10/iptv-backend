#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Video from '../models/Video.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/teamg';

async function run() {
  console.log('Connecting to', uri.startsWith('mongodb+srv') ? 'MongoDB Atlas' : uri);
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  // Buscar videos donde tmdbRating no existe pero hay alguna otra pista
  const candidates = await Video.find({
    $and: [
      { $or: [{ tmdbRating: { $exists: false } }, { tmdbRating: null }, { tmdbRating: '' }] },
      { $or: [{ rating: { $exists: true, $ne: '' } }, { vote_average: { $exists: true, $ne: '' } }, { rating_tmdb: { $exists: true, $ne: '' } }] }
    ]
  }).limit(50).lean();

  console.log(`Found ${candidates.length} candidate(s) with alternate rating fields and missing tmdbRating:`);
  for (const c of candidates) {
    console.log(`- _id=${c._id} title="${c.title || c.name || ''}" tmdbRating=${c.tmdbRating} rating=${c.rating} vote_average=${c.vote_average} rating_tmdb=${c.rating_tmdb}`);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
