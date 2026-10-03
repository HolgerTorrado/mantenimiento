const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const crypto = require('crypto');
const cloudStorage = require('./cloudStorage');
const imageStorage = require('./imageStorage');

const app = express();
const PORT = process.env.PORT || 3000;

// Rutas de archivos
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const MECANICOS_FILE = path.join(DATA_DIR, 'mecanicos.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Asegurar directorios y persistencia permanente
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Inicializar archivos locales por defecto si no existen
if (!fs.existsSync(TASKS_FILE)) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2), 'utf-8');
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

function invalidarTodosLosCaches() {
  cacheTareas = null;
  cacheMecanicos = null;
  cacheUsuarios = null;
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
    user: userSeguro
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
const ROLES_TODOS = ['admin', 'supervisor', 'sst', 'director', 'mecanico', 'electrico', 'maquinista', 'visualizador'];

function getEspecialidadPorRol(rol) {
  switch (rol) {
    case 'admin': return 'Administrador General';
    case 'supervisor': return 'Supervisor de Mantenimiento / Planta';
    case 'sst': return 'Seguridad y Salud en el Trabajo (SST)';
    case 'director': return 'Director de Planta';
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
  const usuarios = leerUsuarios().map(u => ({
    id: u.id,
    username: u.username,
    nombre: u.nombre,
    rol: u.rol,
    especialidad: u.especialidad
  }));
  res.json(usuarios);
});

// Modificar usuario (Exclusivo Administrador Holger)
app.put('/api/users/:id', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Permiso denegado: Solo el Administrador Holger puede modificar usuarios.' });
  }

  let usuarios = leerUsuarios();
  const idx = usuarios.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { nombre, rol, especialidad, password } = req.body;
  if (nombre) usuarios[idx].nombre = nombre.trim();
  if (rol && ROLES_TODOS.includes(rol)) {
    usuarios[idx].rol = rol;
    if (!especialidad) usuarios[idx].especialidad = getEspecialidadPorRol(rol);
  }
  if (especialidad) usuarios[idx].especialidad = especialidad.trim();
  if (password && password.trim().length > 0) {
    usuarios[idx].password_hash = hashPassword(password.trim());
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

  res.json({
    mensaje: `Usuario @${usuarios[idx].username} actualizado exitosamente`,
    user: {
      id: usuarios[idx].id,
      username: usuarios[idx].username,
      nombre: usuarios[idx].nombre,
      rol: usuarios[idx].rol,
      especialidad: usuarios[idx].especialidad
    }
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
    .filter(u => ROLES_TECNICOS_MOVIL.includes(u.rol))
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

  // OPTIMIZACIÓN DE ANCHO DE BANDA (Render 5GB):
  // Si la tarea está completada, no enviar las fotos pesadas en Base64 en el listado periódico recurrente.
  // Las fotos de completadas se solicitan bajo demanda vía GET /api/tasks/:id al tocar "Ver Detalles".
  // Las tareas pendientes y en progreso sí conservan sus fotos completas para visualización directa en la lista.
  const conTodasFotos = req.query.con_todas_fotos === 'true';
  if (!conTodasFotos) {
    tareas = tareas.map(t => {
      if (t.estado === 'completado') {
        const copia = { ...t };
        copia.tiene_foto_comprobante = Boolean(t.foto_comprobante);
        copia.tiene_foto_inicial = Boolean(t.foto_inicial);
        delete copia.foto_comprobante;
        delete copia.foto_inicial;
        if (Array.isArray(copia.avances)) {
          copia.avances = copia.avances.map(a => {
            const ac = { ...a };
            ac.tiene_foto = Boolean(a.foto);
            delete ac.foto;
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

// 5. Crear nueva tarea de mantenimiento (Admin, Supervisor, SST, Director de Planta)
app.post('/api/tasks', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!ROLES_GESTION.includes(userRol)) {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador, Supervisor, SST o Director de Planta tienen autorización para crear y programar tareas.' });
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

  // Normalizar roles requeridos para la tarea (Permite tareas conjuntas)
  let rolesFinal = ['mecanico'];
  if (Array.isArray(roles_asignados) && roles_asignados.length > 0) {
    rolesFinal = roles_asignados.filter(r => ROLES_TECNICOS.includes(r));
    if (rolesFinal.length === 0) rolesFinal = ['mecanico'];
  } else if (typeof roles_asignados === 'string' && roles_asignados.trim()) {
    try {
      const p = JSON.parse(roles_asignados);
      if (Array.isArray(p)) rolesFinal = p.filter(r => ROLES_TECNICOS.includes(r));
    } catch(e) {
      rolesFinal = roles_asignados.split(',').map(s => s.trim()).filter(r => ROLES_TECNICOS.includes(r));
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

  // Retrocompatibilidad con mecanico_asignado
  if (tecnicosFinal.length === 0 && mecanico_asignado && mecanico_asignado !== 'Sin Asignar') {
    tecnicosFinal = [mecanico_asignado.trim()];
  }

  let resumenAsignado = 'Sin Asignar';
  if (tecnicosFinal.length > 0) {
    resumenAsignado = tecnicosFinal.join(', ');
  } else if (mecanico_asignado) {
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

// 7. Completar tarea con guardado permanente de foto (Cloudinary / Nube)
app.post('/api/tasks/:id/completar', upload.single('foto'), async (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol === 'visualizador') {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return res.status(403).json({ error: 'Acceso Restringido: El rol de Solo Visualizar no tiene permiso para finalizar tareas ni subir fotos.' });
  }

  const tareas = leerTareas();
  const idx = tareas.findIndex(t => t.id === req.params.id);
  if (idx === -1) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return res.status(404).json({ error: 'Tarea no encontrada' });
  }

  const {
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

  tareas[idx].estado = 'completado';
  tareas[idx].fecha_arreglo = fechaArregloFinal;
  tareas[idx].tiempo_arreglo_minutos = tiempoMinutos;
  tareas[idx].completado_por_usuario = usernameFinal;
  tareas[idx].completado_por_nombre = nombreFinal;
  tareas[idx].completado_por_rol = rolFinal;

  // Desglose de tiempos de espera vs trabajo activo del personal
  const esperaNum = parseInt(tiempo_espera_minutos) || 0;
  tareas[idx].tiempo_espera_minutos = Math.max(0, esperaNum);
  if (motivo_espera !== undefined) tareas[idx].motivo_espera = String(motivo_espera || '').trim();

  if (tiempo_trabajo_activo_minutos !== undefined && tiempo_trabajo_activo_minutos !== null) {
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, parseInt(tiempo_trabajo_activo_minutos) || 0);
  } else if (tiempoMinutos !== null) {
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, tiempoMinutos - tareas[idx].tiempo_espera_minutos);
  }

  // Desglose de horas por rol (ej: mecánico 3h, eléctrico 2h)
  if (tiempos_por_rol !== undefined) {
    tareas[idx].tiempos_por_rol = typeof tiempos_por_rol === 'string' ? JSON.parse(tiempos_por_rol || '{}') : tiempos_por_rol;
  }
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
  tareas[idx].completado_en = new Date().toISOString();

  guardarTareas(tareas);
  res.json({
    mensaje: 'Tarea completada exitosamente con fotografía y tiempos registrados',
    tarea: tareas[idx]
  });
});

// 7.1. Actualizar y Modificar Tarea Completa (Admin, Supervisor, SST, Director de Planta)
app.put('/api/tasks/:id', async (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (!ROLES_GESTION.includes(userRol)) {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el personal de gestión (Administrador, Supervisor, SST o Director) tiene permiso para editar tareas y tiempos.' });
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

  if (fecha_ocurrencia !== undefined) tareas[idx].fecha_ocurrencia = fecha_ocurrencia;
  if (fecha_arreglo !== undefined) tareas[idx].fecha_arreglo = fecha_arreglo || null;
  if (notas_mecanico !== undefined) tareas[idx].notas_mecanico = notas_mecanico;

  // Actualizar fotografía comprobante si se envía nueva (Subir a Cloudinary si está activo)
  if (foto_base64 && foto_base64.startsWith('data:image/')) {
    tareas[idx].foto_comprobante = await imageStorage.subirImagenNube(foto_base64, `comp_${tareas[idx].id}`, 'comprobantes');
    tareas[idx].foto_actualizada_en = new Date().toISOString();
  } else if (foto_comprobante !== undefined) {
    tareas[idx].foto_comprobante = foto_comprobante;
  }

  // Actualizar fotografía inicial del daño o reporte si se envía
  if (foto_inicial_base64 && foto_inicial_base64.startsWith('data:image/')) {
    tareas[idx].foto_inicial = await imageStorage.subirImagenNube(foto_inicial_base64, `ini_${tareas[idx].id}`, 'iniciales');
    tareas[idx].foto_inicial_actualizada_en = new Date().toISOString();
  } else if (foto_inicial !== undefined) {
    tareas[idx].foto_inicial = foto_inicial;
  }
  
  // Modificar roles asignados (permite añadir eléctrico o maquinista si se agravó el daño)
  if (roles_asignados !== undefined) {
    let rFinal = Array.isArray(roles_asignados) ? roles_asignados : [roles_asignados];
    rFinal = rFinal.filter(r => ROLES_TECNICOS.includes(r));
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

  if (tiempo_espera_repuestos_minutos !== undefined) {
    tareas[idx].tiempo_espera_repuestos_minutos = Math.max(0, parseInt(tiempo_espera_repuestos_minutos) || 0);
  }
  if (motivo_espera_repuestos !== undefined) {
    tareas[idx].motivo_espera_repuestos = String(motivo_espera_repuestos || '').trim();
  }
  if (tiempo_fuera_planta_minutos !== undefined) {
    tareas[idx].tiempo_fuera_planta_minutos = Math.max(0, parseInt(tiempo_fuera_planta_minutos) || 0);
  }
  if (motivo_fuera_planta !== undefined) {
    tareas[idx].motivo_fuera_planta = String(motivo_fuera_planta || '').trim();
  }

  // Retrocompatibilidad con tiempo_espera_minutos y motivo_espera
  if (tiempo_espera_minutos !== undefined) {
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
  // Soporte explícito para Reabrir Tarea (Exclusivo Perfil Admin)
  const quiereReabrir = tareas[idx].estado === 'completado' && (req.body.reabrir === true || (estado !== undefined && estado !== 'completado'));
  if (quiereReabrir) {
    if (userRol !== 'admin') {
      return res.status(403).json({ error: 'Acceso Restringido: Solo el perfil de Administrador tiene autorización para reabrir una tarea finalizada.' });
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
    if (tareas[idx].estado === 'completado' && estado !== 'completado' && userRol !== 'admin') {
      return res.status(403).json({ error: 'Acceso Restringido: Solo el perfil de Administrador tiene autorización para modificar el estado de una tarea finalizada.' });
    }
    tareas[idx].estado = estado;
  }

  // Soporte explícito para Quitar / Eliminar Foto Comprobante de Finalización (Exclusivo Perfil Admin)
  if (req.body.eliminar_foto_comprobante === true || foto_comprobante === null) {
    if (userRol !== 'admin') {
      return res.status(403).json({ error: 'Acceso Restringido: Solo el perfil de Administrador tiene autorización para eliminar fotografías de comprobante.' });
    }
    tareas[idx].foto_comprobante = null;
    tareas[idx].foto_comprobante_eliminada = true;
    tareas[idx].foto_actualizada_en = new Date().toISOString();
  }

  // Soporte explícito para Quitar / Eliminar Foto Inicial (Exclusivo Perfil Admin)
  if (req.body.eliminar_foto_inicial === true || foto_inicial === null) {
    if (userRol !== 'admin') {
      return res.status(403).json({ error: 'Acceso Restringido: Solo el perfil de Administrador tiene autorización para eliminar fotografías iniciales.' });
    }
    tareas[idx].foto_inicial = null;
    tareas[idx].foto_inicial_eliminada = true;
    tareas[idx].foto_inicial_actualizada_en = new Date().toISOString();
  }

  // Recalcular tiempo de parada (MTTR) con las fechas modificadas
  if (tareas[idx].fecha_ocurrencia && tareas[idx].fecha_arreglo && tareas[idx].estado === 'completado') {
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
  } else if (!tareas[idx].fecha_arreglo || tareas[idx].estado !== 'completado') {
    tareas[idx].tiempo_arreglo_minutos = null;
  }

  // Recalcular tiempo de trabajo activo si no fue explícito
  if (tiempo_trabajo_activo_minutos !== undefined && tiempo_trabajo_activo_minutos !== null) {
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, parseInt(tiempo_trabajo_activo_minutos) || 0);
  } else if (tareas[idx].tiempo_arreglo_minutos !== null) {
    const espera = tareas[idx].tiempo_espera_minutos || 0;
    tareas[idx].tiempo_trabajo_activo_minutos = Math.max(0, (tareas[idx].tiempo_arreglo_minutos || 0) - espera);
  }

  // Desglose de horas por rol (ej: electrico 2h, mecanico 3h)
  if (tiempos_por_rol !== undefined) {
    tareas[idx].tiempos_por_rol = typeof tiempos_por_rol === 'string' ? JSON.parse(tiempos_por_rol || '{}') : tiempos_por_rol;
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

// Endpoint directo: Reabrir Tarea (Exclusivo Perfil Admin)
app.post('/api/tasks/:id/reabrir', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el perfil de Administrador tiene permiso para reabrir tareas finalizadas.' });
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

// Endpoint directo: Quitar Foto Comprobante de Finalización (Exclusivo Perfil Admin)
app.delete('/api/tasks/:id/foto', (req, res) => {
  const userRol = (req.headers['x-user-role'] || '').toLowerCase().trim();
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el perfil de Administrador tiene permiso para eliminar fotografías de comprobante.' });
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
  const userRol = req.headers['x-user-role'];
  if (userRol === 'visualizador') {
    return res.status(403).json({ error: 'Acceso Restringido: El rol de Solo Visualizar no tiene permiso para cambiar fotografías.' });
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
  const userRol = req.headers['x-user-role'];
  if (userRol === 'visualizador') {
    return res.status(403).json({ error: 'Acceso Restringido: El rol de Solo Visualizar no tiene permiso para modificar fotografías.' });
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

// 8. Eliminar tarea (Exclusivo Administrador Holger)
app.delete('/api/tasks/:id', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador Holger tiene permiso para eliminar tareas.' });
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
    if (!tareas[idx].tiempos_por_rol) tareas[idx].tiempos_por_rol = {};
    const rolKey = (rolFinal === 'electrico' || rolFinal === 'maquinista') ? rolFinal : 'mecanico';
    tareas[idx].tiempos_por_rol[rolKey] = (tareas[idx].tiempos_por_rol[rolKey] || 0) + minutosDedicados;
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
    total_tareas: tareas.length
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

  const tareas = leerTareas();
  const resultado = await imageStorage.migrarFotosExistentes(tareas, 10);
  if (resultado.migrados > 0) {
    guardarTareas(tareas, true);
  }

  res.json({
    ok: true,
    migrados_en_este_lote: resultado.migrados,
    fotos_pendientes_por_migrar: resultado.totalPendientes
  });
});

// 9. Métricas y KPIs para el dashboard (con filtro de período, horas de roles y tiempos muertos)
app.get('/api/metrics', (req, res) => {
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
    // Horas por rol
    if (t.tiempos_por_rol) {
      horas_mecanica_min += (parseInt(t.tiempos_por_rol.mecanico) || 0);
      horas_electrica_min += (parseInt(t.tiempos_por_rol.electrico) || 0);
      horas_maquinaria_min += (parseInt(t.tiempos_por_rol.maquinista) || 0);
    }
    
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
      mecanicos: leerMecanicos()
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
    mecanicos: leerMecanicos()
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
    mecanicos: leerMecanicos()
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

  const { users, tasks, mecanicos } = req.body;
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
      cloudStorage.sincronizarArchivoAlIniciar('mecanicos.json', MECANICOS_FILE)
    ]);
    console.log('[SIMAN] Sincronización blindada inicial completada con éxito.');

    // Precargar cachés en RAM de alto rendimiento
    cacheUsuarios = leerUsuarios();
    cacheTareas = leerTareas();
    cacheMecanicos = leerMecanicos();
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
  });
}

iniciarServidor();
