// Variables del Portal Móvil
let tareasMovil = [];
let tabActual = 'pendientes';
let mecanicoActivo = localStorage.getItem('siman_mecanico_activo') || 'todos';
let fotoCapturadaFile = null;

let deferredInstallPrompt = null;

// Configuración completa de tipos y actividades de planta en móvil
const CONFIG_TIPOS_MOVIL = {
  preventivo: { label: 'PREVENTIVO', icon: 'fa-calendar-check', color: '#10b981', bg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' },
  correctivo: { label: 'CORRECTIVO', icon: 'fa-triangle-exclamation', color: '#ef4444', bg: 'bg-rose-500/10 text-rose-400 border border-rose-500/30' },
  predictivo: { label: 'PREDICTIVO', icon: 'fa-wave-square', color: '#a855f7', bg: 'bg-purple-500/10 text-purple-400 border border-purple-500/30' },
  mejora: { label: 'MEJORA', icon: 'fa-arrow-trend-up', color: '#0284c7', bg: 'bg-sky-500/10 text-sky-400 border border-sky-500/30' },
  locativo: { label: 'LOCATIVO', icon: 'fa-paint-roller', color: '#f59e0b', bg: 'bg-amber-500/10 text-amber-400 border border-amber-500/30' },
  '5s': { label: '5S & ASEO', icon: 'fa-broom', color: '#06b6d4', bg: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' },
  instalacion: { label: 'INSTALACIÓN', icon: 'fa-screwdriver-wrench', color: '#6366f1', bg: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30' },
  lubricacion: { label: 'LUBRICACIÓN', icon: 'fa-oil-can', color: '#f97316', bg: 'bg-orange-500/10 text-orange-400 border border-orange-500/30' },
  otro: { label: 'GENERAL', icon: 'fa-clipboard-list', color: '#64748b', bg: 'bg-slate-500/10 text-slate-400 border border-slate-500/30' }
};

function getBadgeTipoMovil(tipo) {
  const tKey = (tipo || 'otro').toLowerCase().trim();
  const cfg = CONFIG_TIPOS_MOVIL[tKey] || CONFIG_TIPOS_MOVIL['otro'];
  return `<span class="${cfg.bg} text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
    <i class="fa-solid ${cfg.icon} text-[9px]"></i> ${cfg.label}
  </span>`;
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  const user = verificarSesionMovil();
  if (!user) return; // Detener ejecución si no hay sesión activa

  cargarTareasMovil();

  // Registrar Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.log('SW error:', e));
  }

  // Auto-refrescar cada 20 segundos
  setInterval(() => {
    cargarTareasMovil(false);
  }, 20000);
});

// Manejo de Instalación PWA (App Móvil)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('banner-instalar-app');
  if (banner) banner.classList.remove('hidden');
});

function instalarPWA() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        mostrarToastMovil('¡Instalando SIMAN en tu celular!');
      }
      deferredInstallPrompt = null;
      const banner = document.getElementById('banner-instalar-app');
      if (banner) banner.classList.add('hidden');
    });
  } else {
    alert('Para instalar SIMAN en tu teléfono:\n\n• En Android (Chrome/Edge): Toca el menú de 3 puntos (arriba a la derecha) y selecciona "Instalar aplicación" o "Agregar a la pantalla principal".\n\n• En iPhone (Safari): Toca el botón de Compartir (icono con flecha arriba) y selecciona "Agregar al inicio".');
  }
}

function verificarSesionMovil() {
  const userJson = localStorage.getItem('siman_user');
  if (!userJson) {
    window.location.href = '/login';
    return null;
  }
  try {
    const user = JSON.parse(userJson);
    const label = document.getElementById('label-usuario-activo');
    if (label) {
      let icon = '🔧';
      let rolBadge = '<span class="text-[9px] text-emerald-300 opacity-80">(Mecánico)</span>';
      if (user.rol === 'electrico') { icon = '⚡'; rolBadge = '<span class="text-[9px] text-amber-300 opacity-80">(Eléctrico)</span>'; }
      else if (user.rol === 'maquinista') { icon = '🚜'; rolBadge = '<span class="text-[9px] text-orange-300 opacity-80">(Maquinista)</span>'; }
      else if (user.rol === 'supervisor') { icon = '👷'; rolBadge = '<span class="text-[9px] font-bold text-sky-300 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-500/40">SUPERVISOR</span>'; }
      else if (user.rol === 'sst') { icon = '🦺'; rolBadge = '<span class="text-[9px] font-bold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/40">SST</span>'; }
      else if (user.rol === 'director') { icon = '🏢'; rolBadge = '<span class="text-[9px] font-bold text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-500/40">DIRECTOR</span>'; }
      else if (user.rol === 'admin') { icon = '👑'; rolBadge = '<span class="text-[9px] font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/40">ADMIN</span>'; }
      else if (user.rol === 'visualizador') { icon = '👁️'; rolBadge = '<span class="text-[9px] text-purple-300 opacity-80">(Visualizador)</span>'; }

      label.innerHTML = `${icon} <span class="font-bold text-white">${escaparHTMLMovil(user.nombre || user.username)}</span> ${rolBadge}`;
    }

    const esGestion = ['admin', 'supervisor', 'sst', 'director'].includes(user.rol);

    // Si tiene rol de gestión o es Visualizador, habilitar botón de cambiar a Vista PC
    const btnPC = document.getElementById('btn-ir-pc-dashboard');
    if (btnPC) {
      if (esGestion || user.rol === 'visualizador') {
        btnPC.classList.remove('hidden');
      } else {
        btnPC.classList.add('hidden');
      }
    }

    // Si tiene rol de gestión, habilitar botón de crear tarea en barra móvil
    const btnCrear = document.getElementById('btn-crear-tarea-movil');
    if (btnCrear) {
      if (esGestion) {
        btnCrear.classList.remove('hidden');
      } else {
        btnCrear.classList.add('hidden');
      }
    }

    return user;
  } catch (e) {
    window.location.href = '/login';
    return null;
  }
}

function cerrarSesion() {
  localStorage.removeItem('siman_token');
  localStorage.removeItem('siman_user');
  localStorage.removeItem('siman_mecanico_activo');
  sessionStorage.removeItem('siman_forzar_pc');
  window.location.replace('/login?logout=true');
}

function irModoPC() {
  sessionStorage.setItem('siman_forzar_pc', 'true');
  window.location.replace('/dashboard');
}

// Modal Crear Tarea desde Móvil (Administrador)
function abrirModalCrearMovil() {
  const modal = document.getElementById('modal-crear-movil');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModalCrearMovil() {
  const modal = document.getElementById('modal-crear-movil');
  if (modal) modal.classList.add('hidden');
}

let fotoInicialCrearMovilBase64 = null;

async function previsualizarFotoInicialCrearMovil(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    mostrarToastMovil('Comprimiendo foto inicial...');
    fotoInicialCrearMovilBase64 = await comprimirImagenCanvas(file, 1024, 0.72);
    const img = document.getElementById('img-previa-inicial-crear-movil');
    if (img) img.src = fotoInicialCrearMovilBase64;
    document.getElementById('box-sin-foto-inicial-crear-movil')?.classList.add('hidden');
    document.getElementById('box-con-foto-inicial-crear-movil')?.classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(50);
  } catch(err) {
    alert('Error al procesar foto: ' + err.message);
  }
}

