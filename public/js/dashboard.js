// Variables globales del Dashboard
let todasLasTareas = [];
let filtroEstadoActual = 'todos';
let periodoActual = 'todo';
let tareaSeleccionadaId = null;
let chartTipos = null;
let chartTiempos = null;

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

    // Solo el administrador Holger puede ver el botón de crear tareas y el de gestionar usuarios
    const btnCrear = document.getElementById('btn-crear-tarea-dashboard');
    const btnUsers = document.getElementById('btn-admin-usuarios');
    if (user.rol === 'admin') {
      if (btnCrear) btnCrear.classList.remove('hidden');
      if (btnUsers) btnUsers.classList.remove('hidden');
    } else {
      if (btnCrear) btnCrear.classList.add('hidden');
      if (btnUsers) btnUsers.classList.add('hidden');
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
  window.location.replace('/login?logout=true');
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

// Cargar mecánicos en el select
async function cargarMecanicosSelect() {
  try {
    const res = await fetch('/api/mecanicos');
    const mecanicos = await res.json();
    const sel = document.getElementById('select-mecanicos-crear');
    if (!sel) return;

    sel.innerHTML = '<option value="Sin Asignar">Sin Asignar (Disponible)</option>';
    mecanicos.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.nombre;
      opt.textContent = `${m.nombre} (${m.especialidad})`;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error('Error al cargar mecánicos:', err);
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
        <div class="relative group cursor-pointer inline-block" onclick="abrirModalDetalle('${t.id}')">
          <img src="${t.foto_comprobante}" alt="Comprobante" class="w-12 h-10 object-cover rounded-lg border border-slate-600 group-hover:border-emerald-400 transition shadow">
          <span class="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <i class="fa-solid fa-magnifying-glass text-white text-xs"></i>
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
    const txtDuracion = t.tiempo_arreglo_minutos !== null 
      ? `<span class="font-mono font-semibold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">${formatMinutos(t.tiempo_arreglo_minutos)}</span>`
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

        <!-- Mecánico Asignado -->
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="flex items-center space-x-2">
            <div class="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
              ${(t.mecanico_asignado || 'M').charAt(0).toUpperCase()}
            </div>
            <span class="text-xs text-slate-200">${escaparHTML(t.mecanico_asignado || 'Sin Asignar')}</span>
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

  const payload = {
    tipo: formData.get('tipo'),
    equipo: formData.get('equipo'),
    ubicacion: formData.get('ubicacion'),
    titulo: formData.get('titulo'),
    fecha_ocurrencia: formData.get('fecha_ocurrencia'),
    prioridad: formData.get('prioridad'),
    mecanico_asignado: formData.get('mecanico_asignado'),
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
  const txtDuracion = document.getElementById('det-tiempo-total');

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
  if (txtDuracion) txtDuracion.innerText = t.tiempo_arreglo_minutos !== null ? formatMinutos(t.tiempo_arreglo_minutos) : 'En ejecución';

  // Datos
  document.getElementById('det-equipo').innerText = t.equipo;
  document.getElementById('det-ubicacion').innerText = t.ubicacion || 'Planta Principal';
  document.getElementById('det-mecanico').innerText = t.mecanico_asignado || 'Sin Asignar';
  document.getElementById('det-prioridad').innerText = t.prioridad || 'Media';
  document.getElementById('det-descripcion').innerText = t.descripcion || 'Sin descripción';
  
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
      const respNom = t.completado_por_nombre || t.mecanico_asignado || 'Mecánico';
      const respUser = t.completado_por_usuario ? `(@${t.completado_por_usuario})` : '';
      detCompBadge.innerText = `Finalizado por: ${respNom} ${respUser}`;
      detCompBadge.className = 'text-[10px] text-emerald-300 bg-emerald-950/70 border border-emerald-500/30 px-2.5 py-0.5 rounded font-medium';
    } else {
      detCompBadge.innerText = 'En espera de reporte del mecánico';
      detCompBadge.className = 'text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700';
    }
  }

  // Fotografía
  const imgFoto = document.getElementById('det-img-foto');
  const sinFoto = document.getElementById('det-sin-foto');
  if (t.foto_comprobante) {
    imgFoto.src = t.foto_comprobante;
    imgFoto.classList.remove('hidden');
    sinFoto.classList.add('hidden');
  } else {
    imgFoto.src = '';
    imgFoto.classList.add('hidden');
    sinFoto.classList.remove('hidden');
  }

  // Botón eliminar y botón guardar fechas
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

  document.getElementById('modal-detalle').classList.remove('hidden');
}

function cerrarModalDetalle() {
  document.getElementById('modal-detalle').classList.add('hidden');
  tareaSeleccionadaId = null;
}

// Guardar Modificación de Fechas y Horas (Exclusivo Administrador Holger)
async function guardarEdicionFechasAdmin() {
  if (!tareaSeleccionadaId) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (user.rol !== 'admin') {
    alert('Solo el Administrador Holger tiene autorización para modificar las fechas.');
    return;
  }

  const fOcurrio = document.getElementById('edit-det-fecha-ocurrio').value;
  const fArreglo = document.getElementById('edit-det-fecha-arreglo').value;
  const notas = document.getElementById('edit-det-notas-mecanico').value;
  const btn = document.getElementById('btn-guardar-edicion-tarea');

  if (!fOcurrio) {
    alert('La fecha de ocurrencia no puede estar vacía.');
    return;
  }

  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;

  try {
    const res = await fetch(`/api/tasks/${tareaSeleccionadaId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol
      },
      body: JSON.stringify({
        fecha_ocurrencia: fOcurrio,
        fecha_arreglo: fArreglo || null,
        notas_mecanico: notas
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar fechas');

    mostrarToast('✅ Fechas y observaciones actualizadas correctamente');
    cerrarModalDetalle();
    cargarTareas(false);
  } catch(err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
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
      if (u.rol === 'admin') badgeRol = '<span class="bg-blue-900/60 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded text-[10px] font-bold">ADMINISTRADOR</span>';
      else if (u.rol === 'visualizador') badgeRol = '<span class="bg-purple-900/60 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[10px] font-bold">SOLO VER</span>';
      else badgeRol = '<span class="bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-bold">MECÁNICO</span>';

      const esHolger = u.username.toLowerCase() === 'holger';
      const botonEliminar = esHolger
        ? '<span class="text-[10px] text-slate-500 font-semibold italic">Principal</span>'
        : `<button onclick="eliminarUsuarioAdmin('${u.id}', '${escaparHTML(u.nombre)}', '${u.username}')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-950/40 border border-rose-800/40 rounded hover:bg-rose-900 transition">Eliminar</button>`;

      return `
        <tr>
          <td class="py-2.5 px-3 font-mono font-bold text-white">@${escaparHTML(u.username)}</td>
          <td class="py-2.5 px-3 font-medium">${escaparHTML(u.nombre)}</td>
          <td class="py-2.5 px-3">${badgeRol}</td>
          <td class="py-2.5 px-3 text-right">${botonEliminar}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-rose-400">Error cargando usuarios</td></tr>';
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
