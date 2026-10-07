const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const crypto = require('crypto');
const compression = require('compression');
const nodemailer = require('nodemailer');
const cloudStorage = require('./cloudStorage');
const imageStorage = require('./imageStorage');

const app = express();
app.use(compression());
const PORT = process.env.PORT || 3000;

// Rutas de archivos
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const MECANICOS_FILE = path.join(DATA_DIR, 'mecanicos.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PERMISOS_FILE = path.join(DATA_DIR, 'permisos.json');
const REMISIONES_FILE = path.join(DATA_DIR, 'remisiones.json');

// Asegurar directorios y persistencia permanente
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Inicializar archivos locales por defecto si no existen
if (!fs.existsSync(TASKS_FILE)) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2), 'utf-8');
}
if (!fs.existsSync(REMISIONES_FILE)) {
  fs.writeFileSync(REMISIONES_FILE, JSON.stringify([], null, 2), 'utf-8');
}
if (!fs.existsSync(MECANICOS_FILE)) {
  fs.writeFileSync(MECANICOS_FILE, JSON.stringify([], null, 2), 'utf-8');
}
if (!fs.existsSync(USERS_FILE)) {
  const adminHolger = [{
    id: "USR-01",
    username: "Holger",
    password_hash: "a94a885b2cd4f2d0a9b48065f5c86491cff6f75db0054dc2a1ee2f967763d3e2",
    nombre: "Holger Torrado",
    rol: "admin",
    email: "holger@mantenimiento.com",
    creado_en: new Date().toISOString()
  }];
  fs.writeFileSync(USERS_FILE, JSON.stringify(adminHolger, null, 2), 'utf-8');
}
// La persistencia y sincronización blindada con la nube se ejecuta en iniciarServidor() antes de escuchar peticiones HTTP

// Tipos de actividades y mantenimiento admitidos en SIMAN (Abarca todo el trabajo de planta)
const TIPOS_VALIDOS = [
  'correctivo',   // Falla o Avería
  'preventivo',   // Programado / Rutina
  'predictivo',   // Vibración / Termografía
  'mejora',       // Proyectos de Mejora / Modificación de Equipo
  'locativo',     // Pintura, Fachadas, Pisos, Cerrajería
  '5s',           // Orden, Aseo, Recoger puestos, Limpieza de taller
  'instalacion',  // Montaje de nuevos equipos, tuberías, tableros
  'lubricacion',  // Rutinas de engrase y niveles de aceite
  'otro'          // Apoyo auxiliar / General
];

// Middlewares
// Middlewares (Límite optimizado a 10MB para prevenir desbordes de memoria en Render)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de blindaje de codificación UTF-8 para todas las respuestas HTTP
app.use((req, res, next) => {
  res.setHeader('Charset', 'utf-8');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Monitor de memoria y recolección proactiva de basura para Render (Límite 512MB)
setInterval(() => {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);

  // Si la memoria heap supera 180MB o RSS supera 250MB, liberar basura proactivamente
  if (heapMB > 180 || rssMB > 250) {
    if (global.gc) {
      try {
        global.gc();
        const postMem = process.memoryUsage();
        console.log(`[OPTIMIZADOR-MEMORIA] 🧹 GC preventivo ejecutado. Heap: ${heapMB}MB -> ${Math.round(postMem.heapUsed / 1024 / 1024)}MB | RSS: ${rssMB}MB -> ${Math.round(postMem.rss / 1024 / 1024)}MB`);
      } catch(e) {}
    }
  }
}, 60000);

// Configuración de Multer para fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const cleanId = (req.params.id || 'foto').replace(/[^a-zA-Z0-9_-]/g, '');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
    cb(null, `${cleanId}-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ==========================================
// CACHÉ EN MEMORIA ULTRA-RÁPIDO (CERO LECTURAS REDUNDANTES DE DISCO)
// ==========================================
let cacheTareas = null;
let cacheMecanicos = null;
let cacheUsuarios = null;
let cachePermisos = null;
let cacheRemisiones = null;

function invalidarTodosLosCaches() {
  cacheTareas = null;
  cacheMecanicos = null;
  cacheUsuarios = null;
  cachePermisos = null;
  cacheRemisiones = null;
  if (global.gc) {
    try { global.gc(); } catch(e) {}
  }
}

// Helpers de persistencia con caché en RAM y sanitización permanente de codificación UTF-8
function leerTareas() {
  if (cacheTareas) return cacheTareas;
  try {
    if (!fs.existsSync(TASKS_FILE)) {
      cacheTareas = [];
      return cacheTareas;
    }
    const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
    cacheTareas = cloudStorage.sanitizarObjeto(JSON.parse(raw));
    return cacheTareas;
  } catch (err) {
    console.error('Error al leer tasks.json:', err);
    return cacheTareas || [];
  }
}

function guardarTareas(tareas, permiteEliminar = false) {
  const tareasLimpias = cloudStorage.sanitizarObjeto(tareas);
  cacheTareas = tareasLimpias;
  try {
    const str = JSON.stringify(tareasLimpias, null, 2);
    fs.writeFileSync(TASKS_FILE, str, 'utf-8');
    cloudStorage.subirALaNube('data/tasks.json', str, permiteEliminar).catch(() => {});
    return true;
  } catch (err) {
    console.error('Error al guardar tasks.json:', err);
    return false;
  }
}

function leerMecanicos() {
  if (cacheMecanicos) return cacheMecanicos;
  try {
    if (!fs.existsSync(MECANICOS_FILE)) {
      cacheMecanicos = [];
      return cacheMecanicos;
    }
    cacheMecanicos = cloudStorage.sanitizarObjeto(JSON.parse(fs.readFileSync(MECANICOS_FILE, 'utf-8')));
    return cacheMecanicos;
  } catch (err) {
    console.error('Error al leer mecanicos.json:', err);
    return cacheMecanicos || [];
  }
}

function guardarMecanicos(mecanicos) {
  const mecanicosLimpios = cloudStorage.sanitizarObjeto(mecanicos);
  cacheMecanicos = mecanicosLimpios;
  try {
    const str = JSON.stringify(mecanicosLimpios, null, 2);
    fs.writeFileSync(MECANICOS_FILE, str, 'utf-8');
    cloudStorage.subirALaNube('data/mecanicos.json', str).catch(() => {});
    return true;
  } catch (err) {
    console.error('Error al guardar mecanicos.json:', err);
    return false;
  }
}

function leerUsuarios() {
  if (cacheUsuarios) return cacheUsuarios;
  try {
    if (!fs.existsSync(USERS_FILE)) {
      cacheUsuarios = [];
      return cacheUsuarios;
    }
    cacheUsuarios = cloudStorage.sanitizarObjeto(JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')));
    return cacheUsuarios;
  } catch (err) {
    console.error('Error al leer users.json:', err);
    return cacheUsuarios || [];
  }
}

function guardarUsuarios(usuarios) {
  const usuariosLimpios = cloudStorage.sanitizarObjeto(usuarios);
  cacheUsuarios = usuariosLimpios;
  try {
    const str = JSON.stringify(usuariosLimpios, null, 2);
    fs.writeFileSync(USERS_FILE, str, 'utf-8');
    cloudStorage.subirALaNube('data/users.json', str).catch(() => {});
    return true;
  } catch (err) {
    console.error('Error al guardar users.json:', err);
    return false;
  }
}

function hashPassword(pass) {
  return crypto.createHash('sha256').update(String(pass)).digest('hex');
}

function leerRemisiones() {
  if (cacheRemisiones) return cacheRemisiones;
  try {
    if (!fs.existsSync(REMISIONES_FILE)) {
      cacheRemisiones = [];
      return cacheRemisiones;
    }
    const raw = fs.readFileSync(REMISIONES_FILE, 'utf-8');
    cacheRemisiones = cloudStorage.sanitizarObjeto(JSON.parse(raw));
    return cacheRemisiones;
  } catch (err) {
    console.error('Error al leer remisiones.json:', err);
    return cacheRemisiones || [];
  }
}

function guardarRemisiones(remisiones) {
  const remisionesLimpias = cloudStorage.sanitizarObjeto(remisiones);
  cacheRemisiones = remisionesLimpias;
  try {
    const str = JSON.stringify(remisionesLimpias, null, 2);
    fs.writeFileSync(REMISIONES_FILE, str, 'utf-8');
    cloudStorage.subirALaNube('data/remisiones.json', str).catch(() => {});
    return true;
  } catch (err) {
    console.error('Error al guardar remisiones.json:', err);
    return false;
  }
}

function generarConsecutivoRemision() {
  const remisiones = leerRemisiones();
  const hoy = new Date();
  const yy = String(hoy.getFullYear()).slice(-2);
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  const prefijoDia = `${dd}${mm}${yy}`;
  
  const remisionesHoy = remisiones.filter(r => (r.consecutivo || '').startsWith(prefijoDia));
  const num = remisionesHoy.length + 1;
  const numStr = String(num).padStart(2, '0');
  return `${prefijoDia}-${numStr}`;
}

// ================= MATRIZ DINÁMICA DE PERMISOS POR ROL EN SIMAN =================
const PERMISOS_DEFAULT = {
  mecanico: {
    crear_tareas: false,
    cerrar_tareas: true,
    cambiar_horas: false,
    cambiar_foto: true,
    asignable_tareas: true,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: false,
    ver_compras: false,
    crear_compras: false,
    ver_dashboard: false,
    acceso_pc: false,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: false,
    finalizar_remisiones: false,
    eliminar_remisiones: false
  },
  electrico: {
    crear_tareas: false,
    cerrar_tareas: true,
    cambiar_horas: false,
    cambiar_foto: true,
    asignable_tareas: true,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: false,
    ver_compras: false,
    crear_compras: false,
    ver_dashboard: false,
    acceso_pc: false,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: false,
    finalizar_remisiones: false,
    eliminar_remisiones: false
  },
  maquinista: {
    crear_tareas: false,
    cerrar_tareas: true,
    cambiar_horas: false,
    cambiar_foto: true,
    asignable_tareas: true,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: false,
    ver_compras: false,
    crear_compras: false,
    ver_dashboard: false,
    acceso_pc: false,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: false,
    finalizar_remisiones: false,
    eliminar_remisiones: false
  },
  almacenista: {
    crear_tareas: false,
    cerrar_tareas: false,
    cambiar_horas: false,
    cambiar_foto: false,
    asignable_tareas: false,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: false,
    ver_compras: true,
    crear_compras: true,
    ver_dashboard: false,
    acceso_pc: true,
    acceso_movil: false,
    ver_almacen: true,
    crear_remisiones: true,
    finalizar_remisiones: true,
    eliminar_remisiones: false
  },
  supervisor: {
    crear_tareas: true,
    cerrar_tareas: true,
    cambiar_horas: true,
    cambiar_foto: true,
    asignable_tareas: true,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: true,
    ver_compras: true,
    crear_compras: true,
    ver_dashboard: true,
    acceso_pc: true,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: true,
    finalizar_remisiones: true,
    eliminar_remisiones: false
  },
  sst: {
    crear_tareas: true,
    cerrar_tareas: true,
    cambiar_horas: true,
    cambiar_foto: true,
    asignable_tareas: true,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: false,
    ver_compras: true,
    crear_compras: true,
    ver_dashboard: true,
    acceso_pc: true,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: false,
    finalizar_remisiones: false,
    eliminar_remisiones: false
  },
  director: {
    crear_tareas: true,
    cerrar_tareas: true,
    cambiar_horas: true,
    cambiar_foto: true,
    asignable_tareas: false,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: true,
    ver_compras: true,
    crear_compras: true,
    ver_dashboard: true,
    acceso_pc: true,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: true,
    finalizar_remisiones: true,
    eliminar_remisiones: true
  },
  compras: {
    crear_tareas: false,
    cerrar_tareas: false,
    cambiar_horas: false,
    cambiar_foto: false,
    asignable_tareas: false,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: false,
    ver_compras: true,
    crear_compras: true,
    ver_dashboard: false,
    acceso_pc: true,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: false,
    finalizar_remisiones: false,
    eliminar_remisiones: false
  },
  visualizador: {
    crear_tareas: false,
    cerrar_tareas: false,
    cambiar_horas: false,
    cambiar_foto: false,
    asignable_tareas: false,
    ver_contrasenas: false,
    cambiar_contrasenas: false,
    eliminar_tareas: false,
    reabrir_tareas: false,
    ver_compras: false,
    crear_compras: false,
    ver_dashboard: true,
    acceso_pc: true,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: false,
    finalizar_remisiones: false,
    eliminar_remisiones: false
  },
  admin: {
    crear_tareas: true,
    cerrar_tareas: true,
    cambiar_horas: true,
    cambiar_foto: true,
    asignable_tareas: false,
    ver_contrasenas: true,
    cambiar_contrasenas: true,
    eliminar_tareas: true,
    reabrir_tareas: true,
    ver_compras: true,
    crear_compras: true,
    ver_dashboard: true,
    acceso_pc: true,
    acceso_movil: true,
    ver_almacen: true,
    crear_remisiones: true,
    finalizar_remisiones: true,
    eliminar_remisiones: true
  }
};

function leerPermisos() {
  if (cachePermisos) return cachePermisos;
  try {
    if (!fs.existsSync(PERMISOS_FILE)) {
      cachePermisos = JSON.parse(JSON.stringify(PERMISOS_DEFAULT));
      fs.writeFileSync(PERMISOS_FILE, JSON.stringify(cachePermisos, null, 2), 'utf-8');
      return cachePermisos;
    }
    const data = JSON.parse(fs.readFileSync(PERMISOS_FILE, 'utf-8'));
    const merged = JSON.parse(JSON.stringify(PERMISOS_DEFAULT));
    for (const rol in data) {
      if (!merged[rol]) merged[rol] = {};
      Object.assign(merged[rol], data[rol]);
    }
    // El Administrador Holger siempre conserva todos los permisos
    const adminAsignable = (data.admin && data.admin.asignable_tareas !== undefined) ? Boolean(data.admin.asignable_tareas) : false;
    merged.admin = {
      crear_tareas: true,
      cerrar_tareas: true,
      cambiar_horas: true,
      cambiar_foto: true,
      asignable_tareas: adminAsignable,
      ver_contrasenas: true,
      cambiar_contrasenas: true,
      eliminar_tareas: true,
      reabrir_tareas: true,
      ver_compras: true,
      crear_compras: true,
      ver_dashboard: true,
      acceso_pc: true,
      acceso_movil: true,
      ver_almacen: true,
      crear_remisiones: true,
      finalizar_remisiones: true,
      eliminar_remisiones: true
    };
    cachePermisos = merged;
    return cachePermisos;
  } catch (err) {
    console.error('Error al leer permisos.json:', err);
    return cachePermisos || JSON.parse(JSON.stringify(PERMISOS_DEFAULT));
  }
}

function guardarPermisos(permisos) {
  if (!permisos.admin) permisos.admin = {};
  // Garantizar acceso vital para que el administrador nunca quede bloqueado
  permisos.admin.acceso_pc = true;
  permisos.admin.ver_dashboard = true;
  cachePermisos = permisos;
  try {
    const str = JSON.stringify(permisos, null, 2);
    fs.writeFileSync(PERMISOS_FILE, str, 'utf-8');
    cloudStorage.subirALaNube('data/permisos.json', str).catch(() => {});
    return true;
  } catch (err) {
    console.error('Error al guardar permisos.json:', err);
    return false;
  }
}

function tienePermiso(userRol, permiso) {
  if (!userRol) return false;
  const rol = String(userRol).toLowerCase().trim();
  // Administrador tiene acceso total a funciones operativas del sistema,
  // pero su asignación como técnico ejecutor de tareas (asignable_tareas) es 100% configurable
  if (rol === 'admin' && permiso !== 'asignable_tareas') return true;
  const permisos = leerPermisos();
  if (permisos && permisos[rol] && permisos[rol][permiso] !== undefined) {
    return Boolean(permisos[rol][permiso]);
  }
  if (PERMISOS_DEFAULT[rol] && PERMISOS_DEFAULT[rol][permiso] !== undefined) {
    return Boolean(PERMISOS_DEFAULT[rol][permiso]);
  }
  return false;
}

// Normalizar nombres de rol a las 3 especialidades canónicas de taller
function normalizarRol(rol) {
  const r = String(rol || '').toLowerCase().trim();
  if (r === 'electrico' || r === 'electrica') return 'electrico';
  if (r === 'maquinista' || r === 'maquinaria') return 'maquinista';
  return 'mecanico';
}

/**
 * Calcula y distribuye con precisión las horas de mano de obra por especialidad (Mecánica, Eléctrica, Maquinaria).
 * - Si se envían tiempos explícitos con valor > 0 (ej: ajuste manual en modal), se respetan esos tiempos.
 * - Si la tarea fue realizada por un solo rol o cerrada únicamente por esa especialidad, el 100% del tiempo activo se le asigna.
 * - Si la tarea es conjunta (múltiples especialidades):
 *     1. Se acreditan los minutos específicos de avances registrados en la bitácora por cada especialidad.
 *     2. El tiempo activo restante no cubierto por avances se reparte equitativamente entre las especialidades asignadas.
 */
function calcularTiemposPorRol(tarea, tiemposEnviados, rolCompletador) {
  let tpr = { mecanico: 0, electrico: 0, maquinista: 0 };

  // 1. Tiempos explícitos enviados con suma > 0
  if (tiemposEnviados && typeof tiemposEnviados === 'object') {
    const m = parseInt(tiemposEnviados.mecanico) || 0;
    const e = parseInt(tiemposEnviados.electrico) || 0;
    const q = parseInt(tiemposEnviados.maquinista) || 0;
    if ((m + e + q) > 0) {
      return { mecanico: Math.max(0, m), electrico: Math.max(0, e), maquinista: Math.max(0, q) };
    }
  }

  // 2. Extraer tiempo de trabajo activo real de la tarea
  const tActivo = Math.max(0, 
    parseInt(tarea.tiempo_trabajo_activo_minutos) || 
    (parseInt(tarea.tiempo_arreglo_minutos) - parseInt(tarea.tiempo_espera_minutos || 0)) || 
    parseInt(tarea.tiempo_arreglo_minutos) || 
    0
  );

  // 3. Sumar avances registrados previamente en la bitácora
  let sumAvances = 0;
  if (Array.isArray(tarea.avances)) {
    tarea.avances.forEach(a => {
      const aRol = normalizarRol(a.tecnico_rol);
      const aMin = parseInt(a.minutos_dedicados) || Math.round((parseFloat(a.horas_dedicadas) || 0) * 60) || 0;
      if (aMin > 0) {
        tpr[aRol] = (tpr[aRol] || 0) + aMin;
        sumAvances += aMin;
      }
    });
  }

  if (tActivo === 0) return tpr;
  if (sumAvances >= tActivo) return tpr;

  const restante = Math.max(0, tActivo - sumAvances);

  // Identificar roles asignados normalizados
  let roles = [];
  if (Array.isArray(tarea.roles_asignados) && tarea.roles_asignados.length > 0) {
    roles = tarea.roles_asignados.map(normalizarRol);
  } else if (typeof tarea.roles_asignados === 'string' && tarea.roles_asignados.trim()) {
    try {
      const p = JSON.parse(tarea.roles_asignados);
      if (Array.isArray(p)) roles = p.map(normalizarRol);
    } catch(err) {
      roles = [normalizarRol(tarea.roles_asignados)];
    }
  }
  roles = [...new Set(roles)];

  const rolComp = normalizarRol(rolCompletador || tarea.completado_por_rol);

  // Caso A: Tarea en conjunto (múltiples especialidades asignadas)
  if (roles.length > 1) {
    const porRol = Math.round(restante / roles.length);
    roles.forEach(r => {
      tpr[r] = (tpr[r] || 0) + porRol;
    });
    return tpr;
  }

  // Caso B: Tarea de una sola especialidad
  const rolDestino = roles.length === 1 ? roles[0] : rolComp;
  tpr[rolDestino] = (tpr[rolDestino] || 0) + restante;

  return tpr;
}

// Obtener IPs locales de la red Wi-Fi o Ethernet
function getLocalIps() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Ignorar internas y no IPv4
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ name, ip: net.address });
      }
    }
  }
  return results;
}

// Formateador de minutos a texto legible (ej: 2h 30m o 45m)
function formatMinutes(min) {
  if (min === null || min === undefined || isNaN(min)) return 'N/A';
  if (min < 60) return `${Math.round(min)} min`;
  const hours = Math.floor(min / 60);
  const remaining = Math.round(min % 60);
  return `${hours}h ${remaining}m`;
}

// ================= API ENDPOINTS =================

// Health check para despertar servidor de Render al instante
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'SIMAN Cloud', timestamp: new Date().toISOString() });
});

// ================= AUTENTICACIÓN Y USUARIOS =================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  const usuarios = leerUsuarios();
  const hash = hashPassword(password);
  const user = usuarios.find(u => u.username.toLowerCase() === username.toLowerCase().trim() && u.password_hash === hash);

  if (!user) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  // Si no es el admin y aún no tiene guardada la contraseña en texto plano, guardarla para que el Admin pueda consultarla
  if (user.username.toLowerCase() !== 'holger' && !user.password_plana) {
    user.password_plana = password;
    guardarUsuarios(usuarios);
  }

  // Generar token simple de sesión
  const token = `token-${user.id}-${Date.now()}`;
  const userSeguro = {
    id: user.id,
    username: user.username,
    nombre: user.nombre,
    rol: user.rol,
    especialidad: user.especialidad || 'Técnico'
  };

  res.json({
    mensaje: 'Inicio de sesión exitoso',
    token,
    user: userSeguro,
    permisos: leerPermisos()
  });
});

// ================= RECUPERACIÓN SEGURA DE ADMINISTRADOR CON CÓDIGO OTP =================

// Almacén en memoria de códigos OTP de recuperación
const codigosRecuperacionAdmin = new Map();

// Helper para enviar correo de verificación OTP
async function enviarCorreoRecuperacion(emailDestino, codigoOTP) {
  console.log(`[SEGURIDAD-OTP] 🔐 Código de recuperación generado para Administrador (${emailDestino}): ${codigoOTP}`);

  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!smtpUser || !smtpPass) {
    console.warn(`[SEGURIDAD-OTP] ⚠️ Sin credenciales SMTP en Render. Código activo en servidor: ${codigoOTP}`);
    return {
      enviado: false,
      motivo: 'smtp_no_configurado'
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const info = await transporter.sendMail({
      from: `"SIMAN Seguridad" <${smtpUser}>`,
      to: emailDestino,
      subject: `Código de Seguridad SIMAN: ${codigoOTP}`,
      text: `Tu código de verificación para restablecer la contraseña de Administrador en SIMAN es: ${codigoOTP}. Expira en 15 minutos.`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 20px; border-radius: 16px; max-width: 500px; margin: 0 auto; border: 1px solid #334155;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #059669; padding: 12px 18px; border-radius: 12px; font-weight: 800; font-size: 20px; color: white;">
              SIMAN
            </div>
            <h2 style="color: #ffffff; margin-top: 14px; font-size: 20px;">Recuperación de Administrador</h2>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">
            Hola <strong>Holger</strong>, has solicitado restablecer la contraseña de acceso como <strong>Administrador Principal</strong> de SIMAN.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">
            Ingresa el siguiente código de verificación en la pantalla de inicio de sesión:
          </p>
          <div style="background-color: #1e293b; border: 2px dashed #059669; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
            <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #34d399; font-family: monospace;">${codigoOTP}</span>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">
            ⏰ Este código es de uso único y expirará en <strong>15 minutos</strong>.<br>
            Si tú no hiciste esta solicitud, no compartas este código con nadie.
          </p>
          <div style="border-top: 1px solid #334155; margin-top: 24px; padding-top: 16px; text-align: center; font-size: 11px; color: #64748b;">
            SIMAN - Sistema Integral de Mantenimiento Industrial
          </div>
        </div>
      `
    });

    console.log(`[SEGURIDAD-OTP] ✉️ Correo de verificación enviado exitosamente a ${emailDestino} (MessageId: ${info.messageId})`);
    return { enviado: true, messageId: info.messageId };
  } catch(err) {
    console.error(`[SEGURIDAD-OTP] ❌ Error enviando correo vía SMTP:`, err.message);
    return { enviado: false, error: err.message };
  }
}

