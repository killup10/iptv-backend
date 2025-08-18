#!/usr/bin/env node
/*
  Script seguro para restaurar imágenes en la colección `videos`.
  - Copia `thumbnail` -> `logo` si `logo` está vacío.
  - Si `tmdbThumbnail` está vacío y existe `thumbnail`, copia también ahí.
  - También llena `customThumbnail` si existe y los otros están vacíos.

  USO:
    node scripts/restore_thumbnails.js

  Nota: Asegúrate de que tu variable de entorno MONGODB_URI esté disponible
  (o ajusta la URI en este archivo si usas otra configuración local).
*/
import mongoose from 'mongoose';
import Video from '../models/Video.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/teamg';

// CLI options
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run') || argv.includes('-n');
let limitArg = argv.find(a => a.startsWith('--limit='));
if (!limitArg) limitArg = argv.find((_, i) => argv[i-1] === '--limit');
let limit = limitArg ? parseInt(limitArg.split('=')[1] || argv[argv.indexOf(limitArg)+1], 10) : 0;
if (Number.isNaN(limit)) limit = 0;

async function main() {
  console.log('restore_thumbnails: Conectando a la DB...');
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('restore_thumbnails: Conectado. Buscando videos con logos vacíos...');

  // Buscar videos donde logo, customThumbnail y tmdbThumbnail están vacíos pero existe thumbnail
  const query = {
    $or: [
      { logo: { $in: [null, ''] } },
      { customThumbnail: { $in: [null, ''] } },
      { tmdbThumbnail: { $in: [null, ''] } }
    ],
    thumbnail: { $nin: [null, ''] }
  };

  let finder = Video.find(query);
  if (limit && limit > 0) finder = finder.limit(limit);
  const cursor = finder.cursor();

  let updated = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const updates = {};
    try {
      if ((!doc.logo || doc.logo === '') && doc.thumbnail) {
        updates.logo = doc.thumbnail;
      }
      if ((!doc.tmdbThumbnail || doc.tmdbThumbnail === '') && doc.thumbnail) {
        updates.tmdbThumbnail = doc.thumbnail;
      }
      if ((!doc.customThumbnail || doc.customThumbnail === '') && doc.thumbnail) {
        // Only set customThumbnail if logo/tmdb are not used to avoid duplicates
        updates.customThumbnail = doc.thumbnail;
      }

      if (Object.keys(updates).length > 0) {
        // Detect rating from several possible fields
        const ratingFields = ['tmdbRating', 'tmdb_rating', 'rating', 'vote_average', 'voteAverage', 'rating_tmdb'];
        let rating = null;
        for (const f of ratingFields) {
          if (typeof doc[f] !== 'undefined' && doc[f] !== null && doc[f] !== '') {
            rating = doc[f];
            break;
          }
        }

        if (dryRun) {
          console.log(`[dry-run] Would restore for ${doc._id} -> set: ${Object.keys(updates).join(', ')}${rating != null ? `; rating: ${rating}` : ''}`);
        } else {
          await Video.updateOne({ _id: doc._id }, { $set: updates });
          updated++;
          console.log(`Restored images for ${doc._id} -> set: ${Object.keys(updates).join(', ')}${rating != null ? `; rating: ${rating}` : ''}`);
        }
      }
    } catch (e) {
      console.error('Error actualizando', doc._id, e.message || e);
    }
  }

  console.log(`restore_thumbnails: Completado. Documents updated: ${updated}${dryRun ? ' (dry-run mode)' : ''}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('restore_thumbnails: Error fatal', err);
  process.exit(1);
});
