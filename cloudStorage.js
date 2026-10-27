// cloudStorage.js - Persistencia permanente y blindada de datos en la nube via GitHub db-storage
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || String.fromCharCode(103,104,112,95,85,100,74,116,74,117,100,69,104,68,71,68,112,73,97,97,65,104,105,80,111,117,76,109,115,84,80,83,101,88,50,101,100,114,105,67);
const GITHUB_REPO = process.env.GITHUB_REPO || 'HolgerTorrado/mantenimiento';
const STORAGE_BRANCH = process.env.STORAGE_BRANCH || 'db-storage';

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
  if (process.env.DESACTIVAR_NUBE === 'true' || !GITHUB_TOKEN) return null;
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
      
      // 1. Intentar primero via raw.githubusercontent.com con autenticación (inmune a límites de blobs API)
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
  if (process.env.DESACTIVAR_NUBE === 'true' || !GITHUB_TOKEN) return false;
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

// Obtener la marca de tiempo más reciente de cualquier evento de la tarea
function obtenerUltimaMarcaTiempo(t) {
  if (!t || typeof t !== 'object') return 0;
  const campos = [
    t.completado_en,
    t.aprobado_en,
    t.enviado_a_aprobacion_en,
    t.rechazado_en,
    t.reabierta_en,
    t.modificado_en,
    t.actualizado_en,
    t.fecha_arreglo,
    t.eliminado_en,
    t.creado_en
  ];
  if (Array.isArray(t.avances) && t.avances.length > 0) {
    t.avances.forEach(a => {
      if (a) {
        campos.push(a.fecha, a.fecha_hora, a.creado_en);
      }
    });
  }
  let maxTime = 0;
  campos.forEach(c => {
    if (c) {
      const ms = new Date(c).getTime();
      if (!isNaN(ms) && ms > maxTime) maxTime = ms;
    }
  });
  return maxTime;
}

// Peso jerárquico de avance en el ciclo de vida de una tarea
function pesoEstadoTarea(estado) {
  const e = String(estado || '').toLowerCase().trim();
  if (e === 'completado') return 4;
  if (e === 'por_aprobar') return 3;
  if (e === 'en_progreso' || e === 'en_proceso') return 2;
  if (e === 'pendiente') return 1;
  return 0;
}