// 1. Solicitar código de recuperación para Administrador
app.post('/api/auth/recuperar-admin/solicitar', async (req, res) => {
  const { email } = req.body;
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Debes ingresar el correo de recuperación registrado.' });
  }

  const emailIngresado = String(email).toLowerCase().trim();
  const usuarios = leerUsuarios();
  const adminUser = usuarios.find(u => u.rol === 'admin' || u.username.toLowerCase() === 'holger');

  if (!adminUser) {
    return res.status(404).json({ error: 'No se encontró la cuenta de Administrador.' });
  }

  const emailRegistrado = (adminUser.email || 'holger@mantenimiento.com').toLowerCase().trim();

  // Validar estrictamente contra el correo registrado
  if (emailIngresado !== emailRegistrado) {
    return res.status(403).json({ 
      error: 'El correo ingresado no coincide con el correo de recuperación registrado para el Administrador.' 
    });
  }

  // Generar código criptográfico de 6 dígitos
  const codigoOTP = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = Date.now() + 15 * 60 * 1000; // 15 minutos

  codigosRecuperacionAdmin.set(adminUser.id, {
    codigo: codigoOTP,
    expira,
    intentos: 0,
    email: emailRegistrado
  });

  const envio = await enviarCorreoRecuperacion(emailRegistrado, codigoOTP);

  // Censurar correo para visualización segura: h****r@gmail.com
  const partes = emailRegistrado.split('@');
  const usuarioParte = partes[0];
  const dominioParte = partes[1] || '';
  const censurado = usuarioParte.length <= 2 
    ? usuarioParte + '***@' + dominioParte
    : usuarioParte[0] + '****' + usuarioParte[usuarioParte.length - 1] + '@' + dominioParte;

  res.json({
    ok: true,
    mensaje: `Se ha generado un código de verificación de 6 dígitos enviado a tu correo ${censurado}.`,
    email_censurado: censurado,
    correo_enviado: envio.enviado,
    codigo_demo: (!envio.enviado && process.env.NODE_ENV !== 'production') ? codigoOTP : undefined
  });
});

// 2. Verificar código y restablecer contraseña de Administrador
app.post('/api/auth/recuperar-admin/verificar', (req, res) => {
  const { email, codigo, nueva_password } = req.body;
  if (!email || !codigo || !nueva_password) {
    return res.status(400).json({ error: 'Correo, código de verificación y nueva contraseña son obligatorios.' });
  }

  if (String(nueva_password).trim().length < 4) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
  }

  const emailIngresado = String(email).toLowerCase().trim();
  const usuarios = leerUsuarios();
  const adminIdx = usuarios.findIndex(u => u.rol === 'admin' || u.username.toLowerCase() === 'holger');

  if (adminIdx === -1) {
    return res.status(404).json({ error: 'Cuenta de Administrador no encontrada.' });
  }

  const adminUser = usuarios[adminIdx];
  const emailRegistrado = (adminUser.email || 'holger@mantenimiento.com').toLowerCase().trim();

  if (emailIngresado !== emailRegistrado) {
    return res.status(403).json({ error: 'Correo no coincide con el registrado.' });
  }

  const sesionOtp = codigosRecuperacionAdmin.get(adminUser.id);
  if (!sesionOtp) {
    return res.status(400).json({ error: 'No hay ninguna solicitud de recuperación activa o el código ya fue utilizado. Solicita uno nuevo.' });
  }

  if (Date.now() > sesionOtp.expira) {
    codigosRecuperacionAdmin.delete(adminUser.id);
    return res.status(400).json({ error: 'El código de verificación ha expirado. Por favor solicita uno nuevo.' });
  }

  // Protección anti fuerza bruta (máximo 5 intentos)
  if (sesionOtp.intentos >= 5) {
    codigosRecuperacionAdmin.delete(adminUser.id);
    return res.status(429).json({ error: 'Has superado el número máximo de intentos permitidos (5). Por seguridad se canceló la solicitud.' });
  }

  const codigoLimpio = String(codigo).trim();
  if (codigoLimpio !== sesionOtp.codigo) {
    sesionOtp.intentos++;
    const restantes = 5 - sesionOtp.intentos;
    return res.status(400).json({ 
      error: `Código de verificación incorrecto. Te quedan ${restantes} intento(s) antes de que se bloquee.` 
    });
  }

  // Código válido: Cambiar clave de Admin
  usuarios[adminIdx].password_hash = hashPassword(String(nueva_password).trim());
  usuarios[adminIdx].password_actualizada_en = new Date().toISOString();
  codigosRecuperacionAdmin.delete(adminUser.id);

  guardarUsuarios(usuarios, true);
  generarRespaldoAutomatico('recuperacion_clave_admin');

  console.log(`[SEGURIDAD] 🛡️ Contraseña de Administrador @${adminUser.username} restablecida exitosamente mediante código OTP.`);

  res.json({
    ok: true,
    mensaje: '¡Contraseña de Administrador restablecida con éxito! Ya puedes iniciar sesión con tu nueva contraseña.'
  });
});

// 3. Actualizar correo de recuperación del Administrador (Exclusivo Admin)
app.put('/api/admin/correo-recuperacion', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador puede cambiar su correo de recuperación.' });
  }

  const { email } = req.body;
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'Debes proporcionar un correo electrónico válido.' });
  }

  const usuarios = leerUsuarios();
  const adminIdx = usuarios.findIndex(u => u.rol === 'admin' || u.username.toLowerCase() === 'holger');
  if (adminIdx === -1) return res.status(404).json({ error: 'Administrador no encontrado.' });

  usuarios[adminIdx].email = String(email).toLowerCase().trim();
  usuarios[adminIdx].email_actualizado_en = new Date().toISOString();
  guardarUsuarios(usuarios, true);
  generarRespaldoAutomatico('cambio_correo_admin');

  res.json({
    ok: true,
    mensaje: `Correo de recuperación del Administrador actualizado a: ${usuarios[adminIdx].email}`,
    email: usuarios[adminIdx].email
  });
});

// Roles administrativos y de gestión con facultad para crear, programar y asignar tareas
const ROLES_GESTION = ['admin', 'supervisor', 'sst', 'director'];

// Roles de técnicos especializados de campo (acceden a la app móvil con cuenta)
const ROLES_TECNICOS_MOVIL = ['mecanico', 'electrico', 'maquinista'];

// Roles de colaboradores de apoyo de planta (NO requieren cuenta de usuario, solo nombre)
const ROLES_APOYO = ['auxiliar', 'operario', 'supernumerario'];

// Todos los roles de técnicos y colaboradores de planta
const ROLES_TECNICOS = [...ROLES_TECNICOS_MOVIL, ...ROLES_APOYO];

// Todos los roles admisibles con cuenta de usuario
const ROLES_TODOS = ['admin', 'supervisor', 'sst', 'director', 'almacenista', 'mecanico', 'electrico', 'maquinista', 'visualizador', 'compras'];

