// Variables globales del Dashboard
let todasLasTareas = [];
let filtroEstadoActual = 'todos';
let periodoActual = 'todo';
let tareaSeleccionadaId = null;
let chartTipos = null;
let chartTiempos = null;
let nuevaFotoDetalleBase64 = null;
let fotoDetalleOriginal = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  const user = verificarSesionDashboard();
  if (!user) return; // Detener ejecución si no hay sesión activa
  iniciarReloj();
  cargarMecanicosSelect();
  cargarTareas();
  fijarOcurrenciaAhora();

  // Auto-refresco cada 30 segundos
  setInterval(() => {
    cargarTareas(false);
  }, 30000);
});

// Cambiar período de visualización
function cambiarPeriodo(periodo, btn) {
  periodoActual = periodo;

  // Actualizar estilos de botones de período
  document.querySelectorAll('#btn-periodo-group .periodo-btn').forEach(b => {
    b.className = 'periodo-btn px-3 py-1.5 rounded-lg text-xs font-medium transition text-slate-400 hover:text-white hover:bg-slate-700';
  });
  if (btn) {
    btn.className = 'periodo-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white shadow-md';
  }

  cargarTareas(false);
}


function verificarSesionDashboard() {
  const userJson = localStorage.getItem('siman_user');
  if (!userJson) {
    window.location.href = '/login';
    return null;
  }
  try {
    const user = JSON.parse(userJson);
    const nombreEl = document.getElementById('nav-usuario-nombre');
    const rolEl = document.getElementById('nav-usuario-rol');
    if (nombreEl) nombreEl.innerText = user.nombre || user.username;
    if (rolEl) rolEl.innerText = user.rol.toUpperCase();

    // Solo el administrador Holger puede ver botones de admin (crear tarea, usuarios, respaldo)
    const btnCrear = document.getElementById('btn-crear-tarea-dashboard');
    const btnUsers = document.getElementById('btn-admin-usuarios');
    const btnBackup = document.getElementById('btn-admin-backup');
    if (user.rol === 'admin') {
      if (btnCrear) btnCrear.classList.remove('hidden');
      if (btnUsers) btnUsers.classList.remove('hidden');
      if (btnBackup) btnBackup.classList.remove('hidden');
    } else {
      if (btnCrear) btnCrear.classList.add('hidden');
      if (btnUsers) btnUsers.classList.add('hidden');
      if (btnBackup) btnBackup.classList.add('hidden');
    }

    return user;
  } catch (e) {
    window.location.href = '/login';
    return null;
  }
}

function cerrarSesionDashboard() {
  localStorage.removeItem('siman_token');
  localStorage.removeItem('siman_user');
  localStorage.removeItem('siman_mecanico_activo');
  sessionStorage.removeItem('siman_forzar_pc');
  window.location.replace('/login?logout=true');
}

function irModoMovilDesdePC() {
  sessionStorage.removeItem('siman_forzar_pc');
  window.location.replace('/mecanico');
}

// Reloj en tiempo real
function iniciarReloj() {
  function actualizar() {
    const ahora = new Date();
    const str = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const el = document.getElementById('reloj-vivo');
    if (el) el.innerText = str;
  }
  actualizar();
  setInterval(actualizar, 1000);
}

// Información de red y QR para celulares
async function cargarInfoRed() {
  try {
    const res = await fetch('/api/network-info');
    const data = await res.json();
    
    // Actualizar banner
    const ipBanner = document.getElementById('ip-banner-url');
    if (ipBanner) ipBanner.innerText = data.mobileUrl;

    const btnProbar = document.getElementById('btn-probar-movil');
    if (btnProbar) btnProbar.href = data.mobileUrl;

    // Actualizar modal QR
    const qrImg = document.getElementById('qr-img-element');
    if (qrImg && data.qrCodeDataUrl) qrImg.src = data.qrCodeDataUrl;

    const qrUrlText = document.getElementById('qr-url-text');
    if (qrUrlText) qrUrlText.innerText = data.mobileUrl;
  } catch (err) {
    console.error('Error cargando red:', err);
  }
}

// Cargar técnicos y poblar checkboxes de asignación múltiple
let listaTecnicosDisponibles = [];

async function cargarMecanicosSelect() {
  try {
    const res = await fetch('/api/tecnicos');
    listaTecnicosDisponibles = await res.json();
    poblarCheckboxesTecnicos();
  } catch (err) {
    console.error('Error al cargar técnicos:', err);
  }
}

function poblarCheckboxesTecnicos() {
  const cont = document.getElementById('contenedor-checkboxes-tecnicos');
  if (!cont) return;

  if (listaTecnicosDisponibles.length === 0) {
    cont.innerHTML = '<p class="text-[11px] text-slate-500 p-2 col-span-2">No hay técnicos registrados aún. Crea usuarios con rol Mecánico, Eléctrico o Maquinista.</p>';
    return;
  }

  cont.innerHTML = listaTecnicosDisponibles.map(t => {
    let iconRol = 'fa-wrench text-emerald-400';
    let badgeRol = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    let rolTxt = 'Mecánico';
    if (t.rol === 'electrico') {
      iconRol = 'fa-bolt text-amber-400';
      badgeRol = 'bg-amber-950 text-amber-300 border-amber-800';
      rolTxt = 'Eléctrico';
    } else if (t.rol === 'maquinista') {
      iconRol = 'fa-tractor text-orange-400';
      badgeRol = 'bg-orange-950 text-orange-300 border-orange-800';
      rolTxt = 'Maquinista';
    }

    return `
      <label class="cursor-pointer border border-slate-700/80 rounded-lg p-2 flex items-center justify-between text-xs hover:bg-slate-800/80 transition has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-950/30">
        <div class="flex items-center gap-2 truncate">
          <input type="checkbox" name="tecnicos_asignados" value="${escaparHTML(t.nombre)}" onchange="actualizarEstadoTrabajoConjunto()" class="rounded border-slate-700 text-indigo-600 focus:ring-0">
          <span class="font-medium text-white truncate">${escaparHTML(t.nombre)}</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded border ${badgeRol} flex items-center gap-1 flex-shrink-0">
          <i class="fa-solid ${iconRol}"></i> ${rolTxt}
        </span>
      </label>
    `;
  }).join('');
}

