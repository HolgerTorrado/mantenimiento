# 🛠️ SIMAN - Sistema Integral de Mantenimiento

Sistema web completo para la gestión y control de mantenimiento industrial con **Dashboard administrativo para PC** y **Portal Móvil optimizado para celulares de mecánicos con captura de cámara en tiempo real**.

---

## 🚀 Enlaces de Acceso Rápido

- **💻 Dashboard Supervisor / Administrador (PC):**  
  [http://localhost:3000](http://localhost:3000)

- **📱 Portal Móvil para Mecánicos (desde cualquier celular en la red Wi-Fi):**  
  `http://192.168.40.57:3000/mecanico`  
  *(o escaneando el código QR disponible en el botón "Conectar Móvil" del Dashboard)*

---

## ✨ Características Principales

### 1. 📋 Categorización de Actividades
Permite clasificar cada trabajo en las 3 categorías requeridas:
- 🟢 **Preventivo:** Mantenimiento programado y de rutina para evitar fallas (cambio de aceites, ajustes, lubricación).
- 🔴 **Correctivo:** Atención inmediata ante averías, roturas o paradas imprevistas de maquinaria.
- 🟣 **Predictivo:** Inspección basada en condición (análisis de vibraciones, rutas termográficas infrarrojas, ultrasonido).

### 2. ⏱️ Registro de Tiempos y Cálculo de MTTR
- **Fecha y Hora de Ocurrencia:** Registra el momento exacto en que ocurrió o se reportó la avería/tarea.
- **Fecha y Hora de Arreglo:** Registrada por el mecánico desde su celular al finalizar el trabajo (se autocompleta con el momento exacto actual).
- **Cálculo Automático de Inactividad y MTTR:** El sistema calcula la diferencia exacta entre ambos momentos (en horas y minutos), alimentando el indicador clave **MTTR (Mean Time To Repair)** general y por tipo.

### 3. 📸 Evidencia Fotográfica desde el Celular
- El mecánico abre la orden en su celular y al presionar **"Finalizar y Tomar Foto"**, se activa la cámara de su smartphone (`capture="environment"`).
- Vista previa instantánea antes de subir.
- Las fotografías se almacenan en el servidor (`uploads/`) y quedan vinculadas a la tarea para consulta del supervisor en alta resolución con zoom.

### 4. 📊 Dashboard de Control con Gráficas y Métricas
- Tarjetas de KPIs en vivo (Total, Pendientes, En Progreso, Completadas, MTTR).
- Gráfica circular de distribución (Preventivo vs Correctivo vs Predictivo).
- Gráfica comparativa de tiempos medios de reparación.
- Filtros interactivos por estado, tipo de mantenimiento y buscador en tiempo real.

---

## 📂 Estructura del Proyecto

```
mantenimiento-app/
├── server.js              # Servidor Express, API REST, Multer y generación de QR
├── iniciar-servidor.bat   # Script de arranque rápido con un solo clic
├── package.json           # Dependencias (express, cors, multer, qrcode)
├── data/
│   ├── tasks.json         # Base de datos persistente de tareas
│   └── mecanicos.json     # Catálogo de técnicos y mecánicos
├── uploads/               # Directorio donde se guardan las fotos tomadas con el móvil
└── public/
    ├── index.html         # Dashboard para PC/Supervisor
    ├── mobile.html        # Aplicación web móvil para técnicos/mecánicos
    └── js/
        ├── dashboard.js   # Lógica del dashboard y gráficas Chart.js
        └── mobile.js      # Lógica móvil (cámara, geolocalización de tiempos y fotos)
```

---

## ⚡ Cómo Iniciar el Servidor Manualmente

Si reinicia el equipo, puede volver a ejecutar el servidor de dos formas:

1. **Haciendo doble clic** en el archivo:
   `iniciar-servidor.bat`
2. **O desde la terminal PowerShell:**
   ```powershell
   cd "C:\Users\HOLGER TORRADO\.gemini\antigravity\scratch\mantenimiento-app"
   ..\node-bin\node-v20.18.0-win-x64\node.exe server.js
   ```
