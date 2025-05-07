// utils/getTMDBThumbnail.js
import fetch from 'node-fetch';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

export default async function getTMDBThumbnail(title) {
  if (!TMDB_API_KEY) {
    console.warn("⚠️ No hay TMDB_API_KEY definida en .env");
    return "";
  }

  try {
    const query = encodeURIComponent(title);
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${query}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data?.results?.length) {
      const item = data.results[0];
      return `https://image.tmdb.org/t/p/w500${item.poster_path || item.backdrop_path || ''}`;
    }
  } catch (err) {
    console.error("Error al buscar en TMDB:", err);
  }

  return "";
}
