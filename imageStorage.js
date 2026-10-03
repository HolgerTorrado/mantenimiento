const cloudinary = require('cloudinary').v2;

// Verificar si Cloudinary está configurado en las variables de entorno
const isConfigurado = () => {
  return Boolean(
    process.env.CLOUDINARY_URL || 
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  );
};

// Inicializar configuración segura
function initCloudinary() {
  if (!isConfigurado()) return false;
  try {
    if (process.env.CLOUDINARY_URL) {
      cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
    } else {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
        api_key: process.env.CLOUDINARY_API_KEY.trim(),
        api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
        secure: true
      });
    }
    return true;
  } catch (err) {
    console.error('[ImageStorage] Error al inicializar Cloudinary:', err.message);
    return false;
  }
}

initCloudinary();

/**
 * Sube una imagen (Data URL base64 o archivo) a Cloudinary.
 * Si Cloudinary no está configurado o hay un fallo de red, devuelve la foto original sin romper la tarea.
 */
async function subirImagenNube(fotoBase64, idReferencia = 'foto', subcarpeta = 'mantenimiento') {
  if (!fotoBase64 || typeof fotoBase64 !== 'string') return fotoBase64;
  
  // Si ya es una URL externa (https://res.cloudinary.com/...), conservarla tal cual
  if (fotoBase64.startsWith('http://') || fotoBase64.startsWith('https://')) {
    return fotoBase64;
  }

  // Si no es un Data URL base64, no procesar
  if (!fotoBase64.startsWith('data:image/')) {
    return fotoBase64;
  }

  // Si no está configurado Cloudinary, usar el base64 como fallback seguro
  if (!isConfigurado() || !initCloudinary()) {
    return fotoBase64;
  }

  try {
    const cleanId = String(idReferencia || 'foto').replace(/[^a-zA-Z0-9_-]/g, '_');
    const publicId = `${cleanId}_${Date.now()}`;
    
    const resultado = await cloudinary.uploader.upload(fotoBase64, {
      folder: `siman/${subcarpeta}`,
      public_id: publicId,
      resource_type: 'image',
      format: 'webp', // WebP para compresión superior y carga veloz
      transformation: [
        { width: 1280, height: 1280, crop: 'limit', quality: 'auto:good' }
      ]
    });

    console.log(`[ImageStorage] 🚀 Foto subida a Cloudinary exitosamente (${resultado.bytes} bytes): ${resultado.secure_url}`);
    return resultado.secure_url;
  } catch (error) {
    console.error('[ImageStorage] ⚠️ Error al subir foto a Cloudinary (usando fallback seguro):', error.message);
    return fotoBase64;
  }
}

/**
 * Migra fotos existentes en Base64 hacia Cloudinary en lotes controlados
 */
async function migrarFotosExistentes(tareas = [], limitePorLote = 10) {
  if (!isConfigurado() || !Array.isArray(tareas) || tareas.length === 0) {
    return { migrados: 0, totalPendientes: 0 };
  }

  initCloudinary();
  let count = 0;

  for (const t of tareas) {
    if (count >= limitePorLote) break;

    // Migrar foto comprobante
    if (t.foto_comprobante && t.foto_comprobante.startsWith('data:image/')) {
      const url = await subirImagenNube(t.foto_comprobante, `comp_${t.id}`, 'comprobantes');
      if (url.startsWith('https://')) {
        t.foto_comprobante = url;
        count++;
      }
    }

    // Migrar foto inicial
    if (t.foto_inicial && t.foto_inicial.startsWith('data:image/')) {
      const url = await subirImagenNube(t.foto_inicial, `ini_${t.id}`, 'iniciales');
      if (url.startsWith('https://')) {
        t.foto_inicial = url;
        count++;
      }
    }

    // Migrar fotos de avances
    if (Array.isArray(t.avances)) {
      for (const a of t.avances) {
        if (a.foto && a.foto.startsWith('data:image/')) {
          const url = await subirImagenNube(a.foto, `av_${t.id}_${a.id}`, 'avances');
          if (url.startsWith('https://')) {
            a.foto = url;
            count++;
          }
        }
      }
    }
  }

  // Contar cuántos faltan por migrar
  let pendientes = 0;
  for (const t of tareas) {
    if (t.foto_comprobante && t.foto_comprobante.startsWith('data:image/')) pendientes++;
    if (t.foto_inicial && t.foto_inicial.startsWith('data:image/')) pendientes++;
    if (Array.isArray(t.avances)) {
      for (const a of t.avances) {
        if (a.foto && a.foto.startsWith('data:image/')) pendientes++;
      }
    }
  }

  return { migrados: count, totalPendientes: pendientes };
}

module.exports = {
  isConfigurado,
  subirImagenNube,
  migrarFotosExistentes
};
