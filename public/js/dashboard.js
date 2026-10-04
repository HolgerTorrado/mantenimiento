// Variables globales del Dashboard
let todasLasTareas = [];
let filtroEstadoActual = 'todos';
let periodoActual = 'todo';
let tareaSeleccionadaId = null;
let chartTipos = null;
let chartTiempos = null;
let chartRolesTiempos = null;
let nuevaFotoDetalleBase64 = null;
let fotoDetalleOriginal = null;
let eliminarFotoDetallePendiente = false;
let eliminarFotoInicialDetallePendiente = false;

// Matriz dinámica de permisos RBAC
let simanPermisosCache = null;

async function cargarPermisosSistema() {
  try {
    const res = await fetch('/api/permisos');
    if (res.ok) {
      simanPermisosCache = await res.json();
      window.SIMAN_PERMISOS = simanPermisosCache;
      aplicarPermisosEnUI();
    }
  } catch (err) {
    console.warn('No se pudo sincronizar matriz de permisos:', err);
  }
}

function usuarioTienePermiso(permiso) {
  const userJson = localStorage.getItem('siman_user');
  if (!userJson) return false;
  try {
    const user = JSON.parse(userJson);
    const rol = (user.rol || '').toLowerCase().trim();
    if (rol === 'admin') return true; // Administrador Holger siempre tiene acceso total
    if (simanPermisosCache && simanPermisosCache[rol] && simanPermisosCache[rol][permiso] !== undefined) {
      return Boolean(simanPermisosCache[rol][permiso]);
    }
    // Fallbacks inteligentes antes de recibir la red
    if (permiso === 'crear_tareas') return ['admin', 'supervisor', 'sst', 'director'].includes(rol);
    if (permiso === 'cerrar_tareas') return ['admin', 'mecanico', 'electrico', 'maquinista', 'supervisor', 'sst'].includes(rol);
    if (permiso === 'cambiar_foto') return true;
    if (permiso === 'asignable_tareas') return ['mecanico', 'electrico', 'maquinista'].includes(rol);
    return false;
  } catch (e) {
    return false;
  }
}

function aplicarPermisosEnUI() {
  const userJson = localStorage.getItem('siman_user');
  if (!userJson) return;
  try {
    const user = JSON.parse(userJson);
    const rol = (user.rol || '').toLowerCase().trim();
    const esAdmin = rol === 'admin';

    // 0. Verificar si el usuario tiene permiso para estar en el Dashboard / Modo PC
    const puedePC = esAdmin || usuarioTienePermiso('acceso_pc') || usuarioTienePermiso('ver_dashboard');
    if (!puedePC) {
      alert('Tu rol no tiene acceso al Dashboard de PC. Redirigiendo a tu vista móvil...');
      window.location.replace('/mecanico');
      return;
    }

    // 1. Botón Nueva Tarea en el Dashboard
    const btnCrear = document.getElementById('btn-crear-tarea-dashboard');
    if (btnCrear) {
      if (usuarioTienePermiso('crear_tareas')) {
        btnCrear.classList.remove('hidden');
      } else {
        btnCrear.classList.add('hidden');
      }
    }

    // 2. Botón Gestión de Usuarios / Colaboradores / Permisos
    const btnUsers = document.getElementById('btn-admin-usuarios');
    if (btnUsers) {
      const puedeGestionarUsuarios = esAdmin || usuarioTienePermiso('ver_contrasenas') || usuarioTienePermiso('cambiar_contrasenas') || ['supervisor', 'sst', 'director'].includes(rol);
      if (puedeGestionarUsuarios) {
        btnUsers.classList.remove('hidden');
      } else {
        btnUsers.classList.add('hidden');
      }
    }

    // 3. Pestaña de Matriz de Permisos en el modal (Solo Administrador)
    const tabBtnPermisos = document.getElementById('tab-btn-permisos');
    if (tabBtnPermisos) {
      if (esAdmin) {
        tabBtnPermisos.classList.remove('hidden');
      } else {
        tabBtnPermisos.classList.add('hidden');
      }
    }

    // 4. Botón Backup (Exclusivo Administrador)
    const btnBackup = document.getElementById('btn-admin-backup');
    if (btnBackup) {
      if (esAdmin) btnBackup.classList.remove('hidden');
      else btnBackup.classList.add('hidden');
    }

    // 5. Botón Volver a Modo Móvil
    const btnIrMovil = document.getElementById('btn-ir-modo-movil');
    if (btnIrMovil) {
      const puedeMovil = esAdmin || usuarioTienePermiso('acceso_movil');
      if (puedeMovil) {
        btnIrMovil.classList.remove('hidden');
      } else {
        btnIrMovil.classList.add('hidden');
      }
    }
  } catch (e) {}
}

// Configuración completa de tipos de actividades de planta y mantenimiento
const CONFIG_TIPOS = {
  preventivo: {
    label: 'Preventivo',
    icon: 'fa-calendar-check',
    color: '#10b981',
    bgBadge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    bgModal: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
  },
  correctivo: {
    label: 'Correctivo',
    icon: 'fa-triangle-exclamation',
    color: '#ef4444',
    bgBadge: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
    bgModal: 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
  },
  predictivo: {
    label: 'Predictivo',
    icon: 'fa-wave-square',
    color: '#a855f7',
    bgBadge: 'bg-purple-500/10 text-purple-400 border border-purple-500/30',
    bgModal: 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
  },
  mejora: {
    label: 'Mejora Continua',
    icon: 'fa-arrow-trend-up',
    color: '#0284c7',
    bgBadge: 'bg-sky-500/10 text-sky-400 border border-sky-500/30',
    bgModal: 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
  },
  locativo: {
    label: 'Pintura & Locativo',
    icon: 'fa-paint-roller',
    color: '#f59e0b',
    bgBadge: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    bgModal: 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
  },
  '5s': {
    label: 'Orden, Aseo & 5S',
    icon: 'fa-broom',
    color: '#06b6d4',
    bgBadge: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
    bgModal: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
  },
  instalacion: {
    label: 'Montaje & Instalación',
    icon: 'fa-screwdriver-wrench',
    color: '#6366f1',
    bgBadge: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30',
    bgModal: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
  },
  lubricacion: {
    label: 'Lubricación & Engrase',
    icon: 'fa-oil-can',
    color: '#f97316',
    bgBadge: 'bg-orange-500/10 text-orange-400 border border-orange-500/30',
    bgModal: 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
  },
  otro: {
    label: 'General / Apoyo',
    icon: 'fa-clipboard-list',
    color: '#64748b',
    bgBadge: 'bg-slate-500/10 text-slate-400 border border-slate-500/30',
    bgModal: 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
  }
};

