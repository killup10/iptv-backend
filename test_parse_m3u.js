const fs = require('fs');

const filePath = './test_dragonball.m3u';
const content = fs.readFileSync(filePath,'utf8');
const lines = content.split(/\r?\n/);

let seriesMap = new Map();
let videosToAdd = [];
let currentVideoData = {};
let itemsFoundInFile = 0;
let parseErrors = [];

const parseSeriesInfo = (title) => {
  const patterns = [
    /^\s*(?:EP|EPI?SODIO|E)\s*0*(\d+)\s*[-–:\s]+(.+)$/i,
    /^(\d+)x(\d+)\s+(.+)$/i,
    /^(.*?)\s*[-–\s]*S(?:eason)?\s*(\d+)\s*E(?:pisode)?\s*(\d+)/i,
    /^(.*?)\s+S(\d+)E(\d+)/i,
    /^(.*?)\s*[-–\s]*(\d+)x(\d+)(?:\s*[-–\s]*(.+))?/i,
    /^(.*?)\s*(?:Capitulo|Cap)\s*(\d+)(?:\s+T(?:emporada)?\s*(\d+))?/i,
    /^(.*?)\s*(?:Temporada|T)\s*(\d+)\s*(?:-\s*(?:Capitulo|Cap)\s*(\d+))?/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const match = title.match(pattern);
    if (match) {
      let seriesName, seasonNumber, episodeNumber, episodeTitle;
      if (i === 0) {
        seasonNumber = 1;
        episodeNumber = parseInt(match[1],10);
        episodeTitle = match[2].trim();
        seriesName = null;
      } else if (i === 1) {
        seasonNumber = parseInt(match[1],10);
        episodeNumber = parseInt(match[2],10);
        episodeTitle = match[3].trim();
        seriesName = null;
      } else if (i === 2 || i === 3) {
        seriesName = match[1].trim();
        seasonNumber = parseInt(match[2],10);
        episodeNumber = parseInt(match[3],10);
      } else if (i === 4) {
        seriesName = match[1].trim();
        seasonNumber = parseInt(match[2],10);
        episodeNumber = parseInt(match[3],10);
        episodeTitle = match[4] ? match[4].trim() : '';
      } else {
        seriesName = match[1].trim();
        seasonNumber = parseInt(match[3] || match[2] || '1', 10);
        episodeNumber = parseInt(match[2] || match[4], 10);
      }
      if (episodeNumber) {
        return { seriesName, seasonNumber: seasonNumber||1, episodeNumber, episodeTitle: episodeTitle||'' };
      }
    }
  }
  return null;
};

const detectSubtipo = (title, genres=[]) => {
  title = title.toLowerCase();
  const keywords = { anime: ['anime','sub esp','japanese','(jp)','temporada'], dorama:['dorama','kdrama','korean','(kr)'], novela:['novela','telenovela'], documental:['documental'] };
  for (const [tipo, palabras] of Object.entries(keywords)){
    if (palabras.some(word => title.includes(word)) || genres.some(genre => palabras.includes(genre.toLowerCase()))) return tipo;
  }
  return 'serie';
};

