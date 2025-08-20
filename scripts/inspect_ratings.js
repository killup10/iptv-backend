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

async function run() {
  console.log('Connecting to', uri.startsWith('mongodb+srv') ? 'MongoDB Atlas' : uri);
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  const videos = await Video.find({}).limit(20).lean();
  console.log(`Found ${videos.length} videos (sample):`);
  for (const v of videos) {
    console.log(`- _id=${v._id} title="${v.title || v.name || ''}" tmdbRating=${v.tmdbRating} rating=${v.rating} vote_average=${v.vote_average} ranking=${v.ranking} rankingLabel=${v.rankingLabel} ratingText=${v.ratingText} rating_tmdb=${v.rating_tmdb} ratingDisplay=${v.ratingDisplay} releaseYear=${v.releaseYear}`);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
