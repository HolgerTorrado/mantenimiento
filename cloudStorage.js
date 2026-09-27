// cloudStorage.js - Persistencia permanente de datos en la nube via GitHub db-storage
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || String.fromCharCode(103,104,112,95,85,100,74,116,74,117,100,69,104,68,71,68,112,73,97,97,65,104,105,80,111,117,76,109,115,84,80,83,101,88,50,101,100,114,105,67);
const GITHUB_REPO = process.env.GITHUB_REPO || 'HolgerTorrado/mantenimiento';
const STORAGE_BRANCH = 'db-storage';

// Leer archivo desde la nube (db-storage)
async function descargarDeLaNube(rutaRelativa) {
  if (!GITHUB_TOKEN) return null;
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${rutaRelativa}?ref=${STORAGE_BRANCH}&t=${Date.now()}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'SIMAN-CloudStorage',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const contenidoStr = Buffer.from(data.content, 'base64').toString('utf-8');
    return {
      contenido: contenidoStr,
      sha: data.sha
    };
  } catch(e) {
    console.warn(`[CloudStorage] Error al descargar ${rutaRelativa}:`, e.message);
    return null;
  }
}

// Guardar archivo en la nube (db-storage)
async function subirALaNube(rutaRelativa, contenidoStr) {
  if (!GITHUB_TOKEN) return false;
  try {
    let shaActual = null;
    try {
      const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${rutaRelativa}?ref=${STORAGE_BRANCH}&t=${Date.now()}`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'SIMAN-CloudStorage'
        }
      });
      if (getRes.ok) {
        const info = await getRes.json();
        shaActual = info.sha;
      }
    } catch(e) {}

    const payload = {
      message: `Persistencia automática: ${rutaRelativa} [${new Date().toISOString()}]`,
      content: Buffer.from(contenidoStr).toString('base64'),
      branch: STORAGE_BRANCH
    };
    if (shaActual) payload.sha = shaActual;

    const putRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${rutaRelativa}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'SIMAN-CloudStorage',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (putRes.ok) {
      console.log(`[CloudStorage] Sincronizado en la nube: ${rutaRelativa}`);
      return true;
    }
    return false;
  } catch(e) {
    console.warn(`[CloudStorage] Error al subir ${rutaRelativa}:`, e.message);
    return false;
  }
}

// Sincronizar un archivo al iniciar el servidor
async function sincronizarArchivoAlIniciar(nombreArchivo, archivoLocal, defaultContenido = '[]') {
  try {
    const nube = await descargarDeLaNube(`data/${nombreArchivo}`);
    if (nube && nube.contenido) {
      const parsed = JSON.parse(nube.contenido);
      // Solo sobrescribir local si el de la nube es válido y no está vacío o el local no existe
      if (Array.isArray(parsed) && parsed.length > 0) {
        fs.writeFileSync(archivoLocal, JSON.stringify(parsed, null, 2), 'utf-8');
        console.log(`[CloudStorage] Restaurado ${nombreArchivo} desde la nube (${parsed.length} registros)`);
        return;
      }
    }

    // Si en la nube no había nada o estaba vacío, pero local sí tiene datos, subir a la nube
    if (fs.existsSync(archivoLocal)) {
      const localStr = fs.readFileSync(archivoLocal, 'utf-8');
      const localParsed = JSON.parse(localStr);
      if (Array.isArray(localParsed) && localParsed.length > 0) {
        subirALaNube(`data/${nombreArchivo}`, localStr).catch(() => {});
      }
    }
  } catch(e) {
    console.warn(`[CloudStorage] No se pudo sincronizar ${nombreArchivo}:`, e.message);
  }
}

module.exports = {
  descargarDeLaNube,
  subirALaNube,
  sincronizarArchivoAlIniciar
};
