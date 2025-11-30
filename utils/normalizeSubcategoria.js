/**
 * Normaliza la subcategoría para que coincida con el enum del Schema
 * Convierte "HBO MAX", "hbo max", "HBO max" → "HBO Max"
 * @param {string} subcategoria - Valor de subcategoría a normalizar
 * @returns {string|undefined} - Valor normalizado o undefined si no es válido
 */
export function normalizeSubcategoria(subcategoria) {
  if (!subcategoria) return undefined;
  
  const normalized = subcategoria.toString().trim().toLowerCase();
  
  const validSubcategorias = {
    "netflix": "Netflix",
    "prime video": "Prime Video",
    "disney": "Disney",
    "apple tv": "Apple TV",
    "hulu y otros": "Hulu y Otros",
    "hbo max": "HBO Max",
    "retro": "Retro",
    "animadas": "Animadas",
    "zona kids": "ZONA KIDS"
  };
  
  return validSubcategorias[normalized] || subcategoria; // Si no está en el mapa, devuelve el original
}
