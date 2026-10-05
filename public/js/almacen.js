// public/js/almacen.js - Módulo de Almacén y Control de Remisiones de Salida para SIMAN
// Soporte fiel al formato institucional "FORMATO - REMISIÓN DE SALIDA"

let todasLasRemisiones = [];
let statsAlmacen = null;
let filtroEstadoRemision = 'todos'; // 'todos' | 'fuera_planta' | 'retornado'
let filtroAreaRemision = 'todos';   // 'todos' | 'operativa' | 'administrativa'
let filtroBusquedaRemision = '';
let remisionEnEdicionId = null;
let remisionParaFinalizarId = null;

// ==========================================
// NAVEGACIÓN Y CAMBIO DE MÓDULO PRINCIPAL
// ==========================================

function cambiarModuloPrincipal(modulo) {
  const userJson = localStorage.getItem('siman_user');
  let rol = '';
  let esAdmin = false;
  try {
    const u = JSON.parse(userJson || '{}');
    rol = (u.rol || '').toLowerCase().trim();
    esAdmin = rol === 'admin';
  } catch(e) {}

  const puedeVerMantenimiento = esAdmin || (rol !== 'almacenista' && (
    (typeof usuarioTienePermiso === 'function' && (
      usuarioTienePermiso('ver_dashboard') ||
      usuarioTienePermiso('crear_tareas') ||
      usuarioTienePermiso('cerrar_tareas') ||
      usuarioTienePermiso('asignable_tareas')
    ))
  ));

  if (modulo === 'mantenimiento' && !puedeVerMantenimiento) {
    alert('Tu rol de Almacenista está asignado exclusivamente al módulo de Almacén y Remisiones.');
    return;
  }

  const secMant = document.getElementById('seccion-modulo-mantenimiento');
  const secAlm = document.getElementById('seccion-modulo-almacen');
  const tabMant = document.getElementById('tab-nav-mantenimiento');
  const tabAlm = document.getElementById('tab-nav-almacen');
  const btnCrearTarea = document.getElementById('btn-crear-tarea-dashboard');

  if (modulo === 'almacen') {
    if (secMant) secMant.classList.add('hidden');
    if (secAlm) secAlm.classList.remove('hidden');

    if (tabMant) {
      if (puedeVerMantenimiento) {
        tabMant.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60';
        tabMant.classList.remove('hidden');
      } else {
        tabMant.classList.add('hidden');
      }
    }
    if (tabAlm) {
      tabAlm.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition bg-amber-600 text-white shadow-md shadow-amber-900/30';
    }
    if (btnCrearTarea) btnCrearTarea.classList.add('hidden');

    cargarRemisiones();
  } else {
    if (secAlm) secAlm.classList.add('hidden');
    if (secMant) secMant.classList.remove('hidden');

    if (tabAlm) {
      tabAlm.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60';
    }
    if (tabMant) {
      tabMant.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition bg-emerald-600 text-white shadow-md shadow-emerald-900/30';
    }

    // Restaurar visibilidad de crear tarea según permisos
    if (btnCrearTarea && typeof usuarioTienePermiso === 'function' && usuarioTienePermiso('crear_tareas')) {
      btnCrearTarea.classList.remove('hidden');
    }
  }
}

// ==========================================
// CARGA DE DATOS DE REMISIONES Y KPIS
// ==========================================

