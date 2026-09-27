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
    if (label) label.innerText = `👤 ${user.nombre || user.username}`;
    return user;
  } catch (e) {
    window.location.href = '/login';
    return null;
  }
}

function cerrarSesion() {
  if (confirm('¿Desea cerrar la sesión actual?')) {
    localStorage.removeItem('siman_token');
    localStorage.removeItem('siman_user');
    window.location.href = '/login';
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
  mecanicoActivo = sel.value;
  localStorage.setItem('siman_mecanico_activo', mecanicoActivo);
  actualizarTextoMecanicoPie();
  renderTareasMovil();
}

function actualizarTextoMecanicoPie() {
  const el = document.getElementById('txt-mecanico-actual-pie');
  if (el) {
    el.innerText = mecanicoActivo === 'todos' ? 'Viendo: Todos' : `Viendo: ${mecanicoActivo}`;
  }
}

// Cargar Tareas desde el Servidor
async function cargarTareasMovil(mostrarSpin = true) {
  const icon = document.getElementById('mob-icon-recarga');
  if (mostrarSpin && icon) icon.classList.add('fa-spin');

  try {
    const res = await fetch('/api/tasks');
    tareasMovil = await res.json();
    actualizarContadoresMovil();
    renderTareasMovil();
  } catch (err) {
    console.error('Error cargando tareas móvil:', err);
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

// Filtrar tareas según el rol del usuario conectado
function filtrarTareasPorUsuario(tareas) {
  const user = getUsuarioActivo();
  if (!user || user.rol === 'admin' || user.rol === 'visualizador') {
    return tareas;
  }
  // Si es mecánico, ver las tareas asignadas a su nombre o disponibles
  const miNombre = (user.nombre || user.username || '').toLowerCase().trim();
  return tareas.filter(t => {
    const asig = (t.mecanico_asignado || '').toLowerCase().trim();
    return asig === miNombre || asig.includes(miNombre) || asig === 'sin asignar' || asig === 'todos';
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
    contenedor.innerHTML = `
      <div class="py-16 text-center text-slate-400 space-y-2">
        <div class="w-12 h-12 rounded-full bg-slate-800 text-slate-500 mx-auto flex items-center justify-center text-xl">
          <i class="fa-solid fa-check-double"></i>
        </div>
        <p class="font-semibold text-white text-sm">No hay tareas en esta sección</p>
        <p class="text-xs text-slate-500">Todo el mantenimiento está al día o cambia de pestaña.</p>
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

      botonesAccion = `
        <div class="mt-2.5 pt-2.5 border-t border-slate-700/60 text-xs text-slate-400 space-y-1">
          <div class="flex items-center justify-between text-emerald-400 font-medium">
            <span class="flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Arreglado:</span>
            <span class="font-mono">${formatearFechaCorta(t.fecha_arreglo)}</span>
          </div>
          <div class="flex items-center justify-between text-slate-300">
            <span>Duración total:</span>
            <span class="font-mono font-bold text-purple-300">${formatMinutosMovil(t.tiempo_arreglo_minutos)}</span>
          </div>
          ${fotoHtml}
          ${t.notas_mecanico ? `<p class="mt-1 text-[11px] text-slate-300 italic bg-slate-900/60 p-2 rounded-lg border border-slate-800">"${escaparHTMLMovil(t.notas_mecanico)}"</p>` : ''}
        </div>
      `;
    }

    return `
      <div class="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
        
        <!-- Cabecera de la Tarjeta -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <div class="flex items-center space-x-1.5 flex-wrap gap-y-1 mb-1">
              ${badgeTipo}
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
  document.getElementById('input-camara-file').value = '';
  document.getElementById('input-notas-mecanico').value = '';
  document.getElementById('box-sin-foto-previa').classList.remove('hidden');
  document.getElementById('box-con-foto-previa').classList.add('hidden');
  document.getElementById('img-previa-elemento').src = '';
  fotoCapturadaFile = null;

  // Pre-llenar fecha y hora al momento de arreglar con la hora exacta actual
  fijarArregloAhora();

  document.getElementById('modal-completar-movil').classList.remove('hidden');
}

function cerrarModalCompletar() {
  document.getElementById('modal-completar-movil').classList.add('hidden');
}

function fijarArregloAhora() {
  const el = document.getElementById('input-fecha-arreglo');
  if (!el) return;
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - offset)).toISOString().slice(0, 16);
  el.value = localISOTime;
}

// Previsualizar la foto tomada con la cámara del celular
function previsualizarFoto(e) {
  const file = e.target.files[0];
  if (!file) return;

  fotoCapturadaFile = file;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = document.getElementById('img-previa-elemento');
    img.src = evt.target.result;
    document.getElementById('box-sin-foto-previa').classList.add('hidden');
    document.getElementById('box-con-foto-previa').classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(50);
  };
  reader.readAsDataURL(file);
}

// Enviar Finalización al Servidor
async function enviarFinalizacion(e) {
  e.preventDefault();
  const tareaId = document.getElementById('input-tarea-id').value;
  const fechaArreglo = document.getElementById('input-fecha-arreglo').value;
  const notasMecanico = document.getElementById('input-notas-mecanico').value;
  
  // Usuario autenticado que realiza la acción
  const usuarioActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const usuarioNombre = usuarioActual.nombre || 'Mecánico de Turno';
  const usuarioLogin = usuarioActual.username || 'mecanico';
  const usuarioRol = usuarioActual.rol || 'mecanico';

  if (!fotoCapturadaFile) {
    alert('Por favor tome una foto del arreglo antes de finalizar la tarea.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-finalizar');
  const txtOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Subiendo fotografía y registrando...`;

  try {
    const formData = new FormData();
    formData.append('foto', fotoCapturadaFile);
    formData.append('fecha_arreglo', fechaArreglo);
    formData.append('notas_mecanico', notasMecanico);
    formData.append('mecanico_nombre', usuarioNombre);
    formData.append('usuario_username', usuarioLogin);

    const res = await fetch(`/api/tasks/${tareaId}/completar`, {
      method: 'POST',
      headers: {
        'x-user-role': usuarioRol,
        'x-user-username': usuarioLogin,
        'x-user-name': usuarioNombre
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar registro');

    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
    mostrarToastMovil(`¡Excelente! Trabajo finalizado y foto registrada por ${usuarioNombre}`);
    cerrarModalCompletar();
    cambiarTabMovil('completadas', document.querySelectorAll('#mobile-tabs .tab-movil')[2]);
    cargarTareasMovil();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtOriginal;
  }
    alert('Error al registrar: ' + err.message);
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
