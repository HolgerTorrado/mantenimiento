// compras.js - Módulo de Compras, Adquisiciones, Cotizaciones de Proveedores y Control de Stock
let solicitudesCompras = [];
let filtroEstadoCompra = 'todas';
let busquedaCompraTexto = '';
let compraSeleccionadaId = null;
let permisosCompras = {
  roles_permitidos: ['admin', 'compras', 'director'],
  roles_creacion: ['admin', 'compras', 'supervisor', 'sst', 'director'],
  roles_gestion: ['admin', 'compras']
};

// Formato de moneda colombiana (COP)
function formatearCOP(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '$ 0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(valor);
}

// Formato de fecha legible
function formatearFechaLegible(fechaISO) {
  if (!fechaISO) return '-';
  try {
    const d = new Date(fechaISO);
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch(e) {
    return fechaISO;
  }
}

// Obtener datos del usuario actual
function getUsuarioActual() {
  try {
    const raw = localStorage.getItem('siman_user');
    return raw ? JSON.parse(raw) : { rol: 'invitado', nombre: 'Usuario' };
  } catch(e) {
    return { rol: 'invitado', nombre: 'Usuario' };
  }
}

// ==========================================
// CONTROL DE ACCESO Y CAMBIO DE VISTA
// ==========================================

let subseccionComprasMovilActual = 'solicitudes';

function cambiarSubseccionComprasMovil(sub) {
  subseccionComprasMovilActual = sub;
  const vSol = document.getElementById('mob-vista-compras-solicitudes');
  const vDash = document.getElementById('mob-vista-compras-dashboard');
  const btnSol = document.getElementById('mob-btn-sub-solicitudes');
  const btnDash = document.getElementById('mob-btn-sub-dashboard');

  if (sub === 'dashboard') {
    if (vSol) vSol.classList.add('hidden');
    if (vDash) vDash.classList.remove('hidden');
    if (btnDash) btnDash.className = 'py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-indigo-600 text-white shadow';
    if (btnSol) btnSol.className = 'py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 text-slate-400 hover:text-white';
  } else {
    if (vDash) vDash.classList.add('hidden');
    if (vSol) vSol.classList.remove('hidden');
    if (btnSol) btnSol.className = 'py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-cyan-600 text-white shadow';
    if (btnDash) btnDash.className = 'py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 text-slate-400 hover:text-white';
  }
}

async function verificarAccesoModuloCompras() {
  const user = getUsuarioActual();
  try {
    const res = await fetch('/api/compras-permisos');
    if (res.ok) {
      permisosCompras = await res.json();
    }
  } catch(e) {
    console.warn('[Compras] No se pudieron cargar permisos, usando valores por defecto:', e.message);
  }

  const permitidos = permisosCompras.roles_permitidos || ['admin', 'compras', 'director'];
  const tieneAcceso = user.rol === 'admin' || permitidos.includes(user.rol);

  const btnNav = document.getElementById('btn-nav-compras');
  const btnNavMant = document.getElementById('btn-nav-mantenimiento');
  const btnSecCompras = document.getElementById('btn-sec-compras');
  const btnSecTareas = document.getElementById('btn-sec-tareas');
  const btnSecDashboard = document.getElementById('btn-sec-dashboard');
  const btnPermisos = document.getElementById('btn-admin-permisos-compras');
  const btnCrearPrincipal = document.getElementById('btn-crear-tarea-dashboard');

  if (tieneAcceso) {
    if (btnNav) btnNav.classList.remove('hidden');
    if (btnSecCompras) btnSecCompras.classList.remove('hidden');
    if (btnPermisos && user.rol === 'admin') btnPermisos.classList.remove('hidden');

    // Si el rol es compras, aislar estrictamente el módulo de compras
    if (user.rol === 'compras') {
      // En PC: Ocultar pestaña y vista de mantenimiento
      if (btnNavMant) {
        btnNavMant.style.setProperty('display', 'none', 'important');
        btnNavMant.classList.add('hidden');
      }
      const vMant = document.getElementById('vista-mantenimiento');
      if (vMant) {
        vMant.style.setProperty('display', 'none', 'important');
        vMant.classList.add('hidden');
      }
      const vComp = document.getElementById('vista-compras');
      if (vComp) {
        vComp.style.setProperty('display', 'block', 'important');
        vComp.classList.remove('hidden');
      }
      if (btnNav) {
        btnNav.style.setProperty('display', 'flex', 'important');
        btnNav.classList.remove('hidden');
        btnNav.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition bg-cyan-600 text-white shadow-md shadow-cyan-900/30';
      }
      if (btnCrearPrincipal) {
        btnCrearPrincipal.classList.remove('hidden');
        actualizarBotonCrearPrincipal('compras');
      }

      if (typeof cambiarVistaPrincipal === 'function') {
        cambiarVistaPrincipal('compras');
      }

      // En Móvil: Ocultar tareas, dashboard de mantenimiento y pestañas
      if (btnSecTareas) {
        btnSecTareas.style.setProperty('display', 'none', 'important');
        btnSecTareas.classList.add('hidden');
      }
      if (btnSecDashboard) {
        btnSecDashboard.style.setProperty('display', 'none', 'important');
        btnSecDashboard.classList.add('hidden');
      }
      const tabsMovil = document.getElementById('mobile-tabs');
      if (tabsMovil) {
        tabsMovil.style.setProperty('display', 'none', 'important');
        tabsMovil.classList.add('hidden');
      }
      const navSeccionesMovil = document.getElementById('nav-secciones-movil');
      if (navSeccionesMovil) {
        navSeccionesMovil.style.setProperty('display', 'none', 'important');
        navSeccionesMovil.classList.add('hidden');
      }
      const cTareas = document.getElementById('contenedor-tareas-movil');
      if (cTareas) {
        cTareas.style.setProperty('display', 'none', 'important');
        cTareas.classList.add('hidden');
      }
      const cDash = document.getElementById('contenedor-dashboard-movil');
      if (cDash) {
        cDash.style.setProperty('display', 'none', 'important');
        cDash.classList.add('hidden');
      }
      const cComp = document.getElementById('contenedor-compras-movil');
      if (cComp) {
        cComp.style.setProperty('display', 'block', 'important');
        cComp.classList.remove('hidden');
      }

      if (typeof cambiarSeccionMovil === 'function') {
        cambiarSeccionMovil('compras');
      }
    }
  } else {
    if (btnNav) btnNav.classList.add('hidden');
    if (btnSecCompras) btnSecCompras.classList.add('hidden');
    if (btnPermisos) btnPermisos.classList.add('hidden');
  }

  return tieneAcceso;
}

function actualizarBotonCrearPrincipal(vista) {
  const btn = document.getElementById('btn-crear-tarea-dashboard');
  const txt = document.getElementById('texto-btn-crear');
  const txtSm = document.getElementById('texto-btn-crear-sm');
  const icono = document.getElementById('icono-btn-crear');
  if (!btn) return;

  if (vista === 'compras') {
    if (txt) txt.textContent = 'Radicar Solicitud';
    if (txtSm) txtSm.textContent = 'Solicitar';
    if (icono) icono.className = 'fa-solid fa-cart-plus text-xs';
    btn.className = 'flex items-center space-x-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs sm:text-sm font-semibold px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg shadow-md shadow-cyan-600/25 transition-all';
  } else {
    if (txt) txt.textContent = 'Nueva Tarea';
    if (txtSm) txtSm.textContent = 'Crear';
    if (icono) icono.className = 'fa-solid fa-plus text-xs';
    btn.className = 'flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg shadow-md shadow-emerald-600/25 transition-all';
  }
}

function accionBotonCrearPrincipal() {
  const vistaCompras = document.getElementById('vista-compras');
  const user = getUsuarioActual();

  if (user.rol === 'compras' || (vistaCompras && !vistaCompras.classList.contains('hidden'))) {
    abrirModalNuevaCompra();
  } else {
    if (typeof abrirModalCrear === 'function') {
      abrirModalCrear();
    }
  }
}

function cambiarVistaPrincipal(vista) {
  const user = getUsuarioActual();
  if (user.rol === 'compras') {
    vista = 'compras';
  }

  const vistaMantenimiento = document.getElementById('vista-mantenimiento');
  const vistaCompras = document.getElementById('vista-compras');
  const btnMantenimiento = document.getElementById('btn-nav-mantenimiento');
  const btnCompras = document.getElementById('btn-nav-compras');

  if (vista === 'compras') {
    if (vistaMantenimiento) {
      vistaMantenimiento.style.setProperty('display', 'none', 'important');
      vistaMantenimiento.classList.add('hidden');
    }
    if (vistaCompras) {
      vistaCompras.style.setProperty('display', 'block', 'important');
      vistaCompras.classList.remove('hidden');
    }

    if (btnCompras) {
      btnCompras.style.setProperty('display', 'flex', 'important');
      btnCompras.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition bg-cyan-600 text-white shadow-md shadow-cyan-900/30';
    }
    if (btnMantenimiento) {
      if (user.rol === 'compras') {
        btnMantenimiento.style.setProperty('display', 'none', 'important');
        btnMantenimiento.classList.add('hidden');
      } else {
        btnMantenimiento.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80';
      }
    }

    actualizarBotonCrearPrincipal('compras');
    cargarCompras();
  } else {
    if (user.rol === 'compras') return;

    if (vistaCompras) {
      vistaCompras.classList.add('hidden');
      vistaCompras.style.display = 'none';
    }
    if (vistaMantenimiento) {
      vistaMantenimiento.classList.remove('hidden');
      vistaMantenimiento.style.display = 'block';
    }

    if (btnMantenimiento) {
      btnMantenimiento.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition bg-emerald-600 text-white shadow-md shadow-emerald-900/30';
    }
    if (btnCompras) {
      btnCompras.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80';
    }

    actualizarBotonCrearPrincipal('mantenimiento');
  }
}


// ==========================================
// CARGA Y RENDERIZADO DE COMPRAS
// ==========================================

async function cargarCompras() {
  const user = getUsuarioActual();
  try {
    const res = await fetch('/api/compras', {
      headers: {
        'x-user-role': user.rol || '',
        'x-user-name': user.nombre || ''
      }
    });

    if (res.status === 403) {
      console.warn('[Compras] Acceso denegado');
      return;
    }

    if (!res.ok) throw new Error('Error al consultar compras');

    solicitudesCompras = await res.json();
    actualizarMetricasCompras();
    renderizarCompras();
  } catch(err) {
    console.error('[Compras] Error al cargar solicitudes:', err);
  }
}

function actualizarBarraPipe(prefix, valor, total) {
  const txt = document.getElementById(`${prefix}-txt`);
  const bar = document.getElementById(`${prefix}-bar`);
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  if (txt) txt.innerText = `${valor} (${pct}%)`;
  if (bar) bar.style.width = `${pct}%`;
}

function renderizarTopProveedores(compras) {
  const contenedorPC = document.getElementById('compras-top-proveedores-lista');
  const proveedoresMap = {};

  compras.forEach(c => {
    if (c.proveedor_comprado) {
      const p = c.proveedor_comprado.trim();
      if (!proveedoresMap[p]) {
        proveedoresMap[p] = { count: 0, total: 0 };
      }
      proveedoresMap[p].count += 1;
      proveedoresMap[p].total += (Number(c.valor_compra_total) || 0);
    }
  });

  const ranking = Object.entries(proveedoresMap).sort((a, b) => b[1].total - a[1].total);

  if (contenedorPC) {
    if (ranking.length === 0) {
      contenedorPC.innerHTML = '<p class="text-slate-500 italic text-center py-4 text-[11px]">No hay compras adjudicadas aún.</p>';
    } else {
      contenedorPC.innerHTML = ranking.slice(0, 4).map(([nombre, data], idx) => `
        <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
          <div class="flex items-center gap-2 truncate pr-2">
            <span class="w-5 h-5 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">${idx + 1}</span>
            <div class="truncate">
              <span class="font-bold text-white text-xs block truncate" title="${nombre}">${nombre}</span>
              <span class="text-[10px] text-slate-400">${data.count} ${data.count === 1 ? 'orden' : 'órdenes'}</span>
            </div>
          </div>
          <span class="font-mono font-extrabold text-cyan-300 text-xs flex-shrink-0">${formatearCOP(data.total)}</span>
        </div>
      `).join('');
    }
  }
}

function renderizarTopProveedoresMovil(compras) {
  const contenedorMovil = document.getElementById('mob-compras-top-proveedores');
  if (!contenedorMovil) return;

  const proveedoresMap = {};
  compras.forEach(c => {
    if (c.proveedor_comprado) {
      const p = c.proveedor_comprado.trim();
      if (!proveedoresMap[p]) {
        proveedoresMap[p] = { count: 0, total: 0 };
      }
      proveedoresMap[p].count += 1;
      proveedoresMap[p].total += (Number(c.valor_compra_total) || 0);
    }
  });

  const ranking = Object.entries(proveedoresMap).sort((a, b) => b[1].total - a[1].total);
  if (ranking.length === 0) {
    contenedorMovil.innerHTML = '<p class="text-slate-500 italic text-center py-2 text-[11px]">Sin compras adjudicadas aún.</p>';
  } else {
    contenedorMovil.innerHTML = ranking.slice(0, 3).map(([nombre, data], idx) => `
      <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-700/40 text-xs">
        <span class="truncate font-semibold text-slate-200">${nombre}</span>
        <span class="font-mono font-bold text-cyan-300 flex-shrink-0 ml-2">${formatearCOP(data.total)}</span>
      </div>
    `).join('');
  }
}

function actualizarMetricasCompras() {
  const total = solicitudesCompras.length;
  const soloSolicitadas = solicitudesCompras.filter(c => c.estado === 'solicitado' && (!c.cotizaciones || c.cotizaciones.length === 0)).length;
  const cotizando = solicitudesCompras.filter(c => c.estado === 'cotizando' || (!c.proveedor_comprado && (c.cotizaciones || []).length > 0)).length;
  const compradas = solicitudesCompras.filter(c => !!c.proveedor_comprado).length;
  const porPagar = solicitudesCompras.filter(c => c.proveedor_comprado && c.estado_pago !== 'pagado').length;
  const pagadas = solicitudesCompras.filter(c => c.proveedor_comprado && c.estado_pago === 'pagado').length;
  const enTransito = solicitudesCompras.filter(c => c.proveedor_comprado && !c.llego_a_planta).length;
  const finalizadas = solicitudesCompras.filter(c => !!c.llego_a_planta || c.estado === 'finalizado').length;

  // Montos Financieros en COP
  const inversionTotal = solicitudesCompras.reduce((sum, c) => sum + (Number(c.valor_compra_total) || 0), 0);
  const totalPagado = solicitudesCompras.filter(c => c.estado_pago === 'pagado').reduce((sum, c) => sum + (Number(c.valor_compra_total) || 0), 0);
  const totalPorPagar = solicitudesCompras.filter(c => c.proveedor_comprado && c.estado_pago !== 'pagado').reduce((sum, c) => sum + (Number(c.valor_compra_total) || 0), 0);
  const totalCotizaciones = solicitudesCompras.reduce((sum, c) => sum + (Array.isArray(c.cotizaciones) ? c.cotizaciones.length : 0), 0);

  // Actualizar KPIs PC
  const elTotal = document.getElementById('compras-kpi-total');
  const elCotizando = document.getElementById('compras-kpi-cotizando');
  const elAdjudicadas = document.getElementById('compras-kpi-adjudicadas');
  const elPorPagar = document.getElementById('compras-kpi-por-pagar');
  const elEnTransito = document.getElementById('compras-kpi-en-transito');
  const elFinalizadas = document.getElementById('compras-kpi-finalizadas');

  if (elTotal) elTotal.innerText = total;
  if (elCotizando) elCotizando.innerText = cotizando + soloSolicitadas;
  if (elAdjudicadas) elAdjudicadas.innerText = compradas;
  if (elPorPagar) elPorPagar.innerText = porPagar;
  if (elEnTransito) elEnTransito.innerText = enTransito;
  if (elFinalizadas) elFinalizadas.innerText = finalizadas;

  // Actualizar Finanzas PC
  const elInv = document.getElementById('compras-kpi-inversion-total');
  const elPag = document.getElementById('compras-kpi-monto-pagado');
  const elPorPag = document.getElementById('compras-kpi-monto-por-pagar');
  const elTotalCots = document.getElementById('compras-kpi-total-cots');

  if (elInv) elInv.innerText = formatearCOP(inversionTotal);
  if (elPag) elPag.innerText = formatearCOP(totalPagado);
  if (elPorPag) elPorPag.innerText = formatearCOP(totalPorPagar);
  if (elTotalCots) elTotalCots.innerText = totalCotizaciones;

  // Pipeline PC
  actualizarBarraPipe('pipe-solicitadas', total, total);
  actualizarBarraPipe('pipe-cotizando', cotizando + compradas + finalizadas, total);
  actualizarBarraPipe('pipe-compradas', compradas, total);
  actualizarBarraPipe('pipe-pagadas', pagadas, total);
  actualizarBarraPipe('pipe-finalizadas', finalizadas, total);

  // Top Proveedores PC
  renderizarTopProveedores(solicitudesCompras);

  // Actualizar KPIs Móvil
  const mTotal = document.getElementById('mob-compras-kpi-total');
  const mCotizando = document.getElementById('mob-compras-kpi-cotizando');
  const mAdjudicadas = document.getElementById('mob-compras-kpi-adjudicadas');
  const mPorPagar = document.getElementById('mob-compras-kpi-por-pagar');
  const mEnTransito = document.getElementById('mob-compras-kpi-en-transito');
  const mFinalizadas = document.getElementById('mob-compras-kpi-finalizadas');

  if (mTotal) mTotal.innerText = total;
  if (mCotizando) mCotizando.innerText = cotizando + soloSolicitadas;
  if (mAdjudicadas) mAdjudicadas.innerText = compradas;
  if (mPorPagar) mPorPagar.innerText = porPagar;
  if (mEnTransito) mEnTransito.innerText = enTransito;
  if (mFinalizadas) mFinalizadas.innerText = finalizadas;

  // Actualizar Finanzas Móvil
  const mInv = document.getElementById('mob-compras-kpi-inversion-total');
  const mPag = document.getElementById('mob-compras-kpi-monto-pagado');
  const mPorPag = document.getElementById('mob-compras-kpi-monto-por-pagar');

  if (mInv) mInv.innerText = formatearCOP(inversionTotal);
  if (mPag) mPag.innerText = formatearCOP(totalPagado);
  if (mPorPag) mPorPag.innerText = formatearCOP(totalPorPagar);

  // Pipeline Móvil
  actualizarBarraPipe('mob-pipe-solicitadas', total, total);
  actualizarBarraPipe('mob-pipe-cotizando', cotizando + compradas + finalizadas, total);
  actualizarBarraPipe('mob-pipe-compradas', compradas, total);
  actualizarBarraPipe('mob-pipe-pagadas', pagadas, total);
  actualizarBarraPipe('mob-pipe-finalizadas', finalizadas, total);

  // Top Proveedores Móvil
  renderizarTopProveedoresMovil(solicitudesCompras);

  // Badges numéricos
  const badgeConteo = document.getElementById('badge-compras-conteo');
  if (badgeConteo) badgeConteo.innerText = cotizando + soloSolicitadas > 0 ? cotizando + soloSolicitadas : total;

  const mobBadge = document.getElementById('mob-badge-compras');
  if (mobBadge) {
    const val = cotizando + soloSolicitadas > 0 ? cotizando + soloSolicitadas : total;
    mobBadge.innerText = val;
    if (val > 0) mobBadge.classList.remove('hidden');
    else mobBadge.classList.add('hidden');
  }

  const mobSubCount = document.getElementById('mob-count-solicitudes-badge');
  if (mobSubCount) mobSubCount.innerText = total;
}

function filtrarEstadoCompra(estado, btn) {
  filtroEstadoCompra = estado;
  const botones = document.querySelectorAll('.compras-tab-btn');
  botones.forEach(b => {
    b.className = 'compras-tab-btn flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition text-slate-400 hover:text-white hover:bg-slate-700/60';
  });
  if (btn) {
    btn.className = 'compras-tab-btn flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-cyan-600 text-white shadow-md';
  }
  renderizarCompras();
}

function filtrarBusquedaCompras(texto) {
  busquedaCompraTexto = (texto || '').toLowerCase().trim();
  renderizarCompras();
}

function renderizarCompras() {
  const contenedor = document.getElementById('lista-solicitudes-compras');
  if (!contenedor) return;

  let filtradas = [...solicitudesCompras];

  // Filtro por estado del ciclo de compras
  if (filtroEstadoCompra !== 'todas') {
    if (filtroEstadoCompra === 'solicitado') {
      filtradas = filtradas.filter(c => c.estado === 'solicitado');
    } else if (filtroEstadoCompra === 'cotizando') {
      filtradas = filtradas.filter(c => c.estado === 'cotizando' || (!c.proveedor_comprado && (c.cotizaciones || []).length > 0));
    } else if (filtroEstadoCompra === 'comprado') {
      filtradas = filtradas.filter(c => !!c.proveedor_comprado);
    } else if (filtroEstadoCompra === 'por_pagar') {
      filtradas = filtradas.filter(c => c.proveedor_comprado && c.estado_pago !== 'pagado');
    } else if (filtroEstadoCompra === 'en_transito') {
      filtradas = filtradas.filter(c => c.proveedor_comprado && !c.llego_a_planta);
    } else if (filtroEstadoCompra === 'finalizado') {
      filtradas = filtradas.filter(c => !!c.llego_a_planta || c.estado === 'finalizado');
    }
  }

  // Filtro por texto de búsqueda
  if (busquedaCompraTexto) {
    filtradas = filtradas.filter(c => {
      return (c.id && c.id.toLowerCase().includes(busquedaCompraTexto)) ||
             (c.item && c.item.toLowerCase().includes(busquedaCompraTexto)) ||
             (c.equipo && c.equipo.toLowerCase().includes(busquedaCompraTexto)) ||
             (c.proveedor_comprado && c.proveedor_comprado.toLowerCase().includes(busquedaCompraTexto)) ||
             (c.numero_factura_oc && c.numero_factura_oc.toLowerCase().includes(busquedaCompraTexto)) ||
             (c.solicitado_por && c.solicitado_por.toLowerCase().includes(busquedaCompraTexto));
    });
  }

  if (filtradas.length === 0) {
    contenedor.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 bg-slate-800/40 rounded-2xl border border-slate-700/60 p-6">
        <i class="fa-solid fa-boxes-packing text-4xl mb-3 text-cyan-400/60"></i>
        <h3 class="text-base font-bold text-white mb-1">No se encontraron solicitudes de compra</h3>
        <p class="text-xs text-slate-400 max-w-md mx-auto mb-4">No hay ítems que coincidan con el filtro seleccionado. Puedes radicar una nueva solicitud con el botón superior.</p>
        <button onclick="abrirModalNuevaCompra()" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-cyan-600/25">
          <i class="fa-solid fa-plus mr-1"></i> Radicar Solicitud
        </button>
      </div>
    `;
    return;
  }

  const user = getUsuarioActual();
  const esAdmin = user.rol === 'admin';
  const esGestionCompras = esAdmin || user.rol === 'compras';

  contenedor.innerHTML = filtradas.map(c => {
    // Badges de estado coherentes con el ciclo real de compras
    let badgeEstado = '';
    if (c.llego_a_planta || c.estado === 'finalizado') {
      badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"><i class="fa-solid fa-circle-check mr-1"></i>Entregado en Planta</span>';
    } else if (c.proveedor_comprado && !c.llego_a_planta) {
      badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-300 border border-orange-500/30"><i class="fa-solid fa-truck-fast mr-1"></i>En Tránsito</span>';
    } else if (c.proveedor_comprado) {
      badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30"><i class="fa-solid fa-bag-shopping mr-1"></i>Comprado</span>';
    } else if (c.estado === 'cotizando' || (c.cotizaciones && c.cotizaciones.length > 0)) {
      badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30"><i class="fa-solid fa-comments-dollar mr-1"></i>Cotizando</span>';
    } else {
      badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30"><i class="fa-solid fa-clock mr-1"></i>Solicitado</span>';
    }

    // Badge prioridad
    let badgePrioridad = '';
    if (c.prioridad === 'urgente') {
      badgePrioridad = '<span class="text-[10px] font-extrabold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/40"><i class="fa-solid fa-triangle-exclamation mr-1"></i>URGENTE</span>';
    } else if (c.prioridad === 'alta') {
      badgePrioridad = '<span class="text-[10px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">Alta</span>';
    } else {
      badgePrioridad = `<span class="text-[10px] font-medium text-slate-400 capitalize">${c.prioridad || 'Media'}</span>`;
    }

    // Estado de pago
    let badgePago = '';
    if (c.estado_pago === 'pagado') {
      badgePago = '<span class="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Pagado</span>';
    } else if (c.proveedor_comprado) {
      badgePago = '<span class="text-[10px] font-bold text-amber-400 flex items-center gap-1"><i class="fa-solid fa-clock"></i> Pendiente Pago</span>';
    } else {
      badgePago = '<span class="text-[10px] text-slate-500">Por definir</span>';
    }

    // Estado llegada a planta
    let badgeLlegada = '';
    if (c.llego_a_planta) {
      badgeLlegada = `<span class="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><i class="fa-solid fa-check-double"></i> En Planta (${c.recibido_por || 'Almacén'})</span>`;
    } else if (c.proveedor_comprado) {
      badgeLlegada = '<span class="text-[10px] font-semibold text-orange-400 flex items-center gap-1"><i class="fa-solid fa-truck"></i> En camino a planta</span>';
    } else {
      badgeLlegada = '<span class="text-[10px] text-slate-500">Sin despachar</span>';
    }

    const numCotizaciones = (c.cotizaciones || []).length;
    const tieneCots = numCotizaciones > 0;
    const tieneProveedor = !!c.proveedor_comprado;
    const estaPagado = c.estado_pago === 'pagado';
    const estaEnPlanta = !!c.llego_a_planta;

    return `
      <div class="bg-slate-800/90 border border-slate-700/80 hover:border-cyan-500/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 shadow-lg hover:shadow-cyan-950/20">
        
        <div>
          <!-- Encabezado de la tarjeta -->
          <div class="flex items-start justify-between gap-2 mb-2.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-mono text-xs font-extrabold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">${c.id}</span>
              ${badgeEstado}
              ${badgePrioridad}
            </div>
            <span class="text-[10px] text-slate-400 flex-shrink-0">${formatearFechaLegible(c.fecha_solicitud).split(',')[0]}</span>
          </div>

          <!-- Ítem y equipo -->
          <h3 class="font-bold text-base text-white leading-snug mb-1">${c.item}</h3>
          
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 mb-2.5">
            <span class="flex items-center gap-1 text-slate-400">
              <i class="fa-solid fa-gears text-emerald-400"></i> ${c.equipo}
            </span>
            ${c.tarea_id ? `<span class="bg-slate-700/80 text-emerald-300 px-1.5 py-0.2 rounded text-[10px] font-mono">Tarea: ${c.tarea_id}</span>` : ''}
            <span class="text-white font-semibold">
              Cant: <strong class="text-cyan-300 font-extrabold">${c.cantidad_solicitada}</strong> ${c.unidad}
            </span>
          </div>

          <!-- Justificación o motivo -->
          ${c.justificacion ? `<p class="text-xs text-slate-400 line-clamp-2 mb-3 bg-slate-900/40 p-2 rounded-lg border border-slate-700/40 italic">"${c.justificacion}"</p>` : ''}

          <!-- Roadmap visual del ciclo de compras (5 Pasos) -->
          <div class="bg-slate-900/80 border border-slate-700/60 rounded-xl p-2.5 my-2.5">
            <div class="flex items-center justify-between text-[10px] text-slate-400 font-semibold mb-1.5">
              <span>Progreso de Adquisición</span>
              <span class="${estaEnPlanta ? 'text-emerald-400 font-bold' : 'text-cyan-300'}">
                ${estaEnPlanta ? '✅ 100% Finalizado' : estaPagado ? '80% Pagado' : tieneProveedor ? '60% Adjudicado' : tieneCots ? '40% Cotizando' : '20% Radicado'}
              </span>
            </div>
            <div class="grid grid-cols-5 gap-1 text-[9px] text-center font-bold">
              <div class="py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30" title="1. Solicitud radicada">1. Pedido</div>
              <div class="py-1 rounded ${tieneCots || tieneProveedor ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-500'}" title="2. Cotizaciones de proveedores">2. Cotizado</div>
              <div class="py-1 rounded ${tieneProveedor ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-500'}" title="3. Proveedor adjudicado y O.C.">3. Comprado</div>
              <div class="py-1 rounded ${estaPagado ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}" title="4. Pago realizado">4. Pagado</div>
              <div class="py-1 rounded ${estaEnPlanta ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-500'}" title="5. Entregado en planta">5. En Planta</div>
            </div>
          </div>

          <!-- Si ya llegó a planta: Cartel verde de Trabajo de Compras Finalizado -->
          ${estaEnPlanta ? `
            <div class="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-2.5 my-2.5 text-xs flex items-center gap-2.5 shadow-sm">
              <div class="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm flex-shrink-0">
                <i class="fa-solid fa-circle-check"></i>
              </div>
              <div class="truncate">
                <span class="font-extrabold text-emerald-300 block text-[11px] leading-tight">TRABAJO DE COMPRAS FINALIZADO</span>
                <span class="text-[10px] text-slate-300 block truncate">Entregado en planta a: <strong>${c.recibido_por || 'Almacén'}</strong></span>
              </div>
            </div>
          ` : ''}

          <!-- Sección de Proveedor y Compra -->
          <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50 space-y-2 mb-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-medium">Cotizaciones:</span>
              <span class="text-slate-200 font-semibold">
                ${numCotizaciones > 0 ? `<i class="fa-solid fa-file-invoice-dollar text-blue-400"></i> ${numCotizaciones} evaluadas` : '<span class="text-slate-500 italic">Sin cotizaciones aún</span>'}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-medium">Proveedor:</span>
              <span class="text-white font-bold truncate max-w-[180px]" title="${c.proveedor_comprado || 'Por adjudicar'}">
                ${c.proveedor_comprado || '<span class="text-slate-500 font-normal">Por adjudicar</span>'}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-medium">Valor Total:</span>
              <span class="font-extrabold text-cyan-300 font-mono">${c.valor_compra_total ? formatearCOP(c.valor_compra_total) : '-'}</span>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-700/50 text-[11px]">
              <div>
                <span class="text-slate-400 block text-[10px]">Pago:</span>
                ${badgePago}
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">Recepción Planta:</span>
                ${badgeLlegada}
              </div>
            </div>
          </div>
        </div>

        <!-- Acciones en pie de tarjeta (Sin consumo de stock) -->
        <div class="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-1.5">
          <div class="flex items-center gap-1.5">
            <button onclick="abrirModalDetalleCompra('${c.id}')" title="Ver cotizaciones, factura e historial" class="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1">
              <i class="fa-solid fa-eye text-cyan-400"></i>
              <span>Detalles</span>
            </button>

            ${esGestionCompras ? `
              <button onclick="abrirModalGestionarCompra('${c.id}')" title="Gestionar cotizaciones, proveedor, pago y llegada" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1 shadow">
                <i class="fa-solid fa-pen-to-square"></i>
                <span>Gestionar</span>
              </button>
            ` : ''}
          </div>

          ${esAdmin ? `
            <button onclick="eliminarSolicitudCompra('${c.id}')" title="Eliminar solicitud" class="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          ` : ''}
        </div>

      </div>
    `;
  }).join('');
}

// ==========================================
// MODAL: NUEVA SOLICITUD DE COMPRA
// ==========================================

function abrirModalNuevaCompra() {
  const modal = document.getElementById('modal-nueva-compra');
  if (!modal) return;

  document.getElementById('form-nueva-compra').reset();
  document.getElementById('compra-foto-preview').classList.add('hidden');
  document.getElementById('compra-foto-preview-img').src = '';
  document.getElementById('compra-foto-base64').value = '';

  // Cargar lista de tareas en select
  const selectTarea = document.getElementById('compra-tarea-id');
  if (selectTarea) {
    selectTarea.innerHTML = '<option value="">-- Ninguna (Compra general / Stock de planta) --</option>';
    if (window.todasLasTareas && Array.isArray(window.todasLasTareas)) {
      window.todasLasTareas.forEach(t => {
        selectTarea.innerHTML += `<option value="${t.id}">${t.id} - ${t.equipo} (${t.titulo || t.tipo})</option>`;
      });
    }
  }

  modal.classList.remove('hidden');
}

function cerrarModalNuevaCompra() {
  const modal = document.getElementById('modal-nueva-compra');
  if (modal) modal.classList.add('hidden');
}

async function guardarNuevaCompra(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-nueva-compra');
  const user = getUsuarioActual();

  const item = document.getElementById('compra-item').value;
  const equipo = document.getElementById('compra-equipo').value;
  const tarea_id = document.getElementById('compra-tarea-id').value;
  const cantidad_solicitada = document.getElementById('compra-cantidad').value;
  const unidad = document.getElementById('compra-unidad').value;
  const prioridad = document.getElementById('compra-prioridad').value;
  const justificacion = document.getElementById('compra-justificacion').value;
  const foto_muestra = document.getElementById('compra-foto-base64').value;

  if (!item || !item.trim()) {
    alert('Por favor ingresa el nombre del repuesto o ítem a solicitar.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';

  try {
    const res = await fetch('/api/compras', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || '',
        'x-user-name': user.nombre || ''
      },
      body: JSON.stringify({
        item,
        equipo,
        tarea_id,
        cantidad_solicitada,
        unidad,
        prioridad,
        justificacion,
        foto_muestra
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar solicitud');

    cerrarModalNuevaCompra();
    await cargarCompras();
  } catch(err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Radicar Solicitud';
  }
}

// Vista previa de imagen en solicitud de compra
function procesarFotoMuestraCompra(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    document.getElementById('compra-foto-base64').value = base64;
    document.getElementById('compra-foto-preview-img').src = base64;
    document.getElementById('compra-foto-preview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// ==========================================
// MODAL: GESTIÓN DE COMPRA Y COTIZACIONES
// ==========================================

function abrirModalGestionarCompra(id) {
  const c = solicitudesCompras.find(x => x.id === id);
  if (!c) return;
  compraSeleccionadaId = id;

  document.getElementById('gestion-id-badge').innerText = c.id;
  document.getElementById('gestion-item-titulo').innerText = c.item;
  document.getElementById('gestion-solicitado-info').innerText = `Solicitado por ${c.solicitado_por} (${c.solicitado_por_rol}) el ${formatearFechaLegible(c.fecha_solicitud)}`;

  // Rellenar formulario
  document.getElementById('gestion-proveedor').value = c.proveedor_comprado || '';
  document.getElementById('gestion-factura').value = c.numero_factura_oc || '';
  document.getElementById('gestion-valor-total').value = c.valor_compra_total || '';
  document.getElementById('gestion-estado-pago').value = c.estado_pago || 'pendiente';
  document.getElementById('gestion-pago-ref').value = c.comprobante_pago_ref || '';
  document.getElementById('gestion-llego-planta').checked = !!c.llego_a_planta;
  document.getElementById('gestion-recibido-por').value = c.recibido_por || '';
  document.getElementById('gestion-cantidad-recibida').value = c.cantidad_recibida || c.cantidad_solicitada || 1;
  document.getElementById('gestion-estado-general').value = c.estado || 'solicitado';
  document.getElementById('gestion-nota-cambio').value = '';

  // Renderizar tabla de cotizaciones cargadas
  renderizarCotizacionesEnGestion(c);

  document.getElementById('modal-gestionar-compra').classList.remove('hidden');
}

function cerrarModalGestionarCompra() {
  document.getElementById('modal-gestionar-compra').classList.add('hidden');
  compraSeleccionadaId = null;
}

function renderizarCotizacionesEnGestion(c) {
  const contenedor = document.getElementById('gestion-lista-cotizaciones');
  if (!contenedor) return;

  const cotizaciones = c.cotizaciones || [];
  if (cotizaciones.length === 0) {
    contenedor.innerHTML = '<p class="text-xs text-slate-500 italic p-3 text-center bg-slate-900/50 rounded-xl">No hay cotizaciones cargadas para este repuesto.</p>';
    return;
  }

  contenedor.innerHTML = cotizaciones.map((cot, idx) => `
    <div class="bg-slate-900/80 border ${cot.seleccionada ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-slate-700/60'} rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
      <div>
        <div class="flex items-center gap-2">
          <span class="font-bold text-white text-xs">${cot.proveedor}</span>
          ${cot.seleccionada ? '<span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">GANADORA</span>' : ''}
        </div>
        <div class="text-[11px] text-slate-400 space-x-2 mt-0.5">
          <span>Unit: <strong class="text-cyan-300">${formatearCOP(cot.precio_unitario)}</strong></span>
          <span>Total: <strong class="text-emerald-300">${formatearCOP(cot.precio_total)}</strong></span>
          ${cot.tiempo_entrega ? `<span>Entrega: ${cot.tiempo_entrega}</span>` : ''}
        </div>
        ${cot.contacto ? `<p class="text-[10px] text-slate-400 mt-0.5"><i class="fa-solid fa-phone text-slate-500"></i> ${cot.contacto}</p>` : ''}
        ${cot.notas ? `<p class="text-[10px] text-slate-400 mt-0.5 italic">Nota: ${cot.notas}</p>` : ''}
      </div>

      <div class="flex items-center gap-1.5 flex-shrink-0">
        ${!cot.seleccionada ? `
          <button type="button" onclick="seleccionarCotizacionGanadora(${idx})" class="px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-800 text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-500/40 transition">
            <i class="fa-solid fa-check mr-1"></i> Seleccionar
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function seleccionarCotizacionGanadora(idx) {
  const c = solicitudesCompras.find(x => x.id === compraSeleccionadaId);
  if (!c || !c.cotizaciones || !c.cotizaciones[idx]) return;

  c.cotizaciones.forEach((cot, i) => {
    cot.seleccionada = (i === idx);
  });

  const ganadora = c.cotizaciones[idx];
  document.getElementById('gestion-proveedor').value = ganadora.proveedor;
  document.getElementById('gestion-valor-total').value = ganadora.precio_total;

  renderizarCotizacionesEnGestion(c);
}

// Subformulario para añadir cotización
function toggleFormAgregarCotizacion() {
  const box = document.getElementById('box-agregar-cotizacion');
  if (box) box.classList.toggle('hidden');
}

async function guardarCotizacionRapida() {
  if (!compraSeleccionadaId) return;
  const proveedor = document.getElementById('nueva-cot-proveedor').value;
  const precio_unitario = document.getElementById('nueva-cot-unitario').value;
  const precio_total = document.getElementById('nueva-cot-total').value;
  const tiempo_entrega = document.getElementById('nueva-cot-entrega').value;
  const contacto = document.getElementById('nueva-cot-contacto').value;
  const notas = document.getElementById('nueva-cot-notas').value;
  const seleccionada = document.getElementById('nueva-cot-seleccionada').checked;

  if (!proveedor || !proveedor.trim()) {
    alert('Ingresa el nombre del proveedor cotizante');
    return;
  }

  const user = getUsuarioActual();

  try {
    const res = await fetch(`/api/compras/${compraSeleccionadaId}/cotizaciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || '',
        'x-user-name': user.nombre || ''
      },
      body: JSON.stringify({
        proveedor,
        precio_unitario,
        precio_total,
        tiempo_entrega,
        contacto,
        notas,
        seleccionada
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar cotización');

    // Limpiar campos
    document.getElementById('nueva-cot-proveedor').value = '';
    document.getElementById('nueva-cot-unitario').value = '';
    document.getElementById('nueva-cot-total').value = '';
    document.getElementById('nueva-cot-entrega').value = '';
    document.getElementById('nueva-cot-contacto').value = '';
    document.getElementById('nueva-cot-notas').value = '';
    document.getElementById('nueva-cot-seleccionada').checked = false;
    toggleFormAgregarCotizacion();

    // Actualizar datos en memoria y vista
    const c = data.compra;
    const idx = solicitudesCompras.findIndex(x => x.id === c.id);
    if (idx !== -1) solicitudesCompras[idx] = c;

    if (c.proveedor_comprado) document.getElementById('gestion-proveedor').value = c.proveedor_comprado;
    if (c.valor_compra_total) document.getElementById('gestion-valor-total').value = c.valor_compra_total;

    renderizarCotizacionesEnGestion(c);
    actualizarMetricasCompras();
    renderizarCompras();
  } catch(err) {
    alert('Error: ' + err.message);
  }
}

async function guardarGestionCompra(e) {
  e.preventDefault();
  if (!compraSeleccionadaId) return;

  const btn = document.getElementById('btn-guardar-gestion-compra');
  const user = getUsuarioActual();

  const c = solicitudesCompras.find(x => x.id === compraSeleccionadaId);
  const cotizacionesActuales = c ? c.cotizaciones : [];

  const proveedor_comprado = document.getElementById('gestion-proveedor').value;
  const numero_factura_oc = document.getElementById('gestion-factura').value;
  const valor_compra_total = document.getElementById('gestion-valor-total').value;
  const estado_pago = document.getElementById('gestion-estado-pago').value;
  const comprobante_pago_ref = document.getElementById('gestion-pago-ref').value;
  const llego_a_planta = document.getElementById('gestion-llego-planta').checked;
  const recibido_por = document.getElementById('gestion-recibido-por').value;
  const cantidad_recibida = document.getElementById('gestion-cantidad-recibida').value;
  const estado = document.getElementById('gestion-estado-general').value;
  const nota_cambio = document.getElementById('gestion-nota-cambio').value;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Actualizando...';

  try {
    const res = await fetch(`/api/compras/${compraSeleccionadaId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || '',
        'x-user-name': user.nombre || ''
      },
      body: JSON.stringify({
        cotizaciones: cotizacionesActuales,
        proveedor_comprado,
        numero_factura_oc,
        valor_compra_total,
        estado_pago,
        comprobante_pago_ref,
        llego_a_planta,
        recibido_por,
        cantidad_recibida,
        estado,
        nota_cambio
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar');

    cerrarModalGestionarCompra();
    await cargarCompras();
  } catch(err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Guardar Cambios';
  }
}

// ==========================================
// MODAL: REGISTRAR CONSUMO DE STOCK
// ==========================================

function abrirModalConsumoStock(id) {
  const modal = document.getElementById('modal-consumir-stock');
  if (!modal) return;

  const selectItem = document.getElementById('consumo-compra-id');
  selectItem.innerHTML = '';

  const disponibles = solicitudesCompras.filter(c => (c.cantidad_en_stock || 0) > 0);
  if (disponibles.length === 0) {
    alert('No hay repuestos con stock disponible en este momento.');
    return;
  }

  disponibles.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = `${c.id} - ${c.item} (Disp: ${c.cantidad_en_stock} ${c.unidad}) - ${c.equipo}`;
    if (id && c.id === id) opt.selected = true;
    selectItem.appendChild(opt);
  });

  actualizarInfoConsumoSeleccionado();

  const user = getUsuarioActual();
  document.getElementById('consumo-responsable').value = user.nombre || 'Diego Chamorro';
  document.getElementById('consumo-cantidad').value = 1;
  document.getElementById('consumo-observaciones').value = '';

  modal.classList.remove('hidden');
}

function cerrarModalConsumoStock() {
  document.getElementById('modal-consumir-stock').classList.add('hidden');
}

function actualizarInfoConsumoSeleccionado() {
  const select = document.getElementById('consumo-compra-id');
  const id = select.value;
  const c = solicitudesCompras.find(x => x.id === id);
  if (!c) return;

  document.getElementById('consumo-stock-disp-txt').innerText = `${c.cantidad_en_stock} ${c.unidad} disponibles`;
  document.getElementById('consumo-equipo').value = c.equipo || '';

  const inputCant = document.getElementById('consumo-cantidad');
  inputCant.max = c.cantidad_en_stock || 1;
}

async function guardarConsumoStock(e) {
  e.preventDefault();
  const id = document.getElementById('consumo-compra-id').value;
  const cantidad = document.getElementById('consumo-cantidad').value;
  const equipo = document.getElementById('consumo-equipo').value;
  const consumido_por = document.getElementById('consumo-responsable').value;
  const observaciones = document.getElementById('consumo-observaciones').value;

  const btn = document.getElementById('btn-guardar-consumo');
  const user = getUsuarioActual();

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Descontando...';

  try {
    const res = await fetch(`/api/compras/${id}/consumir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || '',
        'x-user-name': user.nombre || ''
      },
      body: JSON.stringify({
        cantidad,
        equipo,
        consumido_por,
        observaciones
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar consumo');

    cerrarModalConsumoStock();
    await cargarCompras();
    alert(data.mensaje);
  } catch(err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-box-open mr-1"></i> Confirmar Descuento de Stock';
  }
}

// ==========================================
// MODAL: DETALLE COMPLETO E HISTORIAL
// ==========================================

function abrirModalDetalleCompra(id) {
  const c = solicitudesCompras.find(x => x.id === id);
  if (!c) return;

  const modal = document.getElementById('modal-detalle-compra');
  if (!modal) return;

  document.getElementById('det-compra-id').innerText = c.id;
  document.getElementById('det-compra-item').innerText = c.item;
  document.getElementById('det-compra-equipo').innerText = c.equipo;
  document.getElementById('det-compra-solicitante').innerText = `${c.solicitado_por} (${c.solicitado_por_rol})`;
  document.getElementById('det-compra-fecha').innerText = formatearFechaLegible(c.fecha_solicitud);
  document.getElementById('det-compra-cantidad').innerText = `${c.cantidad_solicitada} ${c.unidad}`;
  document.getElementById('det-compra-justificacion').innerText = c.justificacion || 'Sin observaciones adicionales.';

  // Cotizaciones
  const contenedorCot = document.getElementById('det-compra-cotizaciones');
  const cots = c.cotizaciones || [];
  if (cots.length === 0) {
    contenedorCot.innerHTML = '<p class="text-xs text-slate-500 italic">No se han registrado cotizaciones para este ítem.</p>';
  } else {
    contenedorCot.innerHTML = cots.map(cot => `
      <div class="bg-slate-900/60 p-2.5 rounded-lg border ${cot.seleccionada ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-700/50'} text-xs">
        <div class="flex items-center justify-between">
          <span class="font-bold text-white">${cot.proveedor} ${cot.seleccionada ? '⭐ (Comprado aquí)' : ''}</span>
          <span class="font-extrabold text-emerald-400">${formatearCOP(cot.precio_total)}</span>
        </div>
        <div class="text-[11px] text-slate-400 flex gap-3 mt-1">
          <span>Unit: ${formatearCOP(cot.precio_unitario)}</span>
          ${cot.tiempo_entrega ? `<span>Entrega: ${cot.tiempo_entrega}</span>` : ''}
          ${cot.contacto ? `<span>Contacto: ${cot.contacto}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Factura y Proveedor
  document.getElementById('det-compra-proveedor').innerText = c.proveedor_comprado || 'Sin proveedor adjudicado';
  document.getElementById('det-compra-factura').innerText = c.numero_factura_oc || 'Sin N° de Factura';
  document.getElementById('det-compra-valor').innerText = c.valor_compra_total ? formatearCOP(c.valor_compra_total) : '-';
  document.getElementById('det-compra-pago').innerText = `${c.estado_pago || 'Pendiente'} ${c.comprobante_pago_ref ? `(${c.comprobante_pago_ref})` : ''}`;

  // Recepción en Planta y Finalización
  document.getElementById('det-compra-llegada').innerText = c.llego_a_planta 
    ? `Sí, entregado en planta a ${c.recibido_por || 'Almacén'} (${formatearFechaLegible(c.fecha_llegada_planta)})` 
    : (c.proveedor_comprado ? 'En camino / despacho a planta' : 'Sin despachar aún');

  const elFinal = document.getElementById('det-compra-estado-final');
  if (elFinal) {
    if (c.llego_a_planta || c.estado === 'finalizado') {
      elFinal.innerHTML = '<span class="text-emerald-400 font-extrabold flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> FINALIZADO - Entregado en Planta</span>';
    } else if (c.proveedor_comprado) {
      elFinal.innerHTML = '<span class="text-orange-400 font-bold flex items-center gap-1"><i class="fa-solid fa-truck-fast"></i> En curso de adquisición y despacho</span>';
    } else {
      elFinal.innerHTML = '<span class="text-amber-400 font-bold flex items-center gap-1"><i class="fa-solid fa-clock"></i> En proceso de cotización</span>';
    }
  }

  // Historial
  const contenedorHist = document.getElementById('det-compra-historial');
  const hist = c.historial_cambios || [];
  contenedorHist.innerHTML = hist.map(h => `
    <div class="flex items-start gap-2 text-xs text-slate-300 border-l-2 border-cyan-500 pl-2.5 py-1">
      <div>
        <span class="font-bold text-white">${h.accion}</span>
        <div class="text-[10px] text-slate-400">${formatearFechaLegible(h.fecha)} - por ${h.usuario}</div>
      </div>
    </div>
  `).join('');

  modal.classList.remove('hidden');
}

function cerrarModalDetalleCompra() {
  document.getElementById('modal-detalle-compra').classList.add('hidden');
}

// ==========================================
// ELIMINAR SOLICITUD (ADMIN)
// ==========================================

async function eliminarSolicitudCompra(id) {
  if (!confirm(`¿Estás seguro de que deseas eliminar la solicitud ${id}? Esta acción no se puede deshacer.`)) return;
  const user = getUsuarioActual();

  try {
    const res = await fetch(`/api/compras/${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-role': user.rol || '',
        'x-user-name': user.nombre || ''
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar');

    await cargarCompras();
  } catch(err) {
    alert('Error: ' + err.message);
  }
}

// ==========================================
// MODAL: CONFIGURACIÓN DE PERMISOS
// ==========================================

function abrirModalPermisosCompras() {
  const modal = document.getElementById('modal-permisos-compras');
  if (!modal) return;

  const permitidos = permisosCompras.roles_permitidos || ['admin', 'compras', 'director'];
  const creacion = permisosCompras.roles_creacion || ['admin', 'compras', 'supervisor', 'sst', 'director'];
  const gestion = permisosCompras.roles_gestion || ['admin', 'compras'];

  // Marcar checkboxes de ver módulo
  ['compras', 'director', 'supervisor', 'sst', 'mecanico', 'electrico', 'maquinista'].forEach(rol => {
    const chk = document.getElementById(`perm-ver-${rol}`);
    if (chk) chk.checked = permitidos.includes(rol);

    const chkCrear = document.getElementById(`perm-crear-${rol}`);
    if (chkCrear) chkCrear.checked = creacion.includes(rol);
  });

  modal.classList.remove('hidden');
}

function cerrarModalPermisosCompras() {
  document.getElementById('modal-permisos-compras').classList.add('hidden');
}

async function guardarPermisosComprasDesdeModal() {
  const user = getUsuarioActual();
  if (user.rol !== 'admin') {
    alert('Solo el Administrador Holger puede cambiar los permisos.');
    return;
  }

  const permitidos = ['admin'];
  const creacion = ['admin'];
  const gestion = ['admin', 'compras'];

  ['compras', 'director', 'supervisor', 'sst', 'mecanico', 'electrico', 'maquinista'].forEach(rol => {
    const chk = document.getElementById(`perm-ver-${rol}`);
    if (chk && chk.checked) permitidos.push(rol);

    const chkCrear = document.getElementById(`perm-crear-${rol}`);
    if (chkCrear && chkCrear.checked) creacion.push(rol);
  });

  try {
    const res = await fetch('/api/compras-permisos', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user.rol || '',
        'x-user-name': user.nombre || ''
      },
      body: JSON.stringify({
        roles_permitidos: permitidos,
        roles_creacion: creacion,
        roles_gestion: gestion
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar permisos');

    permisosCompras = data.permisos;
    cerrarModalPermisosCompras();
    alert('Permisos del módulo de compras actualizados con éxito.');
    verificarAccesoModuloCompras();
  } catch(err) {
    alert('Error: ' + err.message);
  }
}

// Inicialización automática cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
  verificarAccesoModuloCompras();
});
