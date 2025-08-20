#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Video from '../models/Video.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node set_tmdb_for_id.js <videoId> [rating]');
    process.exit(2);
  }
  const [id, ratingArg] = args;
  const rating = ratingArg !== undefined ? Number(ratingArg) : 7.5;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/teamg';
  console.log(`Connecting to MongoDB: ${uri}`);
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    const video = await Video.findById(id).lean();
    if (!video) {
      console.error('Video not found:', id);
      process.exit(1);
    }
    console.log('Before update:', { _id: video._id, title: video.title, tmdbRating: video.tmdbRating });
    const res = await Video.updateOne({ _id: id }, { $set: { tmdbRating: rating } });
    console.log('Update result:', res);
    const after = await Video.findById(id).lean();
    console.log('After update:', { _id: after._id, title: after.title, tmdbRating: after.tmdbRating });
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
