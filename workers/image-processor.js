// Web Worker para procesamiento de imágenes pesado
class ImageProcessor {
  constructor() {
    this.canvas = new OffscreenCanvas(800, 600);
    this.ctx = this.canvas.getContext('2d');
  }

  async processImage(imageData, operations) {
    const img = await this.createImageBitmap(imageData);
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    
    // Aplicar operaciones optimizadas
    this.ctx.drawImage(img, 0, 0);
    
    for (const operation of operations) {
      await this.applyOperation(operation);
    }
    
    return this.canvas.transferToImageBitmap();
  }

  async applyOperation(operation) {
    switch (operation.type) {
      case 'watermark-text':
        this.applyTextWatermark(operation.config);
        break;
      case 'watermark-image':
        await this.applyImageWatermark(operation.config);
        break;
      case 'filter':
        this.applyFilter(operation.config);
        break;
    }
  }

  applyTextWatermark(config) {
    this.ctx.font = `${config.size}px ${config.font}`;
    this.ctx.fillStyle = config.color;
    this.ctx.globalAlpha = config.opacity;
    this.ctx.fillText(config.text, config.x, config.y);
    this.ctx.globalAlpha = 1;
  }

  async applyImageWatermark(config) {
    const watermarkImg = await this.createImageBitmap(config.imageData);
    this.ctx.globalAlpha = config.opacity;
    this.ctx.drawImage(
      watermarkImg, 
      config.x, 
      config.y, 
      config.width, 
      config.height
    );
    this.ctx.globalAlpha = 1;
  }

  applyFilter(config) {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    
    // Aplicar filtros optimizados
    switch (config.type) {
      case 'brightness':
        this.adjustBrightness(data, config.value);
        break;
      case 'contrast':
        this.adjustContrast(data, config.value);
        break;
      case 'saturation':
        this.adjustSaturation(data, config.value);
        break;
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }

  adjustBrightness(data, brightness) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] + brightness));     // R
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + brightness)); // G
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + brightness)); // B
    }
  }

  adjustContrast(data, contrast) {
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
      data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
      data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
    }
  }

  adjustSaturation(data, saturation) {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = Math.min(255, Math.max(0, gray + saturation * (data[i] - gray)));
      data[i + 1] = Math.min(255, Math.max(0, gray + saturation * (data[i + 1] - gray)));
      data[i + 2] = Math.min(255, Math.max(0, gray + saturation * (data[i + 2] - gray)));
    }
  }
}

// Worker message handler
self.onmessage = async function(e) {
  const { id, type, data } = e.data;
  const processor = new ImageProcessor();
  
  try {
    let result;
    
    switch (type) {
      case 'process':
        result = await processor.processImage(data.imageData, data.operations);
        break;
      default:
        throw new Error(`Unknown operation: ${type}`);
    }
    
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