function getEspecialidadPorRol(rol) {
  switch (rol) {
    case 'admin': return 'Administrador General';
    case 'supervisor': return 'Supervisor de Mantenimiento / Planta';
    case 'sst': return 'Seguridad y Salud en el Trabajo (SST)';
    case 'director': return 'Director de Planta';
    case 'almacenista': return 'Almacenista / Gestión de Almacén';
    case 'compras': return 'Compras y Adquisiciones';
    case 'electrico': return 'Técnico Electricista';
    case 'maquinista': return 'Operador de Maquinaria';
    case 'auxiliar': return 'Auxiliar Mecánico';
    case 'operario': return 'Operario de Planta';
    case 'supernumerario': return 'Supernumerario';
    case 'visualizador': return 'Solo Lectura';
    case 'mecanico':
    default:
      return 'Mecánico de Planta';
  }
}

app.post('/api/auth/register', (req, res) => {
  const { nombre, username, password, rol, especialidad } = req.body;
  if (!nombre || !username || !password) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña son requeridos' });
  }

  const usuarios = leerUsuarios();
  const existe = usuarios.some(u => u.username.toLowerCase() === username.toLowerCase().trim());
  if (existe) {
    return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
  }

  const rolValido = ROLES_TODOS.includes(rol) ? rol : 'mecanico';
  const espDefecto = getEspecialidadPorRol(rolValido);

  const nuevoUsuario = {
    id: `USR-${String(usuarios.length + 1).padStart(2, '0')}`,
    username: username.toLowerCase().trim(),
    password_hash: hashPassword(password),
    password_plana: username.toLowerCase().trim() !== 'holger' ? String(password).trim() : undefined,
    nombre: nombre.trim(),
    rol: rolValido,
    especialidad: (especialidad || espDefecto).trim(),
    creado_en: new Date().toISOString()
  };

  usuarios.push(nuevoUsuario);
  guardarUsuarios(usuarios);

  // Si es un técnico (mecánico, eléctrico o maquinista), registrar en mecanicos.json
  if (ROLES_TECNICOS.includes(nuevoUsuario.rol)) {
    const mecanicos = leerMecanicos();
    if (!mecanicos.some(m => m.nombre.toLowerCase() === nuevoUsuario.nombre.toLowerCase())) {
      mecanicos.push({
        id: `TEC-${String(mecanicos.length + 1).padStart(2, '0')}`,
        nombre: nuevoUsuario.nombre,
        username: nuevoUsuario.username,
        rol: nuevoUsuario.rol,
        especialidad: nuevoUsuario.especialidad
      });
      guardarMecanicos(mecanicos);
    }
  }

  res.status(201).json({
    mensaje: 'Usuario registrado exitosamente',
    user: {
      id: nuevoUsuario.id,
      username: nuevoUsuario.username,
      nombre: nuevoUsuario.nombre,
      rol: nuevoUsuario.rol,
      especialidad: nuevoUsuario.especialidad
    }
  });
});

app.get('/api/users', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const puedeVerPass = userRol === 'admin' || tienePermiso(userRol, 'ver_contrasenas');
  const esAdmin = userRol === 'admin';

  const usuarios = leerUsuarios().map(u => {
    const item = {
      id: u.id,
      username: u.username,
      nombre: u.nombre,
      rol: u.rol,
      especialidad: u.especialidad
    };
    if (puedeVerPass) {
      if (u.username.toLowerCase() !== 'holger') {
        item.password_plana = u.password_plana || null;
      }
    }
    if (esAdmin && u.username.toLowerCase() === 'holger') {
      item.email = u.email || 'holger@mantenimiento.com';
    }
    return item;
  });
  res.json(usuarios);
});

// Modificar usuario o reasignar contraseña
app.put('/api/users/:id', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const puedeCambiarPass = userRol === 'admin' || tienePermiso(userRol, 'cambiar_contrasenas');
  const esAdmin = userRol === 'admin';

  if (!esAdmin && !puedeCambiarPass) {
    return res.status(403).json({ error: 'Permiso denegado: No tiene autorización para modificar usuarios ni contraseñas.' });
  }

  let usuarios = leerUsuarios();
  const idx = usuarios.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { nombre, rol, especialidad, password, email } = req.body;

  // Solo el Admin puede alterar nombre, rol, especialidad o correo
  if (esAdmin) {
    if (nombre) usuarios[idx].nombre = nombre.trim();
    if (rol && ROLES_TODOS.includes(rol)) {
      usuarios[idx].rol = rol;
      if (!especialidad) usuarios[idx].especialidad = getEspecialidadPorRol(rol);
    }
    if (especialidad) usuarios[idx].especialidad = especialidad.trim();
    if (email && usuarios[idx].username.toLowerCase() === 'holger') {
      usuarios[idx].email = String(email).toLowerCase().trim();
    }
  }

  // Cambio de contraseña (requiere admin o permiso cambiar_contrasenas)
  if (password && String(password).trim().length > 0) {
    if (!puedeCambiarPass) {
      return res.status(403).json({ error: 'No tiene permiso para cambiar contraseñas de usuarios.' });
    }
    if (usuarios[idx].username.toLowerCase() === 'holger' && !esAdmin) {
      return res.status(403).json({ error: 'No se puede modificar la clave de Administrador Principal por este canal.' });
    }
    const passLimpia = String(password).trim();
    usuarios[idx].password_hash = hashPassword(passLimpia);
    if (usuarios[idx].username.toLowerCase() !== 'holger') {
      usuarios[idx].password_plana = passLimpia;
    }
    usuarios[idx].password_actualizada_en = new Date().toISOString();
  }

  guardarUsuarios(usuarios);

  // Sincronizar en mecanicos.json si el rol es técnico
  if (ROLES_TECNICOS.includes(usuarios[idx].rol)) {
    const mecanicos = leerMecanicos();
    const mIdx = mecanicos.findIndex(m => m.nombre.toLowerCase() === usuarios[idx].nombre.toLowerCase());
    if (mIdx !== -1) {
      mecanicos[mIdx].rol = usuarios[idx].rol;
      mecanicos[mIdx].especialidad = usuarios[idx].especialidad;
    } else {
      mecanicos.push({
        id: `TEC-${String(mecanicos.length + 1).padStart(2, '0')}`,
        nombre: usuarios[idx].nombre,
        username: usuarios[idx].username,
        rol: usuarios[idx].rol,
        especialidad: usuarios[idx].especialidad
      });
    }
    guardarMecanicos(mecanicos);
  }

  generarRespaldoAutomatico('modificacion_usuario');

  res.json({
    mensaje: `Usuario @${usuarios[idx].username} actualizado exitosamente`,
    user: {
      id: usuarios[idx].id,
      username: usuarios[idx].username,
      nombre: usuarios[idx].nombre,
      rol: usuarios[idx].rol,
      especialidad: usuarios[idx].especialidad,
      password_plana: (esAdmin || puedeCambiarPass) ? usuarios[idx].password_plana : undefined
    }
  });
});

// ================= GESTIÓN DE PERMISOS SIMAN (MATRIZ RBAC) =================

// 1. Obtener la matriz de permisos de todos los roles
app.get('/api/permisos', (req, res) => {
  res.json(leerPermisos());
});

// 2. Modificar la matriz de permisos por rol (Exclusivo Administrador Holger)
app.put('/api/permisos', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador Holger puede configurar los permisos de SIMAN.' });
  }

  const nuevosPermisos = req.body;
  if (!nuevosPermisos || typeof nuevosPermisos !== 'object') {
    return res.status(400).json({ error: 'Estructura de matriz de permisos inválida' });
  }

  guardarPermisos(nuevosPermisos);
  generarRespaldoAutomatico('actualizacion_matriz_permisos');

  res.json({
    ok: true,
    mensaje: '¡Matriz de permisos de SIMAN actualizada y aplicada correctamente!',
    permisos: leerPermisos()
  });
});

// Eliminar usuario (Exclusivo Administrador Holger)
app.delete('/api/users/:id', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Permiso denegado: Solo el Administrador Holger puede eliminar usuarios.' });
  }

  let usuarios = leerUsuarios();
  const u = usuarios.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (u.username.toLowerCase() === 'holger') {
    return res.status(400).json({ error: 'Acción bloqueada: No se puede eliminar la cuenta principal de Holger.' });
  }

  usuarios = usuarios.filter(x => x.id !== req.params.id);
  guardarUsuarios(usuarios);

  // Si era técnico, remover de mecanicos.json también
  if (ROLES_TECNICOS.includes(u.rol)) {
    let mecanicos = leerMecanicos();
    mecanicos = mecanicos.filter(m => m.nombre.toLowerCase() !== u.nombre.toLowerCase());
    guardarMecanicos(mecanicos);
  }

  res.json({ mensaje: `Usuario ${u.nombre} eliminado exitosamente` });
});

// 1. Info de red y código QR para celular
app.get('/api/network-info', async (req, res) => {
  try {
    const localIps = getLocalIps();
    const primaryIp = localIps.find(i => !i.ip.startsWith('169.254'))?.ip || 'localhost';
    const mobileUrl = `http://${primaryIp}:${PORT}/mecanico`;
    const qrCodeDataUrl = await QRCode.toDataURL(mobileUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    res.json({
      port: PORT,
      primaryIp,
      allIps: localIps,
      mobileUrl,
      qrCodeDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Error generando información de red' });
  }
});

// Helper para obtener todos los técnicos y personal de apoyo de planta
function obtenerListaTecnicos() {
  const usuarios = leerUsuarios();
  const tecnicos = usuarios
    .filter(u => tienePermiso(u.rol, 'asignable_tareas'))
    .map(u => ({
      id: u.id,
      nombre: u.nombre,
      username: u.username,
      rol: u.rol,
      especialidad: u.especialidad || getEspecialidadPorRol(u.rol),
      es_apoyo: false,
      sin_cuenta: false
    }));

  const mecanicosExtra = leerMecanicos();
  mecanicosExtra.forEach(m => {
    if (!tecnicos.some(t => t.nombre.toLowerCase() === m.nombre.toLowerCase())) {
      tecnicos.push({
        id: m.id || `TEC-${Date.now()}`,
        nombre: m.nombre,
        username: m.username || null,
        rol: m.rol || 'mecanico',
        especialidad: m.especialidad || getEspecialidadPorRol(m.rol || 'mecanico'),
        es_apoyo: ROLES_APOYO.includes(m.rol) || m.es_apoyo === true,
        sin_cuenta: m.sin_cuenta === true || !m.username
      });
    }
  });

  return tecnicos;
}

// 2. Listado de técnicos y colaboradores de planta
app.get('/api/tecnicos', (req, res) => {
  res.json(obtenerListaTecnicos());
});

app.get('/api/mecanicos', (req, res) => {
  res.json(obtenerListaTecnicos());
});

// 2.1. Gestión de Personal de Apoyo (Auxiliares, Operarios y Supernumerarios sin cuenta)
app.get('/api/personal-apoyo', (req, res) => {
  const mecanicos = leerMecanicos();
  const apoyo = mecanicos.filter(m => ROLES_APOYO.includes(m.rol) || m.es_apoyo === true || m.sin_cuenta === true);
  res.json(apoyo);
});

app.post('/api/personal-apoyo', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!ROLES_GESTION.includes(userRol)) {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador, Supervisor, SST o Director pueden registrar personal de apoyo.' });
  }

  const { nombre, rol, especialidad } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del colaborador es obligatorio' });
  }

  const rolValido = ROLES_APOYO.includes(rol) ? rol : 'auxiliar';
  const espDefecto = especialidad ? especialidad.trim() : getEspecialidadPorRol(rolValido);

  const mecanicos = leerMecanicos();
  if (mecanicos.some(m => m.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un colaborador registrado con este nombre' });
  }

  const nuevoApoyo = {
    id: `APOYO-${String(mecanicos.length + 1).padStart(2, '0')}`,
    nombre: nombre.trim(),
    username: null,
    rol: rolValido,
    especialidad: espDefecto,
    es_apoyo: true,
    sin_cuenta: true,
    creado_en: new Date().toISOString()
  };

  mecanicos.push(nuevoApoyo);
  guardarMecanicos(mecanicos);

  res.status(201).json({
    mensaje: `Colaborador de apoyo ${nuevoApoyo.nombre} (${nuevoApoyo.especialidad}) registrado exitosamente`,
    colaborador: nuevoApoyo
  });
});

app.delete('/api/personal-apoyo/:id', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!ROLES_GESTION.includes(userRol)) {
    return res.status(403).json({ error: 'Acceso Restringido: Solo personal de gestión puede eliminar personal de apoyo.' });
  }

  let mecanicos = leerMecanicos();
  const target = req.params.id;
  const idx = mecanicos.findIndex(m => m.id === target || m.nombre.toLowerCase() === decodeURIComponent(target).toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'Colaborador no encontrado' });

  const eliminado = mecanicos.splice(idx, 1)[0];
  guardarMecanicos(mecanicos);

  res.json({ mensaje: `Colaborador ${eliminado.nombre} eliminado correctamente` });
});

