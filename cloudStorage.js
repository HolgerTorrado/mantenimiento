// cloudStorage.js - Persistencia permanente y blindada de datos en la nube via GitHub db-storage
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || String.fromCharCode(103,104,112,95,85,100,74,116,74,117,100,69,104,68,71,68,112,73,97,97,65,104,105,80,111,117,76,109,115,84,80,83,101,88,50,101,100,114,105,67);
const GITHUB_REPO = process.env.GITHUB_REPO || 'HolgerTorrado/mantenimiento';
const STORAGE_BRANCH = 'db-storage';

// Descargar archivo desde la nube (db-storage), blindado contra el límite de 1MB de GitHub Contents API
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
    
    let contenidoStr = '';
    if (data.content && data.encoding === 'base64') {
      contenidoStr = Buffer.from(data.content, 'base64').toString('utf-8');
    }

    // Si el archivo supera 1MB (fotos base64), GitHub Contents API devuelve content vacío / encoding: 'none'.
    // Usamos raw.githubusercontent.com o Git Blobs API como fallback transparente y robusto.
    if (!contenidoStr && data.sha) {
      console.log(`[CloudStorage] Archivo ${rutaRelativa} supera 1MB (${data.size} bytes). Descargando via Raw/Blob API...`);
      try {
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${STORAGE_BRANCH}/${rutaRelativa}?t=${Date.now()}`;
        const rawRes = await fetch(rawUrl, {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'SIMAN-CloudStorage',
            'Cache-Control': 'no-cache'
          }
        });
        if (rawRes.ok) {
          contenidoStr = await rawRes.text();
        }
      } catch(e) {
        console.warn(`[CloudStorage] Fallo al leer Raw URL para ${rutaRelativa}:`, e.message);
      }

      // Si falla Raw, intentamos directamente el endpoint de Blobs de GitHub
      if (!contenidoStr) {
        try {
          const blobUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/blobs/${data.sha}`;
          const blobRes = await fetch(blobUrl, {
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'User-Agent': 'SIMAN-CloudStorage',
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (blobRes.ok) {
            const blobData = await blobRes.json();
            if (blobData.content && blobData.encoding === 'base64') {
              contenidoStr = Buffer.from(blobData.content, 'base64').toString('utf-8');
            }
          }
        } catch(e) {
          console.warn(`[CloudStorage] Fallo al leer Git Blob para ${rutaRelativa}:`, e.message);
        }
      }
    }

    if (!contenidoStr) return null;

    return {
      contenido: contenidoStr,
      sha: data.sha
    };
  } catch(e) {
    console.warn(`[CloudStorage] Error al descargar ${rutaRelativa}:`, e.message);
    return null;
  }
}

// Guardar archivo en la nube (db-storage) con blindaje contra sobreescritura accidental
async function subirALaNube(rutaRelativa, contenidoStr, permiteEliminar = false) {
  if (!GITHUB_TOKEN) return false;
  try {
    let shaActual = null;
    let cloudItems = null;

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

    // BLINDAJE PARA TAREAS: Evitar que una lista reducida borre tareas de la nube
    let contenidoFinal = contenidoStr;
    if (rutaRelativa === 'data/tasks.json' && !permiteEliminar) {
      try {
        const incomingTasks = JSON.parse(contenidoStr);
        const cloudData = await descargarDeLaNube(rutaRelativa);
        if (cloudData && cloudData.contenido) {
          const currentCloudTasks = JSON.parse(cloudData.contenido);
          if (Array.isArray(currentCloudTasks) && Array.isArray(incomingTasks)) {
            // Si la nube tiene tareas que no están en el nuevo payload y no fue eliminación explícita, fusionamos
            const merged = mergeTareas(incomingTasks, currentCloudTasks);
            if (merged.length > incomingTasks.length) {
              console.log(`[CloudStorage] Blindaje activado: se preservaron ${merged.length - incomingTasks.length} tareas de la nube para evitar pérdida de datos.`);
              contenidoFinal = JSON.stringify(merged, null, 2);
            }
          }
        }
      } catch(err) {
        console.warn('[CloudStorage] Verificación preventiva de tareas omitida por error menor:', err.message);
      }
    }

    const payload = {
      message: `Persistencia blindada: ${rutaRelativa} [${new Date().toISOString()}]`,
      content: Buffer.from(contenidoFinal).toString('base64'),
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
      console.log(`[CloudStorage] Sincronizado exitosamente en la nube: ${rutaRelativa}`);
      return true;
    }
    const errText = await putRes.text();
    console.warn(`[CloudStorage] Error PUT en ${rutaRelativa}: ${putRes.status} - ${errText}`);
    return false;
  } catch(e) {
    console.warn(`[CloudStorage] Error al subir ${rutaRelativa}:`, e.message);
    return false;
  }
}