function quitarFotoInicialCrearMovil() {
  fotoInicialCrearMovilBase64 = null;
  const cam = document.getElementById('mob-crear-foto-camara');
  const gal = document.getElementById('mob-crear-foto-galeria');
  if (cam) cam.value = '';
  if (gal) gal.value = '';
  const img = document.getElementById('img-previa-inicial-crear-movil');
  if (img) img.src = '';
  document.getElementById('box-con-foto-inicial-crear-movil')?.classList.add('hidden');
  document.getElementById('box-sin-foto-inicial-crear-movil')?.classList.remove('hidden');
}

async function guardarNuevaTareaMovil(e) {
  e.preventDefault();
  const user = getUsuarioActivo();
  const ROLES_GESTION = ['admin', 'supervisor', 'sst', 'director'];
  if (!ROLES_GESTION.includes(user.rol)) {
    alert('Acceso Restringido: Solo el Administrador, Supervisor, SST o Director de Planta pueden crear tareas.');
    return;
  }

  const equipo = document.getElementById('mob-crear-equipo')?.value.trim();
  const ubicacion = document.getElementById('mob-crear-ubicacion')?.value.trim() || 'Planta Principal';
  const titulo = document.getElementById('mob-crear-titulo')?.value.trim() || `Revisión de ${equipo}`;
  const tipo = document.getElementById('mob-crear-tipo')?.value || 'correctivo';
  const prioridad = document.getElementById('mob-crear-prioridad')?.value || 'media';
  const descripcion = document.getElementById('mob-crear-descripcion')?.value.trim() || '';

  const roles = Array.from(document.querySelectorAll('input[name="mob_roles"]:checked')).map(cb => cb.value);
  const rolesFinales = roles.length > 0 ? roles : ['mecanico'];

  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - offset)).toISOString().slice(0, 16);

  const btn = document.getElementById('btn-submit-crear-movil');
  const txtOrig = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
  }

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || 'admin',
        'x-user-username': user.username || 'Holger',
        'x-user-name': user.nombre || 'Administrador'
      },
      body: JSON.stringify({
        equipo,
        ubicacion,
        titulo,
        tipo,
        prioridad,
        descripcion,
        roles_asignados: rolesFinales,
        fecha_ocurrencia: localISOTime,
        foto_inicial: fotoInicialCrearMovilBase64,
        tecnicos_asignados: []
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error creando tarea');

    mostrarToastMovil('✅ Tarea creada exitosamente');
    cerrarModalCrearMovil();
    document.getElementById('form-crear-tarea-movil')?.reset();
    quitarFotoInicialCrearMovil();
    cargarTareasMovil(false);
  } catch(err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = txtOrig;
    }
  }
}

// Cargar mecánicos y restaurar seleccionado
async function cargarMecanicosMovil() {
  try {
    const res = await fetch('/api/mecanicos');
    const mecanicos = await res.json();
    const sel = document.getElementById('select-mecanico-activo');
    if (!sel) return;

    sel.innerHTML = '<option value="todos">Todos los Técnicos</option>';
    mecanicos.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.nombre;
      opt.textContent = m.nombre;
      sel.appendChild(opt);
    });

    if (mecanicoActivo) {
      sel.value = mecanicoActivo;
    }
    actualizarTextoMecanicoPie();
  } catch (err) {
    console.error('Error cargando mecánicos:', err);
  }
}

function cambiarMecanicoActivo() {
  const sel = document.getElementById('select-mecanico-activo');
  if (!sel) return;
  mecanicoActivo = sel.value;
  localStorage.setItem('siman_mecanico_activo', mecanicoActivo);
  actualizarTextoMecanicoPie();
  renderTareasMovil();
}

function actualizarTextoMecanicoPie() {
  const el = document.getElementById('txt-mecanico-actual-pie');
  if (el) {
    el.innerText = mecanicoActivo === 'todos' ? 'Mantenimiento en línea' : `Técnico: ${mecanicoActivo}`;
  }
}

// Cargar Tareas desde el Servidor
async function cargarTareasMovil(mostrarSpin = true) {
  const icon = document.getElementById('mob-icon-recarga');
  if (mostrarSpin && icon) icon.classList.add('fa-spin');

  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error('Error de conexión');
    const data = await res.json();
    tareasMovil = Array.isArray(data) ? data : [];
    actualizarContadoresMovil();
    renderTareasMovil();
  } catch (err) {
    console.error('Error cargando tareas móvil:', err);
    const contenedor = document.getElementById('contenedor-tareas-movil');
    if (contenedor && (!tareasMovil || tareasMovil.length === 0)) {
      contenedor.innerHTML = `
        <div class="py-16 text-center text-slate-400 space-y-3 px-4">
          <div class="w-14 h-14 rounded-2xl bg-slate-800 text-amber-400 border border-slate-700 mx-auto flex items-center justify-center text-2xl">
            <i class="fa-solid fa-cloud-arrow-down animate-bounce"></i>
          </div>
          <p class="font-bold text-white text-base">Conectando con el servidor...</p>
          <p class="text-xs text-slate-400 max-w-xs mx-auto">
            El servidor en la nube se está activando. Reintentando automáticamente en unos momentos.
          </p>
          <button onclick="cargarTareasMovil(true)" class="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition inline-flex items-center gap-2">
            <i class="fa-solid fa-arrows-rotate"></i> Reintentar ahora
          </button>
        </div>
      `;
    }
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
}

// Pestañas
function cambiarTabMovil(tab, btn) {
  tabActual = tab;
  document.querySelectorAll('#mobile-tabs .tab-movil').forEach(b => {
    b.className = 'tab-movil flex-1 py-1.5 px-2 rounded-lg text-xs font-medium text-center transition text-slate-400 hover:text-white';
  });
  if (btn) {
    btn.className = 'tab-movil flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold text-center transition bg-emerald-600 text-white shadow';
  }
  renderTareasMovil();
}

// Obtener usuario activo
function getUsuarioActivo() {
  try {
    return JSON.parse(localStorage.getItem('siman_user') || '{}');
  } catch(e) {
    return {};
  }
}

// Filtrar tareas según el rol del usuario conectado y tareas en conjunto
function filtrarTareasPorUsuario(tareas) {
  const user = getUsuarioActivo();
  if (!user || ['admin', 'supervisor', 'sst', 'director', 'visualizador'].includes(user.rol)) {
    return tareas;
  }

  const miRol = (user.rol || 'mecanico').toLowerCase().trim();
  const miNombre = (user.nombre || '').toLowerCase().trim();
  const miUsername = (user.username || '').toLowerCase().trim();

  return tareas.filter(t => {
    // 1. ¿Está asignado específicamente a mi nombre o usuario?
    const tecs = Array.isArray(t.tecnicos_asignados) ? t.tecnicos_asignados.map(x => String(x).toLowerCase().trim()) : [];
    const asignadoTexto = (t.mecanico_asignado || '').toLowerCase().trim();

    const asignadoAMiPersona = (miNombre && (tecs.includes(miNombre) || asignadoTexto.includes(miNombre))) ||
                               (miUsername && (tecs.includes(miUsername) || asignadoTexto.includes(miUsername)));

    if (asignadoAMiPersona) {
      return true;
    }

    // 2. ¿La tarea incluye el rol del usuario conectado?
    const roles = Array.isArray(t.roles_asignados) && t.roles_asignados.length > 0
      ? t.roles_asignados.map(r => String(r).toLowerCase().trim())
      : ['mecanico']; // Por defecto tareas anteriores son mecánicas

    const incluyeMiRol = roles.includes(miRol) || roles.includes('todos');

    // 3. Si la tarea incluye mi rol y está sin asignar o disponible para el rol
    const esDisponibleParaMiRol = incluyeMiRol && (
      tecs.length === 0 || 
      asignadoTexto === 'sin asignar' || 
      asignadoTexto === 'todos' || 
      asignadoTexto === ''
    );

    return esDisponibleParaMiRol;
  });
}