function getBadgeTipo(tipo) {
  const tKey = (tipo || 'otro').toLowerCase().trim();
  const cfg = CONFIG_TIPOS[tKey] || CONFIG_TIPOS['otro'];
  return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bgBadge}">
    <i class="fa-solid ${cfg.icon} text-[10px]"></i> ${cfg.label}
  </span>`;
}

function cambiarTipoDetalleModal(nuevoTipo) {
  const badge = document.getElementById('det-tipo-badge');
  if (!badge) return;
  const tKey = (nuevoTipo || 'otro').toLowerCase().trim();
  const cfg = CONFIG_TIPOS[tKey] || CONFIG_TIPOS['otro'];
  badge.innerText = (cfg.label || nuevoTipo).toUpperCase();
  badge.className = `px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${cfg.bgModal}`;
}

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  const user = verificarSesionDashboard();
  if (!user) return; // Detener ejecución si no hay sesión activa
  iniciarReloj();
  await cargarPermisosSistema();
  cargarMecanicosSelect();
  cargarTareas();
  fijarOcurrenciaAhora();

  // Auto-refresco inteligente cada 30 segundos (solo si la pestaña está activa)
  setInterval(() => {
    if (document.hidden) return;
    cargarTareas(false);
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      cargarTareas(false);
    }
  });
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

    aplicarPermisosEnUI();
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
  localStorage.removeItem('siman_vista_preferida');
  sessionStorage.removeItem('siman_forzar_pc');
  localStorage.removeItem('siman_forzar_pc');
  window.location.replace('/login?logout=true');
}

function irModoMovilDesdePC() {
  localStorage.setItem('siman_vista_preferida', 'movil');
  sessionStorage.removeItem('siman_forzar_pc');
  localStorage.removeItem('siman_forzar_pc');
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

function getInfoRolColaborador(t) {
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
  } else if (t.rol === 'auxiliar') {
    iconRol = 'fa-screwdriver-wrench text-teal-400';
    badgeRol = 'bg-teal-950 text-teal-300 border-teal-800';
    rolTxt = 'Aux. Mecánico';
  } else if (t.rol === 'operario') {
    iconRol = 'fa-helmet-safety text-cyan-400';
    badgeRol = 'bg-cyan-950 text-cyan-300 border-cyan-800';
    rolTxt = 'Operario';
  } else if (t.rol === 'supernumerario') {
    iconRol = 'fa-user-clock text-sky-400';
    badgeRol = 'bg-sky-950 text-sky-300 border-sky-800';
    rolTxt = 'Supernumerario';
  }
  const tagApoyo = (t.es_apoyo || t.sin_cuenta) ? '<span class="text-[9px] text-teal-300/80 font-normal ml-0.5">(Apoyo)</span>' : '';
  return { iconRol, badgeRol, rolTxt, tagApoyo };
}

function poblarCheckboxesTecnicos() {
  const cont = document.getElementById('contenedor-checkboxes-tecnicos');
  if (!cont) return;

  if (listaTecnicosDisponibles.length === 0) {
    cont.innerHTML = '<p class="text-[11px] text-slate-500 p-2 col-span-2">No hay colaboradores registrados. Registra técnicos o personal de apoyo en el panel.</p>';
    return;
  }

  cont.innerHTML = listaTecnicosDisponibles.map(t => {
    const info = getInfoRolColaborador(t);

    return `
      <label class="cursor-pointer border border-slate-700/80 rounded-lg p-2 flex items-center justify-between text-xs hover:bg-slate-800/80 transition has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-950/30">
        <div class="flex items-center gap-2 truncate">
          <input type="checkbox" name="tecnicos_asignados" value="${escaparHTML(t.nombre)}" onchange="actualizarEstadoTrabajoConjunto()" class="rounded border-slate-700 text-indigo-600 focus:ring-0">
          <span class="font-medium text-white truncate">${escaparHTML(t.nombre)}</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded border ${info.badgeRol} flex items-center gap-1 flex-shrink-0">
          <i class="fa-solid ${info.iconRol}"></i> ${info.rolTxt} ${info.tagApoyo}
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

  // Leyenda dinámica de todas las categorías activas
  const contLeyenda = document.getElementById('stat-tipos-leyenda');
  if (contLeyenda && pt) {
    const tiposActivos = Object.keys(CONFIG_TIPOS).filter(k => (pt[k] || 0) > 0 || ['preventivo', 'correctivo', 'predictivo'].includes(k));
    contLeyenda.className = tiposActivos.length > 3 
      ? 'grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-700/60 text-center max-h-48 overflow-y-auto p-1'
      : 'grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-700/60 text-center';

    contLeyenda.innerHTML = tiposActivos.map(k => {
      const cfg = CONFIG_TIPOS[k] || CONFIG_TIPOS['otro'];
      const cnt = pt[k] || 0;
      return `
        <div class="p-2 rounded-lg border text-center transition" style="background-color: ${cfg.color}15; border-color: ${cfg.color}40;">
          <span class="text-[10px] font-semibold block uppercase truncate" style="color: ${cfg.color}">
            <i class="fa-solid ${cfg.icon} mr-1"></i>${cfg.label}
          </span>
          <span class="text-base font-bold text-white">${cnt}</span>
        </div>
      `;
    }).join('');
  }

  // Tiempos por tipo
  const mPrev = document.getElementById('mttr-preventivo-txt');
  const mCorr = document.getElementById('mttr-correctivo-txt');
  const mPred = document.getElementById('mttr-predictivo-txt');
  if (mPrev) mPrev.innerText = mt.preventivo?.formato || '0 min';
  if (mCorr) mCorr.innerText = mt.correctivo?.formato || '0 min';
  if (mPred) mPred.innerText = mt.predictivo?.formato || '0 min';

  // Nuevos KPIs: Horas por Especialidad y Tiempos Muertos
  const elTrabajoActivo = document.getElementById('kpi-trabajo-activo');
  const elHorasMec = document.getElementById('kpi-horas-mecanica');
  const elHorasElec = document.getElementById('kpi-horas-electrica');
  const elHorasMaq = document.getElementById('kpi-horas-maquinaria');
  const elTiempoRep = document.getElementById('kpi-tiempo-repuestos');
  const elTiempoExt = document.getElementById('kpi-tiempo-fuera-planta');
  const elTotalAvances = document.getElementById('stat-total-avances-txt');

  if (elTrabajoActivo) elTrabajoActivo.innerText = m.tiempo_trabajo_activo_total_formato || '0 min';
  if (elHorasMec) elHorasMec.innerText = m.horas_mecanica_formato || '0 min';
  if (elHorasElec) elHorasElec.innerText = m.horas_electrica_formato || '0 min';
  if (elHorasMaq) elHorasMaq.innerText = m.horas_maquinaria_formato || '0 min';
  if (elTiempoRep) elTiempoRep.innerText = m.tiempo_espera_repuestos_formato || '0 min';
  if (elTiempoExt) elTiempoExt.innerText = m.tiempo_fuera_planta_formato || '0 min';
  if (elTotalAvances) elTotalAvances.innerText = `📝 ${m.total_avances || 0} avances registrados`;
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

  // 1. Gráfica de Donut: Todas las Actividades y Tipos Dinámicos
  const ctxTipos = document.getElementById('chart-tipos')?.getContext('2d');
  if (ctxTipos) {
    const tiposConDatos = Object.keys(CONFIG_TIPOS).filter(k => (pt[k] || 0) > 0);
    const clavesFinales = tiposConDatos.length > 0 ? tiposConDatos : ['preventivo', 'correctivo', 'predictivo'];
    const labelsFinales = clavesFinales.map(k => CONFIG_TIPOS[k]?.label || k);
    const dataTipos = clavesFinales.map(k => pt[k] || 0);
    const bgColors = clavesFinales.map(k => CONFIG_TIPOS[k]?.color || '#64748b');

    if (chartTipos) {
      chartTipos.data.labels = labelsFinales;
      chartTipos.data.datasets[0].data = dataTipos;
      chartTipos.data.datasets[0].backgroundColor = bgColors;
      chartTipos.update();
    } else {
      chartTipos = new Chart(ctxTipos, {
        type: 'doughnut',
        data: {
          labels: labelsFinales,
          datasets: [{
            data: dataTipos,
            backgroundColor: bgColors,
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
          cutout: '68%'
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

  // 3. Gráfica de Barras Comparativa: Horas por Especialidad vs Tiempos Muertos
  const ctxRolesTiempos = document.getElementById('chart-roles-tiempos')?.getContext('2d');
  if (ctxRolesTiempos) {
    const valMec = Math.round(((m.horas_mecanica_minutos || 0) / 60) * 10) / 10;
    const valElec = Math.round(((m.horas_electrica_minutos || 0) / 60) * 10) / 10;
    const valMaq = Math.round(((m.horas_maquinaria_minutos || 0) / 60) * 10) / 10;
    const valRep = Math.round(((m.tiempo_espera_repuestos_minutos || 0) / 60) * 10) / 10;
    const valExt = Math.round(((m.tiempo_fuera_planta_minutos || 0) / 60) * 10) / 10;
    const dataRT = [valMec, valElec, valMaq, valRep, valExt];

    if (chartRolesTiempos) {
      chartRolesTiempos.data.datasets[0].data = dataRT;
      chartRolesTiempos.update();
    } else {
      chartRolesTiempos = new Chart(ctxRolesTiempos, {
        type: 'bar',
        data: {
          labels: ['Mecánica (🔧)', 'Eléctrica (⚡)', 'Maquinaria (🚜)', 'Espera Repuestos (📦)', 'Fuera Planta / Torno (🏭)'],
          datasets: [{
            label: 'Horas Totales',
            data: dataRT,
            backgroundColor: [
              '#10b981cc', // Verde Esmeralda
              '#f59e0bcc', // Ámbar
              '#f97316cc', // Naranja
              '#f43f5ecc', // Rosa/Rojo
              '#a855f7cc'  // Morado Torno
            ],
            borderColor: [
              '#10b981',
              '#f59e0b',
              '#f97316',
              '#f43f5e',
              '#a855f7'
            ],
            borderWidth: 1.5,
            borderRadius: 8,
            maxBarThickness: 38
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              grid: { color: '#334155' },
              ticks: {
                color: '#94a3b8',
                font: { size: 10 },
                callback: (val) => `${val}h`
              }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.raw} Horas registradas`
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
    // Badge Tipo dinámico con icono y colores específicos de la actividad
    const badgeTipo = getBadgeTipo(t.tipo);

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
    } else if (t.tiene_foto_comprobante) {
      fotoTd = `
        <button type="button" onclick="cargarYVerFoto('${t.id}', 'comprobante'); event.stopPropagation();" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60 text-xs font-semibold transition shadow-sm" title="Ver fotografía de comprobante (carga ligera)">
          <i class="fa-solid fa-camera"></i> Ver Foto
        </button>
      `;
    } else {
      const txtFoto = t.estado === 'completado' ? 'Sin comprobante' : 'Pendiente';
      fotoTd = `
        <span class="text-slate-500 text-xs italic flex items-center justify-center gap-1">
          <i class="fa-regular fa-image text-slate-600"></i> ${txtFoto}
        </span>
      `;
    }

    // Fechas formateadas
    const txtOcurrio = formatearFechaHora(t.fecha_ocurrencia);
    const txtArreglo = t.fecha_arreglo ? formatearFechaHora(t.fecha_arreglo) : `<span class="text-slate-500 italic">En proceso...</span>`;
    
    let desgloseTiempos = '';
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

    if (t.tiempo_arreglo_minutos !== null) {
      if (tMuertoTotal > 0) {
        const activo = (t.tiempo_trabajo_activo_minutos !== undefined && t.tiempo_trabajo_activo_minutos !== null)
          ? t.tiempo_trabajo_activo_minutos
          : Math.max(0, t.tiempo_arreglo_minutos - tMuertoTotal);
        
        const partesMuerto = [];
        if (repMin > 0) partesMuerto.push(`${formatMinutos(repMin)} repuestos`);
        if (extMin > 0) partesMuerto.push(`${formatMinutos(extMin)} torno/externo`);

        desgloseTiempos = `
          <div class="text-[10px] text-amber-300/90 flex flex-col gap-0.5 mt-1 font-mono">
            <span class="text-emerald-400 font-bold"><i class="fa-solid fa-wrench text-[9px]"></i> ${formatMinutos(activo)} activo</span>
            <span class="text-rose-300/80"><i class="fa-solid fa-hourglass-half text-[9px]"></i> Inactividad: ${partesMuerto.join(' + ')}</span>
          </div>
        `;
      }
    }

    const txtDuracion = t.tiempo_arreglo_minutos !== null 
      ? `<div><span class="font-mono font-semibold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">${formatMinutos(t.tiempo_arreglo_minutos)}</span>${desgloseTiempos}</div>`
      : `<span class="text-slate-500">-</span>`;

    // Avances registrados badge
    const numAvances = Array.isArray(t.avances) ? t.avances.length : 0;
    const badgeAvances = numAvances > 0 
      ? `<button type="button" onclick="abrirModalDetalle('${t.id}'); event.stopPropagation();" class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 transition">
          <i class="fa-solid fa-list-check text-[9px]"></i> ${numAvances} avance${numAvances > 1 ? 's' : ''} registrado${numAvances > 1 ? 's' : ''}
         </button>`
      : '';

    // Horas por rol en la fila si existen
    let desgloseHorasRoles = '';
    if (t.tiempos_por_rol) {
      const tpr = t.tiempos_por_rol;
      const partes = [];
      if (tpr.mecanico > 0) partes.push(`🔧 ${formatMinutos(tpr.mecanico)}`);
      if (tpr.electrico > 0) partes.push(`⚡ ${formatMinutos(tpr.electrico)}`);
      if (tpr.maquinista > 0) partes.push(`🚜 ${formatMinutos(tpr.maquinista)}`);
      if (partes.length > 0) {
        desgloseHorasRoles = `<div class="text-[10px] text-indigo-300 font-mono mt-0.5">${partes.join(' | ')}</div>`;
      }
    }

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
              ${badgeAvances}
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
            ${desgloseHorasRoles}
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
let fotoInicialCrearBase64 = null;

function procesarFotoInicialCrear(event) {
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
      fotoInicialCrearBase64 = canvas.toDataURL('image/jpeg', 0.75);

      const previewBox = document.getElementById('crear-preview-foto-inicial-box');
      const previewImg = document.getElementById('crear-preview-foto-inicial-img');
      const lblNombre = document.getElementById('crear-foto-inicial-nombre');

      if (previewImg) previewImg.src = fotoInicialCrearBase64;
      if (previewBox) previewBox.classList.remove('hidden');
      if (lblNombre) lblNombre.innerText = file.name;
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function eliminarFotoInicialCrear() {
  fotoInicialCrearBase64 = null;
  const input = document.getElementById('crear-foto-inicial-file');
  if (input) input.value = '';
  const previewBox = document.getElementById('crear-preview-foto-inicial-box');
  const previewImg = document.getElementById('crear-preview-foto-inicial-img');
  const lblNombre = document.getElementById('crear-foto-inicial-nombre');
  if (previewImg) previewImg.src = '';
  if (previewBox) previewBox.classList.add('hidden');
  if (lblNombre) lblNombre.innerText = 'Sin fotografía adjunta (opcional)';
}

function abrirModalCrear() {
  fijarOcurrenciaAhora();
  eliminarFotoInicialCrear();
  document.getElementById('modal-crear').classList.remove('hidden');
}

function cerrarModalCrear() {
  document.getElementById('modal-crear').classList.add('hidden');
  eliminarFotoInicialCrear();
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
  const ROLES_GESTION = ['admin', 'supervisor', 'sst', 'director'];

  if (!ROLES_GESTION.includes(user.rol)) {
    alert('Acceso Restringido: Solo el Administrador, Supervisor, SST o Director de Planta tienen autorización para crear tareas.');
    return;
  }

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
    descripcion: formData.get('descripcion'),
    foto_inicial: fotoInicialCrearBase64
  };

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || 'admin',
        'x-user-username': user.username || 'Holger',
        'x-user-name': user.nombre || 'Administrador'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al crear tarea');

    mostrarToast('✅ Tarea creada exitosamente');
    cerrarModalCrear();
    form.reset();
    eliminarFotoInicialCrear();
    cargarTareas();
  } catch (err) {
    alert(err.message);
  }
}

// Carga bajo demanda de fotos de una tarea específica (Ahorro de ancho de banda)
async function cargarYVerFoto(id, tipo = 'comprobante') {
  let t = todasLasTareas.find(item => item.id === id);
  if (!t) return;
  if (!t.foto_comprobante && !t.foto_inicial) {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (res.ok) {
        const tCompleta = await res.json();
        Object.assign(t, tCompleta);
      }
    } catch(e) {
      console.error('Error al cargar foto bajo demanda:', e);
    }
  }
  const foto = (tipo === 'inicial') ? (t.foto_inicial || t.foto_comprobante) : (t.foto_comprobante || t.foto_inicial);
  if (foto) {
    abrirVisorFoto(foto, `${t.id} - ${escaparHTML(t.equipo)}`);
  } else {
    alert('No se encontró fotografía para esta tarea.');
  }
}

// Modal Detalle
async function abrirModalDetalle(id) {
  let t = todasLasTareas.find(item => item.id === id);
  if (!t) return;

  // Si es una tarea optimizada sin fotos cargadas en memoria, cargarlas bajo demanda
  if ((t.tiene_foto_comprobante && !t.foto_comprobante) || (t.tiene_foto_inicial && !t.foto_inicial)) {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (res.ok) {
        const tCompleta = await res.json();
        Object.assign(t, tCompleta);
      }
    } catch (e) {
      console.error('Error al cargar fotos de la tarea:', e);
    }
  }

  tareaSeleccionadaId = id;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const esAdmin = user.rol === 'admin';

  // Guardar estado original de foto comprobante
  fotoDetalleOriginal = t.foto_comprobante || null;
  nuevaFotoDetalleBase64 = null;
  const inputFoto = document.getElementById('input-cambiar-foto-detalle');
  if (inputFoto) inputFoto.value = '';
  const avisoFoto = document.getElementById('aviso-nueva-foto-detalle');
  if (avisoFoto) avisoFoto.classList.add('hidden');

  // Guardar estado original de foto inicial
  fotoInicialDetalleOriginal = t.foto_inicial || null;
  nuevaFotoInicialDetalleBase64 = null;
  const inputFotoIni = document.getElementById('input-cambiar-foto-inicial-detalle');
  if (inputFotoIni) inputFotoIni.value = '';
  const avisoFotoIni = document.getElementById('aviso-nueva-foto-inicial-detalle');
  if (avisoFotoIni) avisoFotoIni.classList.add('hidden');

  // Título e ID
  document.getElementById('det-id-titulo').innerText = `${t.id} - ${t.equipo}`;
  
  // Resetear estados de eliminación de fotos
  eliminarFotoDetallePendiente = false;
  eliminarFotoInicialDetallePendiente = false;

  // Badge y Selector de tipo de actividad / re-clasificación
  const selTipo = document.getElementById('edit-det-tipo');
  if (selTipo) {
    selTipo.value = t.tipo || 'correctivo';
    selTipo.disabled = !esAdmin;
  }
  cambiarTipoDetalleModal(t.tipo || 'correctivo');

  // Estado de la tarea y Botón Reabrir
  const selEstado = document.getElementById('edit-det-estado');
  const btnReabrir = document.getElementById('btn-reabrir-tarea-detalle');
  if (selEstado) {
    selEstado.value = t.estado || 'pendiente';
    selEstado.disabled = !esAdmin;
  }
  if (btnReabrir) {
    if (esAdmin && t.estado === 'completado') {
      btnReabrir.classList.remove('hidden');
    } else {
      btnReabrir.classList.add('hidden');
    }
  }

  // Visibilidad de botones para quitar fotos
  const btnQuitarFoto = document.getElementById('btn-quitar-foto-detalle');
  const btnQuitarFotoIni = document.getElementById('btn-quitar-foto-inicial-detalle');
  if (btnQuitarFoto) {
    if (esAdmin && t.foto_comprobante) btnQuitarFoto.classList.remove('hidden');
    else btnQuitarFoto.classList.add('hidden');
  }
  if (btnQuitarFotoIni) {
    if (esAdmin && t.foto_inicial) btnQuitarFotoIni.classList.remove('hidden');
    else btnQuitarFotoIni.classList.add('hidden');
  }

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

  // Tiempos de espera por repuestos vs trabajos fuera de planta
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

  const inEsperaH = document.getElementById('edit-det-espera-horas');
  const inEsperaM = document.getElementById('edit-det-espera-minutos');
  const inMotivoEsp = document.getElementById('edit-det-motivo-espera');
  if (inEsperaH) { inEsperaH.value = Math.floor(tRep / 60); inEsperaH.disabled = !esAdmin; }
  if (inEsperaM) { inEsperaM.value = tRep % 60; inEsperaM.disabled = !esAdmin; }
  if (inMotivoEsp) { inMotivoEsp.value = motRep; inMotivoEsp.disabled = !esAdmin; }

  const inFueraH = document.getElementById('edit-det-fuera-horas');
  const inFueraM = document.getElementById('edit-det-fuera-minutos');
  const inMotivoFuera = document.getElementById('edit-det-fuera-motivo');
  if (inFueraH) { inFueraH.value = Math.floor(tExt / 60); inFueraH.disabled = !esAdmin; }
  if (inFueraM) { inFueraM.value = tExt % 60; inFueraM.disabled = !esAdmin; }
  if (inMotivoFuera) { inMotivoFuera.value = motExt; inMotivoFuera.disabled = !esAdmin; }

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

  // 1. Fotografía Inicial del Problema con persistencia base64
  const imgFotoInicial = document.getElementById('det-img-foto-inicial');
  const sinFotoInicial = document.getElementById('det-sin-foto-inicial');
  const badgeAmpliarInicial = document.getElementById('det-badge-ampliar-inicial');
  if (t.foto_inicial) {
    if (imgFotoInicial) {
      imgFotoInicial.src = t.foto_inicial;
      imgFotoInicial.onerror = function() {
        this.classList.add('hidden');
        if (badgeAmpliarInicial) badgeAmpliarInicial.classList.add('hidden');
        if (sinFotoInicial) sinFotoInicial.classList.remove('hidden');
      };
      imgFotoInicial.classList.remove('hidden');
    }
    if (badgeAmpliarInicial) badgeAmpliarInicial.classList.remove('hidden');
    if (sinFotoInicial) sinFotoInicial.classList.add('hidden');
  } else {
    if (imgFotoInicial) {
      imgFotoInicial.src = '';
      imgFotoInicial.classList.add('hidden');
    }
    if (badgeAmpliarInicial) badgeAmpliarInicial.classList.add('hidden');
    if (sinFotoInicial) sinFotoInicial.classList.remove('hidden');
  }

  // 2. Fotografía Comprobante con persistencia base64
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

  // Resetear formulario de nuevo avance y renderizar bitácora
  const formAvance = document.getElementById('form-nuevo-avance-pc');
  if (formAvance) formAvance.classList.add('hidden');
  renderAvancesDetallePC(t, esAdmin);

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
    const info = getInfoRolColaborador(t);
    const checked = tecsAsignados.some(nombre => nombre.toLowerCase() === t.nombre.toLowerCase());
    const disabledAttr = esAdmin ? '' : 'disabled';

    return `
      <label class="cursor-pointer border border-slate-700/80 rounded-lg p-2 flex items-center justify-between text-xs hover:bg-slate-800 transition has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-950/30">
        <div class="flex items-center gap-2 truncate">
          <input type="checkbox" name="det_tecnicos_asignados" value="${escaparHTML(t.nombre)}" ${checked ? 'checked' : ''} ${disabledAttr} onchange="actualizarEstadoConjuntaDetalle()" class="rounded border-slate-700 text-indigo-600 focus:ring-0">
          <span class="font-medium text-white truncate">${escaparHTML(t.nombre)}</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded border ${info.badgeRol} flex items-center gap-1 flex-shrink-0">
          <i class="fa-solid ${info.iconRol}"></i> ${info.rolTxt} ${info.tagApoyo}
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

  const hFuera = parseInt(document.getElementById('edit-det-fuera-horas')?.value) || 0;
  const mFuera = parseInt(document.getElementById('edit-det-fuera-minutos')?.value) || 0;
  const totalFueraMin = Math.max(0, (hFuera * 60) + mFuera);

  const totalInactividadMin = totalEsperaMin + totalFueraMin;

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

  if (elResumenEspera) elResumenEspera.innerText = formatMinutos(totalInactividadMin);

  if (totalParadaMin !== null) {
    if (elTotal) elTotal.innerText = formatMinutos(totalParadaMin);
    if (elResumenParada) elResumenParada.innerText = formatMinutos(totalParadaMin);

    const activoMin = Math.max(0, totalParadaMin - totalInactividadMin);
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

// Procesar y comprimir nueva foto inicial en el modal de detalle
function procesarNuevaFotoInicialDetalle(event) {
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

      nuevaFotoInicialDetalleBase64 = canvas.toDataURL('image/jpeg', 0.75);

      const imgElement = document.getElementById('det-img-foto-inicial');
      const sinFoto = document.getElementById('det-sin-foto-inicial');
      const badgeAmpliar = document.getElementById('det-badge-ampliar-inicial');
      const aviso = document.getElementById('aviso-nueva-foto-inicial-detalle');

      if (imgElement) {
        imgElement.src = nuevaFotoInicialDetalleBase64;
        imgElement.classList.remove('hidden');
      }
      if (badgeAmpliar) badgeAmpliar.classList.remove('hidden');
      if (sinFoto) sinFoto.classList.add('hidden');
      if (aviso) aviso.classList.remove('hidden');
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function cancelarNuevaFotoInicialDetalle() {
  nuevaFotoInicialDetalleBase64 = null;
  const input = document.getElementById('input-cambiar-foto-inicial-detalle');
  if (input) input.value = '';

  const aviso = document.getElementById('aviso-nueva-foto-inicial-detalle');
  if (aviso) aviso.classList.add('hidden');

  const imgElement = document.getElementById('det-img-foto-inicial');
  const sinFoto = document.getElementById('det-sin-foto-inicial');
  const badgeAmpliar = document.getElementById('det-badge-ampliar-inicial');

  if (fotoInicialDetalleOriginal) {
    if (imgElement) {
      imgElement.src = fotoInicialDetalleOriginal;
      imgElement.classList.remove('hidden');
    }
    if (badgeAmpliar) badgeAmpliar.classList.remove('hidden');
    if (sinFoto) sinFoto.classList.add('hidden');
  } else {
    if (imgElement) {
      imgElement.src = '';
      imgElement.classList.add('hidden');
    }
    if (badgeAmpliar) badgeAmpliar.classList.add('hidden');
    if (sinFoto) sinFoto.classList.remove('hidden');
  }
}

function abrirFotoInicialDetalleActual() {
  const imgFoto = document.getElementById('det-img-foto-inicial');
  const titulo = document.getElementById('det-id-titulo')?.innerText || 'Foto Inicial del Problema';
  if (imgFoto && imgFoto.src && !imgFoto.classList.contains('hidden')) {
    abrirVisorFoto(imgFoto.src, `Foto Inicial - ${titulo}`);
  }
}

function alCambiarEstadoDetalleModal(nuevoEstado) {
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const esAdmin = (user.rol || '').toLowerCase().trim() === 'admin';
  const btnReabrir = document.getElementById('btn-reabrir-tarea-detalle');
  if (btnReabrir) {
    if (esAdmin && nuevoEstado === 'completado') btnReabrir.classList.remove('hidden');
    else btnReabrir.classList.add('hidden');
  }
  if (nuevoEstado !== 'completado') {
    const inArreglo = document.getElementById('edit-det-fecha-arreglo');
    if (inArreglo) inArreglo.value = '';
    const txtArreglo = document.getElementById('det-fecha-arreglo-txt');
    if (txtArreglo) txtArreglo.innerText = 'Pendiente de registrar';
    calcularTiemposDetalle();
  }
}

function reabrirTareaActual() {
  if (!tareaSeleccionadaId) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (!usuarioTienePermiso('reabrir_tareas')) {
    mostrarToast('❌ Acceso Restringido: Tu rol no tiene permisos para reabrir tareas.', 'error');
    return;
  }
  const selEstado = document.getElementById('edit-det-estado');
  if (selEstado) selEstado.value = 'en_proceso';
  alCambiarEstadoDetalleModal('en_proceso');

  const t = todasLasTareas.find(item => item.id === tareaSeleccionadaId);
  if (t && t.foto_comprobante && !eliminarFotoDetallePendiente) {
    if (confirm('¿Deseas también quitar la fotografía de comprobante subida por error?')) {
      marcarEliminarFotoDetalle();
    }
  }

  mostrarToast('ℹ️ Tarea reabierta a "En Proceso". Haz clic en "Guardar Cambios" para aplicar.');
}

function marcarEliminarFotoDetalle() {
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (!usuarioTienePermiso('cambiar_foto')) {
    mostrarToast('❌ Acceso Restringido: Tu rol no tiene permisos para modificar o eliminar fotografías.', 'error');
    return;
  }
  if (!confirm('¿Está seguro de quitar la fotografía de comprobante final?')) return;
  eliminarFotoDetallePendiente = true;
  nuevaFotoDetalleBase64 = null;
  const imgFoto = document.getElementById('det-img-foto');
  const sinFoto = document.getElementById('det-sin-foto');
  const badgeAmpliar = document.getElementById('det-badge-ampliar');
  const btnQuitar = document.getElementById('btn-quitar-foto-detalle');
  if (imgFoto) {
    imgFoto.src = '';
    imgFoto.classList.add('hidden');
  }
  if (badgeAmpliar) badgeAmpliar.classList.add('hidden');
  if (sinFoto) sinFoto.classList.remove('hidden');
  if (btnQuitar) btnQuitar.classList.add('hidden');
  
  const aviso = document.getElementById('aviso-nueva-foto-detalle');
  if (aviso) {
    aviso.innerHTML = `<span class="flex items-center gap-1 text-[11px] text-rose-300"><i class="fa-solid fa-trash-can text-rose-400"></i> Foto de comprobante marcada para eliminar al guardar</span>
    <button type="button" onclick="cancelarEliminarFotoDetalle()" class="text-slate-300 hover:text-white text-xs font-bold underline ml-2">Deshacer</button>`;
    aviso.classList.remove('hidden');
  }
  mostrarToast('🗑️ Fotografía final marcada para eliminar');
}

function cancelarEliminarFotoDetalle() {
  eliminarFotoDetallePendiente = false;
  const t = todasLasTareas.find(item => item.id === tareaSeleccionadaId);
  const aviso = document.getElementById('aviso-nueva-foto-detalle');
  if (aviso) aviso.classList.add('hidden');
  if (t && t.foto_comprobante) {
    const imgFoto = document.getElementById('det-img-foto');
    const sinFoto = document.getElementById('det-sin-foto');
    const badgeAmpliar = document.getElementById('det-badge-ampliar');
    const btnQuitar = document.getElementById('btn-quitar-foto-detalle');
    if (imgFoto) {
      imgFoto.src = t.foto_comprobante;
      imgFoto.classList.remove('hidden');
    }
    if (badgeAmpliar) badgeAmpliar.classList.remove('hidden');
    if (sinFoto) sinFoto.classList.add('hidden');
    if (btnQuitar) btnQuitar.classList.remove('hidden');
  }
}

function marcarEliminarFotoInicialDetalle() {
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (!usuarioTienePermiso('cambiar_foto')) {
    mostrarToast('❌ Acceso Restringido: Tu rol no tiene permisos para modificar o eliminar fotografías.', 'error');
    return;
  }
  if (!confirm('¿Está seguro de quitar la fotografía inicial?')) return;
  eliminarFotoInicialDetallePendiente = true;
  nuevaFotoInicialDetalleBase64 = null;
  const imgFoto = document.getElementById('det-img-foto-inicial');
  const sinFoto = document.getElementById('det-sin-foto-inicial');
  const badgeAmpliar = document.getElementById('det-badge-ampliar-inicial');
  const btnQuitar = document.getElementById('btn-quitar-foto-inicial-detalle');
  if (imgFoto) {
    imgFoto.src = '';
    imgFoto.classList.add('hidden');
  }
  if (badgeAmpliar) badgeAmpliar.classList.add('hidden');
  if (sinFoto) sinFoto.classList.remove('hidden');
  if (btnQuitar) btnQuitar.classList.add('hidden');

  const aviso = document.getElementById('aviso-nueva-foto-inicial-detalle');
  if (aviso) {
    aviso.innerHTML = `<span class="flex items-center gap-1 text-[11px] text-rose-300"><i class="fa-solid fa-trash-can text-rose-400"></i> Foto inicial marcada para eliminar al guardar</span>
    <button type="button" onclick="cancelarEliminarFotoInicialDetalle()" class="text-slate-300 hover:text-white text-xs font-bold underline ml-2">Deshacer</button>`;
    aviso.classList.remove('hidden');
  }
}

function cancelarEliminarFotoInicialDetalle() {
  eliminarFotoInicialDetallePendiente = false;
  const t = todasLasTareas.find(item => item.id === tareaSeleccionadaId);
  const aviso = document.getElementById('aviso-nueva-foto-inicial-detalle');
  if (aviso) aviso.classList.add('hidden');
  if (t && t.foto_inicial) {
    const imgFoto = document.getElementById('det-img-foto-inicial');
    const sinFoto = document.getElementById('det-sin-foto-inicial');
    const badgeAmpliar = document.getElementById('det-badge-ampliar-inicial');
    const btnQuitar = document.getElementById('btn-quitar-foto-inicial-detalle');
    if (imgFoto) {
      imgFoto.src = t.foto_inicial;
      imgFoto.classList.remove('hidden');
    }
    if (badgeAmpliar) badgeAmpliar.classList.remove('hidden');
    if (sinFoto) sinFoto.classList.add('hidden');
    if (btnQuitar) btnQuitar.classList.remove('hidden');
  }
}

// Guardar Modificación Completa de Tarea (Fechas, Roles, Participantes, Tiempos y Fotos)
async function guardarEdicionDetalleAdmin() {
  if (!tareaSeleccionadaId) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (!usuarioTienePermiso('cambiar_horas') && !usuarioTienePermiso('crear_tareas')) {
    alert('Acceso Restringido: Tu rol no tiene autorización para modificar fechas, horas o detalles de las tareas.');
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

  // Tiempos de espera por repuestos
  const hEspera = parseInt(document.getElementById('edit-det-espera-horas')?.value) || 0;
  const mEspera = parseInt(document.getElementById('edit-det-espera-minutos')?.value) || 0;
  const tiempoEsperaMin = Math.max(0, (hEspera * 60) + mEspera);
  const motivoEspera = (document.getElementById('edit-det-motivo-espera')?.value || '').trim();

  // Trabajos fuera de planta / Torno / Talleres externos
  const hFuera = parseInt(document.getElementById('edit-det-fuera-horas')?.value) || 0;
  const mFuera = parseInt(document.getElementById('edit-det-fuera-minutos')?.value) || 0;
  const tiempoFueraMin = Math.max(0, (hFuera * 60) + mFuera);
  const motivoFuera = (document.getElementById('edit-det-fuera-motivo')?.value || '').trim();

  // Horas por rol
  const hMec = parseFloat(document.getElementById('edit-horas-mecanico')?.value) || 0;
  const hElec = parseFloat(document.getElementById('edit-horas-electrico')?.value) || 0;
  const hMaq = parseFloat(document.getElementById('edit-horas-maquinista')?.value) || 0;
  const tiemposPorRol = {
    mecanico: Math.round(hMec * 60),
    electrico: Math.round(hElec * 60),
    maquinista: Math.round(hMaq * 60)
  };

  const tipoSeleccionado = document.getElementById('edit-det-tipo')?.value;
  const estadoSeleccionado = document.getElementById('edit-det-estado')?.value || 'pendiente';
  const tareaActual = todasLasTareas.find(item => item.id === tareaSeleccionadaId);
  const esReapertura = Boolean(tareaActual && tareaActual.estado === 'completado' && estadoSeleccionado !== 'completado');

  const payload = {
    tipo: tipoSeleccionado,
    estado: estadoSeleccionado,
    reabrir: esReapertura,
    eliminar_foto_comprobante: eliminarFotoDetallePendiente,
    eliminar_foto_inicial: eliminarFotoInicialDetallePendiente,
    fecha_ocurrencia: fOcurrio,
    fecha_arreglo: esReapertura ? null : (fArreglo || null),
    notas_mecanico: notas,
    roles_asignados: rolesFinales,
    tecnicos_asignados: tecnicosFinales,
    tiempo_espera_minutos: tiempoEsperaMin,
    tiempo_espera_repuestos_minutos: tiempoEsperaMin,
    motivo_espera: motivoEspera,
    motivo_espera_repuestos: motivoEspera,
    tiempo_fuera_planta_minutos: tiempoFueraMin,
    motivo_fuera_planta: motivoFuera,
    tiempos_por_rol: tiemposPorRol
  };

  if (nuevaFotoDetalleBase64) {
    payload.foto_base64 = nuevaFotoDetalleBase64;
  }
  if (nuevaFotoInicialDetalleBase64) {
    payload.foto_inicial_base64 = nuevaFotoInicialDetalleBase64;
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

    nuevaFotoDetalleBase64 = null;
    nuevaFotoInicialDetalleBase64 = null;
    mostrarToast('✅ Tarea, roles, personal, tiempos y fotografías actualizados');
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
  if (!usuarioTienePermiso('eliminar_tareas')) {
    alert('Acceso Restringido: Tu rol no tiene autorización para eliminar tareas en SIMAN.');
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

// ================= GESTIÓN DE USUARIOS Y PERMISOS RBAC =================

const ROLES_MATRIZ = [
  { key: 'mecanico', label: 'Mecánico', icon: '🔧', colorClass: 'text-cyan-400' },
  { key: 'electrico', label: 'Eléctrico', icon: '⚡', colorClass: 'text-amber-400' },
  { key: 'maquinista', label: 'Maquinista', icon: '🚜', colorClass: 'text-orange-400' },
  { key: 'supervisor', label: 'Supervisor', icon: '👷', colorClass: 'text-sky-400' },
  { key: 'sst', label: 'SST', icon: '🦺', colorClass: 'text-emerald-400' },
  { key: 'director', label: 'Director', icon: '🏢', colorClass: 'text-indigo-400' },
  { key: 'visualizador', label: 'Solo Ver', icon: '👁️', colorClass: 'text-purple-400' },
  { key: 'admin', label: 'Admin', icon: '💻', colorClass: 'text-blue-400' }
];

const PERMISOS_CONFIG_UI = [
  {
    key: 'crear_tareas',
    nombre: 'Crear Tareas / Fallas',
    desc: 'Registrar nuevas órdenes y reportar fallas en planta',
    icono: 'fa-plus-circle',
    color: 'text-emerald-400'
  },
  {
    key: 'cerrar_tareas',
    nombre: 'Cerrar / Finalizar Tareas',
    desc: 'Completar tareas en proceso y registrar el arreglo',
    icono: 'fa-check-circle',
    color: 'text-green-400'
  },
  {
    key: 'cambiar_horas',
    nombre: 'Modificar Fechas / Horas',
    desc: 'Editar horas de inicio, término y fecha de ocurrencia',
    icono: 'fa-clock',
    color: 'text-amber-400'
  },
  {
    key: 'cambiar_foto',
    nombre: 'Subir / Cambiar Fotos',
    desc: 'Subir fotos iniciales o evidencias del trabajo',
    icono: 'fa-camera',
    color: 'text-cyan-400'
  },
  {
    key: 'asignable_tareas',
    nombre: 'Asignable en Tareas',
    desc: 'Aparece en listas para asignarle órdenes de trabajo',
    icono: 'fa-user-tag',
    color: 'text-teal-400'
  },
  {
    key: 'ver_contrasenas',
    nombre: 'Ver Contraseñas',
    desc: 'Poder revelar las contraseñas de los usuarios',
    icono: 'fa-eye',
    color: 'text-yellow-400'
  },
  {
    key: 'cambiar_contrasenas',
    nombre: 'Cambiar Contraseñas',
    desc: 'Asignar o restablecer contraseñas de los usuarios',
    icono: 'fa-key',
    color: 'text-orange-400'
  },
  {
    key: 'reabrir_tareas',
    nombre: 'Reabrir Tareas',
    desc: 'Volver a abrir una orden completada a estado en proceso',
    icono: 'fa-rotate-left',
    color: 'text-rose-400'
  },
  {
    key: 'eliminar_tareas',
    nombre: 'Eliminar Tareas',
    desc: 'Borrar definitivamente órdenes o registros de fallas',
    icono: 'fa-trash-can',
    color: 'text-red-400'
  },
  {
    key: 'ver_compras',
    nombre: 'Ver Módulo de Compras',
    desc: 'Visualizar solicitudes de repuestos y materiales',
    icono: 'fa-cart-shopping',
    color: 'text-indigo-400'
  },
  {
    key: 'crear_compras',
    nombre: 'Crear Solicitudes de Compra',
    desc: 'Generar nuevos requerimientos de compra y repuestos',
    icono: 'fa-bag-shopping',
    color: 'text-violet-400'
  },
  {
    key: 'ver_dashboard',
    nombre: 'Ver Dashboard y Métricas',
    desc: 'Visualizar gráficas de fallas, tiempos, indicadores KPI y reportes',
    icono: 'fa-chart-pie',
    color: 'text-sky-400'
  },
  {
    key: 'acceso_pc',
    nombre: 'Acceso a Modo PC / Escritorio',
    desc: 'Permite ingresar a la interfaz de escritorio en computadora',
    icono: 'fa-laptop',
    color: 'text-indigo-400'
  },
  {
    key: 'acceso_movil',
    nombre: 'Acceso a Modo Móvil',
    desc: 'Permite ingresar a la aplicación móvil para celulares y tablets',
    icono: 'fa-mobile-screen',
    color: 'text-emerald-400'
  }
];

function cambiarTabUsuarios(tab) {
  const btnUsuarios = document.getElementById('tab-btn-usuarios');
  const btnPermisos = document.getElementById('tab-btn-permisos');
  const panelUsuarios = document.getElementById('tab-panel-usuarios');
  const panelPermisos = document.getElementById('tab-panel-permisos');

  if (!btnUsuarios || !btnPermisos || !panelUsuarios || !panelPermisos) return;

  if (tab === 'permisos') {
    btnPermisos.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-emerald-600 text-white shadow';
    btnUsuarios.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800';
    panelUsuarios.classList.add('hidden');
    panelPermisos.classList.remove('hidden');
    renderizarMatrizPermisos();
  } else {
    btnUsuarios.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-blue-600 text-white shadow';
    btnPermisos.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800';
    panelPermisos.classList.add('hidden');
    panelUsuarios.classList.remove('hidden');
  }
}

async function renderizarMatrizPermisos() {
  const tbody = document.getElementById('tabla-matriz-permisos-body');
  if (!tbody) return;

  if (!simanPermisosCache) {
    tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Cargando matriz de permisos...</td></tr>';
    await cargarPermisosSistema();
  }

  const matriz = simanPermisosCache || {};

  tbody.innerHTML = PERMISOS_CONFIG_UI.map((p, idx) => {
    const bgRow = idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-950/40';

    const celdasRoles = ROLES_MATRIZ.map(r => {
      const esAdminRol = r.key === 'admin';
      const valor = esAdminRol ? true : (matriz[r.key] && matriz[r.key][p.key] !== undefined ? Boolean(matriz[r.key][p.key]) : false);

      if (esAdminRol) {
        return `
          <td class="py-2.5 px-2 text-center">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-950 border border-blue-500/40 text-blue-400 text-xs shadow-inner" title="El rol Admin siempre tiene este permiso activo">
              <i class="fa-solid fa-check"></i>
            </span>
            <input type="checkbox" data-rol="${r.key}" data-permiso="${p.key}" checked disabled class="hidden">
          </td>
        `;
      }

      return `
        <td class="py-2.5 px-2 text-center">
          <label class="inline-flex items-center justify-center cursor-pointer p-1">
            <input type="checkbox" data-rol="${r.key}" data-permiso="${p.key}" ${valor ? 'checked' : ''} class="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer accent-emerald-500 transition">
          </label>
        </td>
      `;
    }).join('');

    return `
      <tr class="${bgRow} hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-3.5">
          <div class="flex items-center gap-2">
            <i class="fa-solid ${p.icono} ${p.color} text-xs w-4 text-center"></i>
            <div>
              <div class="font-bold text-white text-xs leading-tight">${p.nombre}</div>
              <div class="text-[10px] text-slate-400 leading-tight">${p.desc}</div>
            </div>
          </div>
        </td>
        ${celdasRoles}
      </tr>
    `;
  }).join('');
}

async function guardarMatrizPermisos() {
  const btn = document.getElementById('btn-guardar-matriz-permisos');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando cambios...';
  }

  const inputs = document.querySelectorAll('#tabla-matriz-permisos-body input[data-rol][data-permiso]');
  const nuevaMatriz = {};

  ROLES_MATRIZ.forEach(r => {
    nuevaMatriz[r.key] = {};
  });

  inputs.forEach(inp => {
    const rol = inp.getAttribute('data-rol');
    const perm = inp.getAttribute('data-permiso');
    if (rol && perm) {
      if (!nuevaMatriz[rol]) nuevaMatriz[rol] = {};
      nuevaMatriz[rol][perm] = rol === 'admin' ? true : inp.checked;
    }
  });

  // Asegurar admin con todo en true
  nuevaMatriz.admin = {
    crear_tareas: true,
    cerrar_tareas: true,
    cambiar_horas: true,
    cambiar_foto: true,
    asignable_tareas: true,
    ver_contrasenas: true,
    cambiar_contrasenas: true,
    eliminar_tareas: true,
    reabrir_tareas: true,
    ver_compras: true,
    crear_compras: true,
    ver_dashboard: true,
    acceso_pc: true,
    acceso_movil: true
  };

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');

  try {
    const res = await fetch('/api/permisos', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userActual.rol || 'admin',
        'x-user-username': userActual.username || 'Holger'
      },
      body: JSON.stringify(nuevaMatriz)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar permisos');

    simanPermisosCache = data.permisos || nuevaMatriz;
    window.SIMAN_PERMISOS = simanPermisosCache;
    mostrarToast('¡Matriz de permisos guardada y respaldada en la nube con éxito!');
    aplicarPermisosEnUI();
    cargarMecanicosSelect(); // Actualiza selector de técnicos según asignable_tareas
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

async function restaurarPermisosPorDefecto() {
  if (!confirm('¿Deseas restaurar la matriz a los permisos recomendados de fábrica para todos los roles?')) return;

  const defaults = {
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
      acceso_movil: true
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
      acceso_movil: true
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
      acceso_movil: true
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
      acceso_movil: true
    },
    sst: {
      crear_tareas: true,
      cerrar_tareas: false,
      cambiar_horas: false,
      cambiar_foto: true,
      asignable_tareas: false,
      ver_contrasenas: false,
      cambiar_contrasenas: false,
      eliminar_tareas: false,
      reabrir_tareas: false,
      ver_compras: false,
      crear_compras: false,
      ver_dashboard: true,
      acceso_pc: true,
      acceso_movil: true
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
      acceso_movil: true
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
      acceso_movil: true
    },
    admin: {
      crear_tareas: true,
      cerrar_tareas: true,
      cambiar_horas: true,
      cambiar_foto: true,
      asignable_tareas: true,
      ver_contrasenas: true,
      cambiar_contrasenas: true,
      eliminar_tareas: true,
      reabrir_tareas: true,
      ver_compras: true,
      crear_compras: true,
      ver_dashboard: true,
      acceso_pc: true,
      acceso_movil: true
    }
  };

  simanPermisosCache = defaults;
  renderizarMatrizPermisos();
  await guardarMatrizPermisos();
}

async function abrirModalUsuarios() {
  document.getElementById('modal-usuarios').classList.remove('hidden');
  cambiarTabUsuarios('usuarios');
  await Promise.all([cargarPermisosSistema(), cargarListaUsuariosAdmin(), cargarListaPersonalApoyo()]);
}

function cerrarModalUsuarios() {
  document.getElementById('modal-usuarios').classList.add('hidden');
}

async function cargarListaUsuariosAdmin() {
  const tbody = document.getElementById('tabla-usuarios-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Cargando usuarios...</td></tr>';

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');

  try {
    const res = await fetch('/api/users', {
      headers: {
        'x-user-role': userActual.rol || 'admin',
        'x-user-username': userActual.username || 'Holger'
      }
    });
    const users = await res.json();

    const puedeVerPass = usuarioTienePermiso('ver_contrasenas');
    const puedeCambiarPass = usuarioTienePermiso('cambiar_contrasenas');
    const esAdmin = (userActual.rol || '').toLowerCase().trim() === 'admin';

    tbody.innerHTML = users.map(u => {
      let badgeRol = '';
      if (u.rol === 'admin') badgeRol = '<span class="bg-blue-900/60 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-crown mr-1"></i>ADMIN</span>';
      else if (u.rol === 'supervisor') badgeRol = '<span class="bg-sky-950 text-sky-300 border border-sky-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-helmet-safety mr-1"></i>SUPERVISOR</span>';
      else if (u.rol === 'sst') badgeRol = '<span class="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-shield-halved mr-1"></i>SST</span>';
      else if (u.rol === 'director') badgeRol = '<span class="bg-indigo-950 text-indigo-300 border border-indigo-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-building mr-1"></i>DIRECTOR</span>';
      else if (u.rol === 'electrico') badgeRol = '<span class="bg-amber-950 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-bolt mr-1"></i>ELÉCTRICO</span>';
      else if (u.rol === 'maquinista') badgeRol = '<span class="bg-orange-950 text-orange-300 border border-orange-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-tractor mr-1"></i>MAQUINISTA</span>';
      else if (u.rol === 'visualizador') badgeRol = '<span class="bg-purple-900/60 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-eye mr-1"></i>SOLO VER</span>';
      else badgeRol = '<span class="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-wrench mr-1"></i>MECÁNICO</span>';

      const esHolger = u.username.toLowerCase() === 'holger';

      if (esHolger && u.email) {
        const inputCorreo = document.getElementById('input-admin-correo-recuperacion');
        if (inputCorreo && !inputCorreo.value) {
          inputCorreo.value = u.email;
        }
      }

      const colRol = esHolger
        ? badgeRol
        : `
          <div class="flex items-center gap-1.5">
            ${badgeRol}
            <select onchange="cambiarRolUsuarioAdmin('${u.id}', this.value)" title="Cambiar rol" class="bg-slate-950 border border-slate-700 text-slate-300 text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="mecanico" ${u.rol === 'mecanico' ? 'selected' : ''}>🔧 Mecánico</option>
              <option value="electrico" ${u.rol === 'electrico' ? 'selected' : ''}>⚡ Eléctrico</option>
              <option value="maquinista" ${u.rol === 'maquinista' ? 'selected' : ''}>🚜 Maquinista</option>
              <option value="supervisor" ${u.rol === 'supervisor' ? 'selected' : ''}>👷 Supervisor</option>
              <option value="sst" ${u.rol === 'sst' ? 'selected' : ''}>🦺 SST</option>
              <option value="director" ${u.rol === 'director' ? 'selected' : ''}>🏢 Director</option>
              <option value="visualizador" ${u.rol === 'visualizador' ? 'selected' : ''}>👁️ Solo Ver</option>
            </select>
          </div>
        `;

      let colPassword = '';
      if (esHolger) {
        colPassword = `<span class="bg-emerald-950 text-emerald-300 border border-emerald-600/40 px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1"><i class="fa-solid fa-shield-halved text-emerald-400"></i>Protegida (OTP)</span>`;
      } else {
        const btnCambiarHtml = puedeCambiarPass
          ? `<button type="button" data-user="${encodeURIComponent(u.username)}" data-nombre="${encodeURIComponent(u.nombre)}" onclick="abrirModalCambiarPasswordAdmin('${u.id}', decodeURIComponent(this.getAttribute('data-user')), decodeURIComponent(this.getAttribute('data-nombre')))" title="${u.password_plana ? 'Cambiar contraseña' : 'Asignar contraseña conocida'}" class="text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded text-[10px] font-semibold hover:bg-amber-900/60 transition ml-1 flex items-center gap-1 active:scale-95">
              <i class="fa-solid fa-key text-[9px]"></i> ${u.password_plana ? 'Cambiar' : 'Asignar'}
            </button>`
          : '';

        if (u.password_plana) {
          const btnEyeHtml = puedeVerPass
            ? `<button type="button" data-pass="${encodeURIComponent(u.password_plana)}" onclick="toggleVerPasswordAdmin('${u.id}', decodeURIComponent(this.getAttribute('data-pass')))" title="Ver / Ocultar clave" class="text-slate-400 hover:text-white p-1 text-xs transition">
                <i id="pass-eye-${u.id}" class="fa-solid fa-eye"></i>
              </button>`
            : '';

          colPassword = `
            <div class="flex items-center gap-1.5">
              <span id="pass-txt-${u.id}" class="font-mono text-slate-300 text-xs">••••••••</span>
              ${btnEyeHtml}
              ${btnCambiarHtml}
            </div>
          `;
        } else {
          colPassword = `
            <div class="flex items-center gap-1.5">
              <span class="text-slate-500 italic text-[11px]">No visible aún</span>
              ${btnCambiarHtml}
            </div>
          `;
        }
      }

      const botonEliminar = esHolger
        ? '<span class="text-[10px] text-slate-500 font-semibold italic">Principal</span>'
        : (esAdmin ? `<button onclick="eliminarUsuarioAdmin('${u.id}', '${escaparHTML(u.nombre)}', '${u.username}')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-950/40 border border-rose-800/40 rounded hover:bg-rose-900 transition">Eliminar</button>` : '');

      return `
        <tr>
          <td class="py-2.5 px-3 font-mono font-bold text-white">@${escaparHTML(u.username)}</td>
          <td class="py-2.5 px-3 font-medium">${escaparHTML(u.nombre)}</td>
          <td class="py-2.5 px-3">${colRol}</td>
          <td class="py-2.5 px-3">${colPassword}</td>
          <td class="py-2.5 px-3 text-right">${botonEliminar}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-rose-400">Error cargando usuarios</td></tr>';
  }
}

function toggleVerPasswordAdmin(id, passPlana) {
  const txt = document.getElementById(`pass-txt-${id}`);
  const eye = document.getElementById(`pass-eye-${id}`);
  if (!txt || !eye) return;
  if (txt.getAttribute('data-revealed') === 'true') {
    txt.innerText = '••••••••';
    txt.removeAttribute('data-revealed');
    eye.className = 'fa-solid fa-eye';
  } else {
    txt.innerText = passPlana;
    txt.setAttribute('data-revealed', 'true');
    eye.className = 'fa-solid fa-eye-slash text-emerald-400';
  }
}

function abrirModalCambiarPasswordAdmin(id, username, nombre) {
  const modal = document.getElementById('modal-cambiar-password-admin');
  if (!modal) return;
  const idInput = document.getElementById('input-cambiar-pass-id');
  const userTxt = document.getElementById('txt-cambiar-pass-usuario');
  const passInput = document.getElementById('input-cambiar-pass-nueva');
  if (idInput) idInput.value = id;
  if (userTxt) userTxt.innerText = `@${username} (${nombre})`;
  if (passInput) {
    passInput.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => passInput.focus(), 100);
  }
}

function cerrarModalCambiarPasswordAdmin() {
  const modal = document.getElementById('modal-cambiar-password-admin');
  if (modal) modal.classList.add('hidden');
}

async function ejecutarCambioPasswordUsuarioAdmin(e) {
  e.preventDefault();
  const id = document.getElementById('input-cambiar-pass-id').value;
  const passInput = document.getElementById('input-cambiar-pass-nueva');
  const nuevaPass = (passInput ? passInput.value : '').trim();

  if (!nuevaPass || nuevaPass.length < 4) {
    alert('La contraseña debe tener al menos 4 caracteres.');
    return;
  }

  const btn = document.getElementById('btn-submit-cambiar-pass');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
  }

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  try {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userActual.rol || 'admin',
        'x-user-username': userActual.username || 'Holger'
      },
      body: JSON.stringify({ password: nuevaPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error cambiando contraseña');

    cerrarModalCambiarPasswordAdmin();
    mostrarToast('¡Contraseña actualizada exitosamente!');
    await cargarListaUsuariosAdmin();
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

async function guardarCorreoRecuperacionAdmin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('input-admin-correo-recuperacion');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email || !email.includes('@')) {
    alert('Por favor ingresa un correo electrónico válido.');
    return;
  }

  const btn = document.getElementById('btn-guardar-correo-admin');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
  }

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  try {
    const res = await fetch('/api/admin/correo-recuperacion', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userActual.rol || 'admin',
        'x-user-username': userActual.username || 'Holger'
      },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error guardando correo');

    mostrarToast(data.mensaje || '¡Correo de recuperación guardado con éxito!');
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
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

// ================= GESTIÓN DE PERSONAL DE APOYO (SIN CUENTA) =================
async function cargarListaPersonalApoyo() {
  const tbody = document.getElementById('tabla-apoyo-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Cargando personal de apoyo...</td></tr>';

  try {
    const res = await fetch('/api/personal-apoyo');
    const colaboradores = await res.json();

    if (!Array.isArray(colaboradores) || colaboradores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No hay colaboradores de apoyo registrados aún. Puedes registrar auxiliares u operarios arriba.</td></tr>';
      return;
    }

    tbody.innerHTML = colaboradores.map(c => {
      let icon = '🛠️';
      let badge = 'bg-teal-950 text-teal-300 border border-teal-800';
      let nombreRol = 'Auxiliar Mecánico';
      if (c.rol === 'operario') {
        icon = '👷';
        badge = 'bg-cyan-950 text-cyan-300 border border-cyan-800';
        nombreRol = 'Operario de Planta';
      } else if (c.rol === 'supernumerario') {
        icon = '⏱️';
        badge = 'bg-sky-950 text-sky-300 border border-sky-800';
        nombreRol = 'Supernumerario';
      }

      return `
        <tr>
          <td class="py-2.5 px-3 font-bold text-white">${escaparHTML(c.nombre)}</td>
          <td class="py-2.5 px-3">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded ${badge}">
              ${icon} ${nombreRol}
            </span>
          </td>
          <td class="py-2.5 px-3 text-slate-300 text-[11px]">${escaparHTML(c.especialidad || '-')}</td>
          <td class="py-2.5 px-3 text-right">
            <button onclick="eliminarPersonalApoyo('${c.id}', '${escaparHTML(c.nombre)}')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-950/40 border border-rose-800/40 rounded hover:bg-rose-900 transition">
              Eliminar
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch(err) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-rose-400">Error al cargar colaboradores de apoyo</td></tr>';
  }
}

async function guardarNuevoPersonalApoyo(e) {
  e.preventDefault();
  const nombre = document.getElementById('apoyo-nombre')?.value.trim();
  const rol = document.getElementById('apoyo-rol')?.value;
  const especialidad = document.getElementById('apoyo-especialidad')?.value.trim();
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');

  if (!nombre) return;

  try {
    const res = await fetch('/api/personal-apoyo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || 'admin',
        'x-user-username': user.username || 'Holger'
      },
      body: JSON.stringify({ nombre, rol, especialidad })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar colaborador');

    mostrarToast(`✅ ${data.mensaje || 'Colaborador registrado'}`);
    document.getElementById('form-crear-apoyo')?.reset();
    await cargarListaPersonalApoyo();
    await cargarMecanicosSelect();
  } catch(err) {
    alert(err.message);
  }
}

async function eliminarPersonalApoyo(id, nombre) {
  if (!confirm(`¿Está seguro de eliminar al colaborador de apoyo ${nombre}?`)) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');

  try {
    const res = await fetch(`/api/personal-apoyo/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': user.rol || 'admin',
        'x-user-username': user.username || 'Holger'
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar');

    mostrarToast(data.mensaje || 'Colaborador eliminado');
    await cargarListaPersonalApoyo();
    await cargarMecanicosSelect();
  } catch(err) {
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

// ================= GESTIÓN DE BITÁCORA DE AVANCES EN PC =================
function mostrarFormularioNuevoAvancePC() {
  const form = document.getElementById('form-nuevo-avance-pc');
  if (!form) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const inTec = document.getElementById('pc-avance-tecnico');
  const inHoras = document.getElementById('pc-avance-horas');
  const inDesc = document.getElementById('pc-avance-desc');
  if (inTec) inTec.value = user.nombre || user.username || '';
  if (inHoras) inHoras.value = '';
  if (inDesc) inDesc.value = '';
  form.classList.remove('hidden');
  if (inDesc) inDesc.focus();
}

function cancelarNuevoAvancePC() {
  const form = document.getElementById('form-nuevo-avance-pc');
  if (form) form.classList.add('hidden');
}

async function guardarNuevoAvancePC() {
  if (!tareaSeleccionadaId) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const inTec = document.getElementById('pc-avance-tecnico')?.value.trim();
  const inHoras = parseFloat(document.getElementById('pc-avance-horas')?.value) || 0;
  const inDesc = document.getElementById('pc-avance-desc')?.value.trim();

  if (!inDesc) {
    alert('Por favor escribe la descripción de lo realizado en este avance.');
    return;
  }

  try {
    const res = await fetch(`/api/tasks/${tareaSeleccionadaId}/avances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || 'admin',
        'x-user-username': user.username || 'admin',
        'x-user-name': inTec || user.nombre || 'Administrador'
      },
      body: JSON.stringify({
        descripcion: inDesc,
        horas_dedicadas: inHoras,
        tecnico_nombre: inTec || user.nombre
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar avance');

    mostrarToast('✅ Avance registrado en la bitácora con éxito');
    cancelarNuevoAvancePC();
    
    // Recargar tareas y actualizar modal
    await cargarTareas(false);
    abrirModalDetalle(tareaSeleccionadaId);
  } catch(err) {
    alert('Error al registrar avance: ' + err.message);
  }
}

async function eliminarAvancePC(tareaId, avanceId) {
  if (!confirm('¿Estás seguro de eliminar este registro de avance de la bitácora?')) return;
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  if (user.rol !== 'admin') {
    alert('Solo el Administrador puede eliminar avances.');
    return;
  }

  try {
    const res = await fetch(`/api/tasks/${tareaId}/avances/${avanceId}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': user.rol
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar avance');

    mostrarToast('Avance eliminado de la bitácora');
    await cargarTareas(false);
    abrirModalDetalle(tareaId);
  } catch(err) {
    alert('Error: ' + err.message);
  }
}

function renderAvancesDetallePC(tarea, esAdmin) {
  const cont = document.getElementById('det-avances-lista');
  if (!cont) return;

  const avances = Array.isArray(tarea.avances) ? tarea.avances : [];
  if (avances.length === 0) {
    cont.innerHTML = `
      <div class="p-3 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-xs">
        <i class="fa-regular fa-clipboard text-slate-600 text-base block mb-1"></i>
        <span>No se han registrado avances intermedios aún para esta orden de trabajo.</span>
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

    const horasTxt = a.horas_dedicadas > 0 ? `<span class="bg-blue-950/70 border border-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">⏱️ ${a.horas_dedicadas}h</span>` : '';
    const fotoThumb = a.foto ? `
      <div class="mt-1.5 cursor-pointer inline-block" onclick="abrirVisorFoto('${a.foto}', 'Avance: ${escaparHTML(a.tecnico_nombre)}'); event.stopPropagation();" title="Ver foto ampliada">
        <img src="${a.foto}" alt="Avance" class="w-16 h-12 object-cover rounded-lg border border-slate-700 hover:border-blue-400 transition shadow">
      </div>
    ` : '';

    const btnElim = esAdmin ? `
      <button type="button" onclick="eliminarAvancePC('${tarea.id}', '${a.id}')" title="Eliminar registro (Admin)" class="text-slate-500 hover:text-rose-400 text-xs p-1 transition">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    ` : '';

    return `
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] px-1.5 py-0.5 rounded border ${badgeRol} font-bold flex items-center gap-1">
              <i class="fa-solid ${iconRol}"></i> ${escaparHTML(a.tecnico_nombre)}
            </span>
            ${horasTxt}
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-500 font-mono">${formatearFechaHora(a.fecha_hora)}</span>
            ${btnElim}
          </div>
        </div>
        <p class="text-slate-300 text-[11px] leading-relaxed">${escaparHTML(a.descripcion)}</p>
        ${fotoThumb}
      </div>
    `;
  }).join('');
}