function actualizarEstadoTrabajoConjunto() {
  const roles = Array.from(document.querySelectorAll('#form-crear-tarea input[name="roles_asignados"]:checked'));
  const tecnicos = Array.from(document.querySelectorAll('#form-crear-tarea input[name="tecnicos_asignados"]:checked'));
  const badge = document.getElementById('badge-tarea-conjunta-crear');
  if (badge) {
    if (roles.length > 1 || tecnicos.length > 1) {
      badge.classList.remove('hidden');
      badge.innerText = `👥 Trabajo en Conjunto (${roles.length} roles, ${tecnicos.length} personas)`;
    } else {
      badge.classList.add('hidden');
    }
  }
}

// Cargar Tareas y Métricas
async function cargarTareas(animarRecarga = true) {
  const icon = document.getElementById('icon-recarga');
  if (animarRecarga && icon) icon.classList.add('fa-spin');

  try {
    // 1. Obtener tareas filtradas por período
    const resTasks = await fetch(`/api/tasks?periodo=${periodoActual}`);
    todasLasTareas = await resTasks.json();

    // 2. Obtener métricas filtradas por período
    const resMetrics = await fetch(`/api/metrics?periodo=${periodoActual}`);
    const metrics = await resMetrics.json();

    actualizarKPIs(metrics);
    actualizarGraficas(metrics);
    aplicarFiltros();
  } catch (err) {
    console.error('Error cargando tareas:', err);
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
}


// Actualizar contadores y KPIs
function actualizarKPIs(m) {
  if (!m) return;
  const pt = m.por_tipo || { preventivo: 0, correctivo: 0, predictivo: 0 };
  const mt = m.mttr_por_tipo || {
    preventivo: { formato: '0 min' },
    correctivo: { formato: '0 min' },
    predictivo: { formato: '0 min' }
  };

  const elTotal = document.getElementById('kpi-total');
  const elPend = document.getElementById('kpi-pendientes');
  const elProg = document.getElementById('kpi-progreso');
  const elComp = document.getElementById('kpi-completadas');
  const elMttr = document.getElementById('kpi-mttr');

  if (elTotal) elTotal.innerText = m.total ?? 0;
  if (elPend) elPend.innerText = m.pendientes ?? 0;
  if (elProg) elProg.innerText = m.en_progreso ?? 0;
  if (elComp) elComp.innerText = m.completadas ?? 0;
  if (elMttr) elMttr.innerText = m.mttr_global_formato || '0 min';

  // Contadores en pestañas
  const cTot = document.getElementById('count-todos');
  const cPend = document.getElementById('count-tab-pendientes');
  const cProg = document.getElementById('count-tab-progreso');
  const cComp = document.getElementById('count-tab-completadas');
  if (cTot) cTot.innerText = m.total ?? 0;
  if (cPend) cPend.innerText = m.pendientes ?? 0;
  if (cProg) cProg.innerText = m.en_progreso ?? 0;
  if (cComp) cComp.innerText = m.completadas ?? 0;

  // Estadísticas por tipo
  const sPrev = document.getElementById('stat-preventivo');
  const sCorr = document.getElementById('stat-correctivo');
  const sPred = document.getElementById('stat-predictivo');
  if (sPrev) sPrev.innerText = pt.preventivo ?? 0;
  if (sCorr) sCorr.innerText = pt.correctivo ?? 0;
  if (sPred) sPred.innerText = pt.predictivo ?? 0;

  // Tiempos por tipo
  const mPrev = document.getElementById('mttr-preventivo-txt');
  const mCorr = document.getElementById('mttr-correctivo-txt');
  const mPred = document.getElementById('mttr-predictivo-txt');
  if (mPrev) mPrev.innerText = mt.preventivo?.formato || '0 min';
  if (mCorr) mCorr.innerText = mt.correctivo?.formato || '0 min';
  if (mPred) mPred.innerText = mt.predictivo?.formato || '0 min';
}

// Actualizar Gráficas con Chart.js
function actualizarGraficas(m) {
  if (!m) return;
  const pt = m.por_tipo || { preventivo: 0, correctivo: 0, predictivo: 0 };
  const mt = m.mttr_por_tipo || {
    preventivo: { minutos: 0 },
    correctivo: { minutos: 0 },
    predictivo: { minutos: 0 }
  };

  // 1. Gráfica de Donut: Tipos
  const ctxTipos = document.getElementById('chart-tipos')?.getContext('2d');
  if (ctxTipos) {
    const totalTipos = (pt.preventivo || 0) + (pt.correctivo || 0) + (pt.predictivo || 0);
    const dataTipos = totalTipos > 0 ? [pt.preventivo, pt.correctivo, pt.predictivo] : [0, 0, 0];
    if (chartTipos) {
      chartTipos.data.datasets[0].data = dataTipos;
      chartTipos.update();
    } else {
      chartTipos = new Chart(ctxTipos, {
        type: 'doughnut',
        data: {
          labels: ['Preventivo', 'Correctivo', 'Predictivo'],
          datasets: [{
            data: dataTipos,
            backgroundColor: ['#10b981', '#ef4444', '#8b5cf6'],
            borderColor: '#1e293b',
            borderWidth: 3,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          cutout: '70%'
        }
      });
    }
  }

  // 2. Gráfica de Barra Horizontal: Minutos MTTR
  const ctxTiempos = document.getElementById('chart-tiempos')?.getContext('2d');
  if (ctxTiempos) {
    const minPreventivo = mt.preventivo?.minutos || 0;
    const minCorrectivo = mt.correctivo?.minutos || 0;
    const minPredictivo = mt.predictivo?.minutos || 0;

    if (chartTiempos) {
      chartTiempos.data.datasets[0].data = [minPreventivo, minCorrectivo, minPredictivo];
      chartTiempos.update();
    } else {
      chartTiempos = new Chart(ctxTiempos, {
        type: 'bar',
        data: {
          labels: ['Preventivo', 'Correctivo', 'Predictivo'],
          datasets: [{
            label: 'Minutos Promedio de Reparación',
            data: [minPreventivo, minCorrectivo, minPredictivo],
            backgroundColor: ['#10b981cc', '#ef4444cc', '#8b5cf6cc'],
            borderRadius: 6,
            maxBarThickness: 16
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { color: '#334155' },
              ticks: { color: '#94a3b8', font: { size: 10 } }
            },
            y: {
              grid: { display: false },
              ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.raw} min (${formatMinutos(ctx.raw)})`
              }
            }
          }
        }
      });
    }
  }
}

// Filtros y Renderizado de Tabla
function filtrarEstado(estado, btn) {
  filtroEstadoActual = estado;
  
  // Cambiar clases visuales en tabs
  document.querySelectorAll('#tabs-estado .tab-btn').forEach(b => {
    b.className = 'tab-btn px-3 py-1.5 rounded-lg text-xs font-medium transition text-slate-400 hover:text-white hover:bg-slate-700/60';
  });
  if (btn) {
    btn.className = 'tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-emerald-600 text-white';
  }

  aplicarFiltros();
}

function aplicarFiltros() {
  const tipo = document.getElementById('select-filtro-tipo').value;
  const busqueda = (document.getElementById('input-busqueda').value || '').toLowerCase().trim();

  let filtradas = todasLasTareas.filter(t => {
    // Filtro estado
    if (filtroEstadoActual !== 'todos' && t.estado !== filtroEstadoActual) return false;
    // Filtro tipo
    if (tipo !== 'todos' && t.tipo !== tipo) return false;
    // Búsqueda
    if (busqueda) {
      const match = (t.equipo && t.equipo.toLowerCase().includes(busqueda)) ||
                    (t.titulo && t.titulo.toLowerCase().includes(busqueda)) ||
                    (t.id && t.id.toLowerCase().includes(busqueda)) ||
                    (t.mecanico_asignado && t.mecanico_asignado.toLowerCase().includes(busqueda)) ||
                    (t.ubicacion && t.ubicacion.toLowerCase().includes(busqueda));
      if (!match) return false;
    }
    return true;
  });

  renderTablaTareas(filtradas);
}

// Renderizado de las filas de la tabla
function renderTablaTareas(tareas) {
  const tbody = document.getElementById('tabla-tareas');
  if (!tbody) return;

  if (tareas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="py-12 text-center text-slate-400">
          <div class="w-12 h-12 rounded-full bg-slate-800 text-slate-500 mx-auto flex items-center justify-center text-xl mb-2">
            <i class="fa-regular fa-folder-open"></i>
          </div>
          <p class="font-medium text-slate-300">No hay tareas que coincidan con el filtro</p>
          <p class="text-xs text-slate-500 mt-1">Crea una nueva tarea o cambia los criterios de búsqueda</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = tareas.map(t => {
    // Badge Tipo
    let badgeTipo = '';
    if (t.tipo === 'preventivo') {
      badgeTipo = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        <i class="fa-solid fa-calendar-check text-[10px]"></i> Preventivo
      </span>`;
    } else if (t.tipo === 'correctivo') {
      badgeTipo = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
        <i class="fa-solid fa-triangle-exclamation text-[10px]"></i> Correctivo
      </span>`;
    } else {
      badgeTipo = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
        <i class="fa-solid fa-wave-square text-[10px]"></i> Predictivo
      </span>`;
    }

    // Badge Estado
    let badgeEstado = '';
    if (t.estado === 'pendiente') {
      badgeEstado = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Pendiente
      </span>`;
    } else if (t.estado === 'en_progreso') {
      badgeEstado = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30">
        <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span> En Progreso
      </span>`;
    } else {
      badgeEstado = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
        <i class="fa-solid fa-check text-[10px]"></i> Completado
      </span>`;
    }

    // Foto comprobante thumbnail
    let fotoTd = '';
    if (t.foto_comprobante) {
      fotoTd = `
        <div class="relative group cursor-pointer inline-block" onclick="abrirVisorFoto('${t.foto_comprobante}', '${t.id} - ${escaparHTML(t.equipo)}'); event.stopPropagation();" title="Clic para ampliar fotografía">
          <img src="${t.foto_comprobante}" alt="Comprobante" class="w-12 h-10 object-cover rounded-lg border border-slate-600 group-hover:border-emerald-400 group-hover:scale-105 transition shadow">
          <span class="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <i class="fa-solid fa-magnifying-glass-plus text-white text-xs"></i>
          </span>
        </div>
      `;
    } else {
      fotoTd = `
        <span class="text-slate-500 text-xs italic flex items-center justify-center gap-1">
          <i class="fa-regular fa-image text-slate-600"></i> Pendiente
        </span>
      `;
    }

    // Fechas formateadas
    const txtOcurrio = formatearFechaHora(t.fecha_ocurrencia);
    const txtArreglo = t.fecha_arreglo ? formatearFechaHora(t.fecha_arreglo) : `<span class="text-slate-500 italic">En proceso...</span>`;
    
    let desgloseTiempos = '';
    if (t.tiempo_arreglo_minutos !== null) {
      if (t.tiempo_espera_minutos && t.tiempo_espera_minutos > 0) {
        const activo = (t.tiempo_trabajo_activo_minutos !== undefined && t.tiempo_trabajo_activo_minutos !== null)
          ? t.tiempo_trabajo_activo_minutos
          : Math.max(0, t.tiempo_arreglo_minutos - t.tiempo_espera_minutos);
        desgloseTiempos = `
          <div class="text-[10px] text-amber-300/90 flex items-center gap-1 mt-1 font-mono" title="Espera repuesto: ${escaparHTML(t.motivo_espera || 'Logística / Repuesto')}">
            <i class="fa-solid fa-hourglass-half text-[9px] text-amber-400"></i> ${formatMinutos(activo)} activo | ${formatMinutos(t.tiempo_espera_minutos)} espera
          </div>
        `;
      }
    }

    const txtDuracion = t.tiempo_arreglo_minutos !== null 
      ? `<div><span class="font-mono font-semibold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">${formatMinutos(t.tiempo_arreglo_minutos)}</span>${desgloseTiempos}</div>`
      : `<span class="text-slate-500">-</span>`;

    return `
      <tr class="hover:bg-slate-700/40 transition">
        <!-- Equipo & Tarea -->
        <td class="py-3 px-4">
          <div class="flex items-center space-x-2">
            <div>
              <div class="flex items-center space-x-2">
                <span class="font-mono text-[11px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">${t.id}</span>
                <span class="font-semibold text-white">${escaparHTML(t.equipo)}</span>
              </div>
              <p class="text-xs text-slate-300 mt-0.5 line-clamp-1">${escaparHTML(t.titulo)}</p>
              <p class="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                <i class="fa-solid fa-location-dot text-[10px] text-slate-500"></i> ${escaparHTML(t.ubicacion || 'Planta')}
              </p>
            </div>
          </div>
        </td>

        <!-- Tipo -->
        <td class="py-3 px-4 whitespace-nowrap">
          ${badgeTipo}
        </td>

        <!-- Técnicos Asignados / Especialidad -->
        <td class="py-3 px-4">
          <div class="space-y-1">
            <div class="flex items-center gap-1 flex-wrap">
              ${(t.roles_asignados || ['mecanico']).map(r => {
                if (r === 'electrico') return '<span class="text-[9px] bg-amber-950 text-amber-300 border border-amber-800/80 px-1.5 py-0.5 rounded font-bold"><i class="fa-solid fa-bolt"></i> Eléctrica</span>';
                if (r === 'maquinista') return '<span class="text-[9px] bg-orange-950 text-orange-300 border border-orange-800/80 px-1.5 py-0.5 rounded font-bold"><i class="fa-solid fa-tractor"></i> Maquinaria</span>';
                return '<span class="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-1.5 py-0.5 rounded font-bold"><i class="fa-solid fa-wrench"></i> Mecánica</span>';
              }).join(' ')}
              ${(t.es_conjunta || (t.roles_asignados && t.roles_asignados.length > 1) || (t.tecnicos_asignados && t.tecnicos_asignados.length > 1)) ? '<span class="text-[9px] bg-purple-900/80 text-purple-200 border border-purple-600 px-1.5 py-0.5 rounded font-bold">👥 Conjunta</span>' : ''}
            </div>
            <div class="text-xs text-slate-200 font-medium truncate max-w-[200px]" title="${escaparHTML(t.mecanico_asignado || 'Sin Asignar')}">
              ${escaparHTML(t.mecanico_asignado || 'Sin Asignar')}
            </div>
          </div>
        </td>

        <!-- Fecha Ocurrencia -->
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="text-xs text-slate-200 font-medium">${txtOcurrio}</div>
        </td>

        <!-- Momento Arreglo -->
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="text-xs text-slate-200 font-medium">${txtArreglo}</div>
        </td>

        <!-- Tiempo de Arreglo / Duración -->
        <td class="py-3 px-4 whitespace-nowrap">
          ${txtDuracion}
        </td>

        <!-- Foto Comprobante -->
        <td class="py-3 px-4 text-center whitespace-nowrap">
          ${fotoTd}
        </td>

        <!-- Estado -->
        <td class="py-3 px-4 whitespace-nowrap">
          ${badgeEstado}
        </td>

        <!-- Acciones -->
        <td class="py-3 px-4 text-right whitespace-nowrap">
          <div class="flex items-center justify-end space-x-1.5">
            <button onclick="abrirModalDetalle('${t.id}')" title="Ver detalle y fotos" class="p-1.5 bg-slate-700/80 hover:bg-slate-600 text-slate-200 rounded-lg transition text-xs">
              <i class="fa-solid fa-eye"></i>
            </button>
            ${(JSON.parse(localStorage.getItem('siman_user') || '{}').rol === 'admin') ? `
            <button onclick="eliminarTarea('${t.id}')" title="Eliminar tarea (Admin)" class="p-1.5 bg-slate-700/80 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg transition text-xs">
              <i class="fa-solid fa-trash-can"></i>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Helpers de Formato
function formatearFechaHora(str) {
  if (!str) return '-';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    const opciones = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    return d.toLocaleDateString('es-CO', opciones);
  } catch (e) {
    return str;
  }
}

function formatMinutos(min) {
  if (min === null || min === undefined || isNaN(min)) return 'N/A';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

function escaparHTML(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Modal Crear Tarea
function abrirModalCrear() {
  fijarOcurrenciaAhora();
  document.getElementById('modal-crear').classList.remove('hidden');
}

function cerrarModalCrear() {
  document.getElementById('modal-crear').classList.add('hidden');
}

function fijarOcurrenciaAhora() {
  const el = document.getElementById('input-fecha-ocurrencia');
  if (!el) return;
  const now = new Date();
  // Formato local YYYY-MM-DDTHH:mm
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - offset)).toISOString().slice(0, 16);
  el.value = localISOTime;
}

async function guardarNuevaTarea(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');

  const roles = Array.from(form.querySelectorAll('input[name="roles_asignados"]:checked')).map(cb => cb.value);
  const tecnicos = Array.from(form.querySelectorAll('input[name="tecnicos_asignados"]:checked')).map(cb => cb.value);

  const payload = {
    tipo: formData.get('tipo'),
    equipo: formData.get('equipo'),
    ubicacion: formData.get('ubicacion'),
    titulo: formData.get('titulo'),
    fecha_ocurrencia: formData.get('fecha_ocurrencia'),
    prioridad: formData.get('prioridad'),
    roles_asignados: roles.length > 0 ? roles : ['mecanico'],
    tecnicos_asignados: tecnicos,
    mecanico_asignado: tecnicos.length > 0 ? tecnicos.join(', ') : 'Sin Asignar',
    descripcion: formData.get('descripcion')
  };

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || 'admin',
        'x-user-username': user.username || 'Holger'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear tarea');

    mostrarToast('Tarea creada exitosamente por Administrador Holger');
    cerrarModalCrear();
    form.reset();
    cargarTareas();
  } catch (err) {
    alert(err.message);
  }
}

// Modal Detalle
function abrirModalDetalle(id) {
  const t = todasLasTareas.find(item => item.id === id);
  if (!t) return;

  tareaSeleccionadaId = id;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const esAdmin = user.rol === 'admin';

  // Guardar estado original de foto
  fotoDetalleOriginal = t.foto_comprobante || null;
  nuevaFotoDetalleBase64 = null;
  const inputFoto = document.getElementById('input-cambiar-foto-detalle');
  if (inputFoto) inputFoto.value = '';
  const avisoFoto = document.getElementById('aviso-nueva-foto-detalle');
  if (avisoFoto) avisoFoto.classList.add('hidden');

  // Título e ID
  document.getElementById('det-id-titulo').innerText = `${t.id} - ${t.equipo}`;
  
  // Badge de tipo
  const badge = document.getElementById('det-tipo-badge');
  badge.innerText = t.tipo.toUpperCase();
  if (t.tipo === 'preventivo') badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  else if (t.tipo === 'correctivo') badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30';
  else badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30';

  // Fechas y Tiempos Editables por el Administrador
  const inOcurrio = document.getElementById('edit-det-fecha-ocurrio');
  const inArreglo = document.getElementById('edit-det-fecha-arreglo');
  const txtOcurrio = document.getElementById('det-fecha-ocurrio-txt');
  const txtArreglo = document.getElementById('det-fecha-arreglo-txt');

  if (inOcurrio) {
    inOcurrio.value = t.fecha_ocurrencia ? t.fecha_ocurrencia.slice(0, 16) : '';
    inOcurrio.disabled = !esAdmin;
  }
  if (inArreglo) {
    inArreglo.value = t.fecha_arreglo ? t.fecha_arreglo.slice(0, 16) : '';
    inArreglo.disabled = !esAdmin;
  }
  if (txtOcurrio) txtOcurrio.innerText = formatearFechaHora(t.fecha_ocurrencia);
  if (txtArreglo) txtArreglo.innerText = t.fecha_arreglo ? formatearFechaHora(t.fecha_arreglo) : 'Pendiente de registrar';

  // Tiempos de espera por repuestos o logística
  const esperaTotal = t.tiempo_espera_minutos || 0;
  const inEsperaH = document.getElementById('edit-det-espera-horas');
  const inEsperaM = document.getElementById('edit-det-espera-minutos');
  const inMotivoEsp = document.getElementById('edit-det-motivo-espera');
  if (inEsperaH) {
    inEsperaH.value = Math.floor(esperaTotal / 60);
    inEsperaH.disabled = !esAdmin;
  }
  if (inEsperaM) {
    inEsperaM.value = esperaTotal % 60;
    inEsperaM.disabled = !esAdmin;
  }
  if (inMotivoEsp) {
    inMotivoEsp.value = t.motivo_espera || '';
    inMotivoEsp.disabled = !esAdmin;
  }

  // Horas por especialidad / rol
  const tpr = t.tiempos_por_rol || {};
  const inHorasMec = document.getElementById('edit-horas-mecanico');
  const inHorasElec = document.getElementById('edit-horas-electrico');
  const inHorasMaq = document.getElementById('edit-horas-maquinista');
  if (inHorasMec) {
    inHorasMec.value = tpr.mecanico ? (tpr.mecanico / 60) : '';
    inHorasMec.disabled = !esAdmin;
  }
  if (inHorasElec) {
    inHorasElec.value = tpr.electrico ? (tpr.electrico / 60) : '';
    inHorasElec.disabled = !esAdmin;
  }
  if (inHorasMaq) {
    inHorasMaq.value = tpr.maquinista ? (tpr.maquinista / 60) : '';
    inHorasMaq.disabled = !esAdmin;
  }

  // Recalcular indicadores de tiempo activo y parada
  calcularTiemposDetalle();

  // Datos generales
  document.getElementById('det-equipo').innerText = t.equipo;
  document.getElementById('det-ubicacion').innerText = t.ubicacion || 'Planta Principal';
  document.getElementById('det-prioridad').innerText = t.prioridad || 'Media';
  document.getElementById('det-descripcion').innerText = t.descripcion || 'Sin descripción';

  // Checkboxes de roles dinámicos (mecanico, electrico, maquinista)
  const roles = (Array.isArray(t.roles_asignados) && t.roles_asignados.length > 0) ? t.roles_asignados : ['mecanico'];
  const cbMec = document.getElementById('edit-det-rol-mecanico');
  const cbElec = document.getElementById('edit-det-rol-electrico');
  const cbMaq = document.getElementById('edit-det-rol-maquinista');
  if (cbMec) { cbMec.checked = roles.includes('mecanico'); cbMec.disabled = !esAdmin; }
  if (cbElec) { cbElec.checked = roles.includes('electrico'); cbElec.disabled = !esAdmin; }
  if (cbMaq) { cbMaq.checked = roles.includes('maquinista'); cbMaq.disabled = !esAdmin; }

  // Checkboxes dinámicos de técnicos participantes
  poblarCheckboxesTecnicosDetalle(t, esAdmin);
  actualizarEstadoConjuntaDetalle();

  // Notas editables
  const inNotas = document.getElementById('edit-det-notas-mecanico');
  if (inNotas) {
    inNotas.value = t.notas_mecanico || '';
    inNotas.disabled = !esAdmin;
  }

  // Badge de quién completó la tarea
  const detCompBadge = document.getElementById('det-completado-por-badge');
  if (detCompBadge) {
    if (t.estado === 'completado') {
      const respNom = t.completado_por_nombre || t.mecanico_asignado || 'Técnico';
      const respUser = t.completado_por_usuario ? `(@${t.completado_por_usuario})` : '';
      const respRol = t.completado_por_rol ? `[${t.completado_por_rol.toUpperCase()}]` : '';
      detCompBadge.innerText = `Finalizado por: ${respNom} ${respUser} ${respRol}`;
      detCompBadge.className = 'text-[10px] text-emerald-300 bg-emerald-950/70 border border-emerald-500/30 px-2.5 py-0.5 rounded font-medium';
    } else {
      detCompBadge.innerText = 'En espera de reporte del técnico';
      detCompBadge.className = 'text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700';
    }
  }

  // Fotografía Comprobante con persistencia base64
  const imgFoto = document.getElementById('det-img-foto');
  const sinFoto = document.getElementById('det-sin-foto');
  const badgeAmpliar = document.getElementById('det-badge-ampliar');
  if (t.foto_comprobante) {
    imgFoto.src = t.foto_comprobante;
    imgFoto.onerror = function() {
      this.classList.add('hidden');
      if (badgeAmpliar) badgeAmpliar.classList.add('hidden');
      if (sinFoto) sinFoto.classList.remove('hidden');
    };
    imgFoto.classList.remove('hidden');
    if (badgeAmpliar) badgeAmpliar.classList.remove('hidden');
    sinFoto.classList.add('hidden');
  } else {
    imgFoto.src = '';
    imgFoto.classList.add('hidden');
    if (badgeAmpliar) badgeAmpliar.classList.add('hidden');
    sinFoto.classList.remove('hidden');
  }

  // Botón eliminar y botón guardar cambios
  const btnElim = document.getElementById('btn-eliminar-tarea');
  const btnGuardar = document.getElementById('btn-guardar-edicion-tarea');
  if (btnElim) {
    if (esAdmin) btnElim.classList.remove('hidden');
    else btnElim.classList.add('hidden');
  }
  if (btnGuardar) {
    if (esAdmin) btnGuardar.classList.remove('hidden');
    else btnGuardar.classList.add('hidden');
  }

  // Reset scroll al inicio para ver la foto de inmediato
  const modalBody = document.getElementById('modal-detalle-body');
  if (modalBody) modalBody.scrollTop = 0;

  document.getElementById('modal-detalle').classList.remove('hidden');
}

// Funciones del Visor de Foto Pantalla Completa
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

function abrirFotoDetalleActual() {
  const imgFoto = document.getElementById('det-img-foto');
  const titulo = document.getElementById('det-id-titulo')?.innerText || 'Fotografía de Mantenimiento';
  if (imgFoto && imgFoto.src && !imgFoto.classList.contains('hidden')) {
    abrirVisorFoto(imgFoto.src, titulo);
  }
}

function poblarCheckboxesTecnicosDetalle(tarea, esAdmin) {
  const cont = document.getElementById('det-tecnicos-checkboxes-container');
  if (!cont) return;

  const tecsAsignados = (tarea.tecnicos_asignados && tarea.tecnicos_asignados.length > 0)
    ? tarea.tecnicos_asignados
    : (tarea.mecanico_asignado && tarea.mecanico_asignado !== 'Sin Asignar' ? tarea.mecanico_asignado.split(',').map(s => s.trim()) : []);

  if (listaTecnicosDisponibles.length === 0) {
    cont.innerHTML = '<p class="text-[11px] text-slate-400 p-2 col-span-2">No hay lista de técnicos cargada.</p>';
    return;
  }

  cont.innerHTML = listaTecnicosDisponibles.map(t => {
    let iconRol = 'fa-wrench text-emerald-400';
    let badgeRol = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    let rolTxt = 'Mecánico';
    if (t.rol === 'electrico') {
      iconRol = 'fa-bolt text-amber-400';
      badgeRol = 'bg-amber-950 text-amber-300 border-amber-800';
      rolTxt = 'Eléctrico';
    } else if (t.rol === 'maquinista') {
      iconRol = 'fa-tractor text-orange-400';
      badgeRol = 'bg-orange-950 text-orange-300 border-orange-800';
      rolTxt = 'Maquinista';
    }

    const checked = tecsAsignados.some(nombre => nombre.toLowerCase() === t.nombre.toLowerCase());
    const disabledAttr = esAdmin ? '' : 'disabled';

    return `
      <label class="cursor-pointer border border-slate-700/80 rounded-lg p-2 flex items-center justify-between text-xs hover:bg-slate-800 transition has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-950/30">
        <div class="flex items-center gap-2 truncate">
          <input type="checkbox" name="det_tecnicos_asignados" value="${escaparHTML(t.nombre)}" ${checked ? 'checked' : ''} ${disabledAttr} onchange="actualizarEstadoConjuntaDetalle()" class="rounded border-slate-700 text-indigo-600 focus:ring-0">
          <span class="font-medium text-white truncate">${escaparHTML(t.nombre)}</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded border ${badgeRol} flex items-center gap-1 flex-shrink-0">
          <i class="fa-solid ${iconRol}"></i> ${rolTxt}
        </span>
      </label>
    `;
  }).join('');
}

function cerrarModalDetalle() {
  document.getElementById('modal-detalle').classList.add('hidden');
  tareaSeleccionadaId = null;
  nuevaFotoDetalleBase64 = null;
  fotoDetalleOriginal = null;
}

// Calcular tiempos detallados dentro del modal
function calcularTiemposDetalle() {
  const fOcurrio = document.getElementById('edit-det-fecha-ocurrio')?.value;
  const fArreglo = document.getElementById('edit-det-fecha-arreglo')?.value;
  const hEspera = parseInt(document.getElementById('edit-det-espera-horas')?.value) || 0;
  const mEspera = parseInt(document.getElementById('edit-det-espera-minutos')?.value) || 0;
  const totalEsperaMin = Math.max(0, (hEspera * 60) + mEspera);

  let totalParadaMin = null;
  if (fOcurrio && fArreglo) {
    try {
      const diffMs = new Date(fArreglo).getTime() - new Date(fOcurrio).getTime();
      if (!isNaN(diffMs) && diffMs >= 0) {
        totalParadaMin = Math.round(diffMs / 60000);
      }
    } catch(e) {}
  }

  const elTotal = document.getElementById('det-tiempo-total');
  const elResumenParada = document.getElementById('det-resumen-parada-total');
  const elResumenEspera = document.getElementById('det-resumen-espera');
  const elActivo = document.getElementById('det-tiempo-activo-calc');

  if (elResumenEspera) elResumenEspera.innerText = formatMinutos(totalEsperaMin);

  if (totalParadaMin !== null) {
    if (elTotal) elTotal.innerText = formatMinutos(totalParadaMin);
    if (elResumenParada) elResumenParada.innerText = formatMinutos(totalParadaMin);

    const activoMin = Math.max(0, totalParadaMin - totalEsperaMin);
    if (elActivo) elActivo.innerText = formatMinutos(activoMin);
  } else {
    if (elTotal) elTotal.innerText = 'En ejecución';
    if (elResumenParada) elResumenParada.innerText = 'En ejecución';
    if (elActivo) elActivo.innerText = 'Calculando al finalizar';
  }
}

// Actualizar indicador de tarea en conjunto en el modal
function actualizarEstadoConjuntaDetalle() {
  const roles = [];
  if (document.getElementById('edit-det-rol-mecanico')?.checked) roles.push('mecanico');
  if (document.getElementById('edit-det-rol-electrico')?.checked) roles.push('electrico');
  if (document.getElementById('edit-det-rol-maquinista')?.checked) roles.push('maquinista');

  const tecs = Array.from(document.querySelectorAll('#det-tecnicos-checkboxes-container input[type="checkbox"]:checked'));
  const badge = document.getElementById('det-badge-conjunta');
  if (badge) {
    if (roles.length > 1 || tecs.length > 1) {
      badge.classList.remove('hidden');
      badge.innerText = `👥 Tarea en Conjunto (${roles.length} roles, ${tecs.length} técnicos)`;
    } else {
      badge.classList.add('hidden');
    }
  }
}

// Procesar y comprimir nueva foto en el modal de detalle
function procesarNuevaFotoDetalle(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 1024;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      nuevaFotoDetalleBase64 = canvas.toDataURL('image/jpeg', 0.75);

      const imgElement = document.getElementById('det-img-foto');
      const sinFoto = document.getElementById('det-sin-foto');
      const aviso = document.getElementById('aviso-nueva-foto-detalle');

      if (imgElement) {
        imgElement.src = nuevaFotoDetalleBase64;
        imgElement.classList.remove('hidden');
      }
      if (sinFoto) sinFoto.classList.add('hidden');
      if (aviso) aviso.classList.remove('hidden');
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function cancelarNuevaFotoDetalle() {
  nuevaFotoDetalleBase64 = null;
  const input = document.getElementById('input-cambiar-foto-detalle');
  if (input) input.value = '';

  const aviso = document.getElementById('aviso-nueva-foto-detalle');
  if (aviso) aviso.classList.add('hidden');

  const imgElement = document.getElementById('det-img-foto');
  const sinFoto = document.getElementById('det-sin-foto');

  if (fotoDetalleOriginal) {
    if (imgElement) {
      imgElement.src = fotoDetalleOriginal;
      imgElement.classList.remove('hidden');
    }
    if (sinFoto) sinFoto.classList.add('hidden');
  } else {
    if (imgElement) {
      imgElement.src = '';
      imgElement.classList.add('hidden');
    }
    if (sinFoto) sinFoto.classList.remove('hidden');
  }
}

// Guardar Modificación Completa de Tarea (Fechas, Roles, Participantes, Tiempos y Foto)
async function guardarEdicionDetalleAdmin() {
  if (!tareaSeleccionadaId) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (user.rol !== 'admin') {
    alert('Solo el Administrador Holger tiene autorización para modificar tareas.');
    return;
  }

  const fOcurrio = document.getElementById('edit-det-fecha-ocurrio')?.value;
  const fArreglo = document.getElementById('edit-det-fecha-arreglo')?.value;
  const notas = document.getElementById('edit-det-notas-mecanico')?.value;
  const btn = document.getElementById('btn-guardar-edicion-tarea');

  if (!fOcurrio) {
    alert('La fecha de ocurrencia no puede estar vacía.');
    return;
  }

  // Roles seleccionados
  const roles = [];
  if (document.getElementById('edit-det-rol-mecanico')?.checked) roles.push('mecanico');
  if (document.getElementById('edit-det-rol-electrico')?.checked) roles.push('electrico');
  if (document.getElementById('edit-det-rol-maquinista')?.checked) roles.push('maquinista');
  const rolesFinales = roles.length > 0 ? roles : ['mecanico'];

  // Técnicos participantes
  const tecsCheckboxes = Array.from(document.querySelectorAll('#det-tecnicos-checkboxes-container input[type="checkbox"]:checked'));
  const tecnicosFinales = tecsCheckboxes.map(cb => cb.value.trim()).filter(Boolean);

  // Tiempos de espera
  const hEspera = parseInt(document.getElementById('edit-det-espera-horas')?.value) || 0;
  const mEspera = parseInt(document.getElementById('edit-det-espera-minutos')?.value) || 0;
  const tiempoEsperaMin = Math.max(0, (hEspera * 60) + mEspera);
  const motivoEspera = (document.getElementById('edit-det-motivo-espera')?.value || '').trim();

  // Horas por rol
  const hMec = parseFloat(document.getElementById('edit-horas-mecanico')?.value) || 0;
  const hElec = parseFloat(document.getElementById('edit-horas-electrico')?.value) || 0;
  const hMaq = parseFloat(document.getElementById('edit-horas-maquinista')?.value) || 0;
  const tiemposPorRol = {
    mecanico: Math.round(hMec * 60),
    electrico: Math.round(hElec * 60),
    maquinista: Math.round(hMaq * 60)
  };

  const payload = {
    fecha_ocurrencia: fOcurrio,
    fecha_arreglo: fArreglo || null,
    notas_mecanico: notas,
    roles_asignados: rolesFinales,
    tecnicos_asignados: tecnicosFinales,
    tiempo_espera_minutos: tiempoEsperaMin,
    motivo_espera: motivoEspera,
    tiempos_por_rol: tiemposPorRol
  };

  if (nuevaFotoDetalleBase64) {
    payload.foto_base64 = nuevaFotoDetalleBase64;
  }

  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
  }

  try {
    const res = await fetch(`/api/tasks/${tareaSeleccionadaId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar tarea');

    mostrarToast('✅ Tarea, roles, personal, tiempos y fotografía actualizados');
    cerrarModalDetalle();
    cargarTareas(false);
  } catch(err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// Alias por compatibilidad
function guardarEdicionFechasAdmin() {
  return guardarEdicionDetalleAdmin();
}

async function eliminarTarea(id) {
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (user.rol !== 'admin') {
    alert('Acceso Restringido: Solo el Administrador Holger tiene permiso para eliminar tareas.');
    return;
  }

  if (!confirm(`¿Está seguro de eliminar la tarea ${id}?`)) return;
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': user.rol,
        'x-user-username': user.username
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar');
    mostrarToast('Tarea eliminada correctamente');
    cargarTareas();
  } catch (err) {
    alert(err.message);
  }
}

function eliminarTareaActual() {
  if (tareaSeleccionadaId) {
    const tid = tareaSeleccionadaId;
    cerrarModalDetalle();
    eliminarTarea(tid);
  }
}

// ================= GESTIÓN DE USUARIOS (ADMIN HOLGER) =================

async function abrirModalUsuarios() {
  document.getElementById('modal-usuarios').classList.remove('hidden');
  await cargarListaUsuariosAdmin();
}

function cerrarModalUsuarios() {
  document.getElementById('modal-usuarios').classList.add('hidden');
}

async function cargarListaUsuariosAdmin() {
  const tbody = document.getElementById('tabla-usuarios-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Cargando usuarios...</td></tr>';

  try {
    const res = await fetch('/api/users');
    const users = await res.json();

    tbody.innerHTML = users.map(u => {
      let badgeRol = '';
      if (u.rol === 'admin') badgeRol = '<span class="bg-blue-900/60 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-crown mr-1"></i>ADMIN</span>';
      else if (u.rol === 'electrico') badgeRol = '<span class="bg-amber-950 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-bolt mr-1"></i>ELÉCTRICO</span>';
      else if (u.rol === 'maquinista') badgeRol = '<span class="bg-orange-950 text-orange-300 border border-orange-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-tractor mr-1"></i>MAQUINISTA</span>';
      else if (u.rol === 'visualizador') badgeRol = '<span class="bg-purple-900/60 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-eye mr-1"></i>SOLO VER</span>';
      else badgeRol = '<span class="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-wrench mr-1"></i>MECÁNICO</span>';

      const esHolger = u.username.toLowerCase() === 'holger';
      const colRol = esHolger
        ? badgeRol
        : `
          <div class="flex items-center gap-1.5">
            ${badgeRol}
            <select onchange="cambiarRolUsuarioAdmin('${u.id}', this.value)" title="Cambiar rol" class="bg-slate-950 border border-slate-700 text-slate-300 text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="mecanico" ${u.rol === 'mecanico' ? 'selected' : ''}>🔧 Mecánico</option>
              <option value="electrico" ${u.rol === 'electrico' ? 'selected' : ''}>⚡ Eléctrico</option>
              <option value="maquinista" ${u.rol === 'maquinista' ? 'selected' : ''}>🚜 Maquinista</option>
              <option value="visualizador" ${u.rol === 'visualizador' ? 'selected' : ''}>👁️ Solo Ver</option>
            </select>
          </div>
        `;

      const botonEliminar = esHolger
        ? '<span class="text-[10px] text-slate-500 font-semibold italic">Principal</span>'
        : `<button onclick="eliminarUsuarioAdmin('${u.id}', '${escaparHTML(u.nombre)}', '${u.username}')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-950/40 border border-rose-800/40 rounded hover:bg-rose-900 transition">Eliminar</button>`;

      return `
        <tr>
          <td class="py-2.5 px-3 font-mono font-bold text-white">@${escaparHTML(u.username)}</td>
          <td class="py-2.5 px-3 font-medium">${escaparHTML(u.nombre)}</td>
          <td class="py-2.5 px-3">${colRol}</td>
          <td class="py-2.5 px-3 text-right">${botonEliminar}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-rose-400">Error cargando usuarios</td></tr>';
  }
}

async function cambiarRolUsuarioAdmin(id, nuevoRol) {
  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  try {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userActual.rol || 'admin',
        'x-user-username': userActual.username || 'Holger'
      },
      body: JSON.stringify({ rol: nuevoRol })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error cambiando rol');
    mostrarToast(data.mensaje || 'Rol actualizado exitosamente');
    await cargarListaUsuariosAdmin();
    cargarMecanicosSelect();
  } catch(err) {
    alert(err.message);
  }
}

async function guardarNuevoUsuarioAdmin(e) {
  e.preventDefault();
  const nombre = document.getElementById('usr-adm-nombre').value.trim();
  const username = document.getElementById('usr-adm-username').value.trim();
  const password = document.getElementById('usr-adm-password').value.trim();
  const rol = document.getElementById('usr-adm-rol').value;

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userActual.rol || 'admin',
        'x-user-username': userActual.username || 'Holger'
      },
      body: JSON.stringify({ nombre, username, password, rol })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error creando usuario');

    mostrarToast(`¡Usuario @${username} creado exitosamente!`);
    document.getElementById('form-crear-usuario-admin').reset();
    await cargarListaUsuariosAdmin();
    cargarMecanicosSelect();
  } catch (err) {
    alert(err.message);
  }
}

async function eliminarUsuarioAdmin(id, nombre, username) {
  if (!confirm(`¿Está seguro de eliminar al usuario ${nombre} (@${username})?`)) return;

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');

  try {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': userActual.rol || 'admin',
        'x-user-username': userActual.username || 'Holger'
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error eliminando usuario');

    mostrarToast(`Usuario ${nombre} eliminado exitosamente`);
    await cargarListaUsuariosAdmin();
    cargarMecanicosSelect();
  } catch (err) {
    alert(err.message);
  }
}

// Modal QR
function abrirModalQR() {
  document.getElementById('modal-qr').classList.remove('hidden');
}

function cerrarModalQR() {
  document.getElementById('modal-qr').classList.add('hidden');
}

function copiarUrlMovil() {
  const url = document.getElementById('qr-url-text').innerText;
  navigator.clipboard.writeText(url).then(() => {
    mostrarToast('¡Enlace móvil copiado al portapapeles!');
  });
}

// Toast
function mostrarToast(mensaje) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toast-msg');
  if (!toast || !msg) return;
  msg.innerText = mensaje;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}

// Modal Copia de Seguridad y Respaldo
function abrirModalBackup() {
  const modal = document.getElementById('modal-backup');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModalBackup() {
  const modal = document.getElementById('modal-backup');
  if (modal) modal.classList.add('hidden');
}

async function descargarRespaldoJSON() {
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  try {
    const res = await fetch('/api/backup', {
      headers: { 'x-user-role': user.rol }
    });
    if (!res.ok) throw new Error('Error al descargar copia de seguridad');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fechaStr = new Date().toISOString().slice(0, 10);
    a.download = `SIMAN_Respaldo_${fechaStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    mostrarToast('✅ Copia de seguridad descargada exitosamente');
  } catch(err) {
    alert(err.message);
  }
}

async function restaurarRespaldoJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const backupData = JSON.parse(evt.target.result);
      if (!backupData.users || !backupData.tasks) {
        throw new Error('El archivo no parece ser un respaldo válido de SIMAN.');
      }

      const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user.rol
        },
        body: JSON.stringify(backupData)
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Error al restaurar respaldo');

      mostrarToast(resData.mensaje || '✅ Respaldo restaurado con éxito');
      cerrarModalBackup();
      cargarTareas(true);
    } catch(err) {
      alert('Error al procesar el archivo de respaldo: ' + err.message);
    }
  };
  reader.readAsText(file);
}
