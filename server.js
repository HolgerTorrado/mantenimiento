const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const crypto = require('crypto');
const cloudStorage = require('./cloudStorage');

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

// Sincronizar de inmediato con la nube (db-storage) para restaurar datos tras reinicio o despliegue
cloudStorage.sincronizarArchivoAlIniciar('users.json', USERS_FILE);
cloudStorage.sincronizarArchivoAlIniciar('tasks.json', TASKS_FILE);
cloudStorage.sincronizarArchivoAlIniciar('mecanicos.json', MECANICOS_FILE);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/uploads', express.static(UPLOADS_DIR));

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
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Helpers de persistencia
function leerTareas() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error al leer tasks.json:', err);
    return [];
  }
}

function guardarTareas(tareas) {
  try {
    const str = JSON.stringify(tareas, null, 2);
    fs.writeFileSync(TASKS_FILE, str, 'utf-8');
    cloudStorage.subirALaNube('data/tasks.json', str).catch(() => {});
    return true;
  } catch (err) {
    console.error('Error al guardar tasks.json:', err);
    return false;
  }
}

function leerMecanicos() {
  try {
    if (!fs.existsSync(MECANICOS_FILE)) return [];
    return JSON.parse(fs.readFileSync(MECANICOS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error al leer mecanicos.json:', err);
    return [];
  }
}

function guardarMecanicos(mecanicos) {
  try {
    const str = JSON.stringify(mecanicos, null, 2);
    fs.writeFileSync(MECANICOS_FILE, str, 'utf-8');
    cloudStorage.subirALaNube('data/mecanicos.json', str).catch(() => {});
    return true;
  } catch (err) {
    console.error('Error al guardar mecanicos.json:', err);
    return false;
  }
}

function leerUsuarios() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error al leer users.json:', err);
    return [];
  }
}

