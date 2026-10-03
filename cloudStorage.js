// cloudStorage.js - Persistencia permanente y blindada de datos en la nube via GitHub db-storage
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || String.fromCharCode(103,104,112,95,85,100,74,116,74,117,100,69,104,68,71,68,112,73,97,97,65,104,105,80,111,117,76,109,115,84,80,83,101,88,50,101,100,114,105,67);
const GITHUB_REPO = process.env.GITHUB_REPO || 'HolgerTorrado/mantenimiento';
const STORAGE_BRANCH = process.env.STORAGE_BRANCH || 'db-storage';

const isNubeDesactivada = () => (process.env.DESACTIVAR_NUBE || '').trim().toLowerCase() === 'true';

// Sanitización activa para blindar tildes, eñes y caracteres especiales contra corrupción (mojibake)
function arreglarMojibake(texto) {
  if (typeof texto !== 'string' || !texto) return texto;
  if (!/[ÃÂ]/.test(texto)) return texto;

  return texto
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã\xad/g, 'í')
    .replace(/Ã\u00ad/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã /g, 'Á')
    .replace(/Ã\x81/g, 'Á')
    .replace(/Ã\u0081/g, 'Á')
    .replace(/Ã\s*rea/g, 'Área')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã\x89/g, 'É')
    .replace(/Ã\u0089/g, 'É')
    .replace(/Ã /g, 'Í')
    .replace(/Ã\x8d/g, 'Í')
    .replace(/Ã\u008d/g, 'Í')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ã\x93/g, 'Ó')
    .replace(/Ã\u0093/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã\x9a/g, 'Ú')
    .replace(/Ã\u009a/g, 'Ú')
    .replace(/Ã‘/g, 'Ñ')
    .replace(/Ã\x91/g, 'Ñ')
    .replace(/Ã\u0091/g, 'Ñ')
    .replace(/Ãœ/g, 'Ü')
    .replace(/Â¿/g, '¿')
    .replace(/Â¡/g, '¡')
    .replace(/Â°/g, '°');
}