for (let i=0;i<lines.length;i++){
  const line = lines[i]?.trim();
  if (!line) continue;
  if (line.startsWith('#EXTINF:')){
    itemsFoundInFile++;
    currentVideoData = { active:true, isFeatured:false, mainSection:'POR_GENERO', requiresPlan:['gplay'], user:'TEST', genres:[] };
    let titlePart = line.substring(line.lastIndexOf(',')+1).trim();
    const seriesInfo = parseSeriesInfo(titlePart);
    if (seriesInfo) {
      currentVideoData.tipo = 'serie';
      let {seriesName, seasonNumber, episodeNumber, episodeTitle} = seriesInfo;
      if (!seriesName) {
        let nextLineIndex = i+1;
        if (lines[nextLineIndex]?.startsWith('#EXTGRP:')){
          const genreString = lines[nextLineIndex].substring('#EXTGRP:'.length).trim();
          currentVideoData.genres = genreString.split(/[,|]/).map(g=>g.trim()).filter(g=>g);
          if (currentVideoData.genres.length>0) { seriesName = currentVideoData.genres[0]; currentVideoData.genres = currentVideoData.genres.slice(1); }
          i = nextLineIndex;
        }
        if (!seriesName){
          const groupMatch = line.match(/group-title="([^"]*)"/i);
          if (groupMatch && groupMatch[1]){
            const groupGenres = groupMatch[1].split(/[,|]/).map(g=>g.trim()).filter(g=>g);
            if (groupGenres.length>0){ seriesName = groupGenres[0]; currentVideoData.genres = groupGenres.slice(1); }
          }
        }
        if (!seriesName){ seriesName = 'Serie Desconocida'; currentVideoData.genres=['Indefinido']; }
      }
      if (seriesName){
        const yearMatch = seriesName.match(/\(?([0-9]{4})\)?$/);
        if (yearMatch) { currentVideoData.releaseYear = parseInt(yearMatch[1],10); currentVideoData.seriesName = seriesName.replace(/\s*\([0-9]{4}\)\s*$/,'').trim(); }
        else currentVideoData.seriesName = seriesName;
      }
      currentVideoData.seasonNumber = seasonNumber;
      currentVideoData.episodeNumber = episodeNumber;
      currentVideoData.episodeTitle = episodeTitle;
      currentVideoData.title = titlePart;
    } else {
      currentVideoData.tipo = 'pelicula';
      const yearMatch = titlePart.match(/\(?([0-9]{4})\)?$/);
      if (yearMatch){ currentVideoData.releaseYear = parseInt(yearMatch[1],10); titlePart = titlePart.replace(/\s*\([0-9]{4}\)$/,'').trim(); titlePart = titlePart.replace(/\s+[0-9]{4}$/,'').trim(); }
      currentVideoData.title = titlePart;
    }

    let nextLineIndex = i+1;
    if (lines[nextLineIndex]?.startsWith('#EXTGRP:')){ const genreString = lines[nextLineIndex].substring('#EXTGRP:'.length).trim(); currentVideoData.genres = genreString.split(/[,|]/).map(g=>g.trim()).filter(g=>g); i = nextLineIndex; }
    if ((!currentVideoData.genres || currentVideoData.genres.length===0)){
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      if (groupMatch && groupMatch[1]) currentVideoData.genres = groupMatch[1].split(/[,|]/).map(g=>g.trim()).filter(g=>g);
    }
    if (!currentVideoData.genres || currentVideoData.genres.length===0) currentVideoData.genres = ['Indefinido'];

  } else if (currentVideoData.title && !line.startsWith('#')){
    currentVideoData.url = line;
    if (!/^https?:\/\//i.test(currentVideoData.url)){
      parseErrors.push(`Entrada ignorada (URL inválida): "${currentVideoData.title}" → "${currentVideoData.url}"`);
      currentVideoData = {};
      continue;
    }
    if (currentVideoData.tipo === 'serie' && currentVideoData.seriesName){
      const seriesKey = currentVideoData.seriesName;
      if (!seriesMap.has(seriesKey)){
        const detectedSubtipo = detectSubtipo(currentVideoData.seriesName, currentVideoData.genres);
        seriesMap.set(seriesKey, { title: currentVideoData.seriesName, tipo:'serie', subtipo: detectedSubtipo, description:'', releaseYear: currentVideoData.releaseYear, genres:[...currentVideoData.genres], active:true, isFeatured:false, mainSection: detectedSubtipo==='anime' ? 'ANIMES' : 'POR_GENERO', requiresPlan:['gplay'], user:'TEST', seasons:[] });
        if (detectedSubtipo==='anime' && !seriesMap.get(seriesKey).genres.includes('Anime')) seriesMap.get(seriesKey).genres.push('Anime');
      }
      const seriesDataInMap = seriesMap.get(seriesKey);
      let targetSeason = seriesDataInMap.seasons.find(s=>s.seasonNumber===currentVideoData.seasonNumber);
      if (!targetSeason){ targetSeason = { seasonNumber: currentVideoData.seasonNumber, title:`Temporada ${currentVideoData.seasonNumber}`, chapters:[] }; seriesDataInMap.seasons.push(targetSeason); seriesDataInMap.seasons.sort((a,b)=>a.seasonNumber-b.seasonNumber); }
      targetSeason.chapters.push({ title: `Capítulo ${currentVideoData.episodeNumber} - ${currentVideoData.title.split(/s\d+e\d+/i)[1] || currentVideoData.title}`, url: currentVideoData.url });
    } else if (currentVideoData.tipo === 'pelicula'){
      if (currentVideoData.title && currentVideoData.url) videosToAdd.push({...currentVideoData});
    }
    currentVideoData = {};
  }
}

for (const [_, seriesData] of seriesMap){ if (seriesData.seasons.length>0){ seriesData.seasons.forEach(season => { season.chapters.sort((a,b)=>{ const numA = parseInt(a.title.match(/\d+/)?.[0]||'0',10); const numB = parseInt(b.title.match(/\d+/)?.[0]||'0',10); return numA-numB; }); }); videosToAdd.push(seriesData); }}

console.log('Items parsed:', itemsFoundInFile);
console.log('parseErrors:', parseErrors);
console.log('videosToAdd count:', videosToAdd.length);
console.log('Sample of videosToAdd (first 5):');
console.log(JSON.stringify(videosToAdd.slice(0,5), null, 2));

// Also print how many of videosToAdd are tipo 'serie' vs 'pelicula'
let cSerie=0,cPeli=0;
for (const v of videosToAdd){ if (v.tipo==='serie') cSerie++; if (v.tipo==='pelicula') cPeli++; }
console.log('Series count:', cSerie, 'Peliculas count:', cPeli);

process.exit(0);