function guardarUsuarios(usuarios) {
  try {
    const str = JSON.stringify(usuarios, null, 2);
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

// Roles válidos del sistema
const ROLES_TECNICOS = ['mecanico', 'electrico', 'maquinista'];
const ROLES_TODOS = ['admin', 'mecanico', 'electrico', 'maquinista', 'visualizador'];

function getEspecialidadPorRol(rol) {
  switch (rol) {
    case 'admin': return 'Supervisor de Planta';
    case 'electrico': return 'Técnico Electricista';
    case 'maquinista': return 'Operador de Maquinaria';
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

// Helper para obtener todos los técnicos (mecánicos, eléctricos, maquinistas)
function obtenerListaTecnicos() {
  const usuarios = leerUsuarios();
  const tecnicos = usuarios
    .filter(u => ROLES_TECNICOS.includes(u.rol))
    .map(u => ({
      id: u.id,
      nombre: u.nombre,
      username: u.username,
      rol: u.rol,
      especialidad: u.especialidad || getEspecialidadPorRol(u.rol)
    }));

  const mecanicosExtra = leerMecanicos();
  mecanicosExtra.forEach(m => {
    if (!tecnicos.some(t => t.nombre.toLowerCase() === m.nombre.toLowerCase())) {
      tecnicos.push({
        id: m.id || `TEC-${Date.now()}`,
        nombre: m.nombre,
        username: m.username || m.nombre.toLowerCase().replace(/\s+/g, ''),
        rol: m.rol || 'mecanico',
        especialidad: m.especialidad || 'Mecánico de Planta'
      });
    }
  });

  return tecnicos;
}

// 2. Listado de técnicos (soporta tanto /api/mecanicos como /api/tecnicos)
app.get('/api/tecnicos', (req, res) => {
  res.json(obtenerListaTecnicos());
});

app.get('/api/mecanicos', (req, res) => {
  res.json(obtenerListaTecnicos());
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

  res.json(tareas);
});

// 4. Obtener detalle de una tarea
app.get('/api/tasks/:id', (req, res) => {
  const tareas = leerTareas();
  const tarea = tareas.find(t => t.id === req.params.id);
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json(tarea);
});

// 5. Crear nueva tarea de mantenimiento (Exclusivo Administrador Holger)
app.post('/api/tasks', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador Holger tiene autorización para crear y programar tareas.' });
  }

  const {
    equipo,
    titulo,
    tipo, // preventivo, correctivo, predictivo
    prioridad, // baja, media, alta, critica
    ubicacion,
    descripcion,
    mecanico_asignado,
    roles_asignados,
    tecnicos_asignados,
    fecha_ocurrencia
  } = req.body;

  if (!equipo || !tipo || !fecha_ocurrencia) {
    return res.status(400).json({ error: 'Equipo, tipo de mantenimiento y fecha de ocurrencia son obligatorios' });
  }

  const tipoNormalizado = ['preventivo', 'correctivo', 'predictivo'].includes(tipo.toLowerCase())
    ? tipo.toLowerCase()
    : 'correctivo';

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
  const nextNumber = 1000 + tareas.length + 1;
  const nuevoId = `TSK-${nextNumber}`;

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
    foto_comprobante: null,
    tiempo_arreglo_minutos: null,
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

// 7. Completar tarea con guardado permanente de foto en base64 (Vector / Nube)
app.post('/api/tasks/:id/completar', upload.single('foto'), (req, res) => {
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

  const { fecha_arreglo, notas_mecanico, mecanico_nombre, usuario_username } = req.body;
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

  // Foto comprobante: Guardar directamente como Data URL Base64 para persistencia total en Git / JSON
  let rutaFoto = tareas[idx].foto_comprobante;
  if (req.body && req.body.foto_base64 && req.body.foto_base64.startsWith('data:image/')) {
    rutaFoto = req.body.foto_base64;
  } else if (req.file) {
    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      const b64 = fs.readFileSync(req.file.path).toString('base64');
      rutaFoto = `data:${mime};base64,${b64}`;
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    } catch(e) {
      console.error('Error convirtiendo foto a base64:', e);
      rutaFoto = `/uploads/${req.file.filename}`;
    }
  }

  tareas[idx].estado = 'completado';
  tareas[idx].fecha_arreglo = fechaArregloFinal;
  tareas[idx].tiempo_arreglo_minutos = tiempoMinutos;
  tareas[idx].completado_por_usuario = usernameFinal;
  tareas[idx].completado_por_nombre = nombreFinal;
  tareas[idx].completado_por_rol = rolFinal;

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

// 7.1. Actualizar y Modificar Tarea (Exclusivo Administrador Holger)
app.put('/api/tasks/:id', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso Restringido: Solo el Administrador Holger tiene permiso para editar tareas y tiempos.' });
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
    equipo,
    titulo,
    tipo,
    prioridad,
    estado
  } = req.body;

  if (fecha_ocurrencia !== undefined) tareas[idx].fecha_ocurrencia = fecha_ocurrencia;
  if (fecha_arreglo !== undefined) tareas[idx].fecha_arreglo = fecha_arreglo || null;
  if (notas_mecanico !== undefined) tareas[idx].notas_mecanico = notas_mecanico;
  
  if (roles_asignados !== undefined) {
    tareas[idx].roles_asignados = Array.isArray(roles_asignados) ? roles_asignados : [roles_asignados];
  }

  if (tecnicos_asignados !== undefined) {
    const arr = Array.isArray(tecnicos_asignados) ? tecnicos_asignados : [tecnicos_asignados];
    tareas[idx].tecnicos_asignados = arr;
    tareas[idx].mecanico_asignado = arr.length > 0 ? arr.join(', ') : 'Sin Asignar';
  } else if (mecanico_asignado !== undefined) {
    tareas[idx].mecanico_asignado = mecanico_asignado;
  }

  if (tareas[idx].roles_asignados || tareas[idx].tecnicos_asignados) {
    tareas[idx].es_conjunta = (tareas[idx].roles_asignados && tareas[idx].roles_asignados.length > 1) || 
                              (tareas[idx].tecnicos_asignados && tareas[idx].tecnicos_asignados.length > 1);
  }

  if (equipo !== undefined) tareas[idx].equipo = equipo.trim();
  if (titulo !== undefined) tareas[idx].titulo = titulo.trim();
  if (tipo !== undefined) tareas[idx].tipo = tipo.toLowerCase();
  if (prioridad !== undefined) tareas[idx].prioridad = prioridad;
  if (estado !== undefined) tareas[idx].estado = estado;

  // Recalcular tiempo de arreglo (MTTR) con las fechas modificadas
  if (tareas[idx].fecha_ocurrencia && tareas[idx].fecha_arreglo) {
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
  } else if (!tareas[idx].fecha_arreglo) {
    tareas[idx].tiempo_arreglo_minutos = null;
  }

  tareas[idx].modificado_por_admin = true;
  tareas[idx].modificado_en = new Date().toISOString();

  guardarTareas(tareas);
  res.json({
    mensaje: 'Tarea y fechas actualizadas correctamente por el Administrador',
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
  if (tarea.foto_comprobante && !tarea.foto_comprobante.includes('demo-')) {
    const filePath = path.join(__dirname, tarea.foto_comprobante);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch(e) {}
    }
  }

  tareas = tareas.filter(t => t.id !== req.params.id);
  guardarTareas(tareas);
  res.json({ mensaje: 'Tarea eliminada exitosamente' });
});

// 9. Métricas y KPIs para el dashboard (con filtro de período)
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

  // Conteo por tipo
  const por_tipo = {
    preventivo: tareas.filter(t => t.tipo === 'preventivo').length,
    correctivo: tareas.filter(t => t.tipo === 'correctivo').length,
    predictivo: tareas.filter(t => t.tipo === 'predictivo').length
  };

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

  const mttr_por_tipo = {
    preventivo: getMttrTipo('preventivo'),
    correctivo: getMttrTipo('correctivo'),
    predictivo: getMttrTipo('predictivo')
  };

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
    periodo
  });
});

// 10. Copia de Seguridad y Respaldo Completo (Exclusivo Administrador Holger)
app.get('/api/backup', (req, res) => {
  const userRol = req.headers['x-user-role'];
  if (userRol !== 'admin') {
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

// Iniciar servidor en todas las interfaces de red (0.0.0.0)
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
