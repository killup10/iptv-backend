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
      const validItem = data.results.find(
        (item) =>
          (item.media_type === "movie" || item.media_type === "tv") &&
          (item.poster_path || item.backdrop_path)
      );

      if (validItem) {
        const path = validItem.poster_path || validItem.backdrop_path;
        return `https://image.tmdb.org/t/p/w780${path}`;
      }
    }
  } catch (err) {
    console.error("Error al buscar en TMDB:", err);
  }

  return "";
}