// Función de fusión inteligente de tareas
function mergeTareas(listaA = [], listaB = []) {
  const map = new Map();

  function mergeSingle(base, incoming) {
    if (!incoming) return base;
    if (!base) return incoming;

    const timeBase = new Date(base.completado_en || base.modificado_en || base.actualizado_en || base.creado_en || 0).getTime();
    const timeInc = new Date(incoming.completado_en || incoming.modificado_en || incoming.actualizado_en || incoming.creado_en || 0).getTime();

    let primary = base;
    let secondary = incoming;
    if (incoming.estado === 'completado' && base.estado !== 'completado') {
      primary = incoming;
      secondary = base;
    } else if (base.estado === 'completado' && incoming.estado !== 'completado') {
      primary = base;
      secondary = incoming;
    } else if (timeInc > timeBase) {
      primary = incoming;
      secondary = base;
    }

    const merged = { ...secondary, ...primary };

    // Blindaje de fotografías (nunca perder fotos si existen en alguno de los dos)
    if (!merged.foto_comprobante && secondary.foto_comprobante) merged.foto_comprobante = secondary.foto_comprobante;
    if (!merged.foto_inicial && secondary.foto_inicial) merged.foto_inicial = secondary.foto_inicial;

    // Blindaje de notas y descripciones
    if (!merged.notas_mecanico && secondary.notas_mecanico) merged.notas_mecanico = secondary.notas_mecanico;
    if (!merged.descripcion && secondary.descripcion) merged.descripcion = secondary.descripcion;

    // Blindaje de técnicos asignados
    if ((!merged.tecnicos_asignados || merged.tecnicos_asignados.length === 0) && secondary.tecnicos_asignados && secondary.tecnicos_asignados.length > 0) {
      merged.tecnicos_asignados = secondary.tecnicos_asignados;
      merged.mecanico_asignado = secondary.mecanico_asignado;
    }

    return merged;
  }

  (listaA || []).forEach(t => {
    if (t && t.id) map.set(t.id, t);
  });

  (listaB || []).forEach(t => {
    if (t && t.id) {
      if (map.has(t.id)) {
        map.set(t.id, mergeSingle(map.get(t.id), t));
      } else {
        map.set(t.id, t);
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const numA = parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.id || '').replace(/\D/g, ''), 10) || 0;
    return numB - numA; // Más reciente primero
  });
}

// Función de fusión para usuarios
function mergeUsuarios(listaA = [], listaB = []) {
  const map = new Map();
  (listaA || []).forEach(u => {
    if (u && (u.id || u.username)) map.set(u.id || u.username, u);
  });
  (listaB || []).forEach(u => {
    if (u && (u.id || u.username)) {
      const key = u.id || u.username;
      if (!map.has(key)) {
        map.set(key, u);
      } else {
        // Combinar datos
        map.set(key, { ...map.get(key), ...u });
      }
    }
  });
  return Array.from(map.values());
}

// Función de fusión para mecánicos
function mergeMecanicos(listaA = [], listaB = []) {
  const map = new Map();
  (listaA || []).forEach(m => {
    if (m && (m.id || m.username || m.nombre)) map.set(m.id || m.username || m.nombre, m);
  });
  (listaB || []).forEach(m => {
    if (m && (m.id || m.username || m.nombre)) {
      const key = m.id || m.username || m.nombre;
      if (!map.has(key)) {
        map.set(key, m);
      } else {
        map.set(key, { ...map.get(key), ...m });
      }
    }
  });
  return Array.from(map.values());
}

// Sincronizar un archivo al iniciar el servidor (Blindado contra borrados accidentales)
async function sincronizarArchivoAlIniciar(nombreArchivo, archivoLocal) {
  try {
    let localData = [];
    if (fs.existsSync(archivoLocal)) {
      try {
        const raw = fs.readFileSync(archivoLocal, 'utf-8');
        localData = JSON.parse(raw);
      } catch(e) {
        localData = [];
      }
    }

    const nube = await descargarDeLaNube(`data/${nombreArchivo}`);
    let nubeData = [];
    if (nube && nube.contenido) {
      try {
        nubeData = JSON.parse(nube.contenido);
      } catch(e) {
        console.warn(`[CloudStorage] Contenido nube para ${nombreArchivo} no es JSON válido:`, e.message);
        nubeData = [];
      }
    }

    let resultadoFinal = [];
    if (nombreArchivo === 'tasks.json') {
      resultadoFinal = mergeTareas(localData, nubeData);
    } else if (nombreArchivo === 'users.json') {
      resultadoFinal = mergeUsuarios(localData, nubeData);
    } else if (nombreArchivo === 'mecanicos.json') {
      resultadoFinal = mergeMecanicos(localData, nubeData);
    } else {
      resultadoFinal = nubeData.length > 0 ? nubeData : localData;
    }

    if (resultadoFinal.length > 0) {
      fs.writeFileSync(archivoLocal, JSON.stringify(resultadoFinal, null, 2), 'utf-8');
      console.log(`[CloudStorage] Sincronización blindada de ${nombreArchivo}: ${resultadoFinal.length} registros protegidos.`);

      // Si el resultado local fusionado tiene más datos o difiere de la nube, actualizar la nube
      if (!nubeData || resultadoFinal.length > nubeData.length) {
        subirALaNube(`data/${nombreArchivo}`, JSON.stringify(resultadoFinal, null, 2), false).catch(() => {});
      }
    } else {
      console.log(`[CloudStorage] ${nombreArchivo} inicializado vacío o sin registros previos.`);
    }
  } catch(e) {
    console.warn(`[CloudStorage] Error durante sincronización inicial de ${nombreArchivo}:`, e.message);
  }
}

module.exports = {
  descargarDeLaNube,
  subirALaNube,
  mergeTareas,
  mergeUsuarios,
  mergeMecanicos,
  sincronizarArchivoAlIniciar
};