// 3. Obtener tareas con filtros opcionales
app.get('/api/tasks', (req, res) => {
  const { tipo, estado, mecanico, search, periodo } = req.query;
  let tareas = leerTareas();

  if (tipo && tipo !== 'todos') {
    tareas = tareas.filter(t => t.tipo?.toLowerCase() === tipo.toLowerCase());
  }

  if (estado && estado !== 'todos') {
    tareas = tareas.filter(t => t.estado?.toLowerCase() === estado.toLowerCase());
  }

  if (mecanico && mecanico !== 'todos') {
    tareas = tareas.filter(t => (t.mecanico_asignado || '').toLowerCase().includes(mecanico.toLowerCase()));
  }

  if (search) {
    const s = search.toLowerCase();
    tareas = tareas.filter(t => 
      (t.id && t.id.toLowerCase().includes(s)) ||
      (t.equipo && t.equipo.toLowerCase().includes(s)) ||
      (t.titulo && t.titulo.toLowerCase().includes(s)) ||
      (t.descripcion && t.descripcion.toLowerCase().includes(s)) ||
      (t.ubicacion && t.ubicacion.toLowerCase().includes(s))
    );
  }

  // Filtro por período
  if (periodo && periodo !== 'todo') {
    const ahora = new Date();
    let desde = null;
    switch (periodo) {
      case 'dia':
        desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
        break;
      case 'semana':
        desde = new Date(ahora);
        desde.setDate(ahora.getDate() - ahora.getDay());
        desde.setHours(0, 0, 0, 0);
        break;
      case 'mes':
        desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'semestre':
        const inicioSemestre = ahora.getMonth() < 6 ? 0 : 6;
        desde = new Date(ahora.getFullYear(), inicioSemestre, 1, 0, 0, 0, 0);
        break;
      case 'anual':
        desde = new Date(ahora.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
    }
    if (desde) {
      tareas = tareas.filter(t => {
        const fecha = new Date(t.fecha_ocurrencia || t.creado_en);
        return !isNaN(fecha) && fecha >= desde;
      });
    }
  }

  // Ordenar: más recientes primero
  tareas.sort((a, b) => new Date(b.fecha_ocurrencia || b.creado_en) - new Date(a.fecha_ocurrencia || a.creado_en));

  // OPTIMIZACIÓN RADICAL DE ANCHO DE BANDA (Render 5GB):
  // 1. Si la foto es una URL externa de CDN (https://res.cloudinary.com/...), solo pesa ~80 bytes y se entrega desde Cloudinary (0 bytes de Render).
  // 2. Si la foto es Base64 pesada (data:image/...), NUNCA se envía en el listado periódico recurrente para no consumir ancho de banda.
  //    Se entregan banderas booleanas (tiene_foto_comprobante, tiene_foto_inicial) y se cargan bajo demanda vía GET /api/tasks/:id.
  const conTodasFotos = req.query.con_todas_fotos === 'true';
  if (!conTodasFotos) {
    tareas = tareas.map(t => {
      const tieneBase64Comp = t.foto_comprobante && t.foto_comprobante.startsWith('data:image/');
      const tieneBase64Ini = t.foto_inicial && t.foto_inicial.startsWith('data:image/');
      const tieneAvancesBase64 = Array.isArray(t.avances) && t.avances.some(a => a.foto && a.foto.startsWith('data:image/'));

      if (tieneBase64Comp || tieneBase64Ini || tieneAvancesBase64 || t.estado === 'completado') {
        const copia = { ...t };
        copia.tiene_foto_comprobante = Boolean(t.foto_comprobante);
        copia.tiene_foto_inicial = Boolean(t.foto_inicial);

        // Remover Base64 comprobante o si ya está completada (a menos que sea link CDN)
        if (tieneBase64Comp || (t.estado === 'completado' && !t.foto_comprobante?.startsWith('https://'))) {
          delete copia.foto_comprobante;
        }

        // Remover Base64 inicial pesada (si es link CDN ligero, se conserva)
        if (tieneBase64Ini) {
          delete copia.foto_inicial;
        }

        if (Array.isArray(copia.avances)) {
          copia.avances = copia.avances.map(a => {
            const ac = { ...a };
            ac.tiene_foto = Boolean(a.foto);
            if (a.foto && a.foto.startsWith('data:image/')) {
              delete ac.foto;
            }
            return ac;
          });
        }
        return copia;
      }
      return t;
    });
  }

  res.json(tareas);
});

// 4. Obtener detalle de una tarea
app.get('/api/tasks/:id', (req, res) => {
  const tareas = leerTareas();
  const tarea = tareas.find(t => t.id === req.params.id);
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json(tarea);
});

// 5. Crear nueva tarea de mantenimiento
app.post('/api/tasks', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!tienePermiso(userRol, 'crear_tareas')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para crear ni programar tareas en SIMAN.' });
  }

  const {
    equipo,
    titulo,
    tipo, // preventivo, correctivo, predictivo, mejora, locativo, 5s, instalacion, lubricacion, otro
    prioridad, // baja, media, alta, critica
    ubicacion,
    descripcion,
    mecanico_asignado,
    roles_asignados,
    tecnicos_asignados,
    fecha_ocurrencia,
    foto_inicial,
    creado_por
  } = req.body;

  if (!equipo || !tipo || !fecha_ocurrencia) {
    return res.status(400).json({ error: 'Equipo, tipo de mantenimiento y fecha de ocurrencia son obligatorios' });
  }

  const tipoNormalizado = (tipo && TIPOS_VALIDOS.includes(tipo.toLowerCase().trim()))
    ? tipo.toLowerCase().trim()
    : (tipo ? tipo.toLowerCase().trim() : 'correctivo');

  // Normalizar roles requeridos para la tarea (Permite tareas conjuntas y roles asignables de la matriz de permisos)
  function rolValidoAsignable(r) {
    if (!r) return false;
    const rol = String(r).toLowerCase().trim();
    return tienePermiso(rol, 'asignable_tareas') || ROLES_TECNICOS.includes(rol) || ROLES_TODOS.includes(rol);
  }

  let rolesFinal = ['mecanico'];
  if (Array.isArray(roles_asignados) && roles_asignados.length > 0) {
    rolesFinal = roles_asignados.map(r => String(r).toLowerCase().trim()).filter(rolValidoAsignable);
    if (rolesFinal.length === 0) rolesFinal = ['mecanico'];
  } else if (typeof roles_asignados === 'string' && roles_asignados.trim()) {
    try {
      const p = JSON.parse(roles_asignados);
      if (Array.isArray(p)) rolesFinal = p.map(r => String(r).toLowerCase().trim()).filter(rolValidoAsignable);
    } catch(e) {
      rolesFinal = roles_asignados.split(',').map(s => s.trim().toLowerCase()).filter(rolValidoAsignable);
    }
    if (rolesFinal.length === 0) rolesFinal = ['mecanico'];
  }

  // Normalizar técnicos asignados (Permite asignar a varias personas en conjunto)
  let tecnicosFinal = [];
  if (Array.isArray(tecnicos_asignados)) {
    tecnicosFinal = tecnicos_asignados.map(s => String(s).trim()).filter(Boolean);
  } else if (typeof tecnicos_asignados === 'string' && tecnicos_asignados.trim()) {
    try {
      const p = JSON.parse(tecnicos_asignados);
      if (Array.isArray(p)) tecnicosFinal = p.map(s => String(s).trim()).filter(Boolean);
    } catch(e) {
      tecnicosFinal = tecnicos_asignados.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  const MAP_NOMBRES_ROLES = {
    mecanico: 'Mecánica',
    electrico: 'Eléctrica',
    maquinista: 'Maquinaria',
    supervisor: 'Supervisión',
    sst: 'SST',
    director: 'Dirección',
    visualizador: 'Visualizador',
    admin: 'Administración'
  };
  const especialidadesDefecto = rolesFinal.map(r => MAP_NOMBRES_ROLES[r] || r).join(', ');

  let resumenAsignado = especialidadesDefecto;
  if (tecnicosFinal.length > 0) {
    resumenAsignado = tecnicosFinal.join(', ');
  } else if (mecanico_asignado && mecanico_asignado !== 'Sin Asignar') {
    resumenAsignado = mecanico_asignado.trim();
  }

  const tareas = leerTareas();
  const maxIdNum = tareas.reduce((max, t) => {
    const n = parseInt(String(t.id || '').replace(/\D/g, ''), 10);
    return !isNaN(n) && n > max ? n : max;
  }, 1000);
  const nuevoId = `TSK-${maxIdNum + 1}`;

  // Subir fotografía inicial a Cloudinary si está disponible
  let fotoInicialFinal = null;
  if (foto_inicial && String(foto_inicial).length > 20) {
    fotoInicialFinal = await imageStorage.subirImagenNube(foto_inicial, `ini_${nuevoId}`, 'iniciales');
  }

  const nuevaTarea = {
    id: nuevoId,
    equipo: equipo.trim(),
    titulo: (titulo || `Mantenimiento ${tipoNormalizado} en ${equipo}`).trim(),
    tipo: tipoNormalizado,
    prioridad: prioridad || 'media',
    ubicacion: (ubicacion || 'Planta Principal').trim(),
    descripcion: (descripcion || '').trim(),
    roles_asignados: rolesFinal,
    tecnicos_asignados: tecnicosFinal,
    mecanico_asignado: resumenAsignado,
    es_conjunta: rolesFinal.length > 1 || tecnicosFinal.length > 1,
    fecha_ocurrencia: fecha_ocurrencia, // ISO o YYYY-MM-DDTHH:mm
    fecha_arreglo: null,
    estado: 'pendiente',
    notas_mecanico: null,
    foto_inicial: fotoInicialFinal,
    foto_comprobante: null,
    tiempo_arreglo_minutos: null,
    creado_por_usuario: (req.headers['x-user-name'] || req.headers['x-user-username'] || creado_por || 'Usuario').trim(),
    creado_por_rol: userRol || 'admin',
    creado_en: new Date().toISOString()
  };

  tareas.unshift(nuevaTarea);
  guardarTareas(tareas);

  res.status(201).json(nuevaTarea);
});

// 6. Iniciar tarea (Poner en progreso por el técnico)
app.post('/api/tasks/:id/iniciar', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol && !tienePermiso(userRol, 'cerrar_tareas')) {
    return res.status(403).json({ error: 'Acceso Restringido: Tu rol no tiene permisos para iniciar o atender tareas.' });
  }

  const tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  tareas[idx].estado = 'en_progreso';
  if (req.body.mecanico_nombre) {
    const nombre = req.body.mecanico_nombre.trim();
    if (!tareas[idx].tecnicos_asignados) tareas[idx].tecnicos_asignados = [];
    if (!tareas[idx].tecnicos_asignados.includes(nombre)) {
      tareas[idx].tecnicos_asignados.push(nombre);
      tareas[idx].mecanico_asignado = tareas[idx].tecnicos_asignados.join(', ');
    }
  }
  tareas[idx].actualizado_en = new Date().toISOString();

  guardarTareas(tareas);
  res.json(tareas[idx]);
});

// ================= SISTEMA ANTI-FRAUDE: HASH Y COMPARACIÓN DE FOTOGRAFÍAS =================
function calcularHashDeDatosImagen(dataOrBuffer) {
  if (!dataOrBuffer) return null;
  try {
    let buffer;
    if (Buffer.isBuffer(dataOrBuffer)) {
      buffer = dataOrBuffer;
    } else if (typeof dataOrBuffer === 'string') {
      if (dataOrBuffer.startsWith('data:image/')) {
        const b64 = dataOrBuffer.split(',')[1] || '';
        buffer = Buffer.from(b64, 'base64');
      } else if (dataOrBuffer.startsWith('http://') || dataOrBuffer.startsWith('https://')) {
        return crypto.createHash('sha256').update(dataOrBuffer.trim()).digest('hex');
      } else {
        buffer = Buffer.from(dataOrBuffer, 'utf-8');
      }
    }
    if (!buffer || buffer.length === 0) return null;
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch (e) {
    console.error('Error calculando hash de imagen:', e);
    return null;
  }
}

// Detectar si la fotografía ya fue utilizada en otra tarea o si es idéntica a la inicial
function validarFotografiaDuplicada(hashEntrante, tareaActualId, tareasLista) {
  if (!hashEntrante) return null;
  const tareaActual = tareasLista.find(t => t.id === tareaActualId);

  // 1. Validar contra la foto inicial del reporte de la misma tarea
  if (tareaActual && tareaActual.foto_inicial) {
    const hashIni = tareaActual.foto_inicial_hash || calcularHashDeDatosImagen(tareaActual.foto_inicial);
    if (hashIni && hashIni === hashEntrante) {
      return {
        tipo: 'inicial_misma_tarea',
        mensaje: `⚠️ Fotografía Rechazada: La foto enviada es idéntica a la foto inicial del reporte de avería (${tareaActual.id}). Debe capturar una fotografía real del trabajo y la reparación finalizada.`
      };
    }
  }

  // 2. Validar contra fotos de otras tareas registradas
  for (const t of tareasLista) {
    if (t.id === tareaActualId) continue;
    // Comprobar contra foto comprobante de otra tarea
    if (t.foto_comprobante) {
      const hashComp = t.foto_comprobante_hash || calcularHashDeDatosImagen(t.foto_comprobante);
      if (hashComp && hashComp === hashEntrante) {
        return {
          tipo: 'duplicada_otra_tarea',
          tareaId: t.id,
          equipo: t.equipo,
          mensaje: `⚠️ Fotografía Duplicada Detectada: Esta misma imagen ya fue utilizada para finalizar la tarea ${t.id} (${t.equipo}). Por control de calidad y veracidad en planta, cada orden de trabajo debe registrar una fotografía original tomada durante el arreglo actual.`
        };
      }
    }
    // Comprobar también contra foto inicial de otra tarea
    if (t.foto_inicial) {
      const hashIniOtra = t.foto_inicial_hash || calcularHashDeDatosImagen(t.foto_inicial);
      if (hashIniOtra && hashIniOtra === hashEntrante) {
        return {
          tipo: 'duplicada_otra_tarea',
          tareaId: t.id,
          equipo: t.equipo,
          mensaje: `⚠️ Fotografía Duplicada: Esta imagen coincide con el reporte de la tarea ${t.id} (${t.equipo}). Debe capturar una fotografía original del arreglo actual.`
        };
      }
    }
  }

  return null;
}

// 7. Completar tarea con validación anti-fraude y flujo de aprobación
app.post('/api/tasks/:id/completar', upload.single('foto'), async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const userName = (req.headers['x-user-username'] || '').toLowerCase().trim();
  const esAdmin = userRol === 'admin' || userName === 'holger';

  if (!esAdmin && !tienePermiso(userRol, 'cerrar_tareas')) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para finalizar o cerrar tareas.' });
  }

  const tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return res.status(404).json({ error: 'Tarea no encontrada' });
  }

  const {
    fecha_ocurrencia,
    fecha_arreglo,
    notas_mecanico,
    mecanico_nombre,
    usuario_username,
    tiempo_espera_minutos,
    motivo_espera,
    tiempo_trabajo_activo_minutos,
    tiempos_por_rol,
    tiempos_por_tecnico
  } = req.body;
  const usernameFinal = req.headers['x-user-username'] || usuario_username || 'tecnico';
  const nombreFinal = req.headers['x-user-name'] || mecanico_nombre || 'Técnico';
  const rolFinal = req.headers['x-user-role'] || 'mecanico';

  if (fecha_ocurrencia && String(fecha_ocurrencia).trim()) {
    tareas[idx].fecha_ocurrencia = String(fecha_ocurrencia).trim();
  }

  // Fecha y hora del arreglo: si no la envía o es vacía, usar el momento exacto actual
  const fechaArregloFinal = fecha_arreglo || new Date().toISOString().slice(0, 16);

  // Calcular diferencia de tiempo entre ocurrencia y momento de arreglo
  let tiempoMinutos = null;
  try {
    const fOcurrencia = new Date(tareas[idx].fecha_ocurrencia);
    const fArreglo = new Date(fechaArregloFinal);
    const diffMs = fArreglo.getTime() - fOcurrencia.getTime();
    if (!isNaN(diffMs) && diffMs >= 0) {
      tiempoMinutos = Math.round(diffMs / (1000 * 60));
    } else if (!isNaN(diffMs) && diffMs < 0) {
      tiempoMinutos = 0;
    }
  } catch (e) {
    console.error('Error calculando tiempo:', e);
  }

  // VALIDACIÓN ANTI-FRAUDE: HASH Y COMPROBACIÓN DE IMAGEN DUPLICADA
  let hashFoto = null;
  if (req.body && req.body.foto_base64 && req.body.foto_base64.startsWith('data:image/')) {
    hashFoto = calcularHashDeDatosImagen(req.body.foto_base64);
  } else if (req.file) {
    try {
      const fileBuf = fs.readFileSync(req.file.path);
      hashFoto = calcularHashDeDatosImagen(fileBuf);
    } catch (e) {}
  }

  if (hashFoto) {
    const errorDuplicada = validarFotografiaDuplicada(hashFoto, req.params.id, tareas);
    if (errorDuplicada) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
      return res.status(400).json({ error: errorDuplicada.mensaje });
    }
  }

  // Foto comprobante: Subir a Cloudinary (CDN) o Base64/local como fallback seguro
  let rutaFoto = tareas[idx].foto_comprobante;
  if (req.body && req.body.foto_base64 && req.body.foto_base64.startsWith('data:image/')) {
    rutaFoto = await imageStorage.subirImagenNube(req.body.foto_base64, `comp_${tareas[idx].id}`, 'comprobantes');
  } else if (req.file) {
    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      const b64 = fs.readFileSync(req.file.path).toString('base64');
      const dataUri = `data:${mime};base64,${b64}`;
      rutaFoto = await imageStorage.subirImagenNube(dataUri, `comp_${tareas[idx].id}`, 'comprobantes');
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    } catch(e) {
      console.error('Error procesando foto comprobante:', e);
      rutaFoto = `/uploads/${req.file.filename}`;
    }
  }

  // FLUJO DE APROBACIÓN:
  // Si finaliza Holger/Admin directamente, se aprueba y completa de inmediato.
  // Si finaliza un técnico operativo, entra a "por_aprobar" para que Holger verifique la foto y el trabajo.
  const esAprobador = esAdmin || tienePermiso(userRol, 'reabrir_tareas');
  const requiereAprobacion = !esAprobador;
  const nuevoEstado = requiereAprobacion ? 'por_aprobar' : 'completado';

  tareas[idx].estado = nuevoEstado;
  tareas[idx].fecha_arreglo = fechaArregloFinal;
  tareas[idx].tiempo_arreglo_minutos = tiempoMinutos;
  tareas[idx].completado_por_usuario = usernameFinal;
  tareas[idx].completado_por_nombre = nombreFinal;
  tareas[idx].completado_por_rol = rolFinal;
  tareas[idx].completado_en = new Date().toISOString();
  if (hashFoto) tareas[idx].foto_comprobante_hash = hashFoto;

  if (requiereAprobacion) {
    tareas[idx].requiere_aprobacion = true;
    tareas[idx].enviado_a_aprobacion_en = new Date().toISOString();
  } else {
    tareas[idx].requiere_aprobacion = false;
    tareas[idx].aprobado_por = nombreFinal;
    tareas[idx].aprobado_en = new Date().toISOString();
  }

  // Desglose de tiempos de espera vs trabajo activo del personal
  const esperaNum = parseInt(tiempo_espera_minutos) || 0;
  tareas[idx].tiempo_espera_minutos = Math.max(0, esperaNum);
  if (motivo_espera !== undefined) tareas[idx].motivo_espera = String(motivo_espera || '').trim();

  if (tiempo_trabajo_activo_minutos !== undefined && tiempo_trabajo_activo_minutos !== null) {
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, parseInt(tiempo_trabajo_activo_minutos) || 0);
  } else if (tiempoMinutos !== null) {
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, tiempoMinutos - tareas[idx].tiempo_espera_minutos);
  }

  // Desglose de horas por rol (ej: mecánico 3h, eléctrico 2h, o cómputo automático)
  const tprRaw = typeof tiempos_por_rol === 'string' ? JSON.parse(tiempos_por_rol || '{}') : (tiempos_por_rol || null);
  tareas[idx].tiempos_por_rol = calcularTiemposPorRol(tareas[idx], tprRaw, rolFinal);

  if (tiempos_por_tecnico !== undefined) {
    tareas[idx].tiempos_por_tecnico = typeof tiempos_por_tecnico === 'string' ? JSON.parse(tiempos_por_tecnico || '{}') : tiempos_por_tecnico;
  }

  // Si no estaba en técnicos asignados, agregarlo
  if (!tareas[idx].tecnicos_asignados) tareas[idx].tecnicos_asignados = [];
  if (!tareas[idx].tecnicos_asignados.includes(nombreFinal)) {
    tareas[idx].tecnicos_asignados.push(nombreFinal);
    tareas[idx].mecanico_asignado = tareas[idx].tecnicos_asignados.join(', ');
  }

  if (notas_mecanico !== undefined) tareas[idx].notas_mecanico = notas_mecanico;
  if (rutaFoto) tareas[idx].foto_comprobante = rutaFoto;

  // Registrar en bitácora
  if (!Array.isArray(tareas[idx].avances)) tareas[idx].avances = [];
  if (requiereAprobacion) {
    tareas[idx].avances.push({
      id: `AV-${Date.now()}`,
      fecha: new Date().toISOString(),
      tecnico: nombreFinal,
      rol: rolFinal,
      horas: Math.round(((tiempoMinutos || 0) / 60) * 10) / 10,
      descripcion: `📋 Finalización enviada con fotografía comprobante. En espera de verificación y aprobación por Holger.`
    });
  }

  guardarTareas(tareas, true);

  const mensajeRes = requiereAprobacion
    ? '✅ Tarea registrada y enviada para verificación. Quedará completada tras la aprobación del Administrador Holger.'
    : '✅ Tarea completada y aprobada exitosamente con fotografía y tiempos registrados.';

  res.json({
    mensaje: mensajeRes,
    requiere_aprobacion: requiereAprobacion,
    tarea: tareas[idx]
  });
});