// Actualizar badges numéricos
function actualizarContadoresMovil() {
  const filtradasPorMecanico = filtrarTareasPorUsuario(tareasMovil);

  const p = filtradasPorMecanico.filter(t => t.estado === 'pendiente').length;
  const prog = filtradasPorMecanico.filter(t => t.estado === 'en_progreso').length;
  const c = filtradasPorMecanico.filter(t => t.estado === 'completado').length;

  const elP = document.getElementById('mob-count-pendientes');
  const elProg = document.getElementById('mob-count-progreso');
  const elC = document.getElementById('mob-count-completadas');
  const elT = document.getElementById('mob-count-todas');

  if (elP) elP.innerText = p;
  if (elProg) elProg.innerText = prog;
  if (elC) elC.innerText = c;
  if (elT) elT.innerText = filtradasPorMecanico.length;
}

// Renderizado de Tarjetas Móviles
function renderTareasMovil() {
  const contenedor = document.getElementById('contenedor-tareas-movil');
  if (!contenedor) return;

  let lista = filtrarTareasPorUsuario(tareasMovil);

  // Filtrar por tab
  if (tabActual === 'pendientes') {
    lista = lista.filter(t => t.estado === 'pendiente');
  } else if (tabActual === 'en_progreso') {
    lista = lista.filter(t => t.estado === 'en_progreso');
  } else if (tabActual === 'completadas') {
    lista = lista.filter(t => t.estado === 'completado');
  }

  actualizarContadoresMovil();

  if (lista.length === 0) {
    let tituloVacio = 'No tienes órdenes de trabajo pendientes';
    let subtituloVacio = 'Todas tus tareas asignadas están al día. Cuando el Administrador programe una nueva tarea, aparecerá aquí de inmediato.';
    if (tabActual === 'en_progreso') {
      tituloVacio = 'No tienes tareas en curso';
      subtituloVacio = 'Ve a la pestaña "Pendientes" y presiona "Iniciar Trabajo" para comenzar.';
    } else if (tabActual === 'completadas') {
      tituloVacio = 'Aún no hay tareas finalizadas';
      subtituloVacio = 'Tus órdenes terminadas con fotografía de comprobante y hora de arreglo se guardarán aquí.';
    }

    contenedor.innerHTML = `
      <div class="py-14 text-center text-slate-400 space-y-3 px-4">
        <div class="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 text-emerald-400 mx-auto flex items-center justify-center text-2xl shadow-inner">
          <i class="fa-solid fa-clipboard-check"></i>
        </div>
        <p class="font-bold text-white text-base">${tituloVacio}</p>
        <p class="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">${subtituloVacio}</p>
        <button onclick="cargarTareasMovil(true)" class="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-arrows-rotate"></i> Actualizar Listado
        </button>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = lista.map(t => {
    // Badge de tipo dinámico
    const badgeTipo = getBadgeTipoMovil(t.tipo);

    // Badge Prioridad
    let badgePrioridad = '';
    if (t.prioridad === 'critica') {
      badgePrioridad = `<span class="text-[10px] bg-rose-950 text-rose-300 border border-rose-700 font-bold px-2 py-0.5 rounded">¡CRÍTICA!</span>`;
    } else if (t.prioridad === 'alta') {
      badgePrioridad = `<span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-700 font-bold px-2 py-0.5 rounded">ALTA</span>`;
    }

    // Fechas y formato
    const fechaOcurrioStr = formatearFechaCorta(t.fecha_ocurrencia);
    const tiempoTranscurridoStr = calcularTiempoTranscurrido(t.fecha_ocurrencia);

    // Botones de acción según el estado y rol
    const usuarioActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
    const esVisualizador = usuarioActual.rol === 'visualizador';

    let botonesAccion = '';
    if (esVisualizador) {
      botonesAccion = `
        <div class="mt-3 pt-2 text-center border-t border-slate-700/60 text-xs text-purple-300 font-medium bg-purple-950/40 p-2 rounded-xl">
          <i class="fa-solid fa-eye mr-1"></i> Modo Solo Consulta (Visualizador)
        </div>
      `;
    } else if (t.estado === 'pendiente') {
      botonesAccion = `
        <div class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-700/60">
          <button onclick="iniciarTareaMovil('${t.id}')" class="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-[0.98]">
            <i class="fa-solid fa-play text-[11px]"></i> Iniciar Trabajo
          </button>
          <button onclick="abrirModalCompletar('${t.id}')" class="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-[0.98]">
            <i class="fa-solid fa-camera text-[11px]"></i> Terminar y Foto
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <button onclick="abrirModalAvanceMovil('${t.id}')" class="py-2 px-2.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-blue-300 border border-blue-500/40 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow">
            <i class="fa-solid fa-pen text-blue-400"></i> 📝 Registrar Avance
          </button>
          <button onclick="abrirDetalleTareaMovil('${t.id}')" class="py-2 px-2.5 bg-slate-800/80 hover:bg-slate-700 active:scale-[0.98] text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow">
            <i class="fa-solid fa-circle-info text-slate-400"></i> Ver Detalles
          </button>
        </div>
      `;
    } else if (t.estado === 'en_progreso') {
      botonesAccion = `
        <div class="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
          <button onclick="abrirModalCompletar('${t.id}')" class="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-[0.98]">
            <i class="fa-solid fa-camera text-base"></i>
            <span>Finalizar y Tomar Foto</span>
          </button>
          <div class="grid grid-cols-2 gap-2">
            <button onclick="abrirModalAvanceMovil('${t.id}')" class="py-2 px-2.5 bg-blue-900/60 hover:bg-blue-800/80 active:scale-[0.98] text-blue-200 border border-blue-500/50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow">
              <i class="fa-solid fa-pen text-blue-400"></i> 📝 Registrar Avance
            </button>
            <button onclick="abrirDetalleTareaMovil('${t.id}')" class="py-2 px-2.5 bg-slate-800/80 hover:bg-slate-700 active:scale-[0.98] text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow">
              <i class="fa-solid fa-circle-info text-slate-400"></i> Ver Detalles
            </button>
          </div>
        </div>
      `;
    } else {
      // Completada
      const fotoHtml = t.foto_comprobante 
        ? `<div class="mt-2.5 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex flex-col items-center justify-center relative group cursor-pointer" onclick="abrirVisorFoto('${t.foto_comprobante}', '${t.id} - ${escaparHTMLMovil(t.equipo)}'); event.stopPropagation();" title="Toca para ver en pantalla completa">
             <img src="${t.foto_comprobante}" alt="Comprobante" class="w-full max-h-48 object-contain rounded-lg p-1 transition hover:scale-[1.02]">
             <div class="w-full bg-slate-900/90 border-t border-slate-800 py-1.5 px-3 flex items-center justify-between text-[11px] text-slate-300">
               <span class="flex items-center gap-1 text-emerald-400 font-semibold"><i class="fa-solid fa-camera"></i> Foto del Trabajo</span>
               <span class="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                 <i class="fa-solid fa-expand"></i> Ver Completa
               </span>
             </div>
           </div>`
        : '';

      // Desglose de tiempo de espera vs trabajo activo en móvil
      let tiempoDetalladoHtml = '';
      const tRep = parseInt(t.tiempo_espera_repuestos_minutos) || 0;
      const tExt = parseInt(t.tiempo_fuera_planta_minutos) || 0;
      const tEspLegacy = parseInt(t.tiempo_espera_minutos) || 0;

      let repMin = tRep;
      let extMin = tExt;
      if (repMin === 0 && extMin === 0 && tEspLegacy > 0) {
        const mot = ((t.motivo_espera || '') + ' ' + (t.motivo_fuera_planta || '')).toLowerCase();
        if (mot.includes('torno') || mot.includes('taller') || mot.includes('extern') || mot.includes('fuera')) {
          extMin = tEspLegacy;
        } else {
          repMin = tEspLegacy;
        }
      }
      const tMuertoTotal = repMin + extMin;

      if (tMuertoTotal > 0) {
        const activo = (t.tiempo_trabajo_activo_minutos !== undefined && t.tiempo_trabajo_activo_minutos !== null)
          ? t.tiempo_trabajo_activo_minutos
          : Math.max(0, (t.tiempo_arreglo_minutos || 0) - tMuertoTotal);
        
        const partesMuerto = [];
        if (repMin > 0) partesMuerto.push(`${formatMinutosMovil(repMin)} repuestos`);
        if (extMin > 0) partesMuerto.push(`${formatMinutosMovil(extMin)} torno/ext`);

        tiempoDetalladoHtml = `
          <div class="mt-1 bg-amber-950/40 border border-amber-500/20 rounded-lg p-2 space-y-0.5 text-[11px]">
            <div class="flex items-center justify-between text-rose-300">
              <span class="flex items-center gap-1"><i class="fa-solid fa-hourglass-half text-[10px]"></i> Tiempos muertos:</span>
              <span class="font-mono font-bold">${partesMuerto.join(' + ')}</span>
            </div>
            <div class="flex items-center justify-between text-emerald-300 pt-0.5 border-t border-amber-500/20">
              <span class="flex items-center gap-1"><i class="fa-solid fa-wrench text-[10px]"></i> Trabajo activo:</span>
              <span class="font-mono font-bold">${formatMinutosMovil(activo)}</span>
            </div>
          </div>
        `;
      }

      // Desglose de horas por especialidad si existen
      let tiemposRolesHtml = '';
      if (t.tiempos_por_rol && Object.keys(t.tiempos_por_rol).length > 0) {
        const tr = t.tiempos_por_rol;
        const badgesRoles = [];
        if (tr.mecanico > 0) badgesRoles.push(`🔧 Mec: ${formatMinutosMovil(tr.mecanico)}`);
        if (tr.electrico > 0) badgesRoles.push(`⚡ Elec: ${formatMinutosMovil(tr.electrico)}`);
        if (tr.maquinista > 0) badgesRoles.push(`🚜 Maq: ${formatMinutosMovil(tr.maquinista)}`);
        if (badgesRoles.length > 0) {
          tiemposRolesHtml = `
            <div class="text-[10px] text-slate-300 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5 flex-wrap">
              <span class="font-semibold text-slate-400">Labor:</span>
              ${badgesRoles.map(b => `<span class="bg-slate-800 px-1.5 py-0.5 rounded font-mono font-bold">${b}</span>`).join('')}
            </div>
          `;
        }
      }

      const botonCambiarFoto = !esVisualizador ? `
        <button onclick="iniciarCambioFotoMovil('${t.id}')" class="w-full mt-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-indigo-300 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow">
          <i class="fa-solid fa-camera-rotate"></i> Cambiar / Mejorar Foto
        </button>
      ` : '';

      botonesAccion = `
        <div class="mt-2.5 pt-2.5 border-t border-slate-700/60 text-xs text-slate-400 space-y-1.5">
          <div class="flex items-center justify-between text-emerald-400 font-medium">
            <span class="flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Arreglado:</span>
            <span class="font-mono">${formatearFechaCorta(t.fecha_arreglo)}</span>
          </div>
          <div class="flex items-center justify-between text-slate-300">
            <span>Duración total parada:</span>
            <span class="font-mono font-bold text-purple-300">${formatMinutosMovil(t.tiempo_arreglo_minutos)}</span>
          </div>
          ${tiempoDetalladoHtml}
          ${tiemposRolesHtml}
          ${fotoHtml}
          ${t.notas_mecanico ? `<p class="mt-1 text-[11px] text-slate-300 italic bg-slate-900/60 p-2 rounded-lg border border-slate-800">"${escaparHTMLMovil(t.notas_mecanico)}"</p>` : ''}
          ${botonCambiarFoto}
          <button onclick="abrirDetalleTareaMovil('${t.id}')" class="w-full mt-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow">
            <i class="fa-solid fa-circle-info text-emerald-400"></i> Ver Todos los Detalles
          </button>
        </div>
      `;
    }

    // Badges de roles y trabajo conjunto
    const rolesBadges = (t.roles_asignados || ['mecanico']).map(r => {
      if (r === 'electrico') return '<span class="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-bolt text-[9px]"></i> ELÉCTRICA</span>';
      if (r === 'maquinista') return '<span class="bg-orange-500/10 text-orange-300 border border-orange-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-tractor text-[9px]"></i> MAQUINARIA</span>';
      return '<span class="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-wrench text-[9px]"></i> MECÁNICA</span>';
    }).join(' ');

    const esConjunta = t.es_conjunta || (t.roles_asignados && t.roles_asignados.length > 1) || (t.tecnicos_asignados && t.tecnicos_asignados.length > 1);
    const badgeConjunta = esConjunta 
      ? `<span class="bg-purple-900/80 text-purple-200 border border-purple-500 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm"><i class="fa-solid fa-people-group text-[9px]"></i> EN CONJUNTO</span>`
      : '';

    const numAvancesMob = Array.isArray(t.avances) ? t.avances.length : 0;
    const badgeAvancesMob = numAvancesMob > 0 
      ? `<button type="button" onclick="abrirDetalleTareaMovil('${t.id}'); event.stopPropagation();" class="bg-blue-900/80 text-blue-200 border border-blue-500/60 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
          <i class="fa-solid fa-list-check text-[9px]"></i> ${numAvancesMob} avance${numAvancesMob > 1 ? 's' : ''}
         </button>`
      : '';

    return `
      <div class="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
        
        <!-- Cabecera de la Tarjeta -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <div class="flex items-center space-x-1.5 flex-wrap gap-y-1 mb-1">
              ${badgeTipo}
              ${rolesBadges}
              ${badgeConjunta}
              ${badgeAvancesMob}
              ${badgePrioridad}
              <span class="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">${t.id}</span>
            </div>
            <h3 class="font-bold text-white text-base leading-snug">${escaparHTMLMovil(t.equipo)}</h3>
            <p class="text-xs text-slate-300 mt-0.5">${escaparHTMLMovil(t.titulo)}</p>
          </div>
        </div>

        <!-- Ubicación y Asignado -->
        <div class="flex items-center justify-between text-xs text-slate-400 mt-2">
          <span class="flex items-center gap-1 truncate max-w-[60%]">
            <i class="fa-solid fa-location-dot text-slate-500"></i> ${escaparHTMLMovil(t.ubicacion || 'Planta')}
          </span>
          <span class="flex items-center gap-1 font-medium text-slate-300">
            <i class="fa-solid fa-user-gear text-emerald-400"></i> ${escaparHTMLMovil(t.mecanico_asignado || 'Sin Asignar')}
          </span>
        </div>

        <!-- Horas de Ocurrencia -->
        <div class="mt-2.5 bg-slate-900/60 rounded-xl p-2.5 border border-slate-800 flex items-center justify-between text-xs">
          <div>
            <span class="text-[10px] text-amber-400 font-semibold uppercase block">Ocurrió / Reportada</span>
            <span class="font-mono text-white font-medium">${fechaOcurrioStr}</span>
          </div>
          <span class="text-[10px] text-slate-400 bg-slate-800 px-2 py-1 rounded">
            ${tiempoTranscurridoStr}
          </span>
        </div>

        <!-- Descripción si existe -->
        ${t.descripcion ? `<p class="mt-2 text-xs text-slate-300 line-clamp-2 bg-slate-900/30 p-2 rounded-lg">${escaparHTMLMovil(t.descripcion)}</p>` : ''}

        <!-- Foto Inicial del Daño / Guía para el técnico si existe -->
        ${t.foto_inicial ? `
          <div class="mt-2.5 rounded-xl overflow-hidden border border-sky-500/40 bg-slate-950 flex flex-col items-center justify-center relative group cursor-pointer" onclick="abrirVisorFoto('${t.foto_inicial}', 'Foto Inicial - ${t.id} - ${escaparHTMLMovil(t.equipo)}'); event.stopPropagation();" title="Toca para ver el problema en grande">
            <img src="${t.foto_inicial}" alt="Problema Reportado" class="w-full max-h-40 object-contain rounded-lg p-1 transition hover:scale-[1.02]">
            <div class="w-full bg-slate-900/90 border-t border-slate-800 py-1 px-2.5 flex items-center justify-between text-[11px] text-slate-300">
              <span class="flex items-center gap-1 text-sky-400 font-semibold text-[10px]"><i class="fa-solid fa-camera"></i> Foto Inicial (Problema Reportado)</span>
              <span class="text-[9px] text-sky-400 font-bold bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-500/30 flex items-center gap-1">
                <i class="fa-solid fa-expand"></i> Ver Grande
              </span>
            </div>
          </div>
        ` : ''}

        <!-- Botones de Acción -->
        ${botonesAccion}

      </div>
    `;
  }).join('');
}

