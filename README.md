# IPTV Backend

Este es un backend para subir archivos .m3u, procesarlos y almacenarlos en MongoDB.

Incluye integración con la API de The Movie Database (TMDB) para obtener
automáticamente la imagen de portada de cada película o serie cuando se crea un
nuevo registro.

## Uso

1. Subir archivo `.m3u` a `/api/upload-m3u` (form-data: `file`)
2. Obtener lista de videos en `/api/videos`
3. Gestionar series con las rutas `/api/admin-content/series`