// 7.4. Aprobar tarea finalizada (Exclusivo Administrador Holger y Supervisores)
app.post('/api/tasks/:id/aprobar', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const userName = (req.headers['x-user-username'] || '').toLowerCase().trim();
  const esAdmin = userRol === 'admin' || userName === 'holger';
  const puedeAprobar = esAdmin || tienePermiso(userRol, 'reabrir_tareas');
  if (!puedeAprobar) {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador y Supervisores autorizados pueden aprobar la finalización de tareas.' });
  }

  const tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  const aprobadorNombre = req.headers['x-user-name'] || (esAdmin ? 'Holger Torrado' : 'Supervisor');
  const aprobadorUsername = req.headers['x-user-username'] || 'holger';

  tareas[idx].estado = 'completado';
  tareas[idx].aprobado_por = aprobadorNombre;
  tareas[idx].aprobado_por_username = aprobadorUsername;
  tareas[idx].aprobado_en = new Date().toISOString();
  tareas[idx].requiere_aprobacion = false;

  // Recalcular MTTR exacto con las fechas registradas
  if (tareas[idx].fecha_ocurrencia && tareas[idx].fecha_arreglo) {
    try {
      const fO = new Date(tareas[idx].fecha_ocurrencia).getTime();
      const fA = new Date(tareas[idx].fecha_arreglo).getTime();
      const diffMs = fA - fO;
      if (!isNaN(diffMs) && diffMs >= 0) {
        tareas[idx].tiempo_arreglo_minutos = Math.round(diffMs / 60000);
      }
    } catch(e) {}
  }

  if (!Array.isArray(tareas[idx].avances)) tareas[idx].avances = [];
  tareas[idx].avances.push({
    id: `AV-${Date.now()}`,
    fecha: new Date().toISOString(),
    tecnico: aprobadorNombre,
    rol: userRol || 'admin',
    horas: 0,
    descripcion: `✅ Trabajo y fotografía comprobante VERIFICADOS Y APROBADOS por la administración. Tarea cerrada oficialmente.`
  });

  guardarTareas(tareas, true);
  res.json({
    ok: true,
    mensaje: `✅ Tarea ${tareas[idx].id} aprobada y cerrada satisfactoriamente por ${aprobadorNombre}`,
    tarea: tareas[idx]
  });
});

// 7.5. Rechazar finalización de tarea (Devolver a En Progreso con observación)
app.post('/api/tasks/:id/rechazar', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const userName = (req.headers['x-user-username'] || '').toLowerCase().trim();
  const esAdmin = userRol === 'admin' || userName === 'holger';
  const puedeRechazar = esAdmin || tienePermiso(userRol, 'reabrir_tareas');
  if (!puedeRechazar) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para rechazar la finalización de tareas.' });
  }

  const tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  const { motivo } = req.body || {};
  const motivoRechazo = String(motivo || 'Fotografía no corresponde o trabajo incompleto').trim();
  const rechazoPor = req.headers['x-user-name'] || (esAdmin ? 'Holger Torrado' : 'Supervisor');

  tareas[idx].estado = 'en_progreso';
  tareas[idx].requiere_aprobacion = false;
  tareas[idx].rechazado_en = new Date().toISOString();
  tareas[idx].rechazado_por = rechazoPor;
  tareas[idx].motivo_rechazo = motivoRechazo;

  if (!Array.isArray(tareas[idx].avances)) tareas[idx].avances = [];
  tareas[idx].avances.push({
    id: `AV-${Date.now()}`,
    fecha: new Date().toISOString(),
    tecnico: rechazoPor,
    rol: userRol || 'admin',
    horas: 0,
    descripcion: `❌ FINALIZACIÓN RECHAZADA: ${motivoRechazo}. La tarea regresa a estado "En Progreso" para corrección por el técnico.`
  });

  guardarTareas(tareas, true);
  res.json({
    ok: true,
    mensaje: `Tarea ${tareas[idx].id} devuelta a "En Progreso" con observación registrada.`,
    tarea: tareas[idx]
  });
});

// 7.1. Actualizar y Modificar Tarea Completa
app.put('/api/tasks/:id', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const userName = (req.headers['x-user-username'] || '').toLowerCase().trim();
  const esAdmin = userRol === 'admin' || userName === 'holger';
  const puedeCambiarHoras = esAdmin || tienePermiso(userRol, 'cambiar_horas');
  const puedeEditar = esAdmin || puedeCambiarHoras || tienePermiso(userRol, 'crear_tareas') || tienePermiso(userRol, 'reabrir_tareas') || tienePermiso(userRol, 'cambiar_foto');
  if (!puedeEditar) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para editar tareas ni modificar fechas u horas.' });
  }

  let tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  const {
    fecha_ocurrencia,
    fecha_arreglo,
    notas_mecanico,
    mecanico_asignado,
    roles_asignados,
    tecnicos_asignados,
    foto_base64,
    foto_comprobante,
    foto_inicial,
    foto_inicial_base64,
    tiempo_espera_minutos,
    motivo_espera,
    tiempo_trabajo_activo_minutos,
    tiempos_por_rol,
    tiempos_por_tecnico,
    equipo,
    titulo,
    tipo,
    prioridad,
    estado
  } = req.body;

  if (fecha_ocurrencia !== undefined && puedeCambiarHoras) tareas[idx].fecha_ocurrencia = fecha_ocurrencia;
  if (fecha_arreglo !== undefined && puedeCambiarHoras) tareas[idx].fecha_arreglo = fecha_arreglo || null;
  if (notas_mecanico !== undefined) tareas[idx].notas_mecanico = notas_mecanico;

  // Actualizar fotografía comprobante si se envía nueva (Subir a Cloudinary si está activo)
  const puedeCambiarFoto = esAdmin || tienePermiso(userRol, 'cambiar_foto');
  if (foto_base64 && foto_base64.startsWith('data:image/')) {
    if (!puedeCambiarFoto) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar fotografías.' });
    }
    tareas[idx].foto_comprobante = await imageStorage.subirImagenNube(foto_base64, `comp_${tareas[idx].id}`, 'comprobantes');
    tareas[idx].foto_actualizada_en = new Date().toISOString();
  } else if (foto_comprobante !== undefined) {
    if (foto_comprobante !== tareas[idx].foto_comprobante && !puedeCambiarFoto) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar fotografías.' });
    }
    tareas[idx].foto_comprobante = foto_comprobante;
  }

  // Actualizar fotografía inicial del daño o reporte si se envía
  if (foto_inicial_base64 && foto_inicial_base64.startsWith('data:image/')) {
    if (!puedeCambiarFoto) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar fotografías iniciales.' });
    }
    tareas[idx].foto_inicial = await imageStorage.subirImagenNube(foto_inicial_base64, `ini_${tareas[idx].id}`, 'iniciales');
    tareas[idx].foto_inicial_actualizada_en = new Date().toISOString();
  } else if (foto_inicial !== undefined) {
    if (foto_inicial !== tareas[idx].foto_inicial && !puedeCambiarFoto) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar fotografías iniciales.' });
    }
    tareas[idx].foto_inicial = foto_inicial;
  }
  
  // Modificar roles asignados
  if (roles_asignados !== undefined) {
    let rFinal = Array.isArray(roles_asignados) ? roles_asignados : [roles_asignados];
    rFinal = rFinal.map(r => String(r).toLowerCase().trim()).filter(r => tienePermiso(r, 'asignable_tareas') || ROLES_TECNICOS.includes(r) || ROLES_TODOS.includes(r));
    if (rFinal.length === 0) rFinal = ['mecanico'];
    tareas[idx].roles_asignados = rFinal;
  }

  // Modificar personas asignadas que participaron
  if (tecnicos_asignados !== undefined) {
    const arr = Array.isArray(tecnicos_asignados) ? tecnicos_asignados : [tecnicos_asignados];
    tareas[idx].tecnicos_asignados = arr.map(s => String(s).trim()).filter(Boolean);
    tareas[idx].mecanico_asignado = tareas[idx].tecnicos_asignados.length > 0 ? tareas[idx].tecnicos_asignados.join(', ') : 'Sin Asignar';
  } else if (mecanico_asignado !== undefined) {
    tareas[idx].mecanico_asignado = mecanico_asignado;
  }

  if (tareas[idx].roles_asignados || tareas[idx].tecnicos_asignados) {
    tareas[idx].es_conjunta = (tareas[idx].roles_asignados && tareas[idx].roles_asignados.length > 1) || 
                              (tareas[idx].tecnicos_asignados && tareas[idx].tecnicos_asignados.length > 1);
  }

  // Tiempos muertos (Espera por repuestos y Trabajos fuera de planta como tornos/talleres)
  const {
    tiempo_espera_repuestos_minutos,
    motivo_espera_repuestos,
    tiempo_fuera_planta_minutos,
    motivo_fuera_planta
  } = req.body;

  if (tiempo_espera_repuestos_minutos !== undefined && puedeCambiarHoras) {
    tareas[idx].tiempo_espera_repuestos_minutos = Math.max(0, parseInt(tiempo_espera_repuestos_minutos) || 0);
  }
  if (motivo_espera_repuestos !== undefined) {
    tareas[idx].motivo_espera_repuestos = String(motivo_espera_repuestos || '').trim();
  }
  if (tiempo_fuera_planta_minutos !== undefined && puedeCambiarHoras) {
    tareas[idx].tiempo_fuera_planta_minutos = Math.max(0, parseInt(tiempo_fuera_planta_minutos) || 0);
  }
  if (motivo_fuera_planta !== undefined) {
    tareas[idx].motivo_fuera_planta = String(motivo_fuera_planta || '').trim();
  }

  // Retrocompatibilidad con tiempo_espera_minutos y motivo_espera
  if (tiempo_espera_minutos !== undefined && puedeCambiarHoras) {
    tareas[idx].tiempo_espera_minutos = Math.max(0, parseInt(tiempo_espera_minutos) || 0);
  } else if (tareas[idx].tiempo_espera_repuestos_minutos !== undefined || tareas[idx].tiempo_fuera_planta_minutos !== undefined) {
    tareas[idx].tiempo_espera_minutos = (tareas[idx].tiempo_espera_repuestos_minutos || 0) + (tareas[idx].tiempo_fuera_planta_minutos || 0);
  }

  if (motivo_espera !== undefined) {
    tareas[idx].motivo_espera = String(motivo_espera || '').trim();
  } else {
    const motivos = [tareas[idx].motivo_espera_repuestos, tareas[idx].motivo_fuera_planta].filter(Boolean);
    if (motivos.length > 0) tareas[idx].motivo_espera = motivos.join(' | ');
  }

  if (equipo !== undefined) tareas[idx].equipo = equipo.trim();
  if (titulo !== undefined) tareas[idx].titulo = titulo.trim();
  if (tipo !== undefined) tareas[idx].tipo = tipo.toLowerCase();
  if (prioridad !== undefined) tareas[idx].prioridad = prioridad;
  
  // Soporte explícito para Reabrir Tarea
  const puedeReabrir = esAdmin || tienePermiso(userRol, 'reabrir_tareas');
  const quiereReabrir = tareas[idx].estado === 'completado' && (req.body.reabrir === true || (estado !== undefined && estado !== 'completado'));
  if (quiereReabrir) {
    if (!puedeReabrir) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para reabrir una tarea finalizada.' });
    }
    tareas[idx].estado = (estado && estado !== 'completado') ? estado : 'en_proceso';
    tareas[idx].completado_en = null;
    tareas[idx].completado_por_usuario = null;
    tareas[idx].completado_por_nombre = null;
    tareas[idx].completado_por_rol = null;
    tareas[idx].fecha_arreglo = null;
    tareas[idx].tiempo_arreglo_minutos = null;
    tareas[idx].reabierta = true;
    tareas[idx].reabierta_en = new Date().toISOString();
    tareas[idx].reabierta_por = userRol;
  } else if (estado !== undefined) {
    if (tareas[idx].estado === 'completado' && estado !== 'completado' && !puedeReabrir) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar el estado de una tarea finalizada.' });
    }
    if (tareas[idx].estado !== 'completado' && estado === 'completado') {
      const puedeCerrar = esAdmin || tienePermiso(userRol, 'cerrar_tareas');
      if (!puedeCerrar) {
        return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para finalizar o cerrar tareas.' });
      }
    }
    tareas[idx].estado = estado;
  }

  // Soporte explícito para Quitar / Eliminar Foto Comprobante de Finalización
  if (req.body.eliminar_foto_comprobante === true || foto_comprobante === null) {
    if (!puedeCambiarFoto) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para eliminar fotografías de comprobante.' });
    }
    tareas[idx].foto_comprobante = null;
    tareas[idx].foto_comprobante_eliminada = true;
    tareas[idx].foto_actualizada_en = new Date().toISOString();
  }

  // Soporte explícito para Quitar / Eliminar Foto Inicial
  if (req.body.eliminar_foto_inicial === true || foto_inicial === null) {
    if (!puedeCambiarFoto) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para eliminar fotografías iniciales.' });
    }
    tareas[idx].foto_inicial = null;
    tareas[idx].foto_inicial_eliminada = true;
    tareas[idx].foto_inicial_actualizada_en = new Date().toISOString();
  }

  // Recalcular tiempo de parada (MTTR) con las fechas modificadas
  if (tareas[idx].fecha_ocurrencia && tareas[idx].fecha_arreglo && (tareas[idx].estado === 'completado' || tareas[idx].estado === 'por_aprobar')) {
    try {
      const fO = new Date(tareas[idx].fecha_ocurrencia).getTime();
      const fA = new Date(tareas[idx].fecha_arreglo).getTime();
      const diffMs = fA - fO;
      if (!isNaN(diffMs) && diffMs >= 0) {
        tareas[idx].tiempo_arreglo_minutos = Math.round(diffMs / (1000 * 60));
      } else if (!isNaN(diffMs) && diffMs < 0) {
        tareas[idx].tiempo_arreglo_minutos = 0;
      }
    } catch(e) {}
  } else if (!tareas[idx].fecha_arreglo || (tareas[idx].estado !== 'completado' && tareas[idx].estado !== 'por_aprobar')) {
    tareas[idx].tiempo_arreglo_minutos = null;
  }

  // Recalcular tiempo de trabajo activo si no fue explícito
  if (tiempo_trabajo_activo_minutos !== undefined && tiempo_trabajo_activo_minutos !== null) {
    if (!puedeCambiarHoras) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar tiempos de trabajo.' });
    }
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, parseInt(tiempo_trabajo_activo_minutos) || 0);
  } else if (tareas[idx].tiempo_arreglo_minutos !== null) {
    const espera = tareas[idx].tiempo_espera_minutos || 0;
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, (tareas[idx].tiempo_arreglo_minutos || 0) - espera);
  }

  // Desglose de horas por rol (ej: electrico 2h, mecanico 3h, o cómputo automático)
  if (tiempos_por_rol !== undefined) {
    if (!puedeCambiarHoras) {
      return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar tiempos por especialidad.' });
    }
    const rawTpr = typeof tiempos_por_rol === 'string' ? JSON.parse(tiempos_por_rol || '{}') : tiempos_por_rol;
    tareas[idx].tiempos_por_rol = calcularTiemposPorRol(tareas[idx], rawTpr, tareas[idx].completado_por_rol || userRol);
  } else if (tareas[idx].estado === 'completado') {
    tareas[idx].tiempos_por_rol = calcularTiemposPorRol(tareas[idx], tareas[idx].tiempos_por_rol, tareas[idx].completado_por_rol || userRol);
  }
  if (tiempos_por_tecnico !== undefined) {
    tareas[idx].tiempos_por_tecnico = typeof tiempos_por_tecnico === 'string' ? JSON.parse(tiempos_por_tecnico || '{}') : tiempos_por_tecnico;
  }

  tareas[idx].modificado_por_admin = true;
  tareas[idx].modificado_en = new Date().toISOString();

  guardarTareas(tareas, true);
  res.json({
    mensaje: 'Tarea, roles, participantes, fotografía y tiempos actualizados correctamente',
    tarea: tareas[idx]
  });
});

