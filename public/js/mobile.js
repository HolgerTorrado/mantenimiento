// Variables del Portal Móvil
let tareasMovil = [];
let tabActual = 'pendientes';
let mecanicoActivo = localStorage.getItem('siman_mecanico_activo') || 'todos';
let fotoCapturadaFile = null;

let deferredInstallPrompt = null;

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
      else if (user.rol === 'admin') { icon = '👑'; rolBadge = '<span class="text-[9px] font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/40">ADMIN</span>'; }
      else if (user.rol === 'visualizador') { icon = '👁️'; rolBadge = '<span class="text-[9px] text-purple-300 opacity-80">(Visualizador)</span>'; }

      label.innerHTML = `${icon} <span class="font-bold text-white">${escaparHTMLMovil(user.nombre || user.username)}</span> ${rolBadge}`;
    }

    // Si es Administrador o Visualizador, habilitar botón de cambiar a Vista PC
    const btnPC = document.getElementById('btn-ir-pc-dashboard');
    if (btnPC) {
      if (user.rol === 'admin' || user.rol === 'visualizador') {
        btnPC.classList.remove('hidden');
      } else {
        btnPC.classList.add('hidden');
      }
    }

    // Si es Administrador, habilitar botón de crear tarea en barra móvil
    const btnCrear = document.getElementById('btn-crear-tarea-movil');
    if (btnCrear) {
      if (user.rol === 'admin') {
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

async function guardarNuevaTareaMovil(e) {
  e.preventDefault();
  const user = getUsuarioActivo();
  if (user.rol !== 'admin') {
    alert('Solo el Administrador tiene permiso para crear tareas.');
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
        'x-user-username': user.username || 'Holger'
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
        tecnicos_asignados: []
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error creando tarea');

    mostrarToastMovil('✅ Tarea creada exitosamente');
    cerrarModalCrearMovil();
    document.getElementById('form-crear-tarea-movil')?.reset();
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
  if (!user || user.rol === 'admin' || user.rol === 'visualizador') {
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
    // Badges de tipo
    let badgeTipo = '';
    if (t.tipo === 'preventivo') {
      badgeTipo = `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
        <i class="fa-solid fa-calendar-check text-[9px]"></i> PREVENTIVO
      </span>`;
    } else if (t.tipo === 'correctivo') {
      badgeTipo = `<span class="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
        <i class="fa-solid fa-triangle-exclamation text-[9px]"></i> CORRECTIVO
      </span>`;
    } else {
      badgeTipo = `<span class="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
        <i class="fa-solid fa-wave-square text-[9px]"></i> PREDICTIVO
      </span>`;
    }

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
      `;
    } else if (t.estado === 'en_progreso') {
      botonesAccion = `
        <div class="mt-3 pt-3 border-t border-slate-700/60">
          <button onclick="abrirModalCompletar('${t.id}')" class="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-[0.98]">
            <i class="fa-solid fa-camera text-base"></i>
            <span>Finalizar y Tomar Foto</span>
          </button>
        </div>
      `;
    } else {
      // Completada
      const fotoHtml = t.foto_comprobante 
        ? `<div class="mt-2.5 rounded-xl overflow-hidden border border-slate-700 max-h-36 bg-black flex items-center justify-center">
             <img src="${t.foto_comprobante}" alt="Comprobante" class="w-full h-36 object-cover">
           </div>`
        : '';

      // Desglose de tiempo de espera vs trabajo activo en móvil
      let tiempoDetalladoHtml = '';
      if (t.tiempo_espera_minutos && t.tiempo_espera_minutos > 0) {
        const activo = (t.tiempo_trabajo_activo_minutos !== undefined && t.tiempo_trabajo_activo_minutos !== null)
          ? t.tiempo_trabajo_activo_minutos
          : Math.max(0, t.tiempo_arreglo_minutos - t.tiempo_espera_minutos);
        tiempoDetalladoHtml = `
          <div class="mt-1 bg-amber-950/40 border border-amber-500/20 rounded-lg p-2 space-y-0.5 text-[11px]">
            <div class="flex items-center justify-between text-amber-300">
              <span class="flex items-center gap-1"><i class="fa-solid fa-hourglass-half text-[10px]"></i> Espera repuesto:</span>
              <span class="font-mono font-bold">${formatMinutosMovil(t.tiempo_espera_minutos)}</span>
            </div>
            ${t.motivo_espera ? `<p class="text-[10px] text-amber-200/70 italic truncate">"${escaparHTMLMovil(t.motivo_espera)}"</p>` : ''}
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

    return `
      <div class="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
        
        <!-- Cabecera de la Tarjeta -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <div class="flex items-center space-x-1.5 flex-wrap gap-y-1 mb-1">
              ${badgeTipo}
              ${rolesBadges}
              ${badgeConjunta}
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
  document.getElementById('modal-tipo-badge').innerText = t.tipo.toUpperCase();
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
