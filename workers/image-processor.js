// ===== WEB WORKER PARA PROCESAMIENTO DE IMÁGENES =====
// Worker optimizado para filtros pesados con OffscreenCanvas

class ImageProcessor {
  constructor() {
    this.supportOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
    console.log('🔧 ImageProcessor iniciado, OffscreenCanvas support:', this.supportOffscreenCanvas);
  }

  // Procesar imagen con filtros específicos
  processImage(imageData, filters) {
    try {
      console.log('🎨 Worker procesando filtros:', filters);
      
      // Crear canvas para procesamiento
      const canvas = this.supportOffscreenCanvas 
        ? new OffscreenCanvas(imageData.width, imageData.height)
        : this.createFallbackCanvas(imageData.width, imageData.height);
      
      const ctx = canvas.getContext('2d');
      
      // Aplicar filtros pesados usando ImageData manipulation
      const processedData = this.applyHeavyFilters(imageData, filters);
      
      return processedData;
      
    } catch (error) {
      console.error('❌ Error en worker:', error);
      throw error;
    }
  }

  // Aplicar filtros computacionalmente pesados
  applyHeavyFilters(imageData, filters) {
    const data = new Uint8ClampedArray(imageData.data);
    const width = imageData.width;
    const height = imageData.height;

    // Aplicar blur si es pesado (> 3px)
    if (filters.blur && Math.abs(filters.blur) > 3) {
      this.applyBoxBlur(data, width, height, Math.abs(filters.blur));
    }

    // Aplicar contrast si es pesado (> 150%)
    if (filters.contrast && Math.abs(filters.contrast - 100) > 50) {
      this.applyContrast(data, filters.contrast);
    }

    // Aplicar saturation si es pesada (> 150%)
    if (filters.saturation && Math.abs(filters.saturation - 100) > 50) {
      this.applySaturation(data, filters.saturation);
    }

    // Aplicar brightness si es pesado
    if (filters.brightness && Math.abs(filters.brightness - 100) > 50) {
      this.applyBrightness(data, filters.brightness);
    }

    return new ImageData(data, width, height);
  }

  // Algoritmo de Box Blur optimizado
  applyBoxBlur(data, width, height, radius) {
    const kernelSize = Math.floor(radius * 2) + 1;
    const halfKernel = Math.floor(kernelSize / 2);
    
    // Crear buffer temporal
    const temp = new Uint8ClampedArray(data.length);
    
    // Blur horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        
        for (let kx = -halfKernel; kx <= halfKernel; kx++) {
          const sampleX = Math.max(0, Math.min(width - 1, x + kx));
          const sampleIndex = (y * width + sampleX) * 4;
          
          r += data[sampleIndex];
          g += data[sampleIndex + 1];
          b += data[sampleIndex + 2];
          a += data[sampleIndex + 3];
          count++;
        }
        
        temp[pixelIndex] = r / count;
        temp[pixelIndex + 1] = g / count;
        temp[pixelIndex + 2] = b / count;
        temp[pixelIndex + 3] = a / count;
      }
    }
    
    // Blur vertical
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          const sampleY = Math.max(0, Math.min(height - 1, y + ky));
          const sampleIndex = (sampleY * width + x) * 4;
          
          r += temp[sampleIndex];
          g += temp[sampleIndex + 1];
          b += temp[sampleIndex + 2];
          a += temp[sampleIndex + 3];
          count++;
        }
        
        data[pixelIndex] = r / count;
        data[pixelIndex + 1] = g / count;
        data[pixelIndex + 2] = b / count;
        data[pixelIndex + 3] = a / count;
      }
    }
  }

  // Aplicar contraste optimizado
  applyContrast(data, contrast) {
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
      data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
      data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
      // Alpha channel unchanged
    }
  }

  // Aplicar saturación optimizada
  applySaturation(data, saturation) {
    const sat = saturation / 100;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Convert to grayscale using luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Apply saturation
      data[i] = Math.max(0, Math.min(255, gray + sat * (r - gray)));
      data[i + 1] = Math.max(0, Math.min(255, gray + sat * (g - gray)));
      data[i + 2] = Math.max(0, Math.min(255, gray + sat * (b - gray)));
      // Alpha channel unchanged
    }
  }

  // Aplicar brillo optimizado
  applyBrightness(data, brightness) {
    const factor = brightness / 100;
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] * factor));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * factor));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * factor));
      // Alpha channel unchanged
    }
  }

  // Fallback canvas para navegadores sin OffscreenCanvas
  createFallbackCanvas(width, height) {
    // En worker context, esto no funcionará, pero es para compatibilidad
    return {
      width,
      height,
      getContext: () => null
    };
  }
}

// Worker message handler
const processor = new ImageProcessor();

self.onmessage = function(e) {
  const { id, imageData, filters } = e.data;
  
  try {
    console.log(`🔧 Worker procesando job ${id}`);
    
    // Procesar imagen
    const processedData = processor.processImage(imageData, filters);
    
    // Enviar resultado (usar transferable objects para mejor performance)
    self.postMessage({
      id,
      success: true,
      result: processedData
    }, [processedData.data.buffer]);
    
    console.log(`✅ Worker completó job ${id}`);
    
  } catch (error) {
    console.error(`❌ Worker error en job ${id}:`, error);
    
    // Enviar error
    self.postMessage({
      id,
      success: false,
      error: error.message
    });
  }
};

// Worker startup
console.log('🚀 Image Processing Worker iniciado');