// Endpoint directo: Reabrir Tarea
app.post('/api/tasks/:id/reabrir', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!tienePermiso(userRol, 'reabrir_tareas')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para reabrir tareas finalizadas.' });
  }

  let tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  const { nuevo_estado, quitar_foto } = req.body;
  tareas[idx].estado = nuevo_estado || 'en_proceso';
  tareas[idx].completado_en = null;
  tareas[idx].completado_por_usuario = null;
  tareas[idx].completado_por_nombre = null;
  tareas[idx].completado_por_rol = null;
  tareas[idx].fecha_arreglo = null;
  tareas[idx].tiempo_arreglo_minutos = null;
  tareas[idx].reabierta = true;
  tareas[idx].reabierta_en = new Date().toISOString();
  tareas[idx].reabierta_por = userRol;
  tareas[idx].modificado_en = new Date().toISOString();

  if (quitar_foto === true) {
    tareas[idx].foto_comprobante = null;
    tareas[idx].foto_comprobante_eliminada = true;
  }

  guardarTareas(tareas, true);
  console.log(`[SIMAN] Tarea ${tareas[idx].id} reabierta con éxito exclusivamente por Admin.`);
  res.json({ ok: true, mensaje: `Tarea ${tareas[idx].id} reabierta exitosamente.`, tarea: tareas[idx] });
});

// Endpoint directo: Quitar Foto Comprobante de Finalización
app.delete('/api/tasks/:id/foto', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin' && !tienePermiso(userRol, 'cambiar_foto')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene permiso para eliminar fotografías de comprobante.' });
  }

  let tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  tareas[idx].foto_comprobante = null;
  tareas[idx].foto_comprobante_eliminada = true;
  tareas[idx].modificado_en = new Date().toISOString();

  guardarTareas(tareas, true);
  console.log(`[SIMAN] Foto comprobante eliminada de ${tareas[idx].id} exclusivamente por Admin.`);
  res.json({ ok: true, mensaje: 'Fotografía comprobante eliminada correctamente.', tarea: tareas[idx] });
});

// 7.2. Actualizar o Cambiar Fotografía (Disponible incluso si la tarea ya está finalizada)
app.post('/api/tasks/:id/foto', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!tienePermiso(userRol, 'cambiar_foto')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para cambiar o subir fotografías.' });
  }

  let tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  const { foto_base64 } = req.body;
  if (!foto_base64 || !foto_base64.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Se requiere una imagen válida en formato Data URL Base64.' });
  }

  const fotoSubida = await imageStorage.subirImagenNube(foto_base64, `comp_${tareas[idx].id}`, 'comprobantes');

  tareas[idx].foto_comprobante = fotoSubida;
  tareas[idx].foto_actualizada_en = new Date().toISOString();
  tareas[idx].foto_actualizada_por = req.headers['x-user-name'] || req.headers['x-user-username'] || 'Usuario';

  guardarTareas(tareas);
  res.json({
    mensaje: 'Fotografía actualizada y respaldada en la nube con éxito',
    tarea: tareas[idx]
  });
});

// 7.3. Actualizar o Cambiar Fotografía Inicial del Daño / Reporte
app.post('/api/tasks/:id/foto-inicial', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!tienePermiso(userRol, 'cambiar_foto')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar fotografías.' });
  }

  let tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  const { foto_base64 } = req.body;
  if (!foto_base64 || !foto_base64.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Se requiere una imagen válida en formato Data URL Base64.' });
  }

  const fotoSubida = await imageStorage.subirImagenNube(foto_base64, `ini_${tareas[idx].id}`, 'iniciales');

  tareas[idx].foto_inicial = fotoSubida;
  tareas[idx].foto_inicial_actualizada_en = new Date().toISOString();
  tareas[idx].foto_inicial_actualizada_por = req.headers['x-user-name'] || req.headers['x-user-username'] || 'Usuario';

  guardarTareas(tareas);
  res.json({
    mensaje: 'Fotografía inicial de la falla actualizada con éxito',
    tarea: tareas[idx]
  });
});

// 8. Eliminar tarea
app.delete('/api/tasks/:id', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!tienePermiso(userRol, 'eliminar_tareas')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para eliminar tareas.' });
  }

  let tareas = leerTareas();
  const tarea = tareas.find(t => t.id === req.params.id);
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });

  // Si tiene foto y no es demo, eliminar archivo
  if (tarea.foto_comprobante && !tarea.foto_comprobante.includes('demo-') && !tarea.foto_comprobante.startsWith('data:')) {
    const filePath = path.join(__dirname, tarea.foto_comprobante);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch(e) {}
    }
  }

  tareas = tareas.filter(t => t.id !== req.params.id);
  guardarTareas(tareas, true);
  generarRespaldoAutomatico('eliminar_tarea');
  res.json({ mensaje: 'Tarea eliminada exitosamente' });
});

// 8.1. Bitácora de Avances de Tarea en Curso (Para mecánicos, eléctricos y maquinistas)
app.post('/api/tasks/:id/avances', async (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol === 'visualizador') {
    return res.status(403).json({ error: 'Acceso Restringido: El rol de Solo Visualizar no tiene permiso para registrar avances.' });
  }

  let tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  const {
    descripcion,
    horas_dedicadas,
    foto_base64,
    fecha_hora,
    tecnico_nombre
  } = req.body;

  if (!descripcion || !descripcion.trim()) {
    return res.status(400).json({ error: 'La descripción del avance es obligatoria.' });
  }

  const usernameFinal = req.headers['x-user-username'] || 'tecnico';
  const nombreFinal = req.headers['x-user-name'] || tecnico_nombre || 'Técnico';
  const rolFinal = req.headers['x-user-role'] || 'mecanico';

  const horasNum = parseFloat(horas_dedicadas) || 0;
  const minutosDedicados = Math.round(horasNum * 60);

  // Subir fotografía de avance a Cloudinary si está disponible
  let fotoAvanceFinal = null;
  if (foto_base64 && foto_base64.startsWith('data:image/')) {
    fotoAvanceFinal = await imageStorage.subirImagenNube(foto_base64, `av_${tareas[idx].id}_${Date.now()}`, 'avances');
  }

  const nuevoAvance = {
    id: `AV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    fecha_hora: fecha_hora || new Date().toISOString().slice(0, 16),
    tecnico_nombre: nombreFinal,
    tecnico_usuario: usernameFinal,
    tecnico_rol: rolFinal,
    descripcion: descripcion.trim(),
    horas_dedicadas: horasNum,
    minutos_dedicados: minutosDedicados,
    foto: fotoAvanceFinal,
    creado_en: new Date().toISOString()
  };

  if (!Array.isArray(tareas[idx].avances)) {
    tareas[idx].avances = [];
  }
  tareas[idx].avances.unshift(nuevoAvance);

  // Si la tarea estaba en pendiente, poner automáticamente en progreso
  if (tareas[idx].estado === 'pendiente') {
    tareas[idx].estado = 'en_progreso';
  }

  // Asegurar que el técnico figure en los asignados
  if (!Array.isArray(tareas[idx].tecnicos_asignados)) {
    tareas[idx].tecnicos_asignados = [];
  }
  if (!tareas[idx].tecnicos_asignados.includes(nombreFinal)) {
    tareas[idx].tecnicos_asignados.push(nombreFinal);
    tareas[idx].mecanico_asignado = tareas[idx].tecnicos_asignados.join(', ');
  }

  // Si registró horas dedicadas en este avance, sumar al rol correspondiente
  if (minutosDedicados > 0) {
    if (!tareas[idx].tiempos_por_rol) {
      tareas[idx].tiempos_por_rol = { mecanico: 0, electrico: 0, maquinista: 0 };
    }
    const rolKey = normalizarRol(rolFinal);
    tareas[idx].tiempos_por_rol[rolKey] = (parseInt(tareas[idx].tiempos_por_rol[rolKey]) || 0) + minutosDedicados;
  }

  tareas[idx].actualizado_en = new Date().toISOString();
  guardarTareas(tareas);
  generarRespaldoAutomatico('registro_avance');

  res.status(201).json({
    mensaje: 'Avance registrado exitosamente en la bitácora',
    avance: nuevoAvance,
    tarea: tareas[idx]
  });
});

app.get('/api/tasks/:id/avances', (req, res) => {
  const tareas = leerTareas();
  const tarea = tareas.find(t => t.id === req.params.id);
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json(tarea.avances || []);
});

app.delete('/api/tasks/:id/avances/:avanceId', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Solo el Administrador puede eliminar registros de avances.' });
  }

  let tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });

  if (Array.isArray(tareas[idx].avances)) {
    tareas[idx].avances = tareas[idx].avances.filter(a => a.id !== req.params.avanceId);
    guardarTareas(tareas);
    generarRespaldoAutomatico('eliminar_avance');
  }

  res.json({ mensaje: 'Avance eliminado correctamente', avances: tareas[idx].avances || [] });
});

// ==========================================
// MÓDULO ALMACÉN & REMISIONES DE SALIDA
// ==========================================

// 1. Listar Remisiones
app.get('/api/remisiones', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin' && !tienePermiso(userRol, 'ver_almacen')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para acceder al módulo de Almacén.' });
  }

  let remisiones = leerRemisiones();
  const { estado, q, area } = req.query;

  if (estado && estado !== 'todos') {
    remisiones = remisiones.filter(r => r.estado === estado);
  }
  if (area && area !== 'todos') {
    remisiones = remisiones.filter(r => (r.area || '').toLowerCase() === area.toLowerCase());
  }
  if (q && q.trim()) {
    const term = q.trim().toLowerCase();
    remisiones = remisiones.filter(r => {
      const itemsTxt = Array.isArray(r.items) ? r.items.map(it => `${it.descripcion || ''} ${it.observaciones || ''}`).join(' ') : '';
      const haystack = `${r.consecutivo || ''} ${r.id || ''} ${r.remitido_por || ''} ${r.cargo_remitente || ''} ${r.dependencia || ''} ${(r.transportador && r.transportador.nombre) || ''} ${(r.transportador && r.transportador.vehiculo_placa) || ''} ${(r.destino && r.destino.empresa_proveedor) || ''} ${itemsTxt} ${r.observaciones_generales || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }

  remisiones.sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0));
  res.json(remisiones);
});

// 2. Resumen y KPIs de Almacén
app.get('/api/remisiones/stats', (req, res) => {
  const remisiones = leerRemisiones();
  const fuera = remisiones.filter(r => r.estado === 'fuera_planta');
  const retornadas = remisiones.filter(r => r.estado === 'retornado');
  
  let totalItemsFuera = 0;
  fuera.forEach(r => {
    if (Array.isArray(r.items)) {
      r.items.forEach(it => {
        totalItemsFuera += (parseFloat(it.cantidad) || 1);
      });
    } else {
      totalItemsFuera += 1;
    }
  });

  const destinosUnicos = new Set(fuera.map(r => (r.destino && r.destino.empresa_proveedor) || 'Desconocido').filter(Boolean));

  res.json({
    total_remisiones: remisiones.length,
    fuera_de_planta: fuera.length,
    retornadas: retornadas.length,
    total_piezas_fuera: totalItemsFuera,
    destinos_activos: Array.from(destinosUnicos),
    consecutivo_siguiente: generarConsecutivoRemision()
  });
});

// 3. Detalle de Remisión por ID o Consecutivo
app.get('/api/remisiones/:id', (req, res) => {
  const remisiones = leerRemisiones();
  const rem = remisiones.find(r => r.id === req.params.id || r.consecutivo === req.params.id);
  if (!rem) return res.status(404).json({ error: 'Remisión no encontrada' });
  res.json(rem);
});

