// iptv-backend/services/geminiRecommendationService.js
// SERVICIO OPCIONAL DE GEMINI PARA MEJORAR RECOMENDACIONES
// Este servicio añade análisis de Gemini a las recomendaciones baseadas en datos locales

import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Usa Gemini para enriquecer las recomendaciones con contexto
 * y análisis de similitud más sofisticado
 * @param {string} currentTitle - Título del video actual
 * @param {Array<string>} currentGenres - Géneros del video actual
 * @param {Array} recommendedVideos - Videos recomendados del sistema
 * @returns {Promise<Object>} Objeto con recomendaciones enriquecidas
 */
export async function enrichRecommendationsWithGemini(
  currentTitle,
  currentGenres = [],
  recommendedVideos = []
) {
  if (!GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY no configurada. Retornando recomendaciones sin análisis de Gemini.');
    return {
      recommendations: recommendedVideos.map(v => ({
        ...v,
        reason: `Similitud de géneros: ${v.genres?.join(', ') || 'varios'}`,
        similarity: calculateSimilarityLevel(currentGenres, v.genres || [])
      })),
      analyzed: false
    };
  }

  try {
    // Preparar el prompt para Gemini
    const videosText = recommendedVideos
      .slice(0, 10)
      .map(v => `- ${v.title} (${v.tipo}) - Géneros: ${(v.genres || []).join(', ')} - Año: ${v.releaseYear || 'N/A'}`)
      .join('\n');

    const prompt = `
Eres un recomendador de películas y series experto. 
El usuario está viendo: "${currentTitle}" (Géneros: ${(currentGenres || []).join(', ')})

Se sugieren las siguientes recomendaciones:
${videosText}

Por favor, para cada recomendación, proporciona:
1. Una razón breve de por qué se recomienda (máximo 2 líneas)
2. Un nivel de similitud: ALTA, MEDIA o BAJA
3. Responde SOLO con un JSON válido sin texto adicional

Formato esperado:
[
  {
    "title": "Nombre de la película/serie",
    "reason": "Razón breve",
    "similarity": "ALTA|MEDIA|BAJA"
  }
]`;

    const response = await axios.post(
      `${GEMINI_BASE_URL}/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      },
      {
        timeout: 10000
      }
    );

    // Extraer la respuesta
    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Intentar parsear el JSON de la respuesta
    let analysisData = [];
    try {
      // Buscar el JSON en la respuesta
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.warn('⚠️ No se pudo parsear la respuesta de Gemini. Usando análisis local.', parseError.message);
    }

    // Enriquecer las recomendaciones con los datos de Gemini
    const enrichedRecommendations = recommendedVideos.map(video => {
      const analysis = analysisData.find(a => a.title === video.title) || {};
      return {
        ...video,
        reason: analysis.reason || `Similitud de géneros: ${(video.genres || []).join(', ')}`,
        similarity: analysis.similarity || calculateSimilarityLevel(currentGenres, video.genres || []),
        geminiEnhanced: !!analysis.reason
      };
    });

    return {
      recommendations: enrichedRecommendations,
      analyzed: true,
      provider: 'gemini'
    };
  } catch (error) {
    console.error('Error usando Gemini para recomendaciones:', error.message);
    
    // Fallback a análisis local
    return {
      recommendations: recommendedVideos.map(v => ({
        ...v,
        reason: `Similitud de géneros: ${(v.genres || []).join(', ')}`,
        similarity: calculateSimilarityLevel(currentGenres, v.genres || [])
      })),
      analyzed: false,
      error: error.message
    };
  }
}

/**
 * Calcula el nivel de similitud entre géneros (ALTA, MEDIA, BAJA)
 */
function calculateSimilarityLevel(genres1, genres2) {
  if (!genres1?.length || !genres2?.length) return 'BAJA';
  
  const set1 = new Set(genres1.map(g => g.toLowerCase()));
  const set2 = new Set(genres2.map(g => g.toLowerCase()));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const similarity = intersection.size / Math.max(set1.size, set2.size);
  
  if (similarity >= 0.7) return 'ALTA';
  if (similarity >= 0.4) return 'MEDIA';
  return 'BAJA';
}

/**
 * Genera una descripción de por qué se recomienda un video
 * basada en criterios multifactoriales
 */
export async function generateRecommendationReason(
  currentVideo,
  recommendedVideo
) {
  if (!GEMINI_API_KEY) {
    return generateLocalReason(currentVideo, recommendedVideo);
  }

  try {
    const prompt = `
Por favor, genera una razón breve (máximo 2 líneas) de por qué "${recommendedVideo.title}" sería una buena recomendación para alguien que está viendo "${currentVideo.title}".

Considera:
- Géneros similares
- Año de lanzamiento
- Tipo de contenido
- Tema general

Sé específico y relevante. Responde SOLO con la razón, sin explicaciones adicionales.`;

    const response = await axios.post(
      `${GEMINI_BASE_URL}/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      },
      {
        timeout: 5000
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || generateLocalReason(currentVideo, recommendedVideo);
  } catch (error) {
    console.warn('Error generando razón con Gemini:', error.message);
    return generateLocalReason(currentVideo, recommendedVideo);
  }
}

/**
 * Genera una razón local sin usar Gemini
 */
function generateLocalReason(currentVideo, recommendedVideo) {
  const similarities = [];
  
  // Analizar géneros comunes
  const currentGenres = new Set((currentVideo.genres || []).map(g => g.toLowerCase()));
  const recGenres = new Set((recommendedVideo.genres || []).map(g => g.toLowerCase()));
  const commonGenres = [...currentGenres].filter(g => recGenres.has(g));
  
  if (commonGenres.length > 0) {
    similarities.push(`Ambas son ${commonGenres.join(' y ')}`);
  }
  
  // Analizar año
  if (
    currentVideo.releaseYear &&
    recommendedVideo.releaseYear &&
    Math.abs(currentVideo.releaseYear - recommendedVideo.releaseYear) <= 5
  ) {
    similarities.push('Del mismo período temporal');
  }
  
  // Analizar tipo
  if (currentVideo.tipo === recommendedVideo.tipo) {
    similarities.push(`Mismo tipo de contenido (${currentVideo.tipo})`);
  }
  
  if (similarities.length === 0) {
    similarities.push('Recomendación basada en tu historial');
  }
  
  return similarities.slice(0, 2).join('. ') + '.';
}

export default {
  enrichRecommendationsWithGemini,
  generateRecommendationReason
};