async function cargarRemisiones(animar = true) {
  const icon = document.getElementById('icon-recarga-almacen');
  if (animar && icon) icon.classList.add('fa-spin');

  const headers = obtenerHeadersSeguros();

  try {
    const [resRem, resStats] = await Promise.all([
      fetch('/api/remisiones', { headers }),
      fetch('/api/remisiones/stats', { headers })
    ]);

    if (resRem.ok) {
      todasLasRemisiones = await resRem.json();
    }
    if (resStats.ok) {
      statsAlmacen = await resStats.json();
      actualizarKPIsAlmacen(statsAlmacen);
    }

    renderizarTablaRemisiones();
  } catch (err) {
    console.error('Error al cargar remisiones:', err);
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
}

function actualizarKPIsAlmacen(s) {
  if (!s) return;
  const elTotal = document.getElementById('kpi-almacen-total');
  const elFuera = document.getElementById('kpi-almacen-fuera');
  const elRet = document.getElementById('kpi-almacen-retornadas');
  const elPiezas = document.getElementById('kpi-almacen-piezas');
  const badgeNav = document.getElementById('badge-nav-almacen-fuera');
  const badgeHeader = document.getElementById('badge-almacen-fuera');

  if (elTotal) elTotal.innerText = s.total_remisiones || 0;
  if (elFuera) elFuera.innerText = s.fuera_de_planta || 0;
  if (elRet) elRet.innerText = s.retornadas || 0;
  if (elPiezas) elPiezas.innerText = s.total_piezas_fuera || 0;

  const fueraCount = s.fuera_de_planta || 0;
  if (badgeNav) {
    if (fueraCount > 0) {
      badgeNav.innerText = `${fueraCount} Fuera`;
      badgeNav.classList.remove('hidden');
    } else {
      badgeNav.classList.add('hidden');
    }
  }
  if (badgeHeader) {
    if (fueraCount > 0) {
      badgeHeader.innerText = fueraCount;
      badgeHeader.classList.remove('hidden');
    } else {
      badgeHeader.classList.add('hidden');
    }
  }
}

// ==========================================
// RENDERIZADO DE TABLA Y TARJETAS
// ==========================================

function filtrarEstadoRemision(estado, btn) {
  filtroEstadoRemision = estado;
  document.querySelectorAll('.tab-btn-remision').forEach(b => {
    b.className = 'tab-btn-remision px-3 py-1.5 rounded-lg text-xs font-medium transition text-slate-400 hover:text-white hover:bg-slate-800';
  });
  if (btn) {
    btn.className = 'tab-btn-remision px-3 py-1.5 rounded-lg text-xs font-bold transition bg-amber-600 text-white shadow';
  }
  renderizarTablaRemisiones();
}

function filtrarAreaRemision(area) {
  filtroAreaRemision = area;
  renderizarTablaRemisiones();
}

function filtrarBusquedaRemision(texto) {
  filtroBusquedaRemision = (texto || '').toLowerCase().trim();
  renderizarTablaRemisiones();
}

function renderizarTablaRemisiones() {
  const tbody = document.getElementById('tabla-remisiones-body');
  if (!tbody) return;

  let filtradas = [...todasLasRemisiones];

  if (filtroEstadoRemision !== 'todos') {
    filtradas = filtradas.filter(r => r.estado === filtroEstadoRemision);
  }
  if (filtroAreaRemision !== 'todos') {
    filtradas = filtradas.filter(r => (r.area || '').toLowerCase() === filtroAreaRemision.toLowerCase());
  }
  if (filtroBusquedaRemision) {
    const q = filtroBusquedaRemision;
    filtradas = filtradas.filter(r => {
      const itemsTxt = Array.isArray(r.items) ? r.items.map(it => `${it.descripcion || ''} ${it.observaciones || ''}`).join(' ') : '';
      const haystack = `${r.consecutivo || ''} ${r.remitido_por || ''} ${r.cargo_remitente || ''} ${r.dependencia || ''} ${(r.transportador && r.transportador.nombre) || ''} ${(r.transportador && r.transportador.vehiculo_placa) || ''} ${(r.destino && r.destino.empresa_proveedor) || ''} ${itemsTxt} ${r.observaciones_generales || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  // Actualizar contador
  const contador = document.getElementById('count-remisiones-listadas');
  if (contador) contador.innerText = `${filtradas.length} remision${filtradas.length === 1 ? '' : 'es'}`;

  if (filtradas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-400">
          <div class="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mx-auto mb-3 text-amber-400 text-xl shadow">
            <i class="fa-solid fa-box-open"></i>
          </div>
          <p class="font-bold text-white text-sm">No se encontraron remisiones</p>
          <p class="text-xs text-slate-400 mt-1">No hay salidas registradas con los filtros seleccionados.</p>
        </td>
      </tr>
    `;
    return;
  }

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const esAdmin = (userActual.rol === 'admin');
  const puedeFinalizar = esAdmin || (typeof usuarioTienePermiso === 'function' && usuarioTienePermiso('finalizar_remisiones'));
  const puedeCrear = esAdmin || (typeof usuarioTienePermiso === 'function' && usuarioTienePermiso('crear_remisiones'));
  const puedeEliminar = esAdmin || (typeof usuarioTienePermiso === 'function' && usuarioTienePermiso('eliminar_remisiones'));

  tbody.innerHTML = filtradas.map(r => {
    const esFuera = (r.estado === 'fuera_planta');
    const badgeEstado = esFuera
      ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 animate-pulse">
           <span class="w-2 h-2 rounded-full bg-amber-400"></span> FUERA DE PLANTA
         </span>`
      : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
           <span class="w-2 h-2 rounded-full bg-emerald-400"></span> RETORNADO A PLANTA
         </span>`;

    const badgeArea = (r.area === 'administrativa')
      ? `<span class="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-semibold">Administrativa</span>`
      : `<span class="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">Operativa</span>`;

    // Resumen de materiales
    let resumenItems = 'Sin descripción';
    if (Array.isArray(r.items) && r.items.length > 0) {
      resumenItems = r.items.map(it => `
        <div class="text-xs font-semibold text-white flex items-center gap-1.5">
          <span class="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-amber-400 text-[10px] font-bold">${it.cantidad} ${it.unidad || 'Und'}</span>
          <span class="truncate">${escaparHTML(it.descripcion)}</span>
        </div>
      `).join('');
    }

    const destinoEmpresa = (r.destino && r.destino.empresa_proveedor) ? r.destino.empresa_proveedor : 'Taller Externo';
    const transportadorTxt = (r.transportador && r.transportador.nombre) ? `${r.transportador.nombre} (${r.transportador.vehiculo_placa || 'Sin placa'})` : 'Sin Transportador';

    // Días transcurridos
    let diasTranscurridosTxt = '';
    if (r.fecha_remision) {
      try {
        const fechaSalida = new Date(r.fecha_remision);
        const hoy = new Date();
        const diffDias = Math.floor((hoy - fechaSalida) / (1000 * 60 * 60 * 24));
        if (diffDias === 0) diasTranscurridosTxt = '<span class="text-[10px] text-emerald-400">Salió hoy</span>';
        else if (diffDias === 1) diasTranscurridosTxt = '<span class="text-[10px] text-amber-400">1 día fuera</span>';
        else if (diffDias > 1) diasTranscurridosTxt = `<span class="text-[10px] text-rose-400 font-bold">${diffDias} días fuera</span>`;
      } catch(e) {}
    }

    return `
      <tr class="hover:bg-slate-800/40 transition border-b border-slate-800/80">
        <!-- Consecutivo y Estado -->
        <td class="py-3 px-3.5">
          <div class="font-extrabold text-white text-sm flex items-center gap-2">
            <span class="text-amber-400">N° ${escaparHTML(r.consecutivo || r.id)}</span>
          </div>
          <div class="mt-1 flex items-center gap-1.5">
            ${badgeArea}
          </div>
          <div class="mt-1.5">
            ${badgeEstado}
          </div>
        </td>

        <!-- Fecha y Salida -->
        <td class="py-3 px-3">
          <div class="text-xs font-semibold text-white flex items-center gap-1.5">
            <i class="fa-regular fa-calendar text-slate-400 text-[11px]"></i>
            <span>${formatearFechaCorta(r.fecha_remision)}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
            <i class="fa-regular fa-clock text-slate-500 text-[10px]"></i>
            <span>${escaparHTML(r.hora_salida || '08:00 a.m.')}</span>
          </div>
          <div class="mt-1">
            ${diasTranscurridosTxt}
          </div>
        </td>

        <!-- Materiales / Repuestos -->
        <td class="py-3 px-3 min-w-[200px]">
          <div class="space-y-1">
            ${resumenItems}
          </div>
          ${r.observaciones_generales ? `<div class="text-[11px] text-slate-400 mt-1.5 line-clamp-1 italic"><i class="fa-solid fa-comment-dots text-slate-500 mr-1 text-[10px]"></i>${escaparHTML(r.observaciones_generales)}</div>` : ''}
        </td>

        <!-- Destino / Proveedor -->
        <td class="py-3 px-3">
          <div class="font-bold text-xs text-amber-300 flex items-center gap-1.5">
            <i class="fa-solid fa-industry text-amber-400 text-[11px]"></i>
            <span>${escaparHTML(destinoEmpresa)}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-1 flex items-center gap-1 truncate max-w-[180px]">
            <i class="fa-solid fa-truck text-slate-500 text-[10px]"></i>
            <span class="truncate">${escaparHTML(transportadorTxt)}</span>
          </div>
        </td>

        <!-- Remitido por -->
        <td class="py-3 px-3 text-xs">
          <div class="font-medium text-white">${escaparHTML(r.remitido_por || 'Almacenista')}</div>
          <div class="text-[10px] text-slate-400">${escaparHTML(r.cargo_remitente || 'Almacén')} - ${escaparHTML(r.dependencia || 'Operativa')}</div>
        </td>

        <!-- Información de Retorno (Si aplica) -->
        <td class="py-3 px-3 text-xs">
          ${r.retorno ? `
            <div class="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 space-y-0.5">
              <div class="text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                <i class="fa-solid fa-circle-check text-[10px]"></i> Recibido: ${formatearFechaCorta(r.retorno.fecha_recibido)}
              </div>
              <div class="text-[10px] text-slate-300 truncate">Por: ${escaparHTML(r.retorno.recibido_por)}</div>
              <div class="text-[10px] text-emerald-400 font-semibold truncate">${escaparHTML(r.retorno.estado_material || 'Conforme')}</div>
            </div>
          ` : `
            <span class="text-[11px] text-slate-500 italic">Esperando llegada a planta...</span>
          `}
        </td>

        <!-- Acciones -->
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${esFuera && puedeFinalizar ? `
              <button onclick="abrirModalFinalizarRemision('${r.id}')" title="Registrar llegada del material a planta y finalizar remisión" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow active:scale-95 transition">
                <i class="fa-solid fa-box-archive"></i>
                <span class="hidden sm:inline">Finalizar Llegada</span>
              </button>
            ` : ''}

            <button onclick="abrirVisualizadorFormatoRemision('${r.id}')" title="Ver e imprimir formato oficial idéntico al Excel" class="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1 transition shadow">
              <i class="fa-solid fa-print text-amber-400"></i>
              <span class="hidden sm:inline">Formato</span>
            </button>

            ${puedeCrear ? `
              <button onclick="abrirModalEditarRemision('${r.id}')" title="Editar remisión" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
            ` : ''}

            ${puedeEliminar ? `
              <button onclick="eliminarRemisionConfirm('${r.id}', '${escaparHTML(r.consecutivo || '')}')" title="Eliminar remisión" class="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs transition">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// FORMULARIO: CREAR Y EDITAR REMISIÓN DE SALIDA
// ==========================================

function abrirModalNuevaRemision() {
  remisionEnEdicionId = null;
  const modal = document.getElementById('modal-remision-form');
  const tituloModal = document.getElementById('remision-modal-titulo');
  const form = document.getElementById('form-remision');
  if (!modal || !form) return;

  form.reset();
  if (tituloModal) tituloModal.innerHTML = '<i class="fa-solid fa-file-export text-amber-400 mr-2"></i>Nueva Remisión de Salida de Material';

  // Fecha y hora actual
  const hoy = new Date();
  const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const horaStr = hoy.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

  document.getElementById('rem-fecha').value = fechaStr;
  document.getElementById('rem-hora').value = horaStr;

  // Autocompletar remitente con usuario en sesión
  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const inpRemitente = document.getElementById('rem-remitido-por');
  const inpCargo = document.getElementById('rem-cargo');
  if (inpRemitente) inpRemitente.value = userActual.nombre || 'Almacenista';
  if (inpCargo) inpCargo.value = (userActual.rol === 'almacenista') ? 'Almacenista' : (userActual.especialidad || 'Mantenimiento');

  // Consecutivo sugerido
  const inpConsecutivo = document.getElementById('rem-consecutivo');
  if (inpConsecutivo) {
    inpConsecutivo.value = (statsAlmacen && statsAlmacen.consecutivo_siguiente) ? statsAlmacen.consecutivo_siguiente : generarConsecutivoLocal();
  }

  // Limpiar y dejar 1 fila de ítems por defecto
  const contItems = document.getElementById('rem-items-container');
  if (contItems) {
    contItems.innerHTML = '';
    agregarFilaItem(1, 'Und', '', '');
  }

  // Limpiar vista previa de foto
  limpiarFotoSalidaPreview();

  modal.classList.remove('hidden');
}

function generarConsecutivoLocal() {
  const hoy = new Date();
  const yy = String(hoy.getFullYear()).slice(-2);
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${dd}${mm}${yy}-01`;
}

function agregarFilaItem(cant = 1, und = 'Und', desc = '', obs = '') {
  const cont = document.getElementById('rem-items-container');
  if (!cont) return;

  const rowId = `item-row-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const div = document.createElement('div');
  div.id = rowId;
  div.className = 'grid grid-cols-12 gap-2 items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800';

  div.innerHTML = `
    <div class="col-span-2 sm:col-span-2">
      <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">CANT *</label>
      <input type="number" step="any" min="0.1" name="item_cantidad" value="${cant}" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center font-bold focus:ring-1 focus:ring-amber-500 focus:outline-none">
    </div>
    <div class="col-span-3 sm:col-span-2">
      <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">UND *</label>
      <select name="item_unidad" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-amber-500 focus:outline-none">
        <option value="Und" ${und === 'Und' ? 'selected' : ''}>Und</option>
        <option value="Juego" ${und === 'Juego' ? 'selected' : ''}>Juego</option>
        <option value="Kg" ${und === 'Kg' ? 'selected' : ''}>Kg</option>
        <option value="Mts" ${und === 'Mts' ? 'selected' : ''}>Mts</option>
        <option value="Litros" ${und === 'Litros' ? 'selected' : ''}>Litros</option>
        <option value="Pza" ${und === 'Pza' ? 'selected' : ''}>Pza</option>
      </select>
    </div>
    <div class="col-span-7 sm:col-span-4">
      <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">DESCRIPCIÓN DEL MATERIAL / REPUESTO *</label>
      <input type="text" name="item_descripcion" value="${escaparHTML(desc)}" placeholder="Ej: POLEA 3 CANALES, MOTOR 10HP..." required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium focus:ring-1 focus:ring-amber-500 focus:outline-none uppercase">
    </div>
    <div class="col-span-10 sm:col-span-3">
      <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">OBSERVACIÓN / MOTIVO DE SALIDA</label>
      <input type="text" name="item_observaciones" value="${escaparHTML(obs)}" placeholder="Ej: Sale para arreglo en torno..." class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-amber-500 focus:outline-none">
    </div>
    <div class="col-span-2 sm:col-span-1 text-center pt-3.5 sm:pt-4">
      <button type="button" onclick="eliminarFilaItem('${rowId}')" title="Quitar ítem" class="w-7 h-7 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 transition flex items-center justify-center mx-auto">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>
  `;

  cont.appendChild(div);
}

function eliminarFilaItem(rowId) {
  const el = document.getElementById(rowId);
  const cont = document.getElementById('rem-items-container');
  if (cont && cont.children.length <= 1) {
    alert('La remisión debe tener al menos un ítem registrado.');
    return;
  }
  if (el) el.remove();
}

function abrirModalEditarRemision(id) {
  const rem = todasLasRemisiones.find(r => r.id === id);
  if (!rem) return;

  remisionEnEdicionId = id;
  const modal = document.getElementById('modal-remision-form');
  const tituloModal = document.getElementById('remision-modal-titulo');
  if (!modal) return;

  if (tituloModal) tituloModal.innerHTML = `<i class="fa-solid fa-pen-to-square text-amber-400 mr-2"></i>Modificar Remisión N° ${escaparHTML(rem.consecutivo || rem.id)}`;

  // Área
  const radioArea = document.querySelector(`input[name="rem_area"][value="${rem.area || 'operativa'}"]`);
  if (radioArea) radioArea.checked = true;

  document.getElementById('rem-consecutivo').value = rem.consecutivo || '';
  document.getElementById('rem-fecha').value = rem.fecha_remision || '';
  document.getElementById('rem-hora').value = rem.hora_salida || '';
  document.getElementById('rem-remitido-por').value = rem.remitido_por || '';
  document.getElementById('rem-cargo').value = rem.cargo_remitente || '';
  document.getElementById('rem-dependencia').value = rem.dependencia || 'Operativa';

  // Transportador
  document.getElementById('rem-transp-nombre').value = (rem.transportador && rem.transportador.nombre) || '';
  document.getElementById('rem-transp-cc').value = (rem.transportador && rem.transportador.cc_nit) || '';
  document.getElementById('rem-transp-vehiculo').value = (rem.transportador && rem.transportador.vehiculo_placa) || '';

  // Destino
  document.getElementById('rem-dest-empresa').value = (rem.destino && rem.destino.empresa_proveedor) || '';
  document.getElementById('rem-dest-contacto').value = (rem.destino && rem.destino.contacto) || '';
  document.getElementById('rem-dest-telefono').value = (rem.destino && rem.destino.telefono) || '';

  document.getElementById('rem-obs-generales').value = rem.observaciones_generales || '';

  // Ítems
  const contItems = document.getElementById('rem-items-container');
  if (contItems) {
    contItems.innerHTML = '';
    if (Array.isArray(rem.items) && rem.items.length > 0) {
      rem.items.forEach(it => {
        agregarFilaItem(it.cantidad || 1, it.unidad || 'Und', it.descripcion || '', it.observaciones || '');
      });
    } else {
      agregarFilaItem(1, 'Und', '', '');
    }
  }

  // Foto previa si existe
  if (rem.foto_salida) {
    mostrarFotoSalidaPreview(rem.foto_salida);
  } else {
    limpiarFotoSalidaPreview();
  }

  modal.classList.remove('hidden');
}

function cerrarModalRemisionForm() {
  const modal = document.getElementById('modal-remision-form');
  if (modal) modal.classList.add('hidden');
}

let fotoSalidaBase64Temporal = null;

function manejarCambioFotoSalida(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    fotoSalidaBase64Temporal = ev.target.result;
    mostrarFotoSalidaPreview(fotoSalidaBase64Temporal);
  };
  reader.readAsDataURL(file);
}

function mostrarFotoSalidaPreview(url) {
  const box = document.getElementById('rem-foto-preview-box');
  const img = document.getElementById('rem-foto-preview-img');
  if (box && img) {
    img.src = url;
    box.classList.remove('hidden');
  }
}

function limpiarFotoSalidaPreview() {
  fotoSalidaBase64Temporal = null;
  const box = document.getElementById('rem-foto-preview-box');
  const inp = document.getElementById('rem-foto-input');
  if (box) box.classList.add('hidden');
  if (inp) inp.value = '';
}

async function guardarRemision(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-remision');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';
  }

  // Recoger ítems
  const cont = document.getElementById('rem-items-container');
  const rows = cont ? cont.querySelectorAll('[id^="item-row-"]') : [];
  const items = [];

  rows.forEach((r, idx) => {
    const cant = r.querySelector('[name="item_cantidad"]')?.value;
    const und = r.querySelector('[name="item_unidad"]')?.value;
    const desc = r.querySelector('[name="item_descripcion"]')?.value;
    const obs = r.querySelector('[name="item_observaciones"]')?.value;

    if (desc && desc.trim()) {
      items.push({
        item_num: idx + 1,
        cantidad: parseFloat(cant) || 1,
        unidad: und || 'Und',
        descripcion: desc.trim().toUpperCase(),
        observaciones: (obs || '').trim()
      });
    }
  });

  if (items.length === 0) {
    alert('Debes ingresar al menos un material o repuesto con descripción.');
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
    return;
  }

  const areaChecked = document.querySelector('input[name="rem_area"]:checked')?.value || 'operativa';

  const payload = {
    consecutivo: document.getElementById('rem-consecutivo')?.value.trim(),
    area: areaChecked,
    fecha_remision: document.getElementById('rem-fecha')?.value.trim(),
    hora_salida: document.getElementById('rem-hora')?.value.trim(),
    remitido_por: document.getElementById('rem-remitido-por')?.value.trim(),
    cargo_remitente: document.getElementById('rem-cargo')?.value.trim(),
    dependencia: document.getElementById('rem-dependencia')?.value.trim(),
    transportador: {
      nombre: document.getElementById('rem-transp-nombre')?.value.trim(),
      cc_nit: document.getElementById('rem-transp-cc')?.value.trim(),
      vehiculo_placa: document.getElementById('rem-transp-vehiculo')?.value.trim().toUpperCase()
    },
    destino: {
      empresa_proveedor: document.getElementById('rem-dest-empresa')?.value.trim(),
      contacto: document.getElementById('rem-dest-contacto')?.value.trim(),
      telefono: document.getElementById('rem-dest-telefono')?.value.trim()
    },
    items: items,
    observaciones_generales: document.getElementById('rem-obs-generales')?.value.trim(),
    foto_salida_base64: fotoSalidaBase64Temporal
  };

  const headers = obtenerHeadersSeguros();
  headers['Content-Type'] = 'application/json';

  try {
    const url = remisionEnEdicionId ? `/api/remisiones/${remisionEnEdicionId}` : '/api/remisiones';
    const method = remisionEnEdicionId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar la remisión');

    mostrarToast(data.mensaje || '¡Remisión de Salida guardada exitosamente!');
    cerrarModalRemisionForm();
    await cargarRemisiones();
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// ==========================================
// FINALIZACIÓN: RETORNO DE MATERIAL A PLANTA
// ==========================================

function abrirModalFinalizarRemision(id) {
  const rem = todasLasRemisiones.find(r => r.id === id);
  if (!rem) return;

  remisionParaFinalizarId = id;
  const modal = document.getElementById('modal-finalizar-remision');
  const infoBox = document.getElementById('ret-remision-resumen-box');
  const form = document.getElementById('form-finalizar-remision');
  if (!modal || !form) return;

  form.reset();

  // Resumen del material que salió
  const itemsTxt = Array.isArray(rem.items) ? rem.items.map(it => `<strong>${it.cantidad} ${it.unidad || 'Und'}</strong> - ${escaparHTML(it.descripcion)}`).join('<br>') : 'Sin descripción';
  const destinoEmpresa = (rem.destino && rem.destino.empresa_proveedor) ? rem.destino.empresa_proveedor : 'Taller Externo';

  if (infoBox) {
    infoBox.innerHTML = `
      <div class="flex items-start justify-between gap-2 border-b border-amber-500/30 pb-2 mb-2">
        <div>
          <span class="text-xs font-bold text-amber-300">Remisión N° ${escaparHTML(rem.consecutivo || rem.id)}</span>
          <span class="text-[10px] text-slate-400 block">Salió el ${formatearFechaCorta(rem.fecha_remision)} a las ${escaparHTML(rem.hora_salida || '08:00 a.m.')}</span>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-950 text-amber-300 border border-amber-500/40">Destino: ${escaparHTML(destinoEmpresa)}</span>
      </div>
      <div class="text-xs text-slate-200">
        <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Material(es) enviado(s) a taller:</span>
        ${itemsTxt}
      </div>
    `;
  }

  // Autocompletar fecha y hora actual de recepción
  const hoy = new Date();
  const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const horaStr = hoy.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

  document.getElementById('ret-fecha').value = fechaStr;
  document.getElementById('ret-hora').value = horaStr;

  const userActual = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const inpReceptor = document.getElementById('ret-recibido-por');
  const inpCargoReceptor = document.getElementById('ret-cargo-receptor');
  if (inpReceptor) inpReceptor.value = userActual.nombre || 'Almacenista';
  if (inpCargoReceptor) inpCargoReceptor.value = (userActual.rol === 'almacenista') ? 'Almacenista' : (userActual.especialidad || 'Recepción Planta');

  limpiarFotoRetornoPreview();

  modal.classList.remove('hidden');
}

function cerrarModalFinalizarRemision() {
  const modal = document.getElementById('modal-finalizar-remision');
  if (modal) modal.classList.add('hidden');
}

let fotoRetornoBase64Temporal = null;

function manejarCambioFotoRetorno(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    fotoRetornoBase64Temporal = ev.target.result;
    mostrarFotoRetornoPreview(fotoRetornoBase64Temporal);
  };
  reader.readAsDataURL(file);
}

function mostrarFotoRetornoPreview(url) {
  const box = document.getElementById('ret-foto-preview-box');
  const img = document.getElementById('ret-foto-preview-img');
  if (box && img) {
    img.src = url;
    box.classList.remove('hidden');
  }
}

function limpiarFotoRetornoPreview() {
  fotoRetornoBase64Temporal = null;
  const box = document.getElementById('ret-foto-preview-box');
  const inp = document.getElementById('ret-foto-input');
  if (box) box.classList.add('hidden');
  if (inp) inp.value = '';
}

async function confirmarFinalizarRemision(e) {
  e.preventDefault();
  if (!remisionParaFinalizarId) return;

  const btn = document.getElementById('btn-confirmar-retorno');
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Registrando ingreso a planta...';
  }

  const payload = {
    fecha_recibido: document.getElementById('ret-fecha')?.value.trim(),
    hora_recibido: document.getElementById('ret-hora')?.value.trim(),
    recibido_por: document.getElementById('ret-recibido-por')?.value.trim(),
    cargo_receptor: document.getElementById('ret-cargo-receptor')?.value.trim(),
    dependencia_receptora: document.getElementById('ret-dependencia-receptora')?.value.trim(),
    estado_material: document.getElementById('ret-estado-material')?.value.trim(),
    observaciones_retorno: document.getElementById('ret-observaciones')?.value.trim(),
    foto_retorno_base64: fotoRetornoBase64Temporal
  };

  const headers = obtenerHeadersSeguros();
  headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(`/api/remisiones/${remisionParaFinalizarId}/finalizar`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar retorno del material');

    mostrarToast(data.mensaje || '¡Material retornado a planta con éxito!');
    cerrarModalFinalizarRemision();
    await cargarRemisiones();
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// ==========================================
// FORMATO OFICIAL IMPRIMIBLE IDÉNTICO AL EXCEL
// ==========================================

function abrirVisualizadorFormatoRemision(id) {
  const rem = todasLasRemisiones.find(r => r.id === id);
  if (!rem) return;

  const modal = document.getElementById('modal-visualizador-formato');
  const contenedorDoc = document.getElementById('contenedor-documento-remision');
  if (!modal || !contenedorDoc) return;

  const esAdmin = (rem.area === 'administrativa');
  const esOperativa = !esAdmin;

  const transportadorNombre = (rem.transportador && rem.transportador.nombre) || '---';
  const transportadorCC = (rem.transportador && rem.transportador.cc_nit) || '---';
  const transportadorVehiculo = (rem.transportador && rem.transportador.vehiculo_placa) || '---';

  const destinoEmpresa = (rem.destino && rem.destino.empresa_proveedor) || '---';
  const destinoContacto = (rem.destino && rem.destino.contacto) || '';

  // Filas de ítems (mínimo 5 filas para mantener el diseño idéntico al formato impreso)
  let itemsRowsHtml = '';
  const itemsLista = Array.isArray(rem.items) ? rem.items : [];
  const maxRows = Math.max(itemsLista.length, 5);

  for (let i = 0; i < maxRows; i++) {
    const it = itemsLista[i];
    itemsRowsHtml += `
      <tr class="border-b border-black">
        <td class="border-r border-black p-1.5 text-center font-bold text-xs">${it ? it.cantidad : '&nbsp;'}</td>
        <td class="border-r border-black p-1.5 text-center text-xs">${it ? (it.unidad || 'Und') : '&nbsp;'}</td>
        <td class="border-r border-black p-1.5 text-xs font-semibold uppercase">${it ? escaparHTML(it.descripcion) : '&nbsp;'}</td>
        <td class="p-1.5 text-xs">${it ? escaparHTML(it.observaciones || '') : '&nbsp;'}</td>
      </tr>
    `;
  }

  // Sección de Retorno a Planta si ya ocurrió
  const retornoHtml = rem.retorno ? `
    <div class="mt-4 border-2 border-emerald-700 rounded-lg p-3 bg-emerald-50 text-emerald-950">
      <div class="font-bold text-xs uppercase flex items-center gap-1.5 border-b border-emerald-300 pb-1 mb-2 text-emerald-900">
        <i class="fa-solid fa-circle-check text-emerald-600"></i> CONSTANCIA DE RETORNO Y RECEPCIÓN EN PLANTA
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div><span class="font-bold block text-[10px] uppercase text-emerald-800">Fecha Llegada:</span> ${formatearFechaCorta(rem.retorno.fecha_recibido)}</div>
        <div><span class="font-bold block text-[10px] uppercase text-emerald-800">Hora Llegada:</span> ${escaparHTML(rem.retorno.hora_recibido || '')}</div>
        <div><span class="font-bold block text-[10px] uppercase text-emerald-800">Recibido en Planta por:</span> ${escaparHTML(rem.retorno.recibido_por)}</div>
        <div><span class="font-bold block text-[10px] uppercase text-emerald-800">Estado del Material:</span> <strong class="text-emerald-700">${escaparHTML(rem.retorno.estado_material || 'Conforme')}</strong></div>
      </div>
      ${rem.retorno.observaciones_retorno ? `
        <div class="mt-2 text-xs text-slate-800 border-t border-emerald-200 pt-1.5">
          <span class="font-bold text-[10px] uppercase text-emerald-800 block">Novedades de Recepción:</span>
          ${escaparHTML(rem.retorno.observaciones_retorno)}
        </div>
      ` : ''}
    </div>
  ` : '';

  contenedorDoc.innerHTML = `
    <!-- ENCABEZADO OFICIAL FIEL AL EXCEL -->
    <div class="border-2 border-black bg-white text-black font-sans text-xs">
      
      <!-- Fila 1: Logo, Título y Código -->
      <div class="grid grid-cols-12 border-b-2 border-black items-center text-center">
        <div class="col-span-3 border-r-2 border-black p-2 flex flex-col items-center justify-center">
          <div class="w-12 h-12 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-extrabold text-xl shadow-sm mb-1">
            <i class="fa-solid fa-screwdriver-wrench"></i>
          </div>
          <span class="font-extrabold text-[11px] tracking-wider text-black">SIMAN INDUSTRIAL</span>
          <span class="text-[9px] text-slate-600">Gestión de Mantenimiento</span>
        </div>
        <div class="col-span-6 border-r-2 border-black p-3">
          <span class="block text-[10px] font-bold text-slate-500 uppercase">FORMATO</span>
          <h2 class="text-base sm:text-lg font-black tracking-wider uppercase">REMISIÓN DE SALIDA</h2>
          <span class="block text-[10px] text-slate-600 mt-0.5">Control de Materiales, Repuestos y Equipos fuera de Planta</span>
        </div>
        <div class="col-span-3 p-2 text-left text-[10px] leading-tight space-y-1">
          <div><strong class="font-bold">CÓDIGO:</strong> F-REM-01</div>
          <div><strong class="font-bold">VERSIÓN:</strong> 0</div>
          <div><strong class="font-bold">APROBACIÓN:</strong> 2026-08</div>
          <div><strong class="font-bold">VIGENCIA:</strong> Activa</div>
        </div>
      </div>

      <!-- Fila 2: Selección de Área y Consecutivo -->
      <div class="grid grid-cols-12 border-b-2 border-black items-center bg-slate-100 p-2 font-bold text-xs">
        <div class="col-span-8 flex items-center gap-6">
          <label class="flex items-center gap-1.5 cursor-default">
            <span class="w-4 h-4 rounded border-2 border-black flex items-center justify-center text-[10px] bg-white">
              ${esAdmin ? '<i class="fa-solid fa-check"></i>' : ''}
            </span>
            <span>ÁREA ADMINISTRATIVA</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-default">
            <span class="w-4 h-4 rounded border-2 border-black flex items-center justify-center text-[10px] bg-white">
              ${esOperativa ? '<i class="fa-solid fa-check text-emerald-800"></i>' : ''}
            </span>
            <span class="${esOperativa ? 'text-emerald-950 font-black' : ''}">ÁREA OPERATIVA</span>
          </label>
        </div>
        <div class="col-span-4 text-right pr-2">
          <span class="text-xs uppercase font-bold text-slate-600 mr-2">REMISIÓN N°:</span>
          <span class="text-sm font-black text-rose-700 bg-white px-2.5 py-0.5 border border-black rounded tracking-wider">${escaparHTML(rem.consecutivo || rem.id)}</span>
        </div>
      </div>

      <!-- Fila 3: Datos de Remitente -->
      <div class="grid grid-cols-12 border-b border-black text-[11px]">
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">FECHA REMISIÓN:</div>
        <div class="col-span-3 border-r border-black p-1.5">${formatearFechaCorta(rem.fecha_remision)}</div>
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">REMITIDO POR:</div>
        <div class="col-span-3 p-1.5 font-bold uppercase">${escaparHTML(rem.remitido_por || '---')}</div>
      </div>
      <div class="grid grid-cols-12 border-b-2 border-black text-[11px]">
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">HORA DE SALIDA:</div>
        <div class="col-span-3 border-r border-black p-1.5">${escaparHTML(rem.hora_salida || '08:00 a.m.')}</div>
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">CARGO / DEPENDENCIA:</div>
        <div class="col-span-3 p-1.5">${escaparHTML(rem.cargo_remitente || '---')} / ${escaparHTML(rem.dependencia || 'Operativa')}</div>
      </div>

      <!-- Fila 4: Datos de Transporte -->
      <div class="grid grid-cols-12 border-b-2 border-black text-[11px]">
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">TRANSPORTADOR:</div>
        <div class="col-span-3 border-r border-black p-1.5 uppercase font-semibold">${escaparHTML(transportadorNombre)}</div>
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">CC / NIT:</div>
        <div class="col-span-3 p-1.5 font-mono">${escaparHTML(transportadorCC)}</div>
      </div>
      <div class="grid grid-cols-12 border-b-2 border-black text-[11px]">
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">VEHÍCULO / PLACA:</div>
        <div class="col-span-3 border-r border-black p-1.5 font-black uppercase text-slate-900">${escaparHTML(transportadorVehiculo)}</div>
        <div class="col-span-3 border-r border-black p-1.5 bg-slate-50 font-bold">EMPRESA / TALLER DESTINO:</div>
        <div class="col-span-3 p-1.5 font-bold uppercase text-amber-900">${escaparHTML(destinoEmpresa)}</div>
      </div>

      <!-- Tabla de Materiales / Repuestos -->
      <div class="w-full">
        <table class="w-full border-collapse text-left">
          <thead class="bg-slate-200 border-b-2 border-black text-[10px] uppercase font-bold text-black">
            <tr>
              <th class="border-r border-black p-1.5 text-center w-16">CANT</th>
              <th class="border-r border-black p-1.5 text-center w-16">UND</th>
              <th class="border-r border-black p-1.5 w-1/2">DESCRIPCIÓN DEL MATERIAL / REPUESTO</th>
              <th class="p-1.5">OBSERVACIONES / MOTIVO</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Fila de Observaciones Generales -->
      <div class="border-t-2 border-black p-2 bg-slate-50 text-[11px]">
        <strong class="font-bold text-[10px] uppercase block text-slate-700">OBSERVACIONES GENERALES:</strong>
        <p class="mt-0.5 text-slate-900">${escaparHTML(rem.observaciones_generales || 'Material enviado a taller especializado para servicio técnico y ajuste mecánico.')}</p>
      </div>

      <!-- Cuadros de Firmas Oficiales -->
      <div class="grid grid-cols-2 border-t-2 border-black">
        <!-- Remitido por (Planta) -->
        <div class="border-r-2 border-black p-3 flex flex-col justify-between min-h-[110px]">
          <span class="text-[10px] font-bold uppercase text-slate-600 block">REMITIDO POR:</span>
          <div class="border-b border-black w-3/4 mx-auto my-2"></div>
          <div class="text-[10px] space-y-0.5">
            <div><strong>NOMBRE:</strong> ${escaparHTML(rem.remitido_por || 'Andres Rangel')}</div>
            <div><strong>FECHA / HORA:</strong> ${formatearFechaCorta(rem.fecha_remision)} - ${escaparHTML(rem.hora_salida || '08:00 a.m.')}</div>
          </div>
        </div>

        <!-- Recibido por (Transportador / Destino) -->
        <div class="p-3 flex flex-col justify-between min-h-[110px]">
          <span class="text-[10px] font-bold uppercase text-slate-600 block">RECIBIDO POR (TRANSPORTADOR / DESTINO):</span>
          <div class="border-b border-black w-3/4 mx-auto my-2"></div>
          <div class="text-[10px] space-y-0.5">
            <div><strong>NOMBRE:</strong> ${escaparHTML(transportadorNombre)}</div>
            <div><strong>CC / NIT:</strong> ${escaparHTML(transportadorCC)}</div>
          </div>
        </div>
      </div>

    </div>

    ${retornoHtml}
  `;

  modal.classList.remove('hidden');
}

function cerrarVisualizadorFormato() {
  const modal = document.getElementById('modal-visualizador-formato');
  if (modal) modal.classList.add('hidden');
}

function imprimirDocumentoRemision() {
  window.print();
}

// ==========================================
// ELIMINAR Y REABRIR REMISIÓN
// ==========================================

async function eliminarRemisionConfirm(id, consecutivo) {
  if (!confirm(`¿Estás seguro de que deseas eliminar definitivamente la remisión N° ${consecutivo || id}? Esta acción no se puede deshacer.`)) {
    return;
  }

  const headers = obtenerHeadersSeguros();

  try {
    const res = await fetch(`/api/remisiones/${id}`, {
      method: 'DELETE',
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar remisión');

    mostrarToast('Remisión eliminada correctamente.');
    await cargarRemisiones();
  } catch (err) {
    alert(err.message);
  }
}

// Helper: Formato de fecha legible
function formatearFechaCorta(str) {
  if (!str) return '---';
  try {
    const partes = str.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  } catch(e) {}
  return str;
}

// Inicialización de Almacén al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(localStorage.getItem('siman_user') || '{}');
  const rol = (user.rol || '').toLowerCase().trim();
  if (rol === 'almacenista' || window.location.hash === '#almacen') {
    cambiarModuloPrincipal('almacen');
  }
});