// 4. Crear Nueva Remisión de Salida
app.post('/api/remisiones', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const userName = req.headers['x-user-name'] || req.headers['x-user-username'] || 'Usuario';
  if (userRol !== 'admin' && !tienePermiso(userRol, 'crear_remisiones')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para generar remisiones de salida.' });
  }

  const {
    consecutivo,
    area,
    fecha_remision,
    hora_salida,
    remitido_por,
    cargo_remitente,
    dependencia,
    transportador,
    destino,
    items,
    observaciones_generales,
    foto_salida_base64
  } = req.body;

  if (!fecha_remision) {
    return res.status(400).json({ error: 'La fecha de remisión es obligatoria.' });
  }

  const remisiones = leerRemisiones();
  const consecutivoFinal = (consecutivo && consecutivo.trim()) ? consecutivo.trim() : generarConsecutivoRemision();
  const idUnico = `REM-${Date.now()}`;

  let fotoUrl = null;
  if (foto_salida_base64 && foto_salida_base64.startsWith('data:image/')) {
    try {
      fotoUrl = await imageStorage.subirImagenNube(foto_salida_base64, `salida_${idUnico}`, 'remisiones');
    } catch(err) {
      console.warn('Error subiendo foto de salida:', err.message);
    }
  }

  let itemsFinales = [];
  if (Array.isArray(items) && items.length > 0) {
    itemsFinales = items.map((it, idx) => ({
      item_num: idx + 1,
      cantidad: parseFloat(it.cantidad) || 1,
      unidad: (it.unidad || 'Und').trim(),
      descripcion: (it.descripcion || '').trim(),
      observaciones: (it.observaciones || '').trim()
    })).filter(it => it.descripcion);
  }
  if (itemsFinales.length === 0) {
    itemsFinales = [{
      item_num: 1,
      cantidad: 1,
      unidad: 'Und',
      descripcion: req.body.descripcion_material || 'Material enviado a taller',
      observaciones: observaciones_generales || ''
    }];
  }

  const nuevaRemision = {
    id: idUnico,
    consecutivo: consecutivoFinal,
    area: (area || 'operativa').toLowerCase().trim(),
    fecha_remision: fecha_remision.trim(),
    hora_salida: (hora_salida || '08:00 a.m.').trim(),
    remitido_por: (remitido_por || userName).trim(),
    cargo_remitente: (cargo_remitente || 'Almacenista').trim(),
    dependencia: (dependencia || 'Operativa').trim(),
    transportador: {
      nombre: (transportador && transportador.nombre ? transportador.nombre : '').trim(),
      cc_nit: (transportador && transportador.cc_nit ? transportador.cc_nit : '').trim(),
      vehiculo_placa: (transportador && transportador.vehiculo_placa ? transportador.vehiculo_placa : '').trim()
    },
    destino: {
      empresa_proveedor: (destino && destino.empresa_proveedor ? destino.empresa_proveedor : 'Taller Externo').trim(),
      contacto: (destino && destino.contacto ? destino.contacto : '').trim(),
      telefono: (destino && destino.telefono ? destino.telefono : '').trim(),
      direccion: (destino && destino.direccion ? destino.direccion : '').trim()
    },
    items: itemsFinales,
    observaciones_generales: (observaciones_generales || '').trim(),
    foto_salida: fotoUrl,
    estado: 'fuera_planta',
    creado_por: req.headers['x-user-username'] || userName,
    creado_por_nombre: userName,
    creado_por_rol: userRol,
    creado_en: new Date().toISOString(),
    retorno: null
  };

  remisiones.push(nuevaRemision);
  guardarRemisiones(remisiones);
  generarRespaldoAutomatico('crear_remision');

  res.json({
    ok: true,
    mensaje: `Remisión de Salida N° ${consecutivoFinal} generada exitosamente.`,
    remision: nuevaRemision
  });
});

// 5. Modificar Remisión de Salida
app.put('/api/remisiones/:id', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin' && !tienePermiso(userRol, 'crear_remisiones')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para modificar remisiones.' });
  }

  let remisiones = leerRemisiones();
  const idx = remisiones.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Remisión no encontrada' });

  const {
    consecutivo,
    area,
    fecha_remision,
    hora_salida,
    remitido_por,
    cargo_remitente,
    dependencia,
    transportador,
    destino,
    items,
    observaciones_generales,
    foto_salida_base64
  } = req.body;

  if (consecutivo !== undefined) remisiones[idx].consecutivo = consecutivo.trim();
  if (area !== undefined) remisiones[idx].area = area.toLowerCase().trim();
  if (fecha_remision !== undefined) remisiones[idx].fecha_remision = fecha_remision.trim();
  if (hora_salida !== undefined) remisiones[idx].hora_salida = hora_salida.trim();
  if (remitido_por !== undefined) remisiones[idx].remitido_por = remitido_por.trim();
  if (cargo_remitente !== undefined) remisiones[idx].cargo_remitente = cargo_remitente.trim();
  if (dependencia !== undefined) remisiones[idx].dependencia = dependencia.trim();
  if (transportador !== undefined) remisiones[idx].transportador = { ...remisiones[idx].transportador, ...transportador };
  if (destino !== undefined) remisiones[idx].destino = { ...remisiones[idx].destino, ...destino };
  if (observaciones_generales !== undefined) remisiones[idx].observaciones_generales = observaciones_generales.trim();

  if (Array.isArray(items)) {
    remisiones[idx].items = items.map((it, i) => ({
      item_num: i + 1,
      cantidad: parseFloat(it.cantidad) || 1,
      unidad: (it.unidad || 'Und').trim(),
      descripcion: (it.descripcion || '').trim(),
      observaciones: (it.observaciones || '').trim()
    })).filter(it => it.descripcion);
  }

  if (foto_salida_base64 && foto_salida_base64.startsWith('data:image/')) {
    remisiones[idx].foto_salida = await imageStorage.subirImagenNube(foto_salida_base64, `salida_${remisiones[idx].id}`, 'remisiones');
  }

  remisiones[idx].modificado_en = new Date().toISOString();
  remisiones[idx].modificado_por = req.headers['x-user-username'] || userRol;

  guardarRemisiones(remisiones);
  res.json({
    ok: true,
    mensaje: `Remisión N° ${remisiones[idx].consecutivo} actualizada correctamente.`,
    remision: remisiones[idx]
  });
});

// 6. FINALIZAR REMISIÓN: Registrar Llegada / Retorno del Material a Planta
app.post('/api/remisiones/:id/finalizar', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  const userName = req.headers['x-user-name'] || req.headers['x-user-username'] || 'Almacenista';
  if (userRol !== 'admin' && !tienePermiso(userRol, 'finalizar_remisiones')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para finalizar remisiones de salida.' });
  }

  let remisiones = leerRemisiones();
  const idx = remisiones.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Remisión no encontrada' });

  const {
    fecha_recibido,
    hora_recibido,
    recibido_por,
    cargo_receptor,
    dependencia_receptora,
    estado_material,
    observaciones_retorno,
    foto_retorno_base64
  } = req.body;

  let fotoUrl = null;
  if (foto_retorno_base64 && foto_retorno_base64.startsWith('data:image/')) {
    try {
      fotoUrl = await imageStorage.subirImagenNube(foto_retorno_base64, `ret_${remisiones[idx].id}`, 'remisiones_retorno');
    } catch(e) {
      console.warn('Error subiendo foto de retorno:', e.message);
    }
  }

  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const horaActualStr = hoy.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

  remisiones[idx].estado = 'retornado';
  remisiones[idx].retorno = {
    fecha_recibido: (fecha_recibido || hoyStr).trim(),
    hora_recibido: (hora_recibido || horaActualStr).trim(),
    recibido_por: (recibido_por || userName).trim(),
    cargo_receptor: (cargo_receptor || 'Almacenista').trim(),
    dependencia_receptora: (dependencia_receptora || 'Almacén Planta').trim(),
    estado_material: (estado_material || 'Reparado / Conforme').trim(),
    observaciones_retorno: (observaciones_retorno || 'Material recibido y verificado en planta.').trim(),
    foto_retorno: fotoUrl,
    finalizado_por: req.headers['x-user-username'] || userName,
    finalizado_por_nombre: userName,
    finalizado_por_rol: userRol,
    finalizado_en: new Date().toISOString()
  };

  guardarRemisiones(remisiones);
  generarRespaldoAutomatico('retorno_material_planta');

  console.log(`[SIMAN] 📦 Remisión ${remisiones[idx].consecutivo} finalizada con éxito. Material retornado a planta.`);
  res.json({
    ok: true,
    mensaje: `¡Excelente! Material de la remisión N° ${remisiones[idx].consecutivo} registrado en planta. La remisión ha quedado FINALIZADA.`,
    remision: remisiones[idx]
  });
});

// 7. Reabrir Remisión
app.post('/api/remisiones/:id/reabrir', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin' && !tienePermiso(userRol, 'finalizar_remisiones')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para reabrir remisiones.' });
  }

  let remisiones = leerRemisiones();
  const idx = remisiones.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Remisión no encontrada' });

  remisiones[idx].estado = 'fuera_planta';
  remisiones[idx].reabierta = true;
  remisiones[idx].reabierta_en = new Date().toISOString();
  remisiones[idx].reabierta_por = userRol;

  guardarRemisiones(remisiones);
  res.json({
    ok: true,
    mensaje: `Remisión N° ${remisiones[idx].consecutivo} reabierta a estado 'Fuera de Planta'.`,
    remision: remisiones[idx]
  });
});

// 8. Eliminar Remisión
app.delete('/api/remisiones/:id', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin' && !tienePermiso(userRol, 'eliminar_remisiones')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para eliminar remisiones.' });
  }

  let remisiones = leerRemisiones();
  const rem = remisiones.find(r => r.id === req.params.id);
  if (!rem) return res.status(404).json({ error: 'Remisión no encontrada' });

  remisiones = remisiones.filter(r => r.id !== req.params.id);
  guardarRemisiones(remisiones);
  generarRespaldoAutomatico('eliminar_remision');

  res.json({
    ok: true,
    mensaje: `Remisión eliminada exitosamente.`
  });
});

// Variable y función de migración en segundo plano de fotos históricas a Cloudinary
let migracionFotosEnCurso = false;
let estadoMigracion = { en_curso: false, total_migradas: 0, restantes: 0, error: null };

async function iniciarMigracionSegundoPlano(limiteTotal = 500) {
  if (migracionFotosEnCurso) return { iniciada: false, motivo: 'Ya hay una migración en curso', estado: estadoMigracion };
  if (!imageStorage.isConfigurado()) return { iniciada: false, motivo: 'Cloudinary no configurado', estado: estadoMigracion };

  migracionFotosEnCurso = true;
  estadoMigracion = { en_curso: true, total_migradas: 0, restantes: 0, error: null };

  // Ejecutar en segundo plano de manera desacoplada
  (async () => {
    try {
      console.log('[Cloudinary-Migracion] 🚀 Iniciando proceso en segundo plano para migrar fotos históricas a Cloudinary...');
      let totalMigradas = 0;
      while (totalMigradas < limiteTotal) {
        const tareas = leerTareas();
        const res = await imageStorage.migrarFotosExistentes(tareas, 10);
        if (res.migrados > 0) {
          totalMigradas += res.migrados;
          estadoMigracion.total_migradas = totalMigradas;
          estadoMigracion.restantes = res.totalPendientes;
          guardarTareas(tareas, true);
          console.log(`[Cloudinary-Migracion] 📸 Lote completado: ${totalMigradas} fotos migradas. Quedan ${res.totalPendientes} pendientes.`);
        }
        if (res.migrados === 0 || res.totalPendientes === 0) {
          console.log(`[Cloudinary-Migracion] 🎉 Todas las fotos históricas han sido migradas exitosamente a Cloudinary (Total: ${totalMigradas})!`);
          break;
        }
        // Esperar 1 segundo entre lotes para no saturar memoria ni CPU en Render
        await new Promise(r => setTimeout(r, 1000));
      }
      generarRespaldoAutomatico('migracion_completa_cloudinary');
    } catch(err) {
      console.error('[Cloudinary-Migracion] ❌ Error en migración:', err.message);
      estadoMigracion.error = err.message;
    } finally {
      migracionFotosEnCurso = false;
      estadoMigracion.en_curso = false;
    }
  })();

  return { iniciada: true, mensaje: 'Migración de fotos a Cloudinary iniciada en segundo plano', estado: estadoMigracion };
}

// 8.2. Estado y Migración de Almacenamiento en la Nube (Cloudinary)
app.get('/api/admin/cloudinary-status', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo Administrador.' });
  }
  const tareas = leerTareas();
  let base64Count = 0;
  let cdnCount = 0;
  tareas.forEach(t => {
    if (t.foto_comprobante) {
      if (t.foto_comprobante.startsWith('data:image/')) base64Count++;
      else if (t.foto_comprobante.startsWith('http')) cdnCount++;
    }
    if (t.foto_inicial) {
      if (t.foto_inicial.startsWith('data:image/')) base64Count++;
      else if (t.foto_inicial.startsWith('http')) cdnCount++;
    }
    if (Array.isArray(t.avances)) {
      t.avances.forEach(a => {
        if (a.foto) {
          if (a.foto.startsWith('data:image/')) base64Count++;
          else if (a.foto.startsWith('http')) cdnCount++;
        }
      });
    }
  });

  res.json({
    configurado: imageStorage.isConfigurado(),
    fotos_en_base64: base64Count,
    fotos_en_cdn: cdnCount,
    total_tareas: tareas.length,
    migracion: estadoMigracion
  });
});

app.post('/api/admin/migrar-fotos-cloudinary', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo Administrador.' });
  }
  if (!imageStorage.isConfigurado()) {
    return res.status(400).json({ error: 'Cloudinary no está configurado en las variables de entorno aún.' });
  }

  const resultado = await iniciarMigracionSegundoPlano(500);
  res.json(resultado);
});

