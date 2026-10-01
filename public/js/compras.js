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
  const btnPermisos = document.getElementById('btn-admin-permisos-compras');

  if (tieneAcceso) {
    if (btnNav) btnNav.classList.remove('hidden');
    if (btnPermisos && user.rol === 'admin') btnPermisos.classList.remove('hidden');

    // Si el rol es compras, abrir directamente la vista de compras
    if (user.rol === 'compras') {
      cambiarVistaPrincipal('compras');
    }
  } else {
    if (btnNav) btnNav.classList.add('hidden');
    if (btnPermisos) btnPermisos.classList.add('hidden');
  }

  return tieneAcceso;
}

function cambiarVistaPrincipal(vista) {
  const vistaMantenimiento = document.getElementById('vista-mantenimiento');
  const vistaCompras = document.getElementById('vista-compras');
  const btnMantenimiento = document.getElementById('btn-nav-mantenimiento');
  const btnCompras = document.getElementById('btn-nav-compras');

  if (vista === 'compras') {
    if (vistaMantenimiento) vistaMantenimiento.classList.add('hidden');
    if (vistaCompras) vistaCompras.classList.remove('hidden');

    if (btnCompras) {
      btnCompras.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition bg-cyan-600 text-white shadow-md shadow-cyan-900/30';
    }
    if (btnMantenimiento) {
      btnMantenimiento.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80';
    }

    cargarCompras();
  } else {
    if (vistaCompras) vistaCompras.classList.add('hidden');
    if (vistaMantenimiento) vistaMantenimiento.classList.remove('hidden');

    if (btnMantenimiento) {
      btnMantenimiento.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition bg-emerald-600 text-white shadow-md shadow-emerald-900/30';
    }
    if (btnCompras) {
      btnCompras.className = 'flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80';
    }
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

function actualizarMetricasCompras() {
  const total = solicitudesCompras.length;
  const cotizando = solicitudesCompras.filter(c => c.estado === 'cotizando' || c.estado === 'solicitado').length;
  const porPagar = solicitudesCompras.filter(c => c.proveedor_comprado && c.estado_pago !== 'pagado').length;
  const enPlantaStock = solicitudesCompras.filter(c => (c.cantidad_en_stock || 0) > 0).length;
  const consumidosTotal = solicitudesCompras.filter(c => c.estado === 'consumido').length;

  const badgeConteo = document.getElementById('badge-compras-conteo');
  if (badgeConteo) badgeConteo.innerText = cotizando > 0 ? cotizando : total;

  const elTotal = document.getElementById('compras-kpi-total');
  const elCotizando = document.getElementById('compras-kpi-cotizando');
  const elPorPagar = document.getElementById('compras-kpi-por-pagar');
  const elStock = document.getElementById('compras-kpi-stock');
  const elConsumidos = document.getElementById('compras-kpi-consumidos');

  if (elTotal) elTotal.innerText = total;
  if (elCotizando) elCotizando.innerText = cotizando;
  if (elPorPagar) elPorPagar.innerText = porPagar;
  if (elStock) elStock.innerText = enPlantaStock;
  if (elConsumidos) elConsumidos.innerText = consumidosTotal;
}

function filtrarEstadoCompra(estado, btn) {
  filtroEstadoCompra = estado;
  const botones = document.querySelectorAll('.compras-tab-btn');
  botones.forEach(b => {
    b.className = 'compras-tab-btn px-3 py-1.5 rounded-lg text-xs font-medium transition text-slate-400 hover:text-white hover:bg-slate-700/60';
  });
  if (btn) {
    btn.className = 'compras-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-cyan-600 text-white shadow-md';
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

  // Filtro por estado
  if (filtroEstadoCompra !== 'todas') {
    if (filtroEstadoCompra === 'solicitado') {
      filtradas = filtradas.filter(c => c.estado === 'solicitado');
    } else if (filtroEstadoCompra === 'cotizando') {
      filtradas = filtradas.filter(c => c.estado === 'cotizando');
    } else if (filtroEstadoCompra === 'comprado') {
      filtradas = filtradas.filter(c => c.estado === 'comprado' || (c.proveedor_comprado && !c.llego_a_planta));
    } else if (filtroEstadoCompra === 'en_stock') {
      filtradas = filtradas.filter(c => (c.cantidad_en_stock || 0) > 0);
    } else if (filtroEstadoCompra === 'consumido') {
      filtradas = filtradas.filter(c => c.estado === 'consumido');
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
          <i class="fa-solid fa-plus mr-1"></i> Nueva Solicitud
        </button>
      </div>
    `;
    return;
  }

  const user = getUsuarioActual();
  const esAdmin = user.rol === 'admin';
  const esGestionCompras = esAdmin || user.rol === 'compras';

  contenedor.innerHTML = filtradas.map(c => {
    // Badges de estado
    let badgeEstado = '';
    switch(c.estado) {
      case 'solicitado':
        badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30"><i class="fa-solid fa-clock mr-1"></i>Solicitado</span>';
        break;
      case 'cotizando':
        badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30"><i class="fa-solid fa-comments-dollar mr-1"></i>Cotizando</span>';
        break;
      case 'comprado':
        badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30"><i class="fa-solid fa-bag-shopping mr-1"></i>Comprado</span>';
        break;
      case 'en_transito':
        badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-300 border border-orange-500/30"><i class="fa-solid fa-truck-fast mr-1"></i>En Tránsito</span>';
        break;
      case 'en_planta':
      case 'en_stock':
        badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"><i class="fa-solid fa-warehouse mr-1"></i>En Planta / Stock</span>';
        break;
      case 'consumido':
        badgeEstado = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30"><i class="fa-solid fa-circle-check mr-1"></i>Consumido Total</span>';
        break;
      default:
        badgeEstado = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">${c.estado}</span>`;
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
      badgeLlegada = '<span class="text-[10px] font-semibold text-orange-400 flex items-center gap-1"><i class="fa-solid fa-truck"></i> En camino / Despacho</span>';
    } else {
      badgeLlegada = '<span class="text-[10px] text-slate-500">Sin despachar</span>';
    }

    // Barra de Stock y Consumo
    const cantRec = Number(c.cantidad_recibida) || 0;
    const cantCons = Number(c.cantidad_consumida) || 0;
    const cantStock = Number(c.cantidad_en_stock) || 0;
    const porcentajeStock = cantRec > 0 ? Math.round((cantStock / cantRec) * 100) : 0;

    let barraColor = 'bg-cyan-500';
    if (cantStock === 0 && cantRec > 0) barraColor = 'bg-slate-600';
    else if (porcentajeStock <= 25) barraColor = 'bg-rose-500';
    else if (porcentajeStock <= 50) barraColor = 'bg-amber-500';

    const numCotizaciones = (c.cotizaciones || []).length;
    const cotizacionGanadora = (c.cotizaciones || []).find(x => x.seleccionada);

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
          
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 mb-3">
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

          <!-- Sección de Proveedor y Compra -->
          <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50 space-y-2 mb-3 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-medium">Cotizaciones:</span>
              <span class="text-slate-200 font-semibold">
                ${numCotizaciones > 0 ? `<i class="fa-solid fa-file-invoice-dollar text-blue-400"></i> ${numCotizaciones} cargadas` : '<span class="text-slate-500 italic">Sin cotizaciones aún</span>'}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-medium">Proveedor:</span>
              <span class="text-white font-bold truncate max-w-[180px]" title="${c.proveedor_comprado || 'Pendiente'}">
                ${c.proveedor_comprado || '<span class="text-slate-500 font-normal">Por adjudicar</span>'}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-medium">Valor Total:</span>
              <span class="font-extrabold text-cyan-300">${c.valor_compra_total ? formatearCOP(c.valor_compra_total) : '-'}</span>
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

          <!-- Control de Stock y Consumo -->
          <div class="bg-slate-900/70 border border-slate-700/60 rounded-xl p-2.5 mb-3">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-slate-300 font-semibold flex items-center gap-1.5">
                <i class="fa-solid fa-cubes-stacked text-cyan-400"></i> Stock en Planta
              </span>
              <span class="font-extrabold ${cantStock > 0 ? 'text-emerald-400' : 'text-slate-500'}">
                ${cantStock} / ${cantRec} ${c.unidad}
              </span>
            </div>
            <div class="w-full bg-slate-700 rounded-full h-2 overflow-hidden mb-1">
              <div class="${barraColor} h-2 rounded-full transition-all duration-300" style="width: ${porcentajeStock}%"></div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-400">
              <span>Recibido: ${cantRec}</span>
              <span>Consumido: ${cantCons}</span>
              <span class="font-bold ${cantStock > 0 ? 'text-cyan-300' : 'text-slate-500'}">${cantStock > 0 ? 'Disponible' : 'Agotado'}</span>
            </div>
          </div>
        </div>

        <!-- Acciones en pie de tarjeta -->
        <div class="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-1.5">
          <div class="flex items-center gap-1">
            <button onclick="abrirModalDetalleCompra('${c.id}')" title="Ver cotizaciones, factura e historial" class="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1">
              <i class="fa-solid fa-eye text-cyan-400"></i>
              <span class="hidden sm:inline">Detalles</span>
            </button>

            ${esGestionCompras ? `
              <button onclick="abrirModalGestionarCompra('${c.id}')" title="Actualizar cotizaciones, compra, pago o recepción" class="px-2.5 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1 shadow">
                <i class="fa-solid fa-pen-to-square"></i>
                <span class="hidden sm:inline">Gestionar</span>
              </button>
            ` : ''}

            ${cantStock > 0 ? `
              <button onclick="abrirModalConsumoStock('${c.id}')" title="Descontar repuesto para una tarea o equipo" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-md shadow-emerald-900/30">
                <i class="fa-solid fa-box-open"></i>
                <span>Consumir</span>
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

  // Recepción y Stock
  document.getElementById('det-compra-llegada').innerText = c.llego_a_planta ? `Sí (Recibió: ${c.recibido_por || 'Almacén'})` : 'No ha llegado a planta';
  document.getElementById('det-compra-stock-resumen').innerText = `Recibido: ${c.cantidad_recibida || 0} | Consumido: ${c.cantidad_consumida || 0} | En Stock: ${c.cantidad_en_stock || 0} ${c.unidad}`;

  // Consumos
  const contenedorCons = document.getElementById('det-compra-consumos-lista');
  const consumos = c.consumos || [];
  if (consumos.length === 0) {
    contenedorCons.innerHTML = '<p class="text-xs text-slate-500 italic">No se han registrado consumos de este repuesto.</p>';
  } else {
    contenedorCons.innerHTML = consumos.map(item => `
      <div class="bg-slate-900/60 p-2 rounded-lg border border-slate-700/40 text-xs">
        <div class="flex items-center justify-between font-bold text-slate-200">
          <span>Descuento de ${item.cantidad} ${c.unidad} para ${item.equipo}</span>
          <span class="text-[10px] text-slate-400">${formatearFechaLegible(item.fecha)}</span>
        </div>
        <p class="text-[11px] text-slate-400">Responsable: <strong class="text-cyan-300">${item.consumido_por}</strong></p>
        ${item.observaciones ? `<p class="text-[11px] text-slate-400 italic">Obs: ${item.observaciones}</p>` : ''}
      </div>
    `).join('');
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