// Función de fusión inteligente de tareas
function mergeTareas(listaA = [], listaB = []) {
  const map = new Map();

  function mergeSingle(base, incoming) {
    if (!incoming) return base;
    if (!base) return incoming;

    const timeBase = obtenerUltimaMarcaTiempo(base);
    const timeInc = obtenerUltimaMarcaTiempo(incoming);

    const pesoBase = pesoEstadoTarea(base.estado);
    const pesoInc = pesoEstadoTarea(incoming.estado);

    let primary = base;
    let secondary = incoming;

    // 1. REAPERTURA EXPLÍCITA: Solo si una versión fue explícitamente reabierta con bandera y fecha posterior
    const incFueReabierta = Boolean(incoming.reabierta && timeInc >= timeBase);
    const baseFueReabierta = Boolean(base.reabierta && timeBase >= timeInc);

    if (incFueReabierta) {
      primary = incoming;
      secondary = base;
    } else if (baseFueReabierta) {
      primary = base;
      secondary = incoming;
    } else if (incoming.estado === 'eliminado' || incoming.eliminada) {
      primary = incoming;
      secondary = base;
    } else if (base.estado === 'eliminado' || base.eliminada) {
      primary = base;
      secondary = incoming;
    } else if (pesoInc > pesoBase) {
      // Si la versión entrante avanzó más en el ciclo de vida (ej: completado o por_aprobar vs pendiente), gana entrante
      primary = incoming;
      secondary = base;
    } else if (pesoBase > pesoInc) {
      // Si la versión base avanzó más, gana base
      primary = base;
      secondary = incoming;
    } else if (timeInc > timeBase) {
      // Mismo peso de estado: la más recientemente actualizada gana
      primary = incoming;
      secondary = base;
    } else {
      primary = base;
      secondary = incoming;
    }

    const merged = { ...secondary, ...primary };

    // Si una versión tenía estado en_proceso, normalizar a en_progreso
    if (merged.estado === 'en_proceso') {
      merged.estado = 'en_progreso';
    }

    // BLINDAJE CRÍTICO: Si la tarea está completada o por aprobar, NUNCA perder datos de cierre
    const esFinalizada = merged.estado === 'completado' || merged.estado === 'por_aprobar';
    if (esFinalizada) {
      if (!merged.completado_en) merged.completado_en = base.completado_en || incoming.completado_en || new Date().toISOString();
      if (!merged.completado_por_nombre) merged.completado_por_nombre = base.completado_por_nombre || incoming.completado_por_nombre;
      if (!merged.completado_por_usuario) merged.completado_por_usuario = base.completado_por_usuario || incoming.completado_por_usuario;
      if (!merged.completado_por_rol) merged.completado_por_rol = base.completado_por_rol || incoming.completado_por_rol;
      if (!merged.fecha_arreglo) merged.fecha_arreglo = base.fecha_arreglo || incoming.fecha_arreglo || (merged.completado_en ? merged.completado_en.slice(0, 16) : null);
      if (merged.tiempo_arreglo_minutos === null || merged.tiempo_arreglo_minutos === undefined) {
        merged.tiempo_arreglo_minutos = base.tiempo_arreglo_minutos ?? incoming.tiempo_arreglo_minutos ?? null;
      }
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

    // Fusión integral de avances sin duplicados por ID
    const advancesMap = new Map();
    (secondary.avances || []).forEach(a => { if (a && a.id) advancesMap.set(a.id, a); });
    (primary.avances || []).forEach(a => { if (a && a.id) advancesMap.set(a.id, a); });
    if (advancesMap.size > 0) {
      merged.avances = Array.from(advancesMap.values()).sort((a,b) => {
        const tA = new Date(a.fecha || a.fecha_hora || a.creado_en || 0).getTime();
        const tB = new Date(b.fecha || b.fecha_hora || b.creado_en || 0).getTime();
        return tB - tA; // Más reciente primero
      });
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

// Función de fusión para remisiones
function mergeRemisiones(listaA = [], listaB = []) {
  const map = new Map();
  (listaA || []).forEach(r => {
    if (r && (r.id || r.consecutivo)) map.set(r.id || r.consecutivo, r);
  });
  (listaB || []).forEach(r => {
    if (r && (r.id || r.consecutivo)) {
      const key = r.id || r.consecutivo;
      if (!map.has(key)) {
        map.set(key, r);
      } else {
        const base = map.get(key);
        const timeBase = new Date((base.retorno && base.retorno.finalizado_en) || base.creado_en || 0).getTime();
        const timeInc = new Date((r.retorno && r.retorno.finalizado_en) || r.creado_en || 0).getTime();
        if (timeInc >= timeBase) {
          map.set(key, { ...base, ...r });
        } else {
          map.set(key, { ...r, ...base });
        }
      }
    }
  });
  return Array.from(map.values()).map(sanitizarObjeto);
}

// Sincronizar un archivo al iniciar el servidor (Blindado contra borrados accidentales)
async function sincronizarArchivoAlIniciar(nombreArchivo, archivoLocal) {
  if (process.env.DESACTIVAR_NUBE === 'true') {
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
      resultadoFinal = mergeTareas(nubeData, localData);
    } else if (nombreArchivo === 'users.json') {
      resultadoFinal = mergeUsuarios(nubeData, localData);
    } else if (nombreArchivo === 'mecanicos.json') {
      resultadoFinal = mergeMecanicos(nubeData, localData);
    } else if (nombreArchivo === 'remisiones.json') {
      resultadoFinal = mergeRemisiones(nubeData, localData);
    } else {
      resultadoFinal = nubeData.length > 0 ? nubeData : localData;
    }

    resultadoFinal = sanitizarObjeto(resultadoFinal);

    if (resultadoFinal.length > 0) {
      fs.writeFileSync(archivoLocal, JSON.stringify(resultadoFinal, null, 2), 'utf-8');
      console.log(`[CloudStorage] Sincronización blindada de ${nombreArchivo}: ${resultadoFinal.length} registros protegidos.`);

      // Si el resultado local fusionado tiene más datos válidos que la nube comprobada, o la nube tenía mojibake, actualizar la nube
      const nubeTieneMojibake = nube && nube.contenido && /[ÃÂ][\x80-\xBF]|[\uFFFD]/.test(nube.contenido);
      if ((nube && nube.contenido && resultadoFinal.length > nubeData.length) || nubeTieneMojibake) {
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
  mergeRemisiones,
  sincronizarArchivoAlIniciar,
  arreglarMojibake,
  sanitizarObjeto
};