// Acción Iniciar Tarea
async function iniciarTareaMovil(id) {
  try {
    const sel = document.getElementById('select-mecanico-activo');
    const mecanicoNombre = (sel && sel.value !== 'todos') ? sel.value : null;

    const res = await fetch(`/api/tasks/${id}/iniciar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mecanico_nombre: mecanicoNombre })
    });

    if (!res.ok) throw new Error('Error al iniciar tarea');

    mostrarToastMovil('¡Tarea iniciada! Puesta en progreso');
    if (navigator.vibrate) navigator.vibrate(80);
    cargarTareasMovil();
  } catch (err) {
    alert(err.message);
  }
}

// Abrir Modal de Completar
function abrirModalCompletar(id) {
  const t = tareasMovil.find(item => item.id === id);
  if (!t) return;

  document.getElementById('input-tarea-id').value = id;
  document.getElementById('modal-subtitulo-tarea').innerText = `${t.id} - ${t.equipo}`;
  document.getElementById('modal-equipo-txt').innerText = t.equipo;
  const elModalTipoBadge = document.getElementById('modal-tipo-badge');
  if (elModalTipoBadge) {
    const tKey = (t.tipo || 'otro').toLowerCase().trim();
    const cfg = CONFIG_TIPOS_MOVIL[tKey] || CONFIG_TIPOS_MOVIL['otro'];
    elModalTipoBadge.innerHTML = `<i class="fa-solid ${cfg.icon} mr-1"></i>${cfg.label}`;
    elModalTipoBadge.style.color = cfg.color;
  }
  document.getElementById('modal-ocurrio-txt').innerText = formatearFechaCorta(t.fecha_ocurrencia);

  // Limpiar campos previos
  const inCam = document.getElementById('input-camara-file');
  const inGal = document.getElementById('input-galeria-file');
  if (inCam) inCam.value = '';
  if (inGal) inGal.value = '';
  document.getElementById('input-notas-mecanico').value = '';

  const inEH = document.getElementById('input-espera-horas-movil');
  const inEM = document.getElementById('input-espera-minutos-movil');
  const inMot = document.getElementById('input-motivo-espera-movil');
  if (inEH) inEH.value = '0';
  if (inEM) inEM.value = '0';
  if (inMot) inMot.value = '';

  document.getElementById('box-sin-foto-previa').classList.remove('hidden');
  document.getElementById('box-con-foto-previa').classList.add('hidden');
  document.getElementById('img-previa-elemento').src = '';
  fotoCapturadaFile = null;
  fotoCapturadaBase64 = null;

  // Pre-llenar fecha y hora al momento de arreglar con la hora exacta actual
  fijarArregloAhora();

  document.getElementById('modal-completar-movil').classList.remove('hidden');
}

function cerrarModalCompletar() {
  document.getElementById('modal-completar-movil').classList.add('hidden');
  fotoCapturadaBase64 = null;
}

function fijarArregloAhora() {
  const el = document.getElementById('input-fecha-arreglo');
  if (!el) return;
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - offset)).toISOString().slice(0, 16);
  el.value = localISOTime;
}

let fotoCapturadaBase64 = null;

// Comprimir imagen usando Canvas para generar un Base64 liviano (~60-90KB) que se guarda directamente en la BD de Git
function comprimirImagenCanvas(file, maxDimension = 1024, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', calidad);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Previsualizar la foto tomada con la cámara del celular con compresión automática
async function previsualizarFoto(e) {
  const file = e.target.files[0];
  if (!file) return;

  fotoCapturadaFile = file;

  try {
    fotoCapturadaBase64 = await comprimirImagenCanvas(file, 1024, 0.72);
    const img = document.getElementById('img-previa-elemento');
    img.src = fotoCapturadaBase64;
    document.getElementById('box-sin-foto-previa').classList.add('hidden');
    document.getElementById('box-con-foto-previa').classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(50);
  } catch (err) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      fotoCapturadaBase64 = evt.target.result;
      const img = document.getElementById('img-previa-elemento');
      img.src = evt.target.result;
      document.getElementById('box-sin-foto-previa').classList.add('hidden');
      document.getElementById('box-con-foto-previa').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
}

// Enviar Finalización al Servidor
async function enviarFinalizacion(e) {
  e.preventDefault();
  const tareaId = document.getElementById('input-tarea-id').value;
  const fechaArreglo = document.getElementById('input-fecha-arreglo').value;
  const notasMecanico = document.getElementById('input-notas-mecanico').value;
  
  // Tiempo de espera por repuestos
  const hEspera = parseInt(document.getElementById('input-espera-horas-movil')?.value) || 0;
  const mEspera = parseInt(document.getElementById('input-espera-minutos-movil')?.value) || 0;
  const tiempoEsperaMin = Math.max(0, (hEspera * 60) + mEspera);
  const motivoEspera = (document.getElementById('input-motivo-espera-movil')?.value || '').trim();

  // Usuario autenticado que realiza la acción
  const usuarioActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const usuarioNombre = usuarioActual.nombre || 'Técnico de Turno';
  const usuarioLogin = usuarioActual.username || 'tecnico';
  const usuarioRol = usuarioActual.rol || 'mecanico';

  if (!fotoCapturadaFile && !fotoCapturadaBase64) {
    alert('Por favor tome una foto del arreglo antes de finalizar la tarea.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-finalizar');
  const txtOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando comprobante permanente...`;

  try {
    let res;
    // Si tenemos foto en base64 comprimida, enviar directamente por JSON (Persistencia total e indestructible en Git)
    if (fotoCapturadaBase64 && fotoCapturadaBase64.startsWith('data:image/')) {
      res = await fetch(`/api/tasks/${tareaId}/completar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': usuarioRol,
          'x-user-username': usuarioLogin,
          'x-user-name': usuarioNombre
        },
        body: JSON.stringify({
          foto_base64: fotoCapturadaBase64,
          fecha_arreglo: fechaArreglo,
          notas_mecanico: notasMecanico,
          mecanico_nombre: usuarioNombre,
          usuario_username: usuarioLogin,
          tiempo_espera_minutos: tiempoEsperaMin,
          motivo_espera: motivoEspera
        })
      });
    } else {
      // Fallback a FormData
      const formData = new FormData();
      formData.append('foto', fotoCapturadaFile);
      formData.append('fecha_arreglo', fechaArreglo);
      formData.append('notas_mecanico', notasMecanico);
      formData.append('mecanico_nombre', usuarioNombre);
      formData.append('usuario_username', usuarioLogin);
      formData.append('tiempo_espera_minutos', tiempoEsperaMin);
      formData.append('motivo_espera', motivoEspera);

      res = await fetch(`/api/tasks/${tareaId}/completar`, {
        method: 'POST',
        headers: {
          'x-user-role': usuarioRol,
          'x-user-username': usuarioLogin,
          'x-user-name': usuarioNombre
        },
        body: formData
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar registro');

    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
    mostrarToastMovil(`¡Excelente! Trabajo finalizado y foto registrada por ${usuarioNombre}`);
    cerrarModalCompletar();
    cambiarTabMovil('completadas', document.querySelectorAll('#mobile-tabs .tab-movil')[2]);
    cargarTareasMovil();
  } catch (err) {
    alert(err.message || 'Error al registrar tarea');
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtOriginal;
  }
}

// Formateadores
function formatearFechaCorta(str) {
  if (!str) return '-';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return str;
  }
}

function calcularTiempoTranscurrido(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    const ahora = new Date();
    const diffMs = ahora - d;
    if (diffMs < 0) return 'Programado';
    const minutos = Math.floor(diffMs / 60000);
    if (minutos < 60) return `Hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Hace ${horas}h`;
    const dias = Math.floor(horas / 24);
    return `Hace ${dias}d`;
  } catch (e) {
    return '';
  }
}

function formatMinutosMovil(min) {
  if (min === null || min === undefined || isNaN(min)) return 'N/A';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

function escaparHTMLMovil(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mostrarToastMovil(mensaje) {
  const toast = document.getElementById('mob-toast');
  const msg = document.getElementById('mob-toast-msg');
  if (!toast || !msg) return;
  msg.innerText = mensaje;
  toast.classList.remove('-translate-y-24', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('-translate-y-24', 'opacity-0');
  }, 4000);
}

// ================= GESTIÓN DE FOTOGRAFÍA EN TAREAS YA COMPLETADAS =================
let idTareaParaCambiarFoto = null;

function iniciarCambioFotoMovil(id) {
  idTareaParaCambiarFoto = id;
  const input = document.getElementById('input-cambiar-foto-movil');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function subirNuevaFotoMovil(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !idTareaParaCambiarFoto) return;

  mostrarToastMovil('Comprimiendo y actualizando fotografía...');
  const user = getUsuarioActivo();

  try {
    const fotoBase64 = await comprimirImagenCanvas(file, 1024, 0.75);

    const res = await fetch(`/api/tasks/${idTareaParaCambiarFoto}/foto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || 'mecanico',
        'x-user-name': user.nombre || 'Técnico',
        'x-user-username': user.username || 'tecnico'
      },
      body: JSON.stringify({ foto_base64: fotoBase64 })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar foto');

    if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
    mostrarToastMovil('✅ ¡Fotografía actualizada y respaldada!');
    e.target.value = '';
    idTareaParaCambiarFoto = null;
    cargarTareasMovil(false);
  } catch (err) {
    alert('Error al cambiar foto: ' + err.message);
  }
}

// ================= VISOR DE FOTO PANTALLA COMPLETA & DETALLES (MÓVIL) =================

function abrirVisorFoto(url, titulo = 'Fotografía Comprobante') {
  if (!url) return;
  const visor = document.getElementById('modal-visor-foto-fullscreen');
  const img = document.getElementById('visor-foto-img');
  const txt = document.getElementById('visor-foto-titulo');
  const btnDescargar = document.getElementById('visor-foto-descargar');

  if (img) img.src = url;
  if (txt) txt.innerText = titulo;
  if (btnDescargar) {
    btnDescargar.href = url;
    btnDescargar.download = `${titulo.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
  }
  if (visor) visor.classList.remove('hidden');
}

function cerrarVisorFoto() {
  const visor = document.getElementById('modal-visor-foto-fullscreen');
  if (visor) visor.classList.add('hidden');
}

function ampliarFotoPreviaMovil() {
  const imgPrevia = document.getElementById('img-previa-elemento');
  const subtitulo = document.getElementById('modal-subtitulo-tarea')?.innerText || 'Fotografía de Comprobante';
  if (imgPrevia && imgPrevia.src) {
    abrirVisorFoto(imgPrevia.src, subtitulo);
  }
}

let tareaDetalleMovilActual = null;

function abrirDetalleTareaMovil(id) {
  const t = tareasMovil.find(item => item.id === id);
  if (!t) return;
  tareaDetalleMovilActual = t;

  // Título e ID
  const elTitulo = document.getElementById('mob-det-id-titulo');
  if (elTitulo) elTitulo.innerText = `${t.id} - ${t.equipo}`;

  // Badge de tipo dinámico
  const badgeTipo = document.getElementById('mob-det-badge-tipo');
  if (badgeTipo) {
    const tKey = (t.tipo || 'otro').toLowerCase().trim();
    const cfg = CONFIG_TIPOS_MOVIL[tKey] || CONFIG_TIPOS_MOVIL['otro'];
    badgeTipo.innerHTML = `<i class="fa-solid ${cfg.icon} text-[9px] mr-1"></i>${cfg.label}`;
    badgeTipo.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cfg.bg}`;
  }

  // Foto Inicial (Problema Reportado "Antes")
  const boxFotoInicial = document.getElementById('mob-det-box-foto-inicial');
  const imgInicial = document.getElementById('mob-det-img-inicial');
  if (t.foto_inicial) {
    if (imgInicial) imgInicial.src = t.foto_inicial;
    if (boxFotoInicial) boxFotoInicial.classList.remove('hidden');
  } else {
    if (imgInicial) imgInicial.src = '';
    if (boxFotoInicial) boxFotoInicial.classList.add('hidden');
  }

  // Foto Comprobante (Reparación Final "Después")
  const boxFoto = document.getElementById('mob-det-box-foto');
  const sinFoto = document.getElementById('mob-det-sin-foto');
  const img = document.getElementById('mob-det-img');
  if (t.foto_comprobante) {
    if (img) img.src = t.foto_comprobante;
    if (boxFoto) boxFoto.classList.remove('hidden');
    if (sinFoto) sinFoto.classList.add('hidden');
  } else {
    if (img) img.src = '';
    if (boxFoto) boxFoto.classList.add('hidden');
    if (sinFoto) sinFoto.classList.remove('hidden');
  }

  // Equipo y Ubicación
  const elEq = document.getElementById('mob-det-equipo');
  const elUb = document.getElementById('mob-det-ubicacion');
  if (elEq) elEq.innerText = t.equipo;
  if (elUb) elUb.innerText = t.ubicacion || 'Planta Principal';

  // Estado y Prioridad
  const elEst = document.getElementById('mob-det-estado');
  const elPrio = document.getElementById('mob-det-prioridad');
  if (elEst) {
    let estTxt = 'Pendiente';
    let estColor = 'text-amber-400';
    if (t.estado === 'en_progreso') { estTxt = 'En Progreso'; estColor = 'text-blue-400'; }
    else if (t.estado === 'completado') { estTxt = 'Completado'; estColor = 'text-emerald-400'; }
    elEst.innerText = estTxt;
    elEst.className = `font-bold ${estColor} text-xs block`;
  }
  if (elPrio) elPrio.innerText = `Prioridad: ${t.prioridad || 'Media'}`;

  // Fechas y Tiempos
  const elOc = document.getElementById('mob-det-ocurrio');
  const elArr = document.getElementById('mob-det-arreglo');
  const elDur = document.getElementById('mob-det-duracion');
  if (elOc) elOc.innerText = formatearFechaCorta(t.fecha_ocurrencia);
  if (elArr) elArr.innerText = t.fecha_arreglo ? formatearFechaCorta(t.fecha_arreglo) : 'En proceso / Pendiente';
  if (elDur) elDur.innerText = formatMinutosMovil(t.tiempo_arreglo_minutos);

  // Desglose de espera por repuestos y fuera de planta / torno
  const boxEsp = document.getElementById('mob-det-box-espera');
  const subEsp = document.getElementById('mob-det-sub-espera');
  const subFuera = document.getElementById('mob-det-sub-fuera');
  const elTE = document.getElementById('mob-det-tiempo-espera');
  const elME = document.getElementById('mob-det-motivo-espera');
  const elTF = document.getElementById('mob-det-tiempo-fuera');
  const elMF = document.getElementById('mob-det-motivo-fuera');
  const elTA = document.getElementById('mob-det-tiempo-activo');

  let tRep = parseInt(t.tiempo_espera_repuestos_minutos) || 0;
  let tExt = parseInt(t.tiempo_fuera_planta_minutos) || 0;
  let motRep = t.motivo_espera_repuestos || t.motivo_espera || '';
  let motExt = t.motivo_fuera_planta || '';

  if (tRep === 0 && tExt === 0 && t.tiempo_espera_minutos > 0) {
    const txtGeneral = (t.motivo_espera || '').toLowerCase();
    if (txtGeneral.includes('torno') || txtGeneral.includes('taller') || txtGeneral.includes('extern') || txtGeneral.includes('fuera')) {
      tExt = t.tiempo_espera_minutos;
      motExt = t.motivo_espera || '';
      motRep = '';
    } else {
      tRep = t.tiempo_espera_minutos;
    }
  }

  const tMuertoTotal = tRep + tExt;
  if (tMuertoTotal > 0) {
    if (boxEsp) boxEsp.classList.remove('hidden');
    if (subEsp) {
      if (tRep > 0) {
        subEsp.classList.remove('hidden');
        if (elTE) elTE.innerText = formatMinutosMovil(tRep);
        if (elME) elME.innerText = motRep ? `"${motRep}"` : '';
      } else {
        subEsp.classList.add('hidden');
      }
    }
    if (subFuera) {
      if (tExt > 0) {
        subFuera.classList.remove('hidden');
        if (elTF) elTF.innerText = formatMinutosMovil(tExt);
        if (elMF) elMF.innerText = motExt ? `"${motExt}"` : '';
      } else {
        subFuera.classList.add('hidden');
      }
    }

    const act = (t.tiempo_trabajo_activo_minutos !== undefined && t.tiempo_trabajo_activo_minutos !== null)
      ? t.tiempo_trabajo_activo_minutos
      : Math.max(0, (t.tiempo_arreglo_minutos || 0) - tMuertoTotal);
    if (elTA) elTA.innerText = formatMinutosMovil(act);
  } else {
    if (boxEsp) boxEsp.classList.add('hidden');
  }

  // Renderizar bitácora de avances en móvil
  renderAvancesDetalleMovil(t);

  // Roles y Personal
  const contRoles = document.getElementById('mob-det-roles');
  if (contRoles) {
    const roles = Array.isArray(t.roles_asignados) && t.roles_asignados.length > 0 ? t.roles_asignados : ['mecanico'];
    contRoles.innerHTML = roles.map(r => {
      if (r === 'electrico') return '<span class="bg-amber-950 text-amber-300 border border-amber-600 px-2 py-0.5 rounded text-[10px] font-bold">⚡ Eléctrica</span>';
      if (r === 'maquinista') return '<span class="bg-orange-950 text-orange-300 border border-orange-600 px-2 py-0.5 rounded text-[10px] font-bold">🚜 Maquinaria</span>';
      return '<span class="bg-emerald-950 text-emerald-300 border border-emerald-600 px-2 py-0.5 rounded text-[10px] font-bold">🔧 Mecánica</span>';
    }).join(' ');
  }

  const elTecs = document.getElementById('mob-det-tecnicos');
  if (elTecs) {
    const tecs = Array.isArray(t.tecnicos_asignados) && t.tecnicos_asignados.length > 0
      ? t.tecnicos_asignados.join(', ')
      : (t.mecanico_asignado || 'Sin Asignar');
    elTecs.innerText = `Asignado a: ${tecs}`;
  }

  const elComp = document.getElementById('mob-det-completado-badge');
  if (elComp) {
    if (t.estado === 'completado') {
      const nom = t.completado_por_nombre || t.mecanico_asignado || 'Técnico';
      elComp.innerText = `✅ Finalizado por: ${nom}`;
      elComp.classList.remove('hidden');
    } else {
      elComp.classList.add('hidden');
    }
  }

  // Descripción
  const elDesc = document.getElementById('mob-det-descripcion');
  if (elDesc) elDesc.innerText = t.descripcion || 'Sin descripción detallada';

  // Observaciones
  const elNotas = document.getElementById('mob-det-notas');
  if (elNotas) elNotas.innerText = t.notas_mecanico ? `"${t.notas_mecanico}"` : 'Sin observaciones adicionales registradas';

  const modal = document.getElementById('modal-detalle-movil');
  if (modal) modal.classList.remove('hidden');
}

function cerrarDetalleTareaMovil() {
  const modal = document.getElementById('modal-detalle-movil');
  if (modal) modal.classList.add('hidden');
  tareaDetalleMovilActual = null;
}

function abrirFotoDetalleMovilActual() {
  if (tareaDetalleMovilActual && tareaDetalleMovilActual.foto_comprobante) {
    abrirVisorFoto(tareaDetalleMovilActual.foto_comprobante, `Foto Final - ${tareaDetalleMovilActual.id} - ${tareaDetalleMovilActual.equipo}`);
  }
}

function abrirFotoInicialDetalleMovilActual() {
  if (tareaDetalleMovilActual && tareaDetalleMovilActual.foto_inicial) {
    abrirVisorFoto(tareaDetalleMovilActual.foto_inicial, `Foto Inicial - ${tareaDetalleMovilActual.id} - ${tareaDetalleMovilActual.equipo}`);
  }
}

// ================= GESTIÓN DE BITÁCORA DE AVANCES EN MÓVIL =================
let fotoAvanceBase64 = null;
let tareaIdParaAvance = null;

function abrirModalAvanceMovil(id) {
  const t = tareasMovil.find(item => item.id === id);
  if (!t) return;
  tareaIdParaAvance = id;

  const inId = document.getElementById('input-avance-tarea-id');
  const sub = document.getElementById('modal-avance-subtitulo');
  const inHoras = document.getElementById('input-avance-horas-movil');
  const inDesc = document.getElementById('input-avance-desc-movil');
  
  if (inId) inId.value = t.id;
  if (sub) sub.innerText = `${t.id} - ${t.equipo}`;
  if (inHoras) inHoras.value = '';
  if (inDesc) inDesc.value = '';

  quitarFotoAvanceMovil();

  const modal = document.getElementById('modal-avance-movil');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModalAvanceMovil() {
  const modal = document.getElementById('modal-avance-movil');
  if (modal) modal.classList.add('hidden');
  tareaIdParaAvance = null;
  fotoAvanceBase64 = null;
}

function irARegistrarAvanceDesdeDetalle() {
  if (!tareaDetalleMovilActual) return;
  const id = tareaDetalleMovilActual.id;
  cerrarDetalleTareaMovil();
  abrirModalAvanceMovil(id);
}

async function previsualizarFotoAvanceMovil(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    mostrarToastMovil('Comprimiendo imagen...');
    fotoAvanceBase64 = await comprimirImagenCanvas(file, 1024, 0.75);

    const img = document.getElementById('img-previa-avance');
    const boxCon = document.getElementById('box-con-foto-avance');
    const boxSin = document.getElementById('box-sin-foto-avance');

    if (img) img.src = fotoAvanceBase64;
    if (boxCon) boxCon.classList.remove('hidden');
    if (boxSin) boxSin.classList.add('hidden');
  } catch(err) {
    alert('Error al procesar foto: ' + err.message);
  }
}

function quitarFotoAvanceMovil() {
  fotoAvanceBase64 = null;
  const camInput = document.getElementById('input-avance-camara-file');
  const galInput = document.getElementById('input-avance-galeria-file');
  if (camInput) camInput.value = '';
  if (galInput) galInput.value = '';

  const boxCon = document.getElementById('box-con-foto-avance');
  const boxSin = document.getElementById('box-sin-foto-avance');
  const img = document.getElementById('img-previa-avance');

  if (img) img.src = '';
  if (boxCon) boxCon.classList.add('hidden');
  if (boxSin) boxSin.classList.remove('hidden');
}

async function guardarAvanceMovil(e) {
  e.preventDefault();
  if (!tareaIdParaAvance) return;

  const desc = document.getElementById('input-avance-desc-movil')?.value.trim();
  const horas = parseFloat(document.getElementById('input-avance-horas-movil')?.value) || 0;
  const user = getUsuarioActivo();

  if (!desc) {
    alert('Por favor describe lo que realizaste en este avance.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-avance');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
  }

  try {
    const res = await fetch(`/api/tasks/${tareaIdParaAvance}/avances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || 'mecanico',
        'x-user-username': user.username || 'tecnico',
        'x-user-name': user.nombre || 'Técnico'
      },
      body: JSON.stringify({
        descripcion: desc,
        horas_dedicadas: horas,
        foto_base64: fotoAvanceBase64,
        tecnico_nombre: user.nombre || 'Técnico'
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar avance');

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    mostrarToastMovil('✅ ¡Avance registrado en la bitácora!');
    cerrarModalAvanceMovil();

    // Mover a la pestaña En Curso si estaba en pendientes
    const tabs = document.querySelectorAll('#mobile-tabs .tab-movil');
    if (tabs && tabs[1]) {
      cambiarTabMovil('en_progreso', tabs[1]);
    }

    cargarTareasMovil(false);
  } catch(err) {
    alert('Error al guardar avance: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

function renderAvancesDetalleMovil(t) {
  const cont = document.getElementById('mob-det-avances-lista');
  if (!cont) return;

  const avances = Array.isArray(t.avances) ? t.avances : [];
  if (avances.length === 0) {
    cont.innerHTML = `
      <div class="p-3 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-[11px]">
        <i class="fa-regular fa-clipboard text-slate-600 text-sm block mb-1"></i>
        <span>No se han registrado avances intermedios aún.</span>
      </div>
    `;
    return;
  }

  cont.innerHTML = avances.map(a => {
    let badgeRol = 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
    let iconRol = 'fa-wrench';
    if (a.tecnico_rol === 'electrico') { badgeRol = 'bg-amber-950/80 text-amber-300 border-amber-800'; iconRol = 'fa-bolt'; }
    else if (a.tecnico_rol === 'maquinista') { badgeRol = 'bg-orange-950/80 text-orange-300 border-orange-800'; iconRol = 'fa-tractor'; }
    else if (a.tecnico_rol === 'admin') { badgeRol = 'bg-purple-950/80 text-purple-300 border-purple-800'; iconRol = 'fa-crown'; }

    const horasBadge = a.horas_dedicadas > 0 ? `<span class="bg-blue-950 border border-blue-500/40 text-blue-300 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">⏱️ ${a.horas_dedicadas}h</span>` : '';
    const fotoThumb = a.foto ? `
      <div class="mt-1.5 cursor-pointer inline-block" onclick="abrirVisorFoto('${a.foto}', 'Avance: ${escaparHTMLMovil(a.tecnico_nombre)}'); event.stopPropagation();">
        <img src="${a.foto}" alt="Avance" class="w-20 h-14 object-cover rounded-lg border border-slate-700 active:scale-95 transition shadow">
      </div>
    ` : '';

    return `
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] px-1.5 py-0.5 rounded border ${badgeRol} font-bold flex items-center gap-1">
              <i class="fa-solid ${iconRol}"></i> ${escaparHTMLMovil(a.tecnico_nombre)}
            </span>
            ${horasBadge}
          </div>
          <span class="text-[10px] text-slate-500 font-mono">${formatearFechaCorta(a.fecha_hora)}</span>
        </div>
        <p class="text-slate-300 text-[11px] leading-relaxed">${escaparHTMLMovil(a.descripcion)}</p>
        ${fotoThumb}
      </div>
    `;
  }).join('');
}


