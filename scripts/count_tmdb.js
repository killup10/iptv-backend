#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Video from '../models/Video.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/teamg';

async function run() {
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  const total = await Video.countDocuments();
  const withTmdb = await Video.countDocuments({ tmdbRating: { $exists: true, $ne: null } });
  const withPositive = await Video.countDocuments({ tmdbRating: { $gt: 0 } });
  console.log(`Total videos: ${total}`);
  console.log(`With tmdbRating (exists & not null): ${withTmdb}`);
  console.log(`With tmdbRating > 0: ${withPositive}`);
  // Show a few sample docs
  const samples = await Video.find({ tmdbRating: { $exists: true, $ne: null } }).limit(10).select('title tmdbRating tmdbThumbnail').lean();
  console.log('Samples:');
  samples.forEach(s => console.log(`- ${s._id} "${s.title || ''}" -> ${s.tmdbRating} ${s.tmdbThumbnail ? 'thumb' : ''}`));
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