// 9. Métricas y KPIs para el dashboard (con filtro de período, horas de roles y tiempos muertos)
app.get('/api/metrics', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin' && !tienePermiso(userRol, 'ver_dashboard')) {
    return res.status(403).json({ error: 'Acceso Restringido: Su rol no tiene autorización para visualizar métricas del Dashboard.' });
  }

  let tareas = leerTareas();

  // Filtro por período basado en fecha_ocurrencia
  const periodo = req.query.periodo || 'todo';
  if (periodo !== 'todo') {
    const ahora = new Date();
    let desde = null;
    switch (periodo) {
      case 'dia':
        desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
        break;
      case 'semana':
        const diaSemana = ahora.getDay(); // 0=Dom
        desde = new Date(ahora);
        desde.setDate(ahora.getDate() - diaSemana);
        desde.setHours(0, 0, 0, 0);
        break;
      case 'mes':
        desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'semestre':
        const mesActual = ahora.getMonth();
        const inicioSemestre = mesActual < 6 ? 0 : 6;
        desde = new Date(ahora.getFullYear(), inicioSemestre, 1, 0, 0, 0, 0);
        break;
      case 'anual':
        desde = new Date(ahora.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
    }
    if (desde) {
      tareas = tareas.filter(t => {
        const fecha = new Date(t.fecha_ocurrencia || t.creado_en);
        return !isNaN(fecha) && fecha >= desde;
      });
    }
  }

  const total = tareas.length;
  const pendientes = tareas.filter(t => t.estado === 'pendiente').length;
  const en_progreso = tareas.filter(t => t.estado === 'en_progreso').length;
  const por_aprobar = tareas.filter(t => t.estado === 'por_aprobar').length;
  const completadas = tareas.filter(t => t.estado === 'completado').length;

  // Conteo por tipo dinámico
  const por_tipo = {};
  TIPOS_VALIDOS.forEach(tp => {
    por_tipo[tp] = tareas.filter(t => t.tipo === tp).length;
  });
  tareas.forEach(t => {
    if (t.tipo && !TIPOS_VALIDOS.includes(t.tipo)) {
      por_tipo[t.tipo] = (por_tipo[t.tipo] || 0) + 1;
    }
  });

  // Cálculo de MTTR (Mean Time to Repair / Tiempo Medio de Arreglo)
  const completadasConTiempo = tareas.filter(t => t.estado === 'completado' && typeof t.tiempo_arreglo_minutos === 'number' && t.tiempo_arreglo_minutos >= 0);
  
  let mttr_global_minutos = 0;
  if (completadasConTiempo.length > 0) {
    const sumaMinutos = completadasConTiempo.reduce((acc, cur) => acc + cur.tiempo_arreglo_minutos, 0);
    mttr_global_minutos = Math.round(sumaMinutos / completadasConTiempo.length);
  }

  // MTTR por tipo
  const getMttrTipo = (tipoNombre) => {
    const filtradas = completadasConTiempo.filter(t => t.tipo === tipoNombre);
    if (filtradas.length === 0) return { minutos: 0, formato: '0 min' };
    const suma = filtradas.reduce((acc, cur) => acc + cur.tiempo_arreglo_minutos, 0);
    const avg = Math.round(suma / filtradas.length);
    return { minutos: avg, formato: formatMinutes(avg), total: filtradas.length };
  };

  const mttr_por_tipo = {};
  TIPOS_VALIDOS.forEach(tp => {
    mttr_por_tipo[tp] = getMttrTipo(tp);
  });

  // ================= CÁLCULO DE HORAS DE MANO DE OBRA Y TIEMPOS MUERTOS =================
  let horas_mecanica_min = 0;
  let horas_electrica_min = 0;
  let horas_maquinaria_min = 0;
  let tiempo_repuestos_min = 0;
  let tiempo_fuera_planta_min = 0;
  let tiempo_activo_total_min = 0;
  let total_avances = 0;

  tareas.forEach(t => {
    // Horas por especialidad (cálculo dinámico y robusto por rol)
    const tTpr = calcularTiemposPorRol(t, t.tiempos_por_rol, t.completado_por_rol);
    horas_mecanica_min += (parseInt(tTpr.mecanico) || 0);
    horas_electrica_min += (parseInt(tTpr.electrico) || 0);
    horas_maquinaria_min += (parseInt(tTpr.maquinista) || 0);
    
    // Tiempos muertos
    const tEsp = parseInt(t.tiempo_espera_repuestos_minutos) || parseInt(t.tiempo_espera_minutos) || 0;
    const tExt = parseInt(t.tiempo_fuera_planta_minutos) || 0;
    
    // Detección automática por texto si no fue explícito
    const motivoTexto = ((t.motivo_espera || '') + ' ' + (t.motivo_fuera_planta || '')).toLowerCase();
    if (tExt === 0 && tEsp > 0 && (motivoTexto.includes('torno') || motivoTexto.includes('taller') || motivoTexto.includes('extern') || motivoTexto.includes('fuera'))) {
      tiempo_fuera_planta_min += tEsp;
    } else {
      tiempo_repuestos_min += tEsp;
      tiempo_fuera_planta_min += tExt;
    }

    if (t.tiempo_trabajo_activo_minutos !== undefined && t.tiempo_trabajo_activo_minutos !== null) {
      tiempo_activo_total_min += (parseInt(t.tiempo_trabajo_activo_minutos) || 0);
    }

    if (Array.isArray(t.avances)) {
      total_avances += t.avances.length;
    }
  });

  const tiempo_muerto_total_min = tiempo_repuestos_min + tiempo_fuera_planta_min;
  const horas_roles_total_min = horas_mecanica_min + horas_electrica_min + horas_maquinaria_min;

  res.json({
    total,
    pendientes,
    en_progreso,
    por_aprobar,
    completadas,
    por_tipo,
    mttr_global_minutos,
    mttr_global_formato: formatMinutes(mttr_global_minutos),
    mttr_por_tipo,
    tasa_completitud: total > 0 ? Math.round((completadas / total) * 100) : 0,
    periodo,
    // Horas por especialidad
    horas_mecanica_minutos: horas_mecanica_min,
    horas_mecanica_formato: formatMinutes(horas_mecanica_min),
    horas_electrica_minutos: horas_electrica_min,
    horas_electrica_formato: formatMinutes(horas_electrica_min),
    horas_maquinaria_minutos: horas_maquinaria_min,
    horas_maquinaria_formato: formatMinutes(horas_maquinaria_min),
    horas_roles_total_minutos: horas_roles_total_min,
    horas_roles_total_formato: formatMinutes(horas_roles_total_min),
    // Tiempos muertos
    tiempo_espera_repuestos_minutos: tiempo_repuestos_min,
    tiempo_espera_repuestos_formato: formatMinutes(tiempo_repuestos_min),
    tiempo_fuera_planta_minutos: tiempo_fuera_planta_min,
    tiempo_fuera_planta_formato: formatMinutes(tiempo_fuera_planta_min),
    tiempo_muerto_total_minutos: tiempo_muerto_total_min,
    tiempo_muerto_total_formato: formatMinutes(tiempo_muerto_total_min),
    tiempo_trabajo_activo_total_minutos: tiempo_activo_total_min,
    tiempo_trabajo_activo_total_formato: formatMinutes(tiempo_activo_total_min),
    total_avances
  });
});

// ================= COPIA DE SEGURIDAD Y RESPALDOS AUTOMÁTICOS =================

const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
}

let ultimoRespaldoClave = '';

function generarRespaldoAutomatico(motivo = 'sistema') {
  try {
    const now = new Date();
    // Hora Colombia (UTC-5)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bogotaTime = new Date(utc - (5 * 3600000));
    const fechaStr = bogotaTime.toISOString().slice(0, 10);
    const horaStr = bogotaTime.toTimeString().slice(0, 8).replace(/:/g, '-');

    const backupData = {
      sistema: 'SIMAN Industrial Maintenance',
      tipo: 'respaldo_automatico',
      exportado_en: now.toISOString(),
      hora_colombia: `${fechaStr} ${horaStr.replace(/-/g, ':')}`,
      motivo: motivo,
      users: leerUsuarios(),
      tasks: leerTareas(),
      mecanicos: leerMecanicos(),
      permisos: leerPermisos(),
      remisiones: leerRemisiones()
    };

    const payload = JSON.stringify(backupData, null, 2);

    // 1. Guardar siempre el último respaldo accesible
    fs.writeFileSync(path.join(BACKUP_DIR, 'ultimo_respaldo.json'), payload, 'utf8');

    // 2. Guardar archivo diario rotativo
    const archivoDiario = path.join(BACKUP_DIR, `SIMAN_AutoBackup_${fechaStr}.json`);
    fs.writeFileSync(archivoDiario, payload, 'utf8');

    console.log(`[RESPALDO AUTOMÁTICO] Respaldo guardado exitosamente (${motivo}) -> ${archivoDiario}`);

    // 3. Rotación: mantener los últimos 30 respaldos diarios
    try {
      const archivos = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('SIMAN_AutoBackup_') && f.endsWith('.json'))
        .sort();
      while (archivos.length > 30) {
        const aBorrar = archivos.shift();
        fs.unlinkSync(path.join(BACKUP_DIR, aBorrar));
      }
    } catch (e) {}

    // 4. Si existe GITHUB_TOKEN en variables de entorno, sincronizar directamente con GitHub
    if (process.env.GITHUB_TOKEN) {
      sincronizarConGitHub(`backups/SIMAN_AutoBackup_${fechaStr}.json`, payload, `chore(backup): respaldo automático ${fechaStr} (${motivo})`)
        .catch(err => console.error('[GITHUB-SYNC] Error sincronizando respaldo con GitHub:', err.message));
    }

    if (global.gc) {
      try { global.gc(); } catch(e) {}
    }

    return { ok: true, fecha: fechaStr, totalTareas: backupData.tasks.length };
  } catch (err) {
    console.error('[RESPALDO AUTOMÁTICO] Error generando copia:', err);
    return { ok: false, error: err.message };
  }
}

// Sincronizador directo con la API de GitHub (usando GITHUB_TOKEN si está configurado en Render)
async function sincronizarConGitHub(rutaArchivo, contenidoString, mensajeCommit) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { sincronizado: false, motivo: 'Sin GITHUB_TOKEN configurado' };

  const owner = 'HolgerTorrado';
  const repo = 'mantenimiento';
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${rutaArchivo}`;

  let sha = undefined;
  try {
    const getRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SIMAN-AutoBackup-Bot'
      }
    });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }
  } catch (e) {}

  const bodyPayload = {
    message: mensajeCommit || `chore: actualizar ${rutaArchivo} [auto-backup]`,
    content: Buffer.from(contenidoString, 'utf8').toString('base64'),
    branch: 'main'
  };
  if (sha) bodyPayload.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'SIMAN-AutoBackup-Bot'
    },
    body: JSON.stringify(bodyPayload)
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub API error ${putRes.status}: ${errText}`);
  }

  const putData = await putRes.json();
  console.log(`[GITHUB-SYNC] Archivo ${rutaArchivo} guardado y commiteado en GitHub exitosamente (commit: ${putData.commit?.sha?.slice(0, 7)})`);
  return { sincronizado: true, sha: putData.commit?.sha };
}

// Reloj programador automático (Ejecuta a las 05:00 AM y 06:00 AM hora Colombia)
setInterval(() => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bogotaTime = new Date(utc - (5 * 3600000));
  const horas = bogotaTime.getHours();
  const minutos = bogotaTime.getMinutes();
  const fechaStr = bogotaTime.toISOString().slice(0, 10);

  // Ejecutar a las 5:00 AM y a las 6:00 AM en punto
  if ((horas === 5 || horas === 6) && minutos === 0) {
    const clave = `${fechaStr}_${horas}`;
    if (ultimoRespaldoClave !== clave) {
      ultimoRespaldoClave = clave;
      console.log(`[CRON 5AM/6AM] ⏰ Ejecutando respaldo matutino automático de las ${horas}:00 AM (Colombia)...`);
      generarRespaldoAutomatico(`programado_${horas}am_colombia`);
    }
  }
}, 30000);

// Generar un respaldo inicial al arrancar el servidor si no existe el de hoy
setTimeout(() => {
  generarRespaldoAutomatico('inicio_servidor');
}, 5000);

// Endpoint universal de exportación de respaldo (para navegador, admin y GitHub Actions)
app.get('/api/backup/export', (req, res) => {
  res.json({
    sistema: 'SIMAN Industrial Maintenance',
    exportado_en: new Date().toISOString(),
    users: leerUsuarios(),
    tasks: leerTareas(),
    mecanicos: leerMecanicos(),
    permisos: leerPermisos(),
    remisiones: leerRemisiones()
  });
});

// Endpoint compatible con versiones previas
app.get('/api/backup', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol && userRol !== 'admin') {
    return res.status(403).json({ error: 'Permiso denegado: Solo el Administrador Holger puede exportar respaldos.' });
  }
  res.json({
    sistema: 'SIMAN Industrial Maintenance',
    exportado_en: new Date().toISOString(),
    users: leerUsuarios(),
    tasks: leerTareas(),
    mecanicos: leerMecanicos(),
    permisos: leerPermisos(),
    remisiones: leerRemisiones()
  });
});

// Listado de copias de seguridad existentes
app.get('/api/backup/list', (req, res) => {
  try {
    const archivos = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          archivo: f,
          tamano_bytes: st.size,
          modificado: st.mtime
        };
      })
      .sort((a, b) => new Date(b.modificado) - new Date(a.modificado));
    res.json({ backups: archivos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disparar sincronización manual inmediata
app.post('/api/backup/sync-git', async (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Solo el Administrador puede forzar sincronización con Git.' });
  }

  const resultado = generarRespaldoAutomatico('solicitud_admin_manual');
  res.json({
    mensaje: 'Copia de seguridad local generada y programada para sincronización',
    detalle: resultado,
    githubConfigurado: !!process.env.GITHUB_TOKEN
  });
});

app.post('/api/restore', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Permiso denegado: Solo el Administrador Holger puede restaurar respaldos.' });
  }

  const { users, tasks, mecanicos, permisos, remisiones } = req.body;
  let restaurados = [];
  if (Array.isArray(users) && users.length > 0) {
    guardarUsuarios(users);
    restaurados.push(`${users.length} usuarios`);
  }
  if (Array.isArray(tasks)) {
    guardarTareas(tasks);
    restaurados.push(`${tasks.length} tareas`);
  }
  if (Array.isArray(mecanicos)) {
    guardarMecanicos(mecanicos);
    restaurados.push(`${mecanicos.length} mecánicos`);
  }
  if (permisos && typeof permisos === 'object') {
    guardarPermisos(permisos);
    restaurados.push('matriz de permisos');
  }
  if (Array.isArray(remisiones)) {
    guardarRemisiones(remisiones);
    restaurados.push(`${remisiones.length} remisiones`);
  }

  generarRespaldoAutomatico('post_restauracion');
  res.json({ mensaje: `Respaldo restaurado con éxito (${restaurados.join(', ')})` });
});

// Rutas directas para el navegador y vistas PWA
app.get('/', (req, res) => {
  res.sendFile('login.html', { root: path.join(__dirname, 'public') });
});

app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: path.join(__dirname, 'public') });
});

app.get('/dashboard', (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

app.get('/mecanico', (req, res) => {
  res.sendFile('mobile.html', { root: path.join(__dirname, 'public') });
});

app.use((req, res) => {
  res.sendFile('login.html', { root: path.join(__dirname, 'public') });
});

// Iniciar servidor tras completar la sincronización blindada con la nube
async function iniciarServidor() {
  console.log('[SIMAN] Iniciando verificación y sincronización blindada con la nube...');
  try {
    await Promise.all([
      cloudStorage.sincronizarArchivoAlIniciar('users.json', USERS_FILE),
      cloudStorage.sincronizarArchivoAlIniciar('tasks.json', TASKS_FILE),
      cloudStorage.sincronizarArchivoAlIniciar('mecanicos.json', MECANICOS_FILE),
      cloudStorage.sincronizarArchivoAlIniciar('remisiones.json', REMISIONES_FILE)
    ]);
    console.log('[SIMAN] Sincronización blindada inicial completada con éxito.');

    // Precargar cachés en RAM de alto rendimiento
    cacheUsuarios = leerUsuarios();
    cacheTareas = leerTareas();
    cacheMecanicos = leerMecanicos();
    cacheRemisiones = leerRemisiones();
    if (global.gc) {
      try { global.gc(); } catch(e) {}
    }
  } catch(e) {
    console.warn('[SIMAN] Advertencia en sincronización inicial:', e.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    const localIps = getLocalIps();
    console.log(`=======================================================`);
    console.log(`🛠️  SIMAN - SISTEMA DE MANTENIMIENTO EN LÍNEA`);
    console.log(`💻 Dashboard Supervisor (PC): http://localhost:${PORT}`);
    localIps.forEach(net => {
      console.log(`📱 Vista Móvil para Mecánicos (${net.name}): http://${net.ip}:${PORT}/mecanico`);
    });
    console.log(`=======================================================`);

    // Si Cloudinary está configurado, verificar si hay fotos Base64 históricas y disparar auto-migración
    setTimeout(() => {
      if (imageStorage.isConfigurado()) {
        const tareas = leerTareas();
        const hayFotosBase64 = tareas.some(t => 
          (t.foto_comprobante && t.foto_comprobante.startsWith('data:image/')) ||
          (t.foto_inicial && t.foto_inicial.startsWith('data:image/')) ||
          (Array.isArray(t.avances) && t.avances.some(a => a.foto && a.foto.startsWith('data:image/')))
        );
        if (hayFotosBase64) {
          console.log('[Cloudinary] 💡 Se detectaron fotos históricas en Base64. Iniciando migración automática a la nube en 5 segundos...');
          setTimeout(() => iniciarMigracionSegundoPlano(500), 5000);
        }
      }
    }, 10000);
  });
}

iniciarServidor();