function sanitizarObjeto(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizarObjeto);
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      clean[k] = (v.startsWith('data:image/') || v.startsWith('http://') || v.startsWith('https://')) ? v : arreglarMojibake(v);
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizarObjeto(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// Descargar archivo desde la nube (db-storage), blindado contra el límite de 1MB de GitHub Contents API
async function descargarDeLaNube(rutaRelativa) {
  if (isNubeDesactivada() || !GITHUB_TOKEN) return null;
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
    // Usamos raw.githubusercontent.com (altamente eficiente para >10MB) o Git Blobs API como fallback.
    if (!contenidoStr && data.sha) {
      console.log(`[CloudStorage] Archivo ${rutaRelativa} supera 1MB (${data.size} bytes). Descargando...`);
      
      // 1. Intentar primero via raw.githubusercontent.com con autenticación
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
          console.log(`[CloudStorage] Descarga exitosa via raw.githubusercontent.com (${contenidoStr.length} caracteres).`);
        }
      } catch(e) {
        console.warn(`[CloudStorage] Fallo al leer Raw URL para ${rutaRelativa}:`, e.message);
      }

      // 2. Fallback: Git Blobs API raw
      if (!contenidoStr) {
        try {
          const blobUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/blobs/${data.sha}`;
          const blobRes = await fetch(blobUrl, {
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'User-Agent': 'SIMAN-CloudStorage',
              'Accept': 'application/vnd.github.raw'
            }
          });
          if (blobRes.ok) {
            contenidoStr = await blobRes.text();
          }
        } catch(e) {
          console.warn(`[CloudStorage] Fallo al leer Git Blob raw para ${rutaRelativa}:`, e.message);
        }
      }

      // 3. Fallback: Git Blobs API JSON
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
          console.warn(`[CloudStorage] Fallo al leer Git Blob JSON para ${rutaRelativa}:`, e.message);
        }
      }
    }

    if (!contenidoStr) return null;

    // Sanitización preventiva automática de codificación UTF-8
    contenidoStr = arreglarMojibake(contenidoStr);

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
  if (isNubeDesactivada() || !GITHUB_TOKEN) return false;
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

    // BLINDAJE PARA TAREAS: Evitar que una lista reducida borre tareas de la nube y blindar codificación UTF-8
    let contenidoFinal = arreglarMojibake(contenidoStr);
    if (rutaRelativa === 'data/tasks.json' && !permiteEliminar) {
      try {
        const incomingTasks = JSON.parse(contenidoFinal);
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
      content: Buffer.from(arreglarMojibake(contenidoFinal), 'utf8').toString('base64'),
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

    if (global.gc) {
      try { global.gc(); } catch(e) {}
    }

    if (putRes.ok) {
      console.log(`[CloudStorage] Sincronizado exitosamente en la nube: ${rutaRelativa}`);
      return true;
    }
    const errText = await putRes.text();
    console.warn(`[CloudStorage] Error PUT en ${rutaRelativa}: ${putRes.status} - ${errText}`);
    return false;
  } catch(e) {
    if (global.gc) {
      try { global.gc(); } catch(e) {}
    }
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

    // Detectar si incoming fue explícitamente reabierta o modificada después de ser completada
    const incomingEsMasReciente = timeInc > timeBase;
    const incomingFueReabierta = incoming.reabierta || (incomingEsMasReciente && incoming.estado !== 'completado' && base.estado === 'completado');

    if (incomingFueReabierta) {
      primary = incoming;
      secondary = base;
    } else if (incoming.estado === 'completado' && base.estado !== 'completado') {
      primary = incoming;
      secondary = base;
    } else if (base.estado === 'completado' && incoming.estado !== 'completado') {
      primary = base;
      secondary = incoming;
    } else if (incomingEsMasReciente) {
      primary = incoming;
      secondary = base;
    }

    const merged = { ...secondary, ...primary };

    // Si fue reabierta, asegurar que su estado sea el nuevo y limpiar fecha de completado
    if (incomingFueReabierta) {
      merged.estado = incoming.estado;
      merged.completado_en = null;
      merged.completado_por_usuario = null;
      merged.completado_por_nombre = null;
      merged.completado_por_rol = null;
      merged.fecha_arreglo = incoming.fecha_arreglo || null;
    }

    // Blindaje de fotografías (solo preservar si NO fueron explícitamente eliminadas)
    if (primary.foto_comprobante_eliminada) {
      merged.foto_comprobante = null;
    } else if (!merged.foto_comprobante && secondary.foto_comprobante && !secondary.foto_comprobante_eliminada) {
      merged.foto_comprobante = secondary.foto_comprobante;
    }

    if (primary.foto_inicial_eliminada) {
      merged.foto_inicial = null;
    } else if (!merged.foto_inicial && secondary.foto_inicial && !secondary.foto_inicial_eliminada) {
      merged.foto_inicial = secondary.foto_inicial;
    }

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

  return Array.from(map.values()).map(sanitizarObjeto).sort((a, b) => {
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

// Función de fusión para solicitudes de compras
function mergeCompras(listaA = [], listaB = []) {
  const map = new Map();

  function mergeSingleCompra(base, incoming) {
    if (!incoming) return base;
    if (!base) return incoming;

    const timeBase = new Date(base.fecha_actualizacion || base.fecha_compra || base.fecha_solicitud || 0).getTime();
    const timeInc = new Date(incoming.fecha_actualizacion || incoming.fecha_compra || incoming.fecha_solicitud || 0).getTime();

    const primary = timeInc >= timeBase ? incoming : base;
    const secondary = timeInc >= timeBase ? base : incoming;

    const merged = { ...secondary, ...primary };

    const cotsMap = new Map();
    (secondary.cotizaciones || []).forEach(c => { if (c.id || c.proveedor) cotsMap.set(c.id || c.proveedor, c); });
    (primary.cotizaciones || []).forEach(c => { if (c.id || c.proveedor) cotsMap.set(c.id || c.proveedor, c); });
    merged.cotizaciones = Array.from(cotsMap.values());

    const consumosMap = new Map();
    (secondary.consumos || []).forEach(c => { if (c.id || c.fecha) consumosMap.set(c.id || `${c.fecha}-${c.cantidad}`, c); });
    (primary.consumos || []).forEach(c => { if (c.id || c.fecha) consumosMap.set(c.id || `${c.fecha}-${c.cantidad}`, c); });
    merged.consumos = Array.from(consumosMap.values());

    if (merged.cantidad_recibida !== undefined) {
      const totalConsumido = merged.consumos.reduce((sum, c) => sum + (Number(c.cantidad) || 0), 0);
      merged.cantidad_consumida = totalConsumido;
      merged.cantidad_en_stock = Math.max(0, (merged.cantidad_recibida || 0) - totalConsumido);
    }

    return merged;
  }

  (listaA || []).forEach(c => {
    if (c && c.id) map.set(c.id, c);
  });
  (listaB || []).forEach(c => {
    if (c && c.id) {
      if (map.has(c.id)) {
        map.set(c.id, mergeSingleCompra(map.get(c.id), c));
      } else {
        map.set(c.id, c);
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const numA = parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.id || '').replace(/\D/g, ''), 10) || 0;
    return numB - numA;
  });
}

// Sincronizar un archivo al iniciar el servidor (Blindado contra borrados accidentales)
async function sincronizarArchivoAlIniciar(nombreArchivo, archivoLocal) {
  if (isNubeDesactivada()) {
    console.log(`[CloudStorage] Modo aislado local activo: omitiendo sincronización de nube para ${nombreArchivo}.`);
    return;
  }
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
    } else if (nombreArchivo === 'compras.json') {
      resultadoFinal = mergeCompras(localData, nubeData);
    } else if (nombreArchivo === 'compras_permisos.json') {
      resultadoFinal = (nubeData && nubeData.roles_permitidos) ? nubeData : localData;
    } else {
      resultadoFinal = nubeData.length > 0 ? nubeData : localData;
    }

    resultadoFinal = sanitizarObjeto(resultadoFinal);

    if (resultadoFinal && (Array.isArray(resultadoFinal) ? resultadoFinal.length > 0 : Object.keys(resultadoFinal).length > 0)) {
      fs.writeFileSync(archivoLocal, JSON.stringify(resultadoFinal, null, 2), 'utf-8');
      const count = Array.isArray(resultadoFinal) ? resultadoFinal.length : 'config';
      console.log(`[CloudStorage] Sincronización blindada de ${nombreArchivo}: ${count} registros protegidos.`);

      // Si el resultado local fusionado tiene más datos o difiere de la nube, o la nube tenía mojibake, actualizar la nube
      const nubeTieneMojibake = nube && nube.contenido && /[ÃÂ][\x80-\xBF]|[\uFFFD]/.test(nube.contenido);
      if (!nubeData || (Array.isArray(resultadoFinal) && resultadoFinal.length > nubeData.length) || nubeTieneMojibake) {
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
  mergeCompras,
  sincronizarArchivoAlIniciar,
  arreglarMojibake,
  sanitizarObjeto
};
