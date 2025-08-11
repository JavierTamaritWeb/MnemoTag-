 // Variables globales optimizadas
    let currentImage = null;
    let canvas = null;
    let ctx = null;
    let currentFile = null;
    let originalExtension = 'jpg';
    let lastDownloadDirectory = null;
    
    // Variables para redimensionado
    let originalImageDimensions = { width: 0, height: 0 };
    let isResizing = false;
    
    // Variables para rotación
    let currentRotation = 0; // Degrees: 0, 90, 180, 270
    let isFlippedHorizontally = false;
    let isFlippedVertically = false;
    
    // Variables para zoom
    let currentZoom = 1.0; // Factor de zoom (1.0 = 100%)
    let minZoom = 0.1; // Zoom mínimo (10%)
    let maxZoom = 5.0; // Zoom máximo (500%)
    let zoomStep = 0.1; // Incremento del zoom (10%)
    let isZoomed = false;
    
    // Variables para pan (navegación con zoom)
    let panX = 0; // Posición X del pan
    let panY = 0; // Posición Y del pan
    let isPanning = false; // Estado de arrastre
    let startPanX = 0; // Posición inicial X del mouse
    let startPanY = 0; // Posición inicial Y del mouse
    let startOffsetX = 0; // Offset inicial X
    let startOffsetY = 0; // Offset inicial Y
    
    // Variables para configuración de salida
    let outputQuality = 0.8; // Valor por defecto (80%)
    let outputFormat = 'jpeg'; // Formato por defecto
    
    // Variables para posicionamiento interactivo de imagen
    let customImagePosition = null;
    let isPositioningMode = false;
    let watermarkImagePreview = null;
    
    // Sistema de historial para deshacer/rehacer
    const historyManager = {
      states: [],
      currentIndex: -1,
      maxStates: 20,
      
      saveState: function() {
        if (!canvas || !currentImage) return;
        
        // Remover estados futuros si estamos en medio del historial
        this.states = this.states.slice(0, this.currentIndex + 1);
        
        // Guardar estado actual
        const state = {
          imageData: canvas.toDataURL(),
          metadata: this.getCurrentMetadata(),
          watermarkConfig: this.getCurrentWatermarkConfig(),
          timestamp: Date.now()
        };
        
        this.states.push(state);
        this.currentIndex++;
        
        // Limitar el número de estados
        if (this.states.length > this.maxStates) {
          this.states.shift();
          this.currentIndex--;
        }
        
        this.updateUndoRedoButtons();
      },
      
      undo: function() {
        if (this.currentIndex > 0) {
          this.currentIndex--;
          this.restoreState(this.states[this.currentIndex]);
          this.updateUndoRedoButtons();
          UIManager.showSuccess('Acción deshecha');
        }
      },
      
      redo: function() {
        if (this.currentIndex < this.states.length - 1) {
          this.currentIndex++;
          this.restoreState(this.states[this.currentIndex]);
          this.updateUndoRedoButtons();
          UIManager.showSuccess('Acción rehecha');
        }
      },
      
      canUndo: function() {
        return this.currentIndex > 0;
      },
      
      canRedo: function() {
        return this.currentIndex < this.states.length - 1;
      },
      
      updateUndoRedoButtons: function() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        
        if (undoBtn) {
          undoBtn.disabled = !this.canUndo();
          undoBtn.style.opacity = this.canUndo() ? '1' : '0.5';
        }
        
        if (redoBtn) {
          redoBtn.disabled = !this.canRedo();
          redoBtn.style.opacity = this.canRedo() ? '1' : '0.5';
        }
      },
      
      getCurrentMetadata: function() {
        const form = document.getElementById('metadata-form');
        if (!form) return {};
        
        const formData = new FormData(form);
        return Object.fromEntries(formData);
      },
      
      getCurrentWatermarkConfig: function() {
        return {
          textEnabled: document.getElementById('watermark-text-enabled')?.checked || false,
          imageEnabled: document.getElementById('watermark-image-enabled')?.checked || false,
          text: document.getElementById('watermark-text')?.value || '',
          font: document.getElementById('watermark-font')?.value || 'Arial',
          color: document.getElementById('watermark-color')?.value || '#000000',
          size: document.getElementById('watermark-size')?.value || '24',
          opacity: document.getElementById('watermark-opacity')?.value || '50',
          position: document.getElementById('watermark-position')?.value || 'bottom-right',
          imageOpacity: document.getElementById('watermark-image-opacity')?.value || '50',
          imageSize: document.getElementById('watermark-image-size')?.value || 'medium',
          imagePosition: document.getElementById('watermark-image-position')?.value || 'bottom-right',
          customPosition: customImagePosition
        };
      },
      
      restoreState: function(state) {
        if (!state || !canvas) return;
        
        const img = new Image();
        img.onload = function() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          
          // Restaurar metadatos
          if (state.metadata) {
            const form = document.getElementById('metadata-form');
            if (form) {
              Object.entries(state.metadata).forEach(([key, value]) => {
                const field = form.querySelector(`[name="${key}"]`);
                if (field) field.value = value;
              });
            }
          }
          
          // Restaurar configuración de marca de agua
          if (state.watermarkConfig) {
            const config = state.watermarkConfig;
            Object.entries(config).forEach(([key, value]) => {
              const element = document.getElementById(`watermark-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
              if (element) {
                if (element.type === 'checkbox') {
                  element.checked = value;
                } else {
                  element.value = value;
                }
              }
            });
            
            if (config.customPosition) {
              customImagePosition = config.customPosition;
            }
          }
          
          toggleWatermarkType();
        };
        img.src = state.imageData;
      },
      
      clear: function() {
        this.states = [];
        this.currentIndex = -1;
        this.updateUndoRedoButtons();
      }
    };
    
    // Cache para optimización de rendimiento - MEJORADO
    const cache = {
      watermarkImage: null,
      lastWatermarkConfig: null,
      processedImages: new Map(),
      thumbnails: new Map(),
      
      // Configuración del cache
      maxSize: 50, // Máximo 50 imágenes en cache
      maxAge: 30 * 60 * 1000, // 30 minutos
      
      // Generar clave única para cache
      generateKey: function(config) {
        return JSON.stringify(config);
      },
      
      // Obtener del cache
      get: function(key) {
        const item = this.processedImages.get(key);
        if (!item) return null;
        
        // Verificar si ha expirado
        if (Date.now() - item.timestamp > this.maxAge) {
          this.processedImages.delete(key);
          return null;
        }
        
        // Actualizar timestamp (LRU)
        item.timestamp = Date.now();
        return item.data;
      },
      
      // Guardar en cache
      set: function(key, data) {
        // Limpiar cache si está lleno
        if (this.processedImages.size >= this.maxSize) {
          this.cleanOldest();
        }
        
        this.processedImages.set(key, {
          data: data,
          timestamp: Date.now(),
          size: this.estimateSize(data)
        });
      },
      
      // Limpiar entradas más antiguas
      cleanOldest: function() {
        let oldest = null;
        let oldestTime = Date.now();
        
        for (const [key, item] of this.processedImages.entries()) {
          if (item.timestamp < oldestTime) {
            oldestTime = item.timestamp;
            oldest = key;
          }
        }
        
        if (oldest) {
          this.processedImages.delete(oldest);
        }
      },
      
      // Estimar tamaño de datos
      estimateSize: function(data) {
        if (typeof data === 'string') {
          return data.length * 2; // UTF-16
        }
        return 1000; // Estimación por defecto
      },
      
      // Limpiar cache completo
      clear: function() {
        this.processedImages.clear();
        this.thumbnails.clear();
        this.watermarkImage = null;
        this.lastWatermarkConfig = null;
      },
      
      // Obtener estadísticas del cache
      getStats: function() {
        const totalSize = Array.from(this.processedImages.values())
          .reduce((sum, item) => sum + (item.size || 0), 0);
          
        return {
          entries: this.processedImages.size,
          totalSize: totalSize,
          maxSize: this.maxSize,
          hitRate: this.hitCount / (this.hitCount + this.missCount) || 0
        };
      }
    };

    // Sistema de gestión de workers para procesamiento de imágenes
    const WorkerManager = {
      workers: new Map(),
      maxWorkers: navigator.hardwareConcurrency || 4,
      activeJobs: new Map(),
      jobIdCounter: 0,
      
      // Verificar soporte de workers
      isSupported: function() {
        return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
      },
      
      // Verificar soporte de workers (alias)
      supportsWorkers: function() {
        return this.isSupported();
      },
      
      // Verificar soporte de transferable objects
      supportsTransferableObjects: function() {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const imageData = ctx.createImageData(1, 1);
          return imageData.data.buffer instanceof ArrayBuffer;
        } catch (e) {
          return false;
        }
      },
      
      // Crear worker pool
      initializeWorkerPool: function() {
        if (!this.supportsWorkers()) {
          console.warn('⚠️ Workers no soportados, usando fallback');
          return false;
        }
        
        try {
          for (let i = 0; i < Math.min(2, this.maxWorkers); i++) {
            const worker = new Worker('workers/image-processor.js');
            worker.onmessage = this.handleWorkerMessage.bind(this);
            worker.onerror = this.handleWorkerError.bind(this);
            this.workers.set(i, {
              worker: worker,
              busy: false,
              lastUsed: Date.now()
            });
          }
          console.log(`🔧 Worker pool inicializado con ${this.workers.size} workers`);
          return true;
        } catch (error) {
          console.error('❌ Error al inicializar workers:', error);
          return false;
        }
      },
      
      // Obtener worker disponible
      getAvailableWorker: function() {
        for (const [id, workerInfo] of this.workers.entries()) {
          if (!workerInfo.busy) {
            workerInfo.busy = true;
            workerInfo.lastUsed = Date.now();
            return { id, worker: workerInfo.worker };
          }
        }
        return null;
      },
      
      // Liberar worker
      releaseWorker: function(workerId) {
        const workerInfo = this.workers.get(workerId);
        if (workerInfo) {
          workerInfo.busy = false;
          workerInfo.lastUsed = Date.now();
        }
      },
      
      // Manejar mensajes de workers
      handleWorkerMessage: function(e) {
        const { id, result, error } = e.data;
        const job = this.activeJobs.get(id);
        
        if (!job) {
          console.warn(`⚠️ Job ${id} no encontrado`);
          return;
        }
        
        // Liberar worker
        this.releaseWorker(job.workerId);
        
        // Resolver/rechazar promesa
        if (error) {
          job.reject(new Error(error));
        } else {
          job.resolve(result);
        }
        
        // Limpiar job
        this.activeJobs.delete(id);
        
        console.log(`✅ Job ${id} completado`);
      },
      
      // Manejar errores de workers
      handleWorkerError: function(error) {
        console.error('❌ Error en worker:', error);
        
        // Limpiar jobs activos relacionados
        for (const [jobId, job] of this.activeJobs.entries()) {
          if (job.workerId === error.target.workerId) {
            job.reject(new Error('Worker error: ' + error.message));
            this.activeJobs.delete(jobId);
          }
        }
      },
      
      // Procesar imagen en worker
      processInWorker: function(imageData, operations) {
        return new Promise((resolve, reject) => {
          // Verificar disponibilidad de worker
          const workerInfo = this.getAvailableWorker();
          if (!workerInfo) {
            reject(new Error('No hay workers disponibles'));
            return;
          }
          
          // Crear job ID único
          const jobId = ++this.jobIdCounter;
          
          // Guardar job
          this.activeJobs.set(jobId, {
            resolve,
            reject,
            workerId: workerInfo.id,
            startTime: Date.now()
          });
          
          // Preparar datos para transferencia
          const transferableData = this.prepareTransferableData(imageData, operations);
          
          // Enviar al worker
          try {
            workerInfo.worker.postMessage({
              id: jobId,
              type: 'process',
              data: transferableData.data
            }, transferableData.transferables);
            
            console.log(`🚀 Job ${jobId} enviado a worker ${workerInfo.id}`);
          } catch (error) {
            // Liberar worker y rechazar
            this.releaseWorker(workerInfo.id);
            this.activeJobs.delete(jobId);
            reject(error);
          }
        });
      },
      
      // Preparar datos transferables
      prepareTransferableData: function(imageData, operations) {
        const transferables = [];
        let processedImageData = imageData;
        
        // Si soporta transferable objects, preparar ImageData
        if (this.supportsTransferableObjects() && imageData instanceof ImageData) {
          // Clonar buffer para transferencia
          const buffer = imageData.data.buffer.slice();
          processedImageData = {
            data: new Uint8ClampedArray(buffer),
            width: imageData.width,
            height: imageData.height
          };
          transferables.push(buffer);
        }
        
        // Procesar operaciones para transferencia
        const processedOperations = operations.map(op => {
          if (op.type === 'watermark-image' && op.config.imageData) {
            // Manejar datos de imagen de marca de agua
            const watermarkBuffer = op.config.imageData.data.buffer.slice();
            transferables.push(watermarkBuffer);
            return {
              ...op,
              config: {
                ...op.config,
                imageData: {
                  data: new Uint8ClampedArray(watermarkBuffer),
                  width: op.config.imageData.width,
                  height: op.config.imageData.height
                }
              }
            };
          }
          return op;
        });
        
        return {
          data: {
            imageData: processedImageData,
            operations: processedOperations
          },
          transferables
        };
      },
      
      // Terminar todos los workers
      terminateWorkers: function() {
        for (const [id, workerInfo] of this.workers.entries()) {
          workerInfo.worker.terminate();
        }
        this.workers.clear();
        this.activeJobs.clear();
        console.log('🔌 Todos los workers terminados');
      },
      
      // Obtener estadísticas
      getStats: function() {
        const busyWorkers = Array.from(this.workers.values()).filter(w => w.busy).length;
        return {
          totalWorkers: this.workers.size,
          busyWorkers,
          availableWorkers: this.workers.size - busyWorkers,
          activeJobs: this.activeJobs.size,
          supportsWorkers: this.supportsWorkers(),
          supportsTransferables: this.supportsTransferableObjects()
        };
      }
    };

    // Sistema de fallback para navegadores sin soporte de workers
    const FallbackProcessor = {
      // Procesar imagen en el hilo principal (fallback)
      processInMainThread: function(imageData, operations) {
        return new Promise((resolve, reject) => {
          try {
            console.log('⚠️ Procesando en hilo principal (fallback)');
            
            // Crear canvas temporal
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            tempCanvas.width = imageData.width;
            tempCanvas.height = imageData.height;
            
            // Dibujar imagen inicial
            tempCtx.putImageData(imageData, 0, 0);
            
            // Aplicar operaciones secuencialmente
            for (const operation of operations) {
              this.applyOperationFallback(tempCtx, operation);
            }
            
            // Obtener resultado
            const resultImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            
            // Simular async con setTimeout para no bloquear UI
            setTimeout(() => {
              resolve(resultImageData);
            }, 0);
            
          } catch (error) {
            reject(error);
          }
        });
      },
      
      // Aplicar operación en fallback
      applyOperationFallback: function(ctx, operation) {
        switch (operation.type) {
          case 'watermark-text':
            this.applyTextWatermarkFallback(ctx, operation.config);
            break;
          case 'watermark-image':
            this.applyImageWatermarkFallback(ctx, operation.config);
            break;
          case 'filter':
            this.applyFilterFallback(ctx, operation.config);
            break;
        }
      },
      
      // Aplicar marca de agua de texto (fallback)
      applyTextWatermarkFallback: function(ctx, config) {
        ctx.save();
        ctx.font = `${config.size}px ${config.font}`;
        ctx.fillStyle = config.color;
        ctx.globalAlpha = config.opacity;
        ctx.fillText(config.text, config.x, config.y);
        ctx.restore();
      },
      
      // Aplicar marca de agua de imagen (fallback)
      applyImageWatermarkFallback: function(ctx, config) {
        if (!config.imageElement) return;
        
        ctx.save();
        ctx.globalAlpha = config.opacity;
        ctx.drawImage(
          config.imageElement,
          config.x,
          config.y,
          config.width,
          config.height
        );
        ctx.restore();
      },
      
      // Aplicar filtro (fallback)
      applyFilterFallback: function(ctx, config) {
        const canvas = ctx.canvas;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        switch (config.type) {
          case 'brightness':
            this.adjustBrightnessFallback(data, config.value);
            break;
          case 'contrast':
            this.adjustContrastFallback(data, config.value);
            break;
          case 'saturation':
            this.adjustSaturationFallback(data, config.value);
            break;
        }
        
        ctx.putImageData(imageData, 0, 0);
      },
      
      // Métodos de ajuste de filtros (fallback)
      adjustBrightnessFallback: function(data, brightness) {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, data[i] + brightness));
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + brightness));
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + brightness));
        }
      },
      
      adjustContrastFallback: function(data, contrast) {
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
          data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
          data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
        }
      },
      
      adjustSaturationFallback: function(data, saturation) {
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = Math.min(255, Math.max(0, gray + saturation * (data[i] - gray)));
          data[i + 1] = Math.min(255, Math.max(0, gray + saturation * (data[i + 1] - gray)));
          data[i + 2] = Math.min(255, Math.max(0, gray + saturation * (data[i + 2] - gray)));
        }
      }
    };

    // Sistema de debouncing inteligente mejorado
    const SmartDebounce = {
      timers: new Map(),
      animationFrames: new Map(),
      
      // Debounce inteligente con 150ms optimizado
      intelligent: function(key, func, delay = 150) {
        return (...args) => {
          // Cancelar timer anterior si existe
          if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
          }
          
          // Cancelar animation frame anterior si existe
          if (this.animationFrames.has(key)) {
            cancelAnimationFrame(this.animationFrames.get(key));
            this.animationFrames.delete(key);
          }
          
          // Crear nuevo timer
          const timer = setTimeout(() => {
            // Ejecutar en el próximo animation frame para mejor performance
            const frameId = requestAnimationFrame(() => {
              func.apply(this, args);
              this.animationFrames.delete(key);
            });
            this.animationFrames.set(key, frameId);
            this.timers.delete(key);
          }, delay);
          
          this.timers.set(key, timer);
        };
      },
      
      // Debounce inmediato para casos críticos
      immediate: function(key, func, delay = 50) {
        return (...args) => {
          if (this.animationFrames.has(key)) {
            cancelAnimationFrame(this.animationFrames.get(key));
          }
          
          const frameId = requestAnimationFrame(() => {
            func.apply(this, args);
            this.animationFrames.delete(key);
          });
          this.animationFrames.set(key, frameId);
        };
      },
      
      // Limpiar todos los timers y frames
      clear: function() {
        this.timers.forEach(timer => clearTimeout(timer));
        this.animationFrames.forEach(frameId => cancelAnimationFrame(frameId));
        this.timers.clear();
        this.animationFrames.clear();
      }
    };

    // Cache de estados de filtros para optimización
    const FilterCache = {
      states: new Map(),
      lastApplied: null,
      isDirty: false,
      
      // Guardar estado actual
      saveState: function(key, filterState) {
        const stateHash = this.generateHash(filterState);
        this.states.set(key, {
          filters: { ...filterState },
          hash: stateHash,
          timestamp: Date.now()
        });
        return stateHash;
      },
      
      // Obtener estado guardado
      getState: function(key) {
        return this.states.get(key);
      },
      
      // Verificar si el estado ha cambiado
      hasChanged: function(currentState) {
        const currentHash = this.generateHash(currentState);
        return this.lastApplied !== currentHash;
      },
      
      // Marcar estado como aplicado
      markApplied: function(filterState) {
        this.lastApplied = this.generateHash(filterState);
        this.isDirty = false;
      },
      
      // Generar hash único para estado de filtros
      generateHash: function(filterState) {
        return JSON.stringify(filterState);
      },
      
      // Limpiar cache antiguo (más de 5 minutos)
      cleanup: function() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutos
        
        for (const [key, state] of this.states.entries()) {
          if (now - state.timestamp > maxAge) {
            this.states.delete(key);
          }
        }
      },
      
      // Marcar como sucio (necesita actualización)
      markDirty: function() {
        this.isDirty = true;
      }
    };

    // Sistema de loading states para filtros
    const FilterLoadingManager = {
      activeLoadings: new Set(),
      
      // Mostrar loading state específico para filtros
      showFilterLoading: function(filterName = null) {
        const key = filterName || 'global';
        this.activeLoadings.add(key);
        
        // Mostrar indicador visual
        const indicator = this.createLoadingIndicator(key);
        if (indicator) {
          this.showIndicator(indicator, filterName);
        }
        
        // Deshabilitar controles temporalmente
        this.disableFilterControls(filterName);
      },
      
      // Ocultar loading state
      hideFilterLoading: function(filterName = null) {
        const key = filterName || 'global';
        this.activeLoadings.delete(key);
        
        // Ocultar indicador
        this.hideIndicator(key);
        
        // Rehabilitar controles
        this.enableFilterControls(filterName);
      },
      
      // Mostrar loading específico para worker
      showWorkerLoading: function() {
        this.showFilterLoading('worker');
        
        // Mostrar indicador específico de worker
        const indicator = document.getElementById('filter-loading-worker');
        if (indicator) {
          const textElement = indicator.querySelector('.filter-loading-text');
          if (textElement) {
            textElement.textContent = '🔧 Procesando con Worker...';
          }
        }
      },
      
      // Crear indicador de carga
      createLoadingIndicator: function(key) {
        const existingIndicator = document.getElementById(`filter-loading-${key}`);
        if (existingIndicator) return existingIndicator;
        
        const indicator = document.createElement('div');
        indicator.id = `filter-loading-${key}`;
        indicator.className = 'filter-loading-indicator';
        indicator.innerHTML = `
          <div class="filter-spinner"></div>
          <span class="filter-loading-text">Aplicando filtros...</span>
        `;
        
        return indicator;
      },
      
      // Mostrar indicador
      showIndicator: function(indicator, filterName) {
        if (filterName) {
          // Mostrar junto al control específico
          const control = document.getElementById(filterName);
          if (control && control.parentNode) {
            control.parentNode.appendChild(indicator);
          }
        } else {
          // Mostrar globalmente
          const container = document.querySelector('.filter-controls') || document.querySelector('.filters-section');
          if (container) {
            container.appendChild(indicator);
          }
        }
        
        // Animar entrada
        indicator.style.opacity = '0';
        indicator.style.transform = 'scale(0.8)';
        requestAnimationFrame(() => {
          indicator.style.transition = 'all 0.2s ease';
          indicator.style.opacity = '1';
          indicator.style.transform = 'scale(1)';
        });
      },
      
      // Ocultar indicador
      hideIndicator: function(key) {
        const indicator = document.getElementById(`filter-loading-${key}`);
        if (indicator) {
          indicator.style.transition = 'all 0.2s ease';
          indicator.style.opacity = '0';
          indicator.style.transform = 'scale(0.8)';
          
          setTimeout(() => {
            if (indicator.parentNode) {
              indicator.parentNode.removeChild(indicator);
            }
          }, 200);
        }
      },
      
      // Deshabilitar controles
      disableFilterControls: function(filterName) {
        if (filterName) {
          const control = document.getElementById(filterName);
          if (control) {
            control.disabled = true;
            control.style.opacity = '0.6';
          }
        } else {
          // Deshabilitar todos los controles
          const allControls = document.querySelectorAll('.filter-controls input, .filter-controls button');
          allControls.forEach(control => {
            control.disabled = true;
            control.style.opacity = '0.6';
          });
        }
      },
      
      // Habilitar controles
      enableFilterControls: function(filterName) {
        if (filterName) {
          const control = document.getElementById(filterName);
          if (control) {
            control.disabled = false;
            control.style.opacity = '1';
          }
        } else {
          // Habilitar todos los controles
          const allControls = document.querySelectorAll('.filter-controls input, .filter-controls button');
          allControls.forEach(control => {
            control.disabled = false;
            control.style.opacity = '1';
          });
        }
      },
      
      // Verificar si hay loading activo
      isLoading: function(filterName = null) {
        const key = filterName || 'global';
        return this.activeLoadings.has(key);
      }
    };

    // Debounce function para optimizar eventos (versión básica mantenida para compatibilidad)
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // Throttle function para eventos de alta frecuencia
    function throttle(func, limit) {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }

    // Optimized preview update with intelligent debouncing
    const debouncedUpdatePreview = SmartDebounce.intelligent('preview-update', updatePreview, 150);
    const immediatePreviewUpdate = SmartDebounce.immediate('preview-immediate', updatePreview, 50);

    // Utility functions
    const utils = {
      showLoading: (element) => {
        element.classList.add('loading');
      },
      
      hideLoading: (element) => {
        element.classList.remove('loading');
      },
      
      createProgressBar: (container) => {
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressFill.style.width = '0%';
        progressBar.appendChild(progressFill);
        container.appendChild(progressBar);
        return progressFill;
      },
      
      updateProgress: (progressElement, percentage) => {
        progressElement.style.width = `${percentage}%`;
      },
      
      removeProgress: (container) => {
        const progressBar = container.querySelector('.progress-bar');
        if (progressBar) {
          progressBar.remove();
        }
      }
    };

    document.addEventListener('DOMContentLoaded', function() {
      initializeApp();
      setupFileNaming();
      initializeTheme();
      
    });

    // Enhanced utility functions for better code maintainability
    const UIManager = {
      // Loading state management
      showLoadingState: function(message = 'Procesando...') {
        const existingLoader = document.querySelector('.global-loader');
        if (existingLoader) return;

        const loader = document.createElement('div');
        loader.className = 'global-loader';
        loader.innerHTML = `
          <div class="loader-content">
            <div class="loader-spinner"></div>
            <p class="loader-message">${SecurityManager.sanitizeText(message)}</p>
          </div>
        `;
        document.body.appendChild(loader);
      },

      hideLoadingState: function() {
        const loader = document.querySelector('.global-loader');
        if (loader) {
          loader.remove();
        }
      },

      // Enhanced error handling
      showError: function(message, duration = 5000) {
        this.hideError(); // Clear any existing error
        
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-toast';
        errorContainer.innerHTML = `
          <div class="error-content">
            <span class="error-icon">⚠️</span>
            <span class="error-message">${SecurityManager.sanitizeText(message)}</span>
            <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
          </div>
        `;
        
        document.body.appendChild(errorContainer);
        
        // Auto-hide after duration
        if (duration > 0) {
          setTimeout(() => {
            if (errorContainer.parentNode) {
              errorContainer.remove();
            }
          }, duration);
        }
      },

      hideError: function() {
        const existingErrors = document.querySelectorAll('.error-toast');
        existingErrors.forEach(error => error.remove());
      },

      // Warning messages
      showWarning: function(message, duration = 4000) {
        const warningContainer = document.createElement('div');
        warningContainer.className = 'warning-toast';
        warningContainer.innerHTML = `
          <div class="warning-content">
            <span class="warning-icon">⚠️</span>
            <span class="warning-message">${SecurityManager.sanitizeText(message)}</span>
            <button class="warning-close" onclick="this.parentElement.parentElement.remove()">×</button>
          </div>
        `;
        
        document.body.appendChild(warningContainer);
        
        // Auto-hide after duration
        if (duration > 0) {
          setTimeout(() => {
            if (warningContainer.parentNode) {
              warningContainer.remove();
            }
          }, duration);
        }
      },

      hideWarning: function() {
        const existingWarnings = document.querySelectorAll('.warning-toast');
        existingWarnings.forEach(warning => warning.remove());
      },

      // Enhanced success messages
      showSuccess: function(message, duration = 3000) {
        const successContainer = document.createElement('div');
        successContainer.className = 'success-toast';
        successContainer.innerHTML = `
          <div class="success-content">
            <span class="success-icon">✅</span>
            <span class="success-message">${SecurityManager.sanitizeText(message)}</span>
            <button class="success-close" onclick="this.parentElement.parentElement.remove()">×</button>
          </div>
        `;
        
        document.body.appendChild(successContainer);
        
        // Auto-hide after duration
        setTimeout(() => {
          if (successContainer.parentNode) {
            successContainer.remove();
          }
        }, duration);
      },

      // Form state management
      setFormDisabled: function(formId, disabled) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        const inputs = form.querySelectorAll('input, textarea, select, button');
        inputs.forEach(input => {
          input.disabled = disabled;
        });
        
        if (disabled) {
          form.classList.add('form-disabled');
        } else {
          form.classList.remove('form-disabled');
        }
      },

      // Debounced functions for performance
      debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
          const later = () => {
            clearTimeout(timeout);
            func(...args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        };
      },

      // Throttled functions for performance
      throttle: function(func, limit) {
        let inThrottle;
        return function() {
          const args = arguments;
          const context = this;
          if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
          }
        };
      }
    };

    // Enhanced configuration management
    const AppConfig = {
      // File validation settings
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      
      // Canvas settings
      maxCanvasWidth: 800,
      maxCanvasHeight: 600,
      
      // Validation limits
      maxTextLength: {
        title: 100,
        author: 100,
        description: 500,
        keywords: 200,
        copyright: 200,
        watermarkText: 100
      },
      
      // Performance settings
      debounceDelay: 300,
      throttleDelay: 100,
      
      // UI settings
      animationDuration: 300,
      toastDuration: 3000,
      errorDuration: 5000
    };

    function initializeApp() {
      console.log('Aplicación cargada');
      
      try {
        // Obtener elementos del DOM
        canvas = document.getElementById('preview-canvas');
        if (!canvas) {
          throw new Error('Canvas element not found');
        }
        
        ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas context not available');
        }
        
        // Configurar event listeners
        setupEventListeners();
        
        // Configurar event listeners de filtros con delay para asegurar DOM
        setTimeout(() => {
          console.log('=== CONFIGURACIÓN TARDÍA DE FILTROS ===');
          setupFilterListeners();
        }, 500);
        
        // Configurar collapsibles
        setupCollapsibles();
        
        // Configurar validación en tiempo real
        setupFormValidation();
        
        // Configurar interceptores de errores globales
        setupGlobalErrorHandling();
        
        // Cargar metadatos guardados
        MetadataManager.loadSavedMetadata();
        
        // Initialize character counters
        initCharacterCounters();
        
        // Initialize rotation functionality
        initRotation();
        
        // Initialize zoom keyboard shortcuts
        initZoomKeyboardShortcuts();
        
        // Initialize mouse wheel zoom
        initMouseWheelZoom();
        
        // Initialize pan navigation
        initPanNavigation();
        
        // Initialize mobile responsive features
        initMobileFeatures();
        
        // Inicializar estado de marcas de agua
        setTimeout(() => {
          toggleWatermarkType();
          // Inicializar modo de posicionamiento
          togglePositioningMode();
          // Inicializar controles de salida
          initializeOutputControls();
        }, 100);
        
        console.log('Aplicación inicializada correctamente');
        
      } catch (error) {
        console.error('Error al inicializar la aplicación:', error);
        UIManager.showError('Error al inicializar la aplicación. Por favor, recarga la página.');
      }
    }

    // Global error handling setup
    function setupGlobalErrorHandling() {
      // Manejar errores no capturados
      window.addEventListener('error', function(event) {
        console.error('Error global capturado:', event.error);
        UIManager.showError('Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo.');
      });

      // Manejar promesas rechazadas no capturadas
      window.addEventListener('unhandledrejection', function(event) {
        console.error('Promesa rechazada no manejada:', event.reason);
        UIManager.showError('Error de procesamiento. Por favor, inténtalo de nuevo.');
        event.preventDefault();
      });
    }

    // Enhanced form validation setup
    function setupFormValidation() {
      // Validación para campos de metadatos
      FormValidator.setupRealTimeValidation('title', (value) => {
        if (value.length > 100) {
          return { valid: false, message: 'El título no puede exceder 100 caracteres' };
        }
        return { valid: true };
      });

      FormValidator.setupRealTimeValidation('author', (value) => {
        if (value.length > 100) {
          return { valid: false, message: 'El autor no puede exceder 100 caracteres' };
        }
        return { valid: true };
      });

      FormValidator.setupRealTimeValidation('description', (value) => {
        if (value.length > 500) {
          return { valid: false, message: 'La descripción no puede exceder 500 caracteres' };
        }
        return { valid: true };
      });

      FormValidator.setupRealTimeValidation('keywords', (value) => {
        if (value.length > 200) {
          return { valid: false, message: 'Las palabras clave no pueden exceder 200 caracteres' };
        }
        return { valid: true };
      });

      FormValidator.setupRealTimeValidation('copyright', (value) => {
        if (value.length > 200) {
          return { valid: false, message: 'El copyright no puede exceder 200 caracteres' };
        }
        return { valid: true };
      });

      // Validación para marca de agua de texto
      FormValidator.setupRealTimeValidation('watermark-text', (value) => {
        if (value.length > 100) {
          return { valid: false, message: 'El texto de marca de agua no puede exceder 100 caracteres' };
        }
        // Verificar caracteres especiales peligrosos
        if (/<script|javascript:|on\w+=/i.test(value)) {
          return { valid: false, message: 'El texto contiene caracteres no permitidos' };
        }
        return { valid: true };
      });

      // Validación para dimensiones personalizadas
      FormValidator.setupRealTimeValidation('watermark-image-width', (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 10 || num > 2000) {
          return { valid: false, message: 'El ancho debe estar entre 10 y 2000 píxeles' };
        }
        return { valid: true };
      });

      FormValidator.setupRealTimeValidation('watermark-image-height', (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 10 || num > 2000) {
          return { valid: false, message: 'La altura debe estar entre 10 y 2000 píxeles' };
        }
        return { valid: true };
      });

      // Validación para calidad de imagen
      FormValidator.setupRealTimeValidation('quality-number', (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1 || num > 100) {
          return { valid: false, message: 'La calidad debe estar entre 1% y 100%' };
        }
        return { valid: true };
      });
    }

    // Initialize output controls
    function initializeOutputControls() {
      try {
        // Initialize quality control
        const qualitySelect = document.getElementById('output-quality');
        const qualityNumber = document.getElementById('quality-number');
        
        if (qualitySelect && qualityNumber) {
          // Set default value
          qualitySelect.value = '80';
          qualityNumber.value = '80';
          handleQualityChange();
        }
        
        // Initialize format control
        const formatSelect = document.getElementById('output-format');
        if (formatSelect) {
          // Set default format based on original file or JPEG
          if (originalExtension && ['jpg', 'jpeg'].includes(originalExtension.toLowerCase())) {
            formatSelect.value = 'jpeg';
          } else if (originalExtension && ['png'].includes(originalExtension.toLowerCase())) {
            formatSelect.value = 'png';
          } else if (originalExtension && ['webp'].includes(originalExtension.toLowerCase())) {
            formatSelect.value = 'webp';
          } else if (originalExtension && ['avif'].includes(originalExtension.toLowerCase())) {
            formatSelect.value = 'avif';
          } else {
            formatSelect.value = 'jpeg'; // default fallback
          }
          handleFormatChange();
        }
        
        // Check format support and disable unsupported formats
        checkAndUpdateFormatSupport();
        
        console.log('Output controls initialized successfully');
      } catch (error) {
        console.error('Error initializing output controls:', error);
      }
    }

    // Check format support and update UI
    async function checkAndUpdateFormatSupport() {
      const formatSelect = document.getElementById('output-format');
      if (!formatSelect) return;
      
      const formats = ['webp', 'avif'];
      
      for (const format of formats) {
        const isSupported = await checkFormatSupport(format);
        const option = formatSelect.querySelector(`option[value="${format}"]`);
        
        if (option) {
          if (!isSupported) {
            option.disabled = true;
            option.textContent += ' (No soportado)';
            option.style.color = '#9ca3af';
          }
        }
      }
    }

    // Funciones del tema oscuro
    function initializeTheme() {
      const themeToggle = document.getElementById('theme-toggle');
      const themeIcon = document.getElementById('theme-icon');
      
      // Cargar tema guardado o usar preferencia del sistema
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
      
      setTheme(currentTheme);
      
      // Escuchar cambios en las preferencias del sistema
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
          setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }

    function setTheme(theme) {
      console.log('SetTheme llamado con:', theme);
      const themeIcon = document.getElementById('theme-icon');
      const html = document.documentElement;
      
      if (theme === 'dark') {
        html.setAttribute('data-theme', 'dark');
        if (themeIcon) {
          themeIcon.className = 'fas fa-sun';
        }
        console.log('Tema oscuro aplicado');
      } else {
        html.removeAttribute('data-theme');
        if (themeIcon) {
          themeIcon.className = 'fas fa-moon';
        }
        console.log('Tema claro aplicado');
      }
      
      localStorage.setItem('theme', theme);
    }

    function toggleTheme() {
      console.log('Toggle theme llamado');
      const html = document.documentElement;
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      console.log('Cambiando de', currentTheme, 'a', newTheme);
      setTheme(newTheme);
    }

    function setupFileNaming() {
      const titleInput = document.getElementById('metaTitle');
      const fileInput = document.getElementById('file-input');

      // Agregar funcionalidad para seleccionar todo el texto al hacer clic
      titleInput.addEventListener('click', function() {
        this.select();
      });

      // También seleccionar todo al recibir foco (tabulación)
      titleInput.addEventListener('focus', function() {
        this.select();
      });

      // Cuando se selecciona un archivo
      fileInput.addEventListener('change', function(e) {
        if (e.target.files.length) {
          currentFile = e.target.files[0];
          // Guardar la extensión original del archivo
          originalExtension = currentFile.name.split('.').pop().toLowerCase();
          
          // Obtener el nombre del archivo sin extensión
          const fileNameWithoutExtension = currentFile.name.replace(/\.[^/.]+$/, "");
          
          // Actualizar el placeholder del campo título
          titleInput.placeholder = fileNameWithoutExtension;
          
          // Establecer el título inicial como el nombre del archivo (sin extensión)
          if (!titleInput.value.trim()) {
            titleInput.value = fileNameWithoutExtension;
          }
        }
      });
    }

    // Enhanced Security and Validation Module
    const SecurityManager = {
      // Sanitización de texto para prevenir XSS
      sanitizeText: function(text) {
        if (typeof text !== 'string') return '';
        return text
          .replace(/[<>'"&]/g, function(match) {
            const entities = {
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#x27;',
              '&': '&amp;'
            };
            return entities[match];
          })
          .trim();
      },

      // Validación de entrada de texto
      validateTextInput: function(text, maxLength = 500) {
        if (!text || typeof text !== 'string') return false;
        const sanitized = this.sanitizeText(text);
        return sanitized.length <= maxLength && sanitized.length > 0;
      },

      // Validación de archivos de imagen mejorada
      validateImageFile: function(file) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
        const maxSize = 25 * 1024 * 1024; // 25MB
        const maxDimensions = {
          width: 8000,  // Máximo 8000px de ancho
          height: 8000  // Máximo 8000px de alto
        };
        
        const validation = {
          isValid: true,
          errors: [],
          warnings: [],
          fileInfo: {
            name: file?.name || 'Archivo desconocido',
            size: file?.size || 0,
            type: file?.type || 'Tipo desconocido',
            sizeFormatted: file ? this.formatFileSize(file.size) : '0 B'
          }
        };

        // Validación de existencia del archivo
        if (!file) {
          validation.isValid = false;
          validation.errors.push({
            type: 'MISSING_FILE',
            message: 'No se ha seleccionado ningún archivo',
            details: 'Por favor, selecciona una imagen para continuar.'
          });
          return validation;
        }

        // Validación de tipo MIME
        if (!allowedTypes.includes(file.type)) {
          validation.isValid = false;
          validation.errors.push({
            type: 'INVALID_FORMAT',
            message: 'Formato de archivo no válido',
            details: `Formato detectado: ${file.type}. Solo se permiten: JPG, JPEG, PNG, WEBP y AVIF.`,
            allowedFormats: ['JPG', 'JPEG', 'PNG', 'WEBP', 'AVIF']
          });
        }

        // Validación de tamaño de archivo
        if (file.size > maxSize) {
          validation.isValid = false;
          validation.errors.push({
            type: 'FILE_TOO_LARGE',
            message: 'El archivo es demasiado grande',
            details: `Tamaño actual: ${this.formatFileSize(file.size)}. Tamaño máximo permitido: ${this.formatFileSize(maxSize)}.`,
            currentSize: file.size,
            maxSize: maxSize
          });
        }

        // Validación del nombre del archivo
        const fileName = file.name;
        if (fileName.length > 255) {
          validation.isValid = false;
          validation.errors.push({
            type: 'FILENAME_TOO_LONG',
            message: 'El nombre del archivo es demasiado largo',
            details: `Longitud actual: ${fileName.length} caracteres. Máximo permitido: 255 caracteres.`
          });
        }

        // Validación de caracteres especiales en el nombre
        const invalidChars = /[<>:"/\\|?*\x00-\x1f]/g;
        if (invalidChars.test(fileName)) {
          validation.warnings.push({
            type: 'INVALID_FILENAME_CHARS',
            message: 'El nombre contiene caracteres no recomendados',
            details: 'Se recomienda usar solo letras, números, guiones y puntos.'
          });
        }

        // Verificar extensión del archivo
        const extension = fileName.split('.').pop()?.toLowerCase();
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
        
        if (!extension || !allowedExtensions.includes(extension)) {
          validation.isValid = false;
          validation.errors.push({
            type: 'INVALID_EXTENSION',
            message: 'Extensión de archivo no válida',
            details: `Extensión detectada: .${extension || 'ninguna'}. Extensiones permitidas: ${allowedExtensions.join(', ')}.`
          });
        }

        // Verificación adicional: MIME vs extensión
        const mimeToExtensions = {
          'image/jpeg': ['jpg', 'jpeg'],
          'image/png': ['png'],
          'image/webp': ['webp'],
          'image/avif': ['avif']
        };

        const expectedExtensions = mimeToExtensions[file.type];
        if (expectedExtensions && extension && !expectedExtensions.includes(extension)) {
          validation.warnings.push({
            type: 'MIME_EXTENSION_MISMATCH',
            message: 'La extensión no coincide completamente con el tipo de archivo',
            details: `Tipo detectado: ${file.type}, extensión: .${extension}. Esto podría indicar un problema con el archivo.`
          });
        }

        // Validaciones adicionales para archivos pequeños (posibles archivos corruptos)
        if (file.size < 1024) { // Menos de 1KB
          validation.warnings.push({
            type: 'SUSPICIOUSLY_SMALL',
            message: 'El archivo es muy pequeño',
            details: 'Archivos de imagen muy pequeños podrían estar corruptos o vacíos.'
          });
        }

        return validation;
      },

      // Validación de dimensiones de imagen (se ejecuta después de cargar)
      validateImageDimensions: function(image, maxDimensions = { width: 8000, height: 8000 }) {
        const validation = {
          isValid: true,
          errors: [],
          warnings: [],
          dimensions: {
            width: image.width || image.naturalWidth || 0,
            height: image.height || image.naturalHeight || 0
          }
        };

        const { width, height } = validation.dimensions;

        // Validar dimensiones máximas
        if (width > maxDimensions.width || height > maxDimensions.height) {
          validation.isValid = false;
          validation.errors.push({
            type: 'DIMENSIONS_TOO_LARGE',
            message: 'Las dimensiones de la imagen son demasiado grandes',
            details: `Dimensiones actuales: ${width}x${height}px. Máximo permitido: ${maxDimensions.width}x${maxDimensions.height}px.`,
            currentDimensions: { width, height },
            maxDimensions: maxDimensions
          });
        }

        // Validar dimensiones mínimas
        if (width < 1 || height < 1) {
          validation.isValid = false;
          validation.errors.push({
            type: 'INVALID_DIMENSIONS',
            message: 'Dimensiones de imagen inválidas',
            details: `Dimensiones detectadas: ${width}x${height}px. Las dimensiones deben ser mayores a 0.`
          });
        }

        // Advertencias para imágenes muy grandes
        if (width > 4000 || height > 4000) {
          validation.warnings.push({
            type: 'LARGE_DIMENSIONS',
            message: 'Imagen de dimensiones grandes detectada',
            details: `Dimensiones: ${width}x${height}px. El procesamiento podría ser más lento.`
          });
        }

        // Advertencias para imágenes muy pequeñas
        if (width < 100 || height < 100) {
          validation.warnings.push({
            type: 'SMALL_DIMENSIONS',
            message: 'Imagen de dimensiones pequeñas',
            details: `Dimensiones: ${width}x${height}px. La calidad podría verse afectada al redimensionar.`
          });
        }

        return validation;
      },

      // Generar preview del archivo antes de cargar
      generateFilePreview: function(file, callback) {
        if (!file || typeof callback !== 'function') {
          callback(null, 'Parámetros inválidos para generar preview');
          return;
        }

        const reader = new FileReader();
        
        reader.onload = function(e) {
          try {
            const img = new Image();
            
            img.onload = function() {
              // Crear canvas para el preview
              const previewCanvas = document.createElement('canvas');
              const previewCtx = previewCanvas.getContext('2d');
              
              // Calcular dimensiones del preview (máximo 300px)
              const maxPreviewSize = 300;
              let previewWidth = img.width;
              let previewHeight = img.height;
              
              if (previewWidth > maxPreviewSize || previewHeight > maxPreviewSize) {
                const ratio = Math.min(maxPreviewSize / previewWidth, maxPreviewSize / previewHeight);
                previewWidth = previewWidth * ratio;
                previewHeight = previewHeight * ratio;
              }
              
              previewCanvas.width = previewWidth;
              previewCanvas.height = previewHeight;
              
              // Dibujar preview
              previewCtx.drawImage(img, 0, 0, previewWidth, previewHeight);
              
              const previewData = {
                dataUrl: previewCanvas.toDataURL('image/jpeg', 0.8),
                originalDimensions: { width: img.width, height: img.height },
                previewDimensions: { width: previewWidth, height: previewHeight },
                fileInfo: {
                  name: file.name,
                  size: SecurityManager.formatFileSize(file.size),
                  type: file.type,
                  lastModified: new Date(file.lastModified).toLocaleString()
                }
              };
              
              callback(previewData, null);
            };
            
            img.onerror = function() {
              callback(null, 'Error al cargar la imagen para preview');
            };
            
            img.src = e.target.result;
          } catch (error) {
            callback(null, 'Error al procesar el archivo: ' + error.message);
          }
        };
        
        reader.onerror = function() {
          callback(null, 'Error al leer el archivo');
        };
        
        reader.readAsDataURL(file);
      },

      // Formatear tamaño de archivo
      formatFileSize: function(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
      },

      // Validación de metadatos
      validateMetadata: function(metadata) {
        const validation = {
          isValid: true,
          errors: {},
          sanitized: {}
        };

        const fields = {
          title: { maxLength: 100, required: false },
          author: { maxLength: 100, required: false },
          description: { maxLength: 500, required: false },
          keywords: { maxLength: 200, required: false },
          copyright: { maxLength: 200, required: false }
        };

        for (const [field, rules] of Object.entries(fields)) {
          const value = metadata[field] || '';
          const sanitized = this.sanitizeText(value);
          
          if (rules.required && !sanitized) {
            validation.isValid = false;
            validation.errors[field] = 'Este campo es obligatorio';
            continue;
          }

          if (sanitized.length > rules.maxLength) {
            validation.isValid = false;
            validation.errors[field] = `Máximo ${rules.maxLength} caracteres permitidos`;
            continue;
          }

          validation.sanitized[field] = sanitized;
        }

        return validation;
      },

      // Validación de marca de agua de texto
      validateWatermarkText: function(text, size, opacity) {
        const validation = {
          isValid: true,
          errors: []
        };

        if (!text || typeof text !== 'string') {
          validation.errors.push('El texto de la marca de agua es requerido');
          validation.isValid = false;
        } else {
          const sanitized = this.sanitizeText(text);
          if (sanitized.length > 100) {
            validation.errors.push('El texto de la marca de agua no puede exceder 100 caracteres');
            validation.isValid = false;
          }
        }

        const sizeNum = parseInt(size);
        if (isNaN(sizeNum) || sizeNum < 10 || sizeNum > 200) {
          validation.errors.push('El tamaño debe estar entre 10 y 200 píxeles');
          validation.isValid = false;
        }

        const opacityNum = parseInt(opacity);
        if (isNaN(opacityNum) || opacityNum < 0 || opacityNum > 100) {
          validation.errors.push('La opacidad debe estar entre 0 y 100');
          validation.isValid = false;
        }

        return validation;
      }
    };

    // Form Validation Manager
    const FormValidator = {
      // Mostrar errores de validación
      showFieldError: function(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Remover errores anteriores
        this.clearFieldError(fieldId);

        // Crear elemento de error
        const errorElement = document.createElement('div');
        errorElement.className = 'field-error';
        errorElement.textContent = message;
        errorElement.id = `${fieldId}-error`;

        // Insertar después del campo
        field.parentNode.insertBefore(errorElement, field.nextSibling);
        
        // Agregar clase de error al campo
        field.classList.add('field-invalid');
      },

      // Limpiar errores de campo
      clearFieldError: function(fieldId) {
        const field = document.getElementById(fieldId);
        const errorElement = document.getElementById(`${fieldId}-error`);
        
        if (field) {
          field.classList.remove('field-invalid');
        }
        
        if (errorElement) {
          errorElement.remove();
        }
      },

      // Limpiar todos los errores del formulario
      clearFormErrors: function(formId) {
        const form = document.getElementById(formId);
        if (!form) return;

        const errorElements = form.querySelectorAll('.field-error');
        const invalidFields = form.querySelectorAll('.field-invalid');

        errorElements.forEach(el => el.remove());
        invalidFields.forEach(field => field.classList.remove('field-invalid'));
      },

      // Validación en tiempo real
      setupRealTimeValidation: function(fieldId, validator) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        const validateField = debounce(() => {
          const isValid = validator(field.value);
          if (!isValid.valid) {
            this.showFieldError(fieldId, isValid.message);
          } else {
            this.clearFieldError(fieldId);
          }
        }, 300);

        field.addEventListener('input', validateField);
        field.addEventListener('blur', validateField);
      }
    };

    // Función para sanitizar nombres de archivo - mejorada
    function sanitizeFilename(filename) {
      if (!filename || typeof filename !== 'string') return 'imagen_editada';
      
      return filename
        .toLowerCase()
        .replace(/[^\w\s.-]/g, '') // Solo permitir letras, números, espacios, puntos y guiones
        .replace(/\s+/g, '-')      // Reemplazar espacios con guiones
        .replace(/-+/g, '-')       // Eliminar guiones múltiples
        .replace(/^-+|-+$/g, '')   // Eliminar guiones al inicio y final
        .substring(0, 100)         // Limitar longitud
        .trim() || 'imagen_editada'; // Fallback si queda vacío
    }

    function setupEventListeners() {
      try {
        console.log('=== CONFIGURANDO EVENT LISTENERS ===');
        
        // Configurar listeners para controles de filtros
        console.log('Configurando event listeners para filtros...');
        ['brightness', 'contrast', 'saturation', 'blur'].forEach(filter => {
          const slider = document.getElementById(filter);
          console.log(`Slider ${filter}:`, slider ? 'encontrado' : 'NO encontrado');
          if (slider) {
            slider.addEventListener('input', (e) => {
              FilterManager.applyFilter(filter, parseInt(e.target.value));
            });
          }
        });
        
        // Configurar presets de filtros
        const presetButtons = document.querySelectorAll('.filter-preset');
        console.log(`Botones de presets encontrados: ${presetButtons.length}`);
        presetButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            console.log(`Aplicando preset: ${btn.dataset.filter}`);
            FilterManager.applyPreset(btn.dataset.filter);
          });
        });
        
        // Listener para reset de filtros
        const resetFiltersBtn = document.getElementById('resetFilters');
        if (resetFiltersBtn) {
          resetFiltersBtn.addEventListener('click', resetFilters);
        }
        
        // Listeners para metadatos y geolocalización
        const autocopyrightBtn = document.getElementById('autoCopyright');
        if (autocopyrightBtn) {
          autocopyrightBtn.addEventListener('click', generateAutoCopyright);
        }
        
        const getCurrentLocationBtn = document.getElementById('getCurrentLocation');
        if (getCurrentLocationBtn) {
          getCurrentLocationBtn.addEventListener('click', () => {
            MetadataManager.getCurrentLocation();
          });
        }
        
        // Auto-actualizar copyright cuando cambia el autor
        const authorInput = document.getElementById('metaAuthor');
        if (authorInput) {
          authorInput.addEventListener('blur', () => {
            const copyrightInput = document.getElementById('metaCopyright');
            if (authorInput.value && !copyrightInput.value) {
              // Solo generar automáticamente si no hay copyright ya escrito
              setTimeout(() => generateAutoCopyright(), 100);
            }
          });
        }
        
        // Upload de archivos con optimización
        const dropArea = document.getElementById('drop-area');
        const fileInput = document.getElementById('file-input');
        const fileSelector = document.getElementById('file-selector');
        const removeFile = document.getElementById('remove-file');
        
        // Solo configurar si los elementos existen
        if (dropArea && fileInput && fileSelector && removeFile) {
          // Simplified drag and drop without throttling for testing
          dropArea.addEventListener('dragover', handleDragOver);
          dropArea.addEventListener('dragleave', handleDragLeave);
          dropArea.addEventListener('drop', handleDrop);
          
          // Enhanced file selector
          fileSelector.addEventListener('click', () => fileInput.click());
          fileInput.addEventListener('change', handleFileSelect);
          removeFile.addEventListener('click', removeSelectedFile);
        }
        
        // Form submissions with loading states
        const metadataForm = document.getElementById('metadata-form');
        const watermarkForm = document.getElementById('watermark-form');
        
        if (metadataForm) {
          metadataForm.addEventListener('submit', handleMetadataSubmit);
        }
        
        if (watermarkForm) {
          watermarkForm.addEventListener('submit', handleWatermarkSubmit);
        }

        // Zoom controls
        const zoomInBtn = document.getElementById('zoom-in-btn');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomResetBtn = document.getElementById('zoom-reset-btn');
        const zoomLevel = document.getElementById('zoom-level');

        if (zoomInBtn && zoomOutBtn && zoomResetBtn) {
          zoomInBtn.addEventListener('click', zoomIn);
          zoomOutBtn.addEventListener('click', zoomOut);
          zoomResetBtn.addEventListener('click', resetZoom);
        }
        
        // Watermark type toggle
        const textEnabledCheckbox = document.getElementById('watermark-text-enabled');
        const imageEnabledCheckbox = document.getElementById('watermark-image-enabled');
        
        if (textEnabledCheckbox) {
          textEnabledCheckbox.addEventListener('change', toggleWatermarkType);
        }
        
        if (imageEnabledCheckbox) {
          imageEnabledCheckbox.addEventListener('change', toggleWatermarkType);
        }
        
        // Custom image size toggle
        const watermarkImageSize = document.getElementById('watermark-image-size');
        if (watermarkImageSize) {
          watermarkImageSize.addEventListener('change', toggleCustomImageSize);
        }
        
        // Real-time controls with debouncing for better performance - con verificación de existencia
        const controls = [
          { id: 'watermark-text-enabled', event: 'change' },
          { id: 'watermark-image-enabled', event: 'change' },
          { id: 'watermark-text', event: 'input' },
          { id: 'watermark-font', event: 'change' },
          { id: 'watermark-color', event: 'change' },
          { id: 'watermark-size', event: 'input' },
          { id: 'watermark-opacity', event: 'input' },
          { id: 'watermark-position', event: 'change' },
          { id: 'watermark-image-size', event: 'change' },
          { id: 'watermark-image-opacity', event: 'input' },
          { id: 'watermark-image-position', event: 'change' },
          { id: 'watermark-image-width', event: 'input' },
          { id: 'watermark-image-height', event: 'input' }
        ];
        
        controls.forEach(({ id, event }) => {
          const element = document.getElementById(id);
          if (element) {
            element.addEventListener(event, debouncedUpdatePreview);
          }
        });
        
        // Posicionamiento personalizado para imagen
        const watermarkImagePosition = document.getElementById('watermark-image-position');
        if (watermarkImagePosition) {
          watermarkImagePosition.addEventListener('change', togglePositioningMode);
        }
        
        // Event listener para el canvas en modo posicionamiento
        if (canvas) {
          canvas.addEventListener('click', handleCanvasClick);
        }
        
        // Image watermark controls
        const watermarkImage = document.getElementById('watermark-image');
        if (watermarkImage) {
          watermarkImage.addEventListener('change', handleWatermarkImageChange);
        }
        
        // Action buttons
        const resetChangesBtn = document.getElementById('reset-changes');
        const downloadImageBtn = document.getElementById('download-image');
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        
        if (resetChangesBtn) {
          resetChangesBtn.addEventListener('click', resetChanges);
        }
        
        if (downloadImageBtn) {
          downloadImageBtn.addEventListener('click', downloadImageWithProgress);
        }
        
        if (undoBtn) {
          undoBtn.addEventListener('click', () => historyManager.undo());
        }
        
        if (redoBtn) {
          redoBtn.addEventListener('click', () => historyManager.redo());
        }
        
        // Compare and fullscreen buttons
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        
        console.log('Botón fullscreen encontrado:', fullscreenBtn);
        
        if (fullscreenBtn) {
          fullscreenBtn.addEventListener('click', toggleFullscreen);
        }
        
        // Theme toggle button - CRÍTICO PARA EL MODO OSCURO
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
          themeToggle.addEventListener('click', toggleTheme);
          console.log('Event listener del tema configurado correctamente');
        } else {
          console.error('Botón de tema no encontrado');
        }
        
        // Output configuration controls
        const outputQualitySelect = document.getElementById('output-quality');
        const outputQualityNumber = document.getElementById('quality-number');
        const outputFormatSelect = document.getElementById('output-format');
        const outputHeader = document.getElementById('output-header');
        
        if (outputQualitySelect) {
          outputQualitySelect.addEventListener('input', handleQualityChange);
          outputQualitySelect.addEventListener('change', handleQualityChange);
        }
        
        if (outputQualityNumber) {
          outputQualityNumber.addEventListener('input', handleQualityNumberChange);
          outputQualityNumber.addEventListener('change', handleQualityNumberChange);
          outputQualityNumber.addEventListener('blur', handleQualityNumberChange);
          // Handle Enter key
          outputQualityNumber.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.target.blur();
            }
          });
        }
        
        if (outputFormatSelect) {
          outputFormatSelect.addEventListener('change', handleFormatChange);
        }
        
        if (outputHeader) {
          outputHeader.addEventListener('click', () => toggleCollapsible('output'));
          outputHeader.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleCollapsible('output');
            }
          });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);
        
      } catch (error) {
        console.error('Error configurando event listeners:', error);
      }
    }

    // Configurar listeners de filtros con retraso para asegurar que el DOM esté listo
    function setupFilterListeners() {
      console.log('🔧 Configurando listeners de filtros...');
      
      // Listeners para los sliders de filtros
      const filterSliders = ['brightness', 'contrast', 'saturation', 'blur'];
      filterSliders.forEach(filterId => {
        const slider = document.getElementById(filterId);
        const valueDisplay = document.getElementById(filterId + '-value');
        
        if (slider && valueDisplay) {
          console.log(`✅ Configurando listener para ${filterId}`);
          slider.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.textContent = value;
            console.log(`🎚️ ${filterId} cambiado a: ${value}`);
            
            if (typeof FilterManager !== 'undefined' && FilterManager.applyFilter) {
              FilterManager.applyFilter();
            } else {
              console.warn('❌ FilterManager no está disponible');
            }
          });
        } else {
          console.warn(`❌ No se encontró elemento para ${filterId}`);
          console.warn(`    - Slider encontrado: ${!!slider}`);
          console.warn(`    - ValueDisplay encontrado: ${!!valueDisplay}`);
        }
      });
      
      // Listeners para los botones de presets
      const presetButtons = document.querySelectorAll('.preset-btn');
      console.log(`🎯 Configurando ${presetButtons.length} botones de preset`);
      
      presetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const preset = e.target.dataset.preset;
          console.log(`🎨 Aplicando preset: ${preset}`);
          
          if (typeof FilterManager !== 'undefined' && FilterManager.applyPreset) {
            FilterManager.applyPreset(preset);
          } else {
            console.warn('❌ FilterManager no está disponible para preset');
          }
        });
      });
      
      // Listener para el botón de reset
      const resetBtn = document.getElementById('resetFilters');
      if (resetBtn) {
        console.log('🔄 Configurando botón de reset de filtros');
        resetBtn.addEventListener('click', () => {
          console.log('🧹 Reseteando filtros');
          if (typeof FilterManager !== 'undefined' && FilterManager.reset) {
            FilterManager.reset();
          } else {
            console.warn('❌ FilterManager no está disponible para reset');
          }
        });
      }
    }

    function handleWatermarkImageChange() {
      // Clear cache when new image is selected
      cache.watermarkImage = null;
      cache.lastWatermarkConfig = null;
      debouncedUpdatePreview();
    }

    // Output configuration handlers
    function handleQualityChange() {
      const qualitySelect = document.getElementById('output-quality');
      const qualityNumber = document.getElementById('quality-number');
      const qualityPercentage = document.getElementById('quality-percentage');
      const qualityBar = document.getElementById('quality-bar');
      
      if (!qualitySelect || !qualityNumber || !qualityPercentage || !qualityBar) return;
      
      const qualityValue = parseInt(qualitySelect.value);
      outputQuality = qualityValue / 100;
      
      // Sync the number input with slider
      qualityNumber.value = qualityValue;
      
      // Update percentage display
      qualityPercentage.textContent = qualityValue + '%';
      
      // Update progress bar with smooth animation
      qualityBar.style.width = qualityValue + '%';
      
      // Update color based on quality with more nuanced ranges
      if (qualityValue <= 30) {
        qualityPercentage.className = 'text-sm font-bold text-red-600';
      } else if (qualityValue <= 50) {
        qualityPercentage.className = 'text-sm font-bold text-orange-600';
      } else if (qualityValue <= 70) {
        qualityPercentage.className = 'text-sm font-bold text-yellow-600';
      } else if (qualityValue <= 85) {
        qualityPercentage.className = 'text-sm font-bold text-blue-600';
      } else {
        qualityPercentage.className = 'text-sm font-bold text-green-600';
      }
      
      // Update the slider track color dynamically
      updateSliderBackground(qualityValue);
      
      console.log('Quality changed to:', qualityValue + '%');
    }

    function handleQualityNumberChange() {
      const qualitySelect = document.getElementById('output-quality');
      const qualityNumber = document.getElementById('quality-number');
      
      if (!qualitySelect || !qualityNumber) return;
      
      let qualityValue = parseInt(qualityNumber.value);
      
      // Validate and constrain the value
      if (isNaN(qualityValue) || qualityValue < 1) {
        qualityValue = 1;
      } else if (qualityValue > 100) {
        qualityValue = 100;
      }
      
      // Update both inputs
      qualityNumber.value = qualityValue;
      qualitySelect.value = qualityValue;
      
      // Trigger the main quality change handler
      handleQualityChange();
    }

    function updateSliderBackground(value) {
      const slider = document.getElementById('output-quality');
      if (!slider) return;
      
      // Create a dynamic gradient based on the current value
      const percentage = value / 100;
      const hue1 = 0;   // Red
      const hue2 = 45;  // Orange/Yellow  
      const hue3 = 120; // Green
      
      let currentHue;
      if (percentage <= 0.5) {
        // Interpolate between red and yellow
        currentHue = hue1 + (hue2 - hue1) * (percentage * 2);
      } else {
        // Interpolate between yellow and green
        currentHue = hue2 + (hue3 - hue2) * ((percentage - 0.5) * 2);
      }
      
      const saturation = 70;
      const lightness = 55;
      
      // Update CSS custom property for dynamic coloring
      slider.style.setProperty('--slider-color', `hsl(${currentHue}, ${saturation}%, ${lightness}%)`);
    }

    function handleFormatChange() {
      const formatSelect = document.getElementById('output-format');
      const formatInfo = document.getElementById('format-info');
      const formatTitle = document.getElementById('format-title');
      const formatDescription = document.getElementById('format-description');
      const formatCompatibility = document.getElementById('format-compatibility');
      
      if (!formatSelect || !formatInfo || !formatTitle || !formatDescription || !formatCompatibility) return;
      
      outputFormat = formatSelect.value;
      
      // Remove previous format classes
      formatInfo.className = formatInfo.className.replace(/format-\w+/g, '');
      formatInfo.classList.add('p-3', 'border', 'rounded-md', `format-${outputFormat}`);
      
      // Update format information
      const formatData = getFormatInfo(outputFormat);
      formatTitle.textContent = formatData.title;
      formatDescription.textContent = formatData.description;
      formatCompatibility.textContent = formatData.compatibility;
      formatCompatibility.className = `text-xs mt-1 font-medium ${formatData.compatibilityClass}`;
      
      console.log('Format changed to:', outputFormat);
    }

    function getFormatInfo(format) {
      const formatInfo = {
        jpeg: {
          title: 'JPEG (.jpg)',
          description: 'Ideal para fotografías, menor tamaño de archivo.',
          compatibility: '✓ Compatible con todos los navegadores',
          compatibilityClass: 'text-green-600'
        },
        png: {
          title: 'PNG (.png)',
          description: 'Ideal para imágenes con transparencia, sin pérdida de calidad.',
          compatibility: '✓ Compatible con todos los navegadores',
          compatibilityClass: 'text-green-600'
        },
        webp: {
          title: 'WebP (.webp)',
          description: 'Mejor compresión que JPEG/PNG, menor tamaño de archivo.',
          compatibility: '✓ Compatible con navegadores modernos (95%+)',
          compatibilityClass: 'text-blue-600'
        },
        avif: {
          title: 'AVIF (.avif)',
          description: 'Nueva generación, máxima compresión y calidad.',
          compatibility: '⚠ Compatible con navegadores recientes (80%+)',
          compatibilityClass: 'text-orange-600'
        }
      };
      
      return formatInfo[format] || formatInfo.jpeg;
    }

    // Function to check format support
    function checkFormatSupport(format) {
      return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        
        try {
          const mimeType = `image/${format}`;
          canvas.toBlob((blob) => {
            resolve(blob !== null);
          }, mimeType, 1);
        } catch (error) {
          resolve(false);
        }
        
        // Timeout fallback
        setTimeout(() => resolve(false), 100);
      });
    }

    function handleKeyboardShortcuts(e) {
      // Ctrl+S or Cmd+S to download
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (canvas && currentImage) {
          downloadImage();
        }
      }
      
      // Ctrl+Z or Cmd+Z to undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyManager.canUndo()) {
          historyManager.undo();
        }
      }
      
      // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z to redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        if (historyManager.canRedo()) {
          historyManager.redo();
        }
      }
      
      // Ctrl+R or Cmd+R to reset (prevent page reload)
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (currentImage) {
          resetChanges();
        }
      }
      
      // Escape to close any modals or reset focus
      if (e.key === 'Escape') {
        document.activeElement.blur();
      }
    }

    function setupCollapsibles() {
      const metadataHeader = document.getElementById('metadata-header');
      const watermarkHeader = document.getElementById('watermark-header');
      
      metadataHeader.addEventListener('click', () => toggleCollapsible('metadata'));
      watermarkHeader.addEventListener('click', () => toggleCollapsible('watermark'));
      
      metadataHeader.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCollapsible('metadata');
        }
      });
      
      watermarkHeader.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCollapsible('watermark');
        }
      });
    }

    function toggleCollapsible(section) {
      const header = document.getElementById(`${section}-header`);
      const content = document.getElementById(`${section}-content`);
      const icon = header.querySelector('.section__icon');
      
      const isOpen = content.classList.contains('section__content--open');
      
      if (isOpen) {
        content.classList.remove('section__content--open');
        icon.classList.add('section__icon--collapsed');
        header.setAttribute('aria-expanded', 'false');
        content.setAttribute('aria-hidden', 'true');
      } else {
        content.classList.add('section__content--open');
        icon.classList.remove('section__icon--collapsed');
        header.setAttribute('aria-expanded', 'true');
        content.setAttribute('aria-hidden', 'false');
      }
    }

    function handleDragOver(e) {
      e.preventDefault();
      document.getElementById('drop-area').classList.add('upload__dropzone--active');
    }

    function handleDragLeave(e) {
      e.preventDefault();
      document.getElementById('drop-area').classList.remove('upload__dropzone--active');
    }

    function handleDrop(e) {
      e.preventDefault();
      document.getElementById('drop-area').classList.remove('upload__dropzone--active');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    }

    function handleFileSelect(e) {
      const file = e.target.files[0];
      if (file) {
        handleFile(file);
      }
    }

    // Enhanced file handling with security validation and preview
    function handleFile(file) {
      // Limpiar errores anteriores
      UIManager.hideError();
      
      // Validación completa del archivo
      const validation = SecurityManager.validateImageFile(file);
      
      if (!validation.isValid) {
        // Mostrar errores específicos con detalles
        validation.errors.forEach(error => {
          let errorMessage = error.message;
          if (error.details) {
            errorMessage += `: ${error.details}`;
          }
          UIManager.showError(errorMessage);
        });
        return;
      }

      // Mostrar advertencias si existen
      if (validation.warnings && validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          console.warn('Advertencia:', warning.message, warning.details);
          // Opcionalmente mostrar advertencias al usuario
          UIManager.showWarning && UIManager.showWarning(warning.message);
        });
      }

      // Mostrar preview del archivo antes de cargar
      UIManager.showLoadingState('Generando preview...');
      
      SecurityManager.generateFilePreview(file, function(previewData, error) {
        if (error) {
          UIManager.hideLoadingState();
          UIManager.showError('Error al generar preview: ' + error);
          return;
        }

        // Mostrar preview al usuario
        showFilePreview(previewData, function(userConfirmed) {
          if (!userConfirmed) {
            UIManager.hideLoadingState();
            return;
          }

          // Usuario confirmó, proceder con la carga
          loadImageWithValidation(file, previewData.originalDimensions);
        });
      });
    }

    // Función para mostrar preview del archivo
    function showFilePreview(previewData, callback) {
      const previewModal = document.createElement('div');
      previewModal.className = 'file-preview-modal';
      previewModal.innerHTML = `
        <div class="preview-overlay">
          <div class="preview-container">
            <div class="preview-header">
              <h3>Vista previa del archivo</h3>
              <button class="preview-close" type="button">&times;</button>
            </div>
            <div class="preview-content">
              <div class="preview-image-container">
                <img src="${previewData.dataUrl}" alt="Preview" class="preview-image">
              </div>
              <div class="preview-info">
                <h4>Información del archivo:</h4>
                <ul>
                  <li><strong>Nombre:</strong> ${previewData.fileInfo.name}</li>
                  <li><strong>Tamaño:</strong> ${previewData.fileInfo.size}</li>
                  <li><strong>Tipo:</strong> ${previewData.fileInfo.type}</li>
                  <li><strong>Dimensiones:</strong> ${previewData.originalDimensions.width}x${previewData.originalDimensions.height}px</li>
                  <li><strong>Modificado:</strong> ${previewData.fileInfo.lastModified}</li>
                </ul>
              </div>
            </div>
            <div class="preview-actions">
              <button class="btn btn-secondary preview-cancel" type="button">Cancelar</button>
              <button class="btn btn-primary preview-confirm" type="button">Cargar imagen</button>
            </div>
          </div>
        </div>
      `;

      // Agregar estilos CSS para el modal de preview
      if (!document.getElementById('preview-modal-styles')) {
        const previewStyles = document.createElement('style');
        previewStyles.id = 'preview-modal-styles';
        previewStyles.textContent = `
          .file-preview-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .preview-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
          }
          
          .preview-container {
            position: relative;
            background: var(--bg-card, #ffffff);
            border-radius: 12px;
            max-width: 600px;
            max-height: 80vh;
            margin: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          
          .preview-header {
            padding: 20px;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-secondary, #f8f9fa);
          }
          
          .preview-header h3 {
            margin: 0;
            color: var(--text-primary, #0f172a);
            font-size: 1.25rem;
            font-weight: 600;
          }
          
          .preview-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--text-secondary, #64748b);
            padding: 4px;
            line-height: 1;
          }
          
          .preview-close:hover {
            color: var(--text-primary, #0f172a);
          }
          
          .preview-content {
            padding: 20px;
            display: flex;
            gap: 20px;
            flex: 1;
            overflow: auto;
          }
          
          .preview-image-container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-tertiary, #f1f5f9);
            border-radius: 8px;
            min-height: 200px;
          }
          
          .preview-image {
            max-width: 100%;
            max-height: 300px;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }
          
          .preview-info {
            flex: 1;
            min-width: 250px;
          }
          
          .preview-info h4 {
            margin: 0 0 12px 0;
            color: var(--text-primary, #0f172a);
            font-size: 1rem;
            font-weight: 600;
          }
          
          .preview-info ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .preview-info li {
            padding: 6px 0;
            color: var(--text-secondary, #64748b);
            font-size: 0.875rem;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
          }
          
          .preview-info li:last-child {
            border-bottom: none;
          }
          
          .preview-info strong {
            color: var(--text-primary, #0f172a);
          }
          
          .preview-actions {
            padding: 20px;
            border-top: 1px solid var(--border-color, #e2e8f0);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background: var(--bg-secondary, #f8f9fa);
          }
          
          @media (max-width: 768px) {
            .preview-container {
              margin: 10px;
              max-height: 90vh;
            }
            
            .preview-content {
              flex-direction: column;
              padding: 15px;
            }
            
            .preview-info {
              min-width: auto;
            }
          }
        `;
        document.head.appendChild(previewStyles);
      }

      document.body.appendChild(previewModal);

      // Event listeners
      const closeBtn = previewModal.querySelector('.preview-close');
      const cancelBtn = previewModal.querySelector('.preview-cancel');
      const confirmBtn = previewModal.querySelector('.preview-confirm');
      const overlay = previewModal.querySelector('.preview-overlay');

      function closePreview(confirmed = false) {
        document.body.removeChild(previewModal);
        callback(confirmed);
      }

      closeBtn.addEventListener('click', () => closePreview(false));
      cancelBtn.addEventListener('click', () => closePreview(false));
      confirmBtn.addEventListener('click', () => closePreview(true));
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closePreview(false);
        }
      });

      // Escape key to close
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escapeHandler);
          closePreview(false);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }

    // Función para cargar imagen con validación de dimensiones
    function loadImageWithValidation(file, knownDimensions = null) {
      UIManager.showLoadingState('Validando imagen...');

      // Guardar información del archivo
      currentFile = file;
      const fileExtension = file.name.split('.').pop().toLowerCase();
      originalExtension = fileExtension;
      
      // Verificación adicional del tipo MIME vs extensión
      const mimeToExt = {
        'image/jpeg': ['jpg', 'jpeg'],
        'image/png': ['png'],
        'image/webp': ['webp'],
        'image/avif': ['avif']
      };
      
      const allowedExtensionsForMime = mimeToExt[file.type];
      if (!allowedExtensionsForMime || !allowedExtensionsForMime.includes(fileExtension)) {
        UIManager.hideLoadingState();
        UIManager.showError('La extensión del archivo no coincide con su tipo');
        return;
      }

      // Leer archivo con manejo de errores mejorado
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const img = new Image();
          
          img.onload = function() {
            // Validar dimensiones
            const dimensionValidation = SecurityManager.validateImageDimensions(img);
            
            if (!dimensionValidation.isValid) {
              UIManager.hideLoadingState();
              dimensionValidation.errors.forEach(error => {
                UIManager.showError(`${error.message}: ${error.details}`);
              });
              return;
            }

            // Mostrar advertencias sobre dimensiones si existen
            if (dimensionValidation.warnings && dimensionValidation.warnings.length > 0) {
              dimensionValidation.warnings.forEach(warning => {
                console.warn('Advertencia de dimensiones:', warning.message, warning.details);
              });
            }

            // Proceder con la carga normal
            loadImage(e.target.result, file.name);
          };

          img.onerror = function() {
            UIManager.hideLoadingState();
            UIManager.showError('Error al cargar la imagen. El archivo podría estar corrupto.');
          };

          img.src = e.target.result;
        } catch (error) {
          UIManager.hideLoadingState();
          console.error('Error al procesar la imagen:', error);
          UIManager.showError('Error al procesar la imagen. Por favor, inténtalo de nuevo.');
        }
      };
      
      reader.onerror = function() {
        UIManager.hideLoadingState();
        UIManager.showError('Error al leer el archivo. Por favor, inténtalo de nuevo.');
      };

      reader.readAsDataURL(file);
    }    // Enhanced image loading with validation
    function loadImage(src, fileName) {
      const img = new Image();
      
      img.onload = function() {
        try {
          // Validar dimensiones de la imagen
          if (img.width < 1 || img.height < 1) {
            UIManager.hideLoadingState();
            UIManager.showError('La imagen no tiene dimensiones válidas');
            return;
          }

          // Validar dimensiones máximas (opcional)
          const maxDimension = 8192; // 8K máximo
          if (img.width > maxDimension || img.height > maxDimension) {
            UIManager.hideLoadingState();
            UIManager.showError(`Las dimensiones de la imagen son demasiado grandes. Máximo ${maxDimension}x${maxDimension} píxeles.`);
            return;
          }

          currentImage = img;
          
          // Store original dimensions for resize functionality
          originalWidth = img.width;
          originalHeight = img.height;
          
          // Reset rotation state when loading new image
          currentRotation = 0;
          isFlippedHorizontally = false;
          isFlippedVertically = false;
          
          console.log('=== IMAGEN CARGADA ===');
          console.log('currentImage asignado:', !!currentImage);
          console.log('Dimensiones originales:', originalWidth, 'x', originalHeight);
          
          // Sanitizar y mostrar información del archivo
          const sanitizedFileName = SecurityManager.sanitizeText(fileName);
          const fileNameElement = document.getElementById('file-name');
          const fileInfoElement = document.getElementById('file-info');
          
          if (fileNameElement) {
            fileNameElement.textContent = sanitizedFileName;
          }
          
          if (fileInfoElement) {
            fileInfoElement.classList.remove('file-info--hidden');
          }
          
          // Establecer título inicial si está vacío
          const titleInput = document.getElementById('metaTitle');
          if (titleInput && !titleInput.value.trim()) {
            const nameWithoutExt = sanitizedFileName.replace(/\.[^/.]+$/, "");
            titleInput.value = SecurityManager.sanitizeText(nameWithoutExt);
            titleInput.placeholder = nameWithoutExt;
          }
          
          // Mostrar editor
          const editorContainer = document.getElementById('editor-container');
          if (editorContainer) {
            editorContainer.classList.remove('editor-container--hidden');
          }
          
          // Mostrar controles de zoom
          const zoomControls = document.getElementById('zoom-controls');
          if (zoomControls) {
            zoomControls.classList.remove('hidden');
          }
          
          // Configurar canvas
          setupCanvas();
          
          // Initialize zoom
          currentZoom = 1.0;
          isZoomed = false;
          resetPan(); // Reset pan también
          updateZoomLevel();
          
          // Mostrar información de la imagen
          updateImageInfo();
          
          // Initialize resize functionality
          initResize();
          
          // Update resize inputs with original dimensions
          const widthInput = document.getElementById('resize-width');
          const heightInput = document.getElementById('resize-height');
          if (widthInput) widthInput.value = originalWidth;
          if (heightInput) heightInput.value = originalHeight;
          
          // Update rotation display
          updateRotationDisplay();
          
          // Actualizar vista previa
          updatePreview();
          
          // Limpiar estado de carga
          UIManager.hideLoadingState();
          
          // Inicializar historial con estado inicial
          setTimeout(() => {
            historyManager.clear();
            historyManager.saveState();
          }, 100);
          
        } catch (error) {
          UIManager.hideLoadingState();
          console.error('Error al configurar la imagen:', error);
          UIManager.showError('Error al configurar la imagen. Por favor, inténtalo de nuevo.');
        }
      };
      
      img.onerror = function() {
        UIManager.hideLoadingState();
        UIManager.showError('Error al cargar la imagen. El archivo puede estar corrupto.');
      };
      
      // Timeout para imágenes que no cargan
      const timeout = setTimeout(() => {
        if (!img.complete) {
          UIManager.hideLoadingState();
          UIManager.showError('La carga de la imagen está tomando demasiado tiempo. Por favor, inténtalo de nuevo.');
        }
      }, 10000);
      
      // Limpiar timeout cuando la imagen se carga exitosamente
      const originalOnload = img.onload;
      img.onload = function() {
        clearTimeout(timeout);
        originalOnload.call(this);
      };

      img.src = src;
    }

    function setupCanvas() {
      if (!currentImage) return;
      
      // Ajustar dimensiones máximas según el tamaño de pantalla
      let maxWidth = 800;
      let maxHeight = 600;
      
      // Para pantallas pequeñas, ajustar los límites
      if (window.innerWidth <= 480) {
        maxWidth = Math.min(window.innerWidth - 32, 400); // 32px de padding
        maxHeight = Math.min(window.innerHeight * 0.6, 400); // 60% de altura de ventana
      } else if (window.innerWidth <= 768) {
        maxWidth = Math.min(window.innerWidth - 48, 600); // 48px de padding
        maxHeight = Math.min(window.innerHeight * 0.7, 500);
      }
      
      let { width, height } = currentImage;
      
      // Calcular nuevas dimensiones manteniendo proporción
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      
      // Asegurar que el canvas mantenga sus proporciones
      canvas.style.objectFit = 'contain';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      
      // Configurar zoom con rueda del ratón en el canvas
      canvas.addEventListener('wheel', function(e) {
        if (!currentImage) return;
        e.preventDefault();
        
        const delta = e.deltaY;
        if (delta < 0) {
          zoomInWheel();
        } else if (delta > 0) {
          zoomOutWheel();
        }
      }, { passive: false });
    }

    function updatePreview() {
      if (!currentImage || !ctx) {
        console.log('⚠️ updatePreview: Sin imagen o contexto disponible');
        FilterLoadingManager.hideFilterLoading();
        return;
      }
      
      console.log('🔄 Actualizando preview con filtros optimizados');
      
      // Verificar si necesitamos usar worker para procesamiento pesado
      if (FilterManager.shouldUseWorker()) {
        updatePreviewWithWorker();
      } else {
        updatePreviewStandard();
      }
    }
    
    // Actualización estándar del preview (sin worker)
    function updatePreviewStandard() {
      // Performance optimization: requestAnimationFrame for smooth rendering
      requestAnimationFrame(() => {
        try {
          // Clear canvas with optimized method
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw image with better quality
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
          
          // Apply watermark with caching
          applyWatermarkOptimized();
          
          // Aplicar filtros CSS al canvas (con cache y loading states)
          applyCanvasFilters();
          
          // Save state to history (debounced)
          if (typeof debouncedSaveHistory === 'undefined') {
            window.debouncedSaveHistory = SmartDebounce.intelligent('save-history', () => {
              historyManager.saveState();
            }, 1000);
          }
          debouncedSaveHistory();
          
          console.log('✅ Preview actualizado exitosamente');
          
        } catch (error) {
          console.error('❌ Error al actualizar preview:', error);
          FilterLoadingManager.hideFilterLoading();
        }
      });
    }
    
    // Actualización del preview usando worker para filtros pesados
    async function updatePreviewWithWorker() {
      try {
        console.log('🔧 Usando Worker para filtros pesados');
        
        // Obtener datos de imagen para el worker
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Dibujar imagen base
        tempCtx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
        const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Procesar con worker
        const processedImageData = await FilterManager.applyWithWorker(imageData);
        
        // Aplicar resultado en el canvas principal
        requestAnimationFrame(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.putImageData(processedImageData, 0, 0);
          
          // Aplicar marcas de agua después del procesamiento
          applyWatermarkOptimized();
          
          // Aplicar filtros CSS restantes (no pesados)
          applyCanvasFiltersLight();
          
          // Save state to history
          if (typeof debouncedSaveHistory === 'undefined') {
            window.debouncedSaveHistory = SmartDebounce.intelligent('save-history', () => {
              historyManager.saveState();
            }, 1000);
          }
          debouncedSaveHistory();
          
          console.log('✅ Preview actualizado con Worker exitosamente');
        });
        
      } catch (error) {
        console.warn('⚠️ Worker falló, usando fallback:', error);
        updatePreviewStandard();
      }
    }

    function applyWatermarkOptimized() {
      const textEnabled = document.getElementById('watermark-text-enabled').checked;
      const imageEnabled = document.getElementById('watermark-image-enabled').checked;
      
      // Aplicar marca de agua de texto si está habilitada
      if (textEnabled) {
        applyTextWatermarkOptimized();
      }
      
      // Aplicar marca de agua de imagen si está habilitada
      if (imageEnabled) {
        applyImageWatermarkOptimized();
      }
    }

    function applyTextWatermarkOptimized() {
      const text = document.getElementById('watermark-text').value.trim();
      if (!text) return;
      
      const font = document.getElementById('watermark-font').value;
      const color = document.getElementById('watermark-color').value;
      const size = parseInt(document.getElementById('watermark-size').value);
      const opacity = parseInt(document.getElementById('watermark-opacity').value) / 100;
      const position = document.getElementById('watermark-position').value;
      
      // Cache font configuration for better performance
      const fontConfig = `${size}px ${font}`;
      ctx.font = fontConfig;
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      
      // Add text shadow for better visibility
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      // Calculate position with better precision
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = size;
      
      const positions = getWatermarkPosition(position, textWidth, textHeight);
      
      // Draw text with enhanced quality
      ctx.fillText(text, positions.x, positions.y);
      
      // Reset shadow and opacity
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = 1;
    }

    function applyImageWatermarkOptimized() {
      const watermarkImageInput = document.getElementById('watermark-image');
      if (!watermarkImageInput.files[0]) return;
      
      // Use cached image if available and configuration hasn't changed
      const currentConfig = {
        file: watermarkImageInput.files[0],
        opacity: document.getElementById('watermark-image-opacity').value,
        size: document.getElementById('watermark-image-size').value,
        position: document.getElementById('watermark-image-position').value,
        width: document.getElementById('watermark-image-width').value,
        height: document.getElementById('watermark-image-height').value,
        customPosition: customImagePosition ? JSON.stringify(customImagePosition) : null
      };
      
      const configChanged = !cache.lastWatermarkConfig || 
        JSON.stringify(currentConfig) !== JSON.stringify(cache.lastWatermarkConfig);
      
      if (cache.watermarkImage && !configChanged) {
        drawCachedWatermark(cache.watermarkImage, currentConfig);
        return;
      }
      
      // Load new watermark image
      const reader = new FileReader();
      reader.onload = function(e) {
        const watermarkImg = new Image();
        watermarkImg.onload = function() {
          // Guardar imagen para referencia en el posicionamiento
          watermarkImagePreview = watermarkImg;
          cache.watermarkImage = watermarkImg;
          cache.lastWatermarkConfig = currentConfig;
          drawCachedWatermark(watermarkImg, currentConfig);
        };
        watermarkImg.src = e.target.result;
      };
      reader.readAsDataURL(watermarkImageInput.files[0]);
    }

    function drawCachedWatermark(watermarkImg, config) {
      const opacity = parseInt(config.opacity) / 100;
      const sizeOption = config.size;
      const position = config.position;
      
      // Calculate size with caching
      let { width, height } = calculateWatermarkImageSize(watermarkImg, sizeOption);
      
      // Calculate position usando la función específica para imagen
      const positions = getImageWatermarkPosition(position, width, height);
      
      // Draw image with enhanced quality and shadow
      ctx.globalAlpha = opacity;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      ctx.drawImage(watermarkImg, positions.x, positions.y, width, height);
      
      // Reset effects
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = 1;
    }

    function calculateWatermarkImageSize(img, sizeOption) {
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      let width, height;
      
      switch (sizeOption) {
        case 'small':
          width = Math.min(img.width, canvasWidth * 0.15);
          height = (width / img.width) * img.height;
          break;
        case 'medium':
          width = Math.min(img.width, canvasWidth * 0.25);
          height = (width / img.width) * img.height;
          break;
        case 'large':
          width = Math.min(img.width, canvasWidth * 0.4);
          height = (width / img.width) * img.height;
          break;
        case 'custom':
          width = parseInt(document.getElementById('watermark-image-width').value) || 100;
          height = parseInt(document.getElementById('watermark-image-height').value) || 100;
          break;
        default:
          width = img.width;
          height = img.height;
      }
      
      return { width, height };
    }

    function getWatermarkPosition(position, width, height) {
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const margin = 20;
      
      let x, y;
      
      switch (position) {
        case 'top-left':
          x = margin;
          y = margin + height;
          break;
        case 'top-center':
          x = (canvasWidth - width) / 2;
          y = margin + height;
          break;
        case 'top-right':
          x = canvasWidth - width - margin;
          y = margin + height;
          break;
        case 'center-left':
          x = margin;
          y = (canvasHeight + height) / 2;
          break;
        case 'center':
          x = (canvasWidth - width) / 2;
          y = (canvasHeight + height) / 2;
          break;
        case 'center-right':
          x = canvasWidth - width - margin;
          y = (canvasHeight + height) / 2;
          break;
        case 'bottom-left':
          x = margin;
          y = canvasHeight - margin;
          break;
        case 'bottom-center':
          x = (canvasWidth - width) / 2;
          y = canvasHeight - margin;
          break;
        case 'bottom-right':
          x = canvasWidth - width - margin;
          y = canvasHeight - margin;
          break;
        default:
          x = margin;
          y = margin + height;
      }
      
      return { x, y };
    }

    function getImageWatermarkPosition(position, width, height) {
      // Si es posición personalizada, usar las coordenadas del clic
      if (position === 'custom' && customImagePosition) {
        return {
          x: customImagePosition.x - width / 2,
          y: customImagePosition.y - height / 2
        };
      }
      
      // Si no, usar la función estándar
      return getWatermarkPosition(position, width, height);
    }

    function toggleWatermarkType() {
      const textOptions = document.getElementById('text-watermark-options');
      const imageOptions = document.getElementById('image-watermark-options');
      const textEnabled = document.getElementById('watermark-text-enabled').checked;
      const imageEnabled = document.getElementById('watermark-image-enabled').checked;
      
      // Mostrar/ocultar opciones de texto
      if (textEnabled) {
        textOptions.classList.remove('watermark-options__text--hidden');
        textOptions.classList.add('watermark-options__text');
      } else {
        textOptions.classList.remove('watermark-options__text');
        textOptions.classList.add('watermark-options__text--hidden');
      }
      
      // Mostrar/ocultar opciones de imagen
      if (imageEnabled) {
        imageOptions.classList.remove('watermark-options__image');
        imageOptions.classList.add('watermark-options__image--visible');
      } else {
        imageOptions.classList.remove('watermark-options__image--visible');
        imageOptions.classList.add('watermark-options__image');
      }
      
      updatePreview();
    }

    function toggleCustomImageSize() {
      const sizeSelect = document.getElementById('watermark-image-size');
      const customSizeDiv = document.getElementById('watermark-image-custom-size');
      
      if (sizeSelect.value === 'custom') {
        customSizeDiv.classList.add('watermark-options__custom-size--visible');
        customSizeDiv.classList.remove('watermark-options__custom-size');
      } else {
        customSizeDiv.classList.remove('watermark-options__custom-size--visible');
        customSizeDiv.classList.add('watermark-options__custom-size');
      }
      
      updatePreview();
    }

    // Funciones para posicionamiento personalizado de imagen
    function togglePositioningMode() {
      const positionSelect = document.getElementById('watermark-image-position');
      const customInfo = document.getElementById('custom-position-info');
      
      if (positionSelect.value === 'custom') {
        isPositioningMode = true;
        customInfo.style.display = 'block';
        
        // Agregar clase al canvas para el cursor
        if (canvas) {
          canvas.classList.add('positioning-mode');
        }
        
        // Si ya hay una posición personalizada, mostrar el marcador
        if (customImagePosition) {
          showPositionMarker();
        }
      } else {
        isPositioningMode = false;
        customInfo.style.display = 'none';
        customImagePosition = null;
        
        // Quitar clase del canvas
        if (canvas) {
          canvas.classList.remove('positioning-mode');
        }
        
        // Quitar marcador si existe
        removePositionMarker();
      }
      
      debouncedUpdatePreview();
    }

    function handleCanvasClick(event) {
      if (!isPositioningMode || !watermarkImagePreview) return;
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      
      // Guardar la posición personalizada
      customImagePosition = { x, y };
      
      // Mostrar marcador visual
      showPositionMarker();
      
      // Actualizar vista previa
      updatePreview();
      
      UIManager.showSuccess('Posición de marca de agua actualizada');
    }

    function showPositionMarker() {
      if (!customImagePosition || !canvas) return;
      
      // Quitar marcador anterior si existe
      removePositionMarker();
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      
      const marker = document.createElement('div');
      marker.className = 'custom-position-marker';
      marker.id = 'position-marker';
      
      const displayX = customImagePosition.x * scaleX;
      const displayY = customImagePosition.y * scaleY;
      
      marker.style.left = displayX + 'px';
      marker.style.top = displayY + 'px';
      
      // Agregar al contenedor del canvas
      const container = canvas.parentElement;
      container.style.position = 'relative';
      container.appendChild(marker);
    }

    function removePositionMarker() {
      const marker = document.getElementById('position-marker');
      if (marker) {
        marker.remove();
      }
    }

    // Enhanced metadata form handler with validation
    function handleMetadataSubmit(e) {
      e.preventDefault();
      
      if (!currentImage) {
        showError('Por favor, selecciona una imagen primero.');
        return;
      }

      const form = e.target;
      
      // Limpiar errores anteriores
      FormValidator.clearFormErrors('metadata-form');
      
      // Mostrar estado de carga
      form.classList.add('form-loading');

      try {
        // Recopilar datos del formulario
        const formData = new FormData(form);
        const metadata = Object.fromEntries(formData);
        
        // Validar metadatos
        const validation = SecurityManager.validateMetadata(metadata);
        
        if (!validation.isValid) {
          // Mostrar errores específicos por campo
          for (const [field, error] of Object.entries(validation.errors)) {
            FormValidator.showFieldError(field, error);
          }
          form.classList.remove('form-loading');
          return;
        }

        // Usar metadatos sanitizados
        const sanitizedMetadata = validation.sanitized;
        
        // Aquí podrías implementar la lógica para aplicar metadatos a la imagen
        // Por ejemplo, usando ExifWriter.js o similar para escribir metadatos EXIF
        
        console.log('Metadatos validados y sanitizados:', sanitizedMetadata);
        
        // Mostrar previsualización de metadatos
        showMetadataPreview(sanitizedMetadata);
        
        // Simular procesamiento
        setTimeout(() => {
          form.classList.remove('form-loading');
          UIManager.showSuccess('Metadatos guardados correctamente.');
        }, 500);
        
      } catch (error) {
        form.classList.remove('form-loading');
        console.error('Error al procesar metadatos:', error);
        UIManager.showError('Error al procesar los metadatos. Por favor, inténtalo de nuevo.');
      }
    }

    // Función para mostrar la previsualización de metadatos
    function showMetadataPreview(metadata) {
      const previewContainer = document.getElementById('metadata-preview');
      
      // Campos a mostrar
      const fields = [
        { key: 'title', label: 'Título' },
        { key: 'author', label: 'Autor' },
        { key: 'description', label: 'Descripción' },
        { key: 'keywords', label: 'Palabras clave' },
        { key: 'copyright', label: 'Copyright' }
      ];
      
      let hasContent = false;
      
      // Mostrar cada campo si tiene contenido
      fields.forEach(field => {
        const value = metadata[field.key];
        const fieldElement = document.getElementById(`preview-${field.key}`);
        const valueElement = document.getElementById(`preview-${field.key}-value`);
        
        if (value && value.trim()) {
          fieldElement.classList.remove('preview-field--hidden');
          valueElement.textContent = value;
          hasContent = true;
        } else {
          fieldElement.classList.add('preview-field--hidden');
        }
      });
      
      // Mostrar/ocultar el contenedor principal
      if (hasContent) {
        previewContainer.classList.remove('metadata-preview--hidden');
        previewContainer.classList.add('metadata-preview');
        
        // Scroll suave hacia la previsualización
        setTimeout(() => {
          previewContainer.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest' 
          });
        }, 100);
      } else {
        previewContainer.classList.add('metadata-preview--hidden');
      }
    }

    // Función para ocultar la previsualización de metadatos
    function hideMetadataPreview() {
      const previewContainer = document.getElementById('metadata-preview');
      if (previewContainer) {
        previewContainer.classList.add('metadata-preview--hidden');
        previewContainer.classList.remove('metadata-preview');
      }
    }

    // Enhanced watermark form handler with validation
    function handleWatermarkSubmit(e) {
      e.preventDefault();
      
      if (!currentImage) {
        showError('Por favor, selecciona una imagen primero.');
        return;
      }

      const form = e.target;
      const textEnabled = document.getElementById('watermark-text-enabled').checked;
      const imageEnabled = document.getElementById('watermark-image-enabled').checked;
      
      // Verificar que al menos una opción esté habilitada
      if (!textEnabled && !imageEnabled) {
        UIManager.showError('Debe habilitar al menos un tipo de marca de agua');
        return;
      }
      
      // Limpiar errores anteriores
      FormValidator.clearFormErrors('watermark-form');
      form.classList.add('form-loading');

      try {
        // Validar marca de agua de texto si está habilitada
        if (textEnabled) {
          const text = document.getElementById('watermark-text').value;
          const size = document.getElementById('watermark-size').value;
          const opacity = document.getElementById('watermark-opacity').value;
          
          // Validar marca de agua de texto
          const validation = SecurityManager.validateWatermarkText(text, size, opacity);
          
          if (!validation.isValid) {
            validation.errors.forEach(error => UIManager.showError(error));
            form.classList.remove('form-loading');
            return;
          }
        }
        
        // Validar marca de agua de imagen si está habilitada
        if (imageEnabled) {
          const watermarkImageInput = document.getElementById('watermark-image');
          if (!watermarkImageInput.files[0]) {
            UIManager.showError('Debe seleccionar una imagen para la marca de agua');
            form.classList.remove('form-loading');
            return;
          }
        }
        
        // Aplicar marca de agua
        updatePreview();
        
        setTimeout(() => {
          form.classList.remove('form-loading');
          UIManager.showSuccess('Marca de agua aplicada correctamente.');
        }, 300);
        
      } catch (error) {
        form.classList.remove('form-loading');
        console.error('Error al aplicar marca de agua:', error);
        showError('Error al aplicar la marca de agua. Por favor, inténtalo de nuevo.');
      }
    }

    function resetChanges() {
      if (!currentImage) return;
      
      // Limpiar formularios
      document.getElementById('metadata-form').reset();
      document.getElementById('watermark-form').reset();
      
      // Resetear tipo de marca de agua
      document.getElementById('watermark-text-enabled').checked = true;
      document.getElementById('watermark-image-enabled').checked = false;
      toggleWatermarkType();
      
      // Limpiar posicionamiento personalizado
      customImagePosition = null;
      isPositioningMode = false;
      watermarkImagePreview = null;
      removePositionMarker();
      
      const customInfo = document.getElementById('custom-position-info');
      if (customInfo) {
        customInfo.style.display = 'none';
      }
      
      if (canvas) {
        canvas.classList.remove('positioning-mode');
      }
      
      // Ocultar previsualización de metadatos
      const metadataPreview = document.getElementById('metadata-preview');
      if (metadataPreview) {
        metadataPreview.classList.add('metadata-preview--hidden');
        metadataPreview.classList.remove('metadata-preview');
      }
      
      // Resetear controles de salida
      resetOutputControls();
      
      // Limpiar historial
      historyManager.clear();
      
      // Actualizar vista previa
      updatePreview();
      
      // Guardar estado inicial
      setTimeout(() => {
        historyManager.saveState();
      }, 100);
    }

    function resetOutputControls() {
      // Reset quality to default (80%)
      const qualitySelect = document.getElementById('output-quality');
      const qualityNumber = document.getElementById('quality-number');
      
      if (qualitySelect && qualityNumber) {
        qualitySelect.value = '80';
        qualityNumber.value = '80';
        outputQuality = 0.8;
        handleQualityChange();
      }
      
      // Reset format to JPEG (or original extension if available)
      const formatSelect = document.getElementById('output-format');
      if (formatSelect && originalExtension) {
        if (['jpg', 'jpeg'].includes(originalExtension.toLowerCase())) {
          formatSelect.value = 'jpeg';
        } else if (['png'].includes(originalExtension.toLowerCase())) {
          formatSelect.value = 'png';
        } else if (['webp'].includes(originalExtension.toLowerCase())) {
          formatSelect.value = 'webp';
        } else if (['avif'].includes(originalExtension.toLowerCase())) {
          formatSelect.value = 'avif';
        } else {
          formatSelect.value = 'jpeg';
        }
        outputFormat = formatSelect.value;
        handleFormatChange();
      }
    }

    async function downloadImage() {
      if (!canvas) {
        showError('No hay imagen para descargar.');
        return;
      }

      if (!currentFile) {
        showError('Por favor, selecciona una imagen primero.');
        return;
      }
      
      try {
        // Obtener metadatos antes de la descarga
        const metadata = MetadataManager.getMetadata();
        const exifData = MetadataManager.applyMetadataToImage(canvas);
        
        // Mostrar resumen de metadatos si están presentes
        if (metadata.title || metadata.author || metadata.copyright || metadata.latitude) {
          console.log('Metadatos aplicados:', metadata);
          
          let metaInfo = [];
          if (metadata.title) metaInfo.push(`Título: ${metadata.title}`);
          if (metadata.author) metaInfo.push(`Autor: ${metadata.author}`);
          if (metadata.copyright) metaInfo.push(`Copyright: ${metadata.copyright}`);
          if (metadata.latitude && metadata.longitude) {
            metaInfo.push(`Ubicación: ${metadata.latitude.toFixed(4)}, ${metadata.longitude.toFixed(4)}`);
          }
          
          if (metaInfo.length > 0) {
            UIManager.showSuccess(`Imagen descargada con metadatos: ${metaInfo.join(' | ')}`);
          }
        }
        
        // Obtener el título y sanitizar el nombre del archivo
        const titleInput = document.getElementById('metaTitle');
        let filename = metadata.title || titleInput.value.trim() || 'imagen_editada';
        filename = sanitizeFilename(filename);
        
        // Usar el formato seleccionado en lugar de la extensión original
        const extension = getFileExtension(outputFormat);
        const fullFilename = `${filename}.${extension}`;
        
        // Obtener el tipo MIME basado en el formato seleccionado
        const mimeType = getMimeType(outputFormat);
        
        // Usar la API File System Access si está disponible (Chrome/Edge modernos)
        if ('showSaveFilePicker' in window) {
          const options = {
            suggestedName: fullFilename,
            types: [{
              description: 'Imágenes',
              accept: {
                [mimeType]: [`.${extension}`]
              }
            }],
            startIn: lastDownloadDirectory || 'desktop'
          };

          try {
            const handle = await window.showSaveFilePicker(options);
            lastDownloadDirectory = await handle.queryPermission({ mode: 'readwrite' });
            
            const writable = await handle.createWritable();
            const blob = await canvasToBlob(canvas, mimeType, outputQuality);
            await writable.write(blob);
            await writable.close();
            
            const qualityText = outputFormat === 'png' ? '' : ` (calidad: ${Math.round(outputQuality * 100)}%)`;
            showSuccess(`Imagen guardada exitosamente en formato ${outputFormat.toUpperCase()}${qualityText}!`);
            return;
          } catch (saveError) {
            // Si el usuario cancela, no mostrar error
            if (saveError.name === 'AbortError') {
              return;
            }
            console.warn('Error con File System Access API, usando fallback:', saveError);
          }
        }
        
        // Fallback para navegadores que no soportan la API o si falla
        const link = document.createElement('a');
        link.download = fullFilename;
        link.href = canvas.toDataURL(mimeType, outputQuality);
        
        // Simular click
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        const qualityText = outputFormat === 'png' ? '' : ` (calidad: ${Math.round(outputQuality * 100)}%)`;
        showSuccess(`Imagen descargada en formato ${outputFormat.toUpperCase()}${qualityText}!`);
        
      } catch (error) {
        console.error('Error al descargar:', error);
        showError('Error al descargar la imagen.');
      }
    }

    // Helper functions for format handling
    function getFileExtension(format) {
      const extensions = {
        'jpeg': 'jpg',
        'png': 'png',
        'webp': 'webp',
        'avif': 'avif'
      };
      return extensions[format] || 'jpg';
    }

    function getMimeType(format) {
      const mimeTypes = {
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'avif': 'image/avif'
      };
      return mimeTypes[format] || 'image/jpeg';
    }

    // Enhanced canvasToBlob function using native browser capabilities
    async function canvasToBlob(canvas, mimeType, quality = 0.9) {
      try {
        // Use native canvas.toBlob method with fallback support
        return await new Promise((resolve, reject) => {
          // Check if browser supports the requested format
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 1;
          tempCanvas.height = 1;
          
          // Test format support
          const testDataUrl = tempCanvas.toDataURL(mimeType);
          if (!testDataUrl.startsWith(`data:${mimeType}`)) {
            // Format not supported, fallback to JPEG
            console.warn(`Format ${mimeType} not supported, falling back to JPEG`);
            mimeType = 'image/jpeg';
          }
          
          // Convert canvas to blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          }, mimeType, quality);
        });
        
      } catch (error) {
        console.error('Error with canvas conversion:', error);
        // Final fallback to JPEG
        return canvasToBlob_fallback(canvas, 'image/jpeg', quality);
      }
    }
    
    // Fallback function using canvas native methods
    function canvasToBlob_fallback(canvas, mimeType, quality = 0.9) {
      return new Promise((resolve, reject) => {
        try {
          // For formats that don't support quality, ignore the quality parameter
          if (mimeType === 'image/png') {
            canvas.toBlob(resolve, mimeType);
          } else {
            canvas.toBlob(resolve, mimeType, quality);
          }
        } catch (error) {
          reject(error);
        }
      });
    }

    // Update image information display
    function updateImageInfo() {
      const imageInfoElement = document.getElementById('image-info');
      const dimensionsElement = document.getElementById('image-dimensions');
      const sizeElement = document.getElementById('image-size');
      const formatElement = document.getElementById('image-format');
      const pixelsElement = document.getElementById('image-pixels');
      const currentDimensionsElement = document.getElementById('current-dimensions');
      const currentSizeDisplay = document.getElementById('current-size-display');
      
      if (!currentImage || !imageInfoElement) return;
      
      // Show image info panel
      imageInfoElement.classList.remove('hidden');
      
      // Update dimensions
      if (dimensionsElement) {
        dimensionsElement.textContent = `${currentImage.width} × ${currentImage.height}`;
      }
      
      // Update current size display in resize section
      if (currentDimensionsElement && currentSizeDisplay) {
        currentDimensionsElement.textContent = `${currentImage.width} × ${currentImage.height}`;
        currentSizeDisplay.classList.remove('hidden');
      }
      
      // Update file size
      if (sizeElement && currentFile) {
        sizeElement.textContent = formatFileSize(currentFile.size);
      } else if (sizeElement) {
        sizeElement.textContent = 'Calculando...';
      }
      
      // Update format
      if (formatElement && currentFile) {
        const fileType = currentFile.type.split('/')[1].toUpperCase();
        formatElement.textContent = fileType || originalExtension.toUpperCase();
      } else if (formatElement) {
        formatElement.textContent = originalExtension.toUpperCase();
      }
      
      // Update total pixels
      if (pixelsElement) {
        const totalPixels = currentImage.width * currentImage.height;
        pixelsElement.textContent = formatNumber(totalPixels);
      }
    }
    
    // Format file size in human readable format
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    // Format number with thousands separator
    function formatNumber(num) {
      return num.toLocaleString('es-ES') + ' px';
    }

    // Initialize resize functionality
    function initResize() {
      const widthInput = document.getElementById('resize-width');
      const heightInput = document.getElementById('resize-height');
      const aspectRatioCheckbox = document.getElementById('maintain-aspect-ratio');
      const applyResizeBtn = document.getElementById('apply-resize');
      const resetResizeBtn = document.getElementById('reset-original-size');
      
      // Preset buttons
      const presetButtons = document.querySelectorAll('.preset-btn');
      
      // Add event listeners to dimension inputs
      if (widthInput) {
        widthInput.addEventListener('input', function() {
          if (aspectRatioCheckbox && aspectRatioCheckbox.checked && originalWidth && originalHeight) {
            const newHeight = Math.round((this.value * originalHeight) / originalWidth);
            if (heightInput) heightInput.value = newHeight;
          }
        });
      }
      
      if (heightInput) {
        heightInput.addEventListener('input', function() {
          if (aspectRatioCheckbox && aspectRatioCheckbox.checked && originalWidth && originalHeight) {
            const newWidth = Math.round((this.value * originalWidth) / originalHeight);
            if (widthInput) widthInput.value = newWidth;
          }
        });
      }
      
      // Preset buttons functionality
      presetButtons.forEach(button => {
        button.addEventListener('click', function() {
          const width = this.getAttribute('data-width');
          const height = this.getAttribute('data-height');
          
          if (widthInput) widthInput.value = width;
          if (heightInput) heightInput.value = height;
          
          // Update button visual state
          presetButtons.forEach(btn => btn.classList.remove('ring-2', 'ring-blue-500'));
          this.classList.add('ring-2', 'ring-blue-500');
        });
      });
      
      // Apply resize functionality
      if (applyResizeBtn) {
        applyResizeBtn.addEventListener('click', function() {
          const newWidth = parseInt(widthInput.value);
          const newHeight = parseInt(heightInput.value);
          
          if (newWidth > 0 && newHeight > 0 && currentImage) {
            resizeImage(newWidth, newHeight);
          }
        });
      }
      
      // Reset resize functionality
      if (resetResizeBtn) {
        resetResizeBtn.addEventListener('click', function() {
          if (originalWidth && originalHeight) {
            if (widthInput) widthInput.value = originalWidth;
            if (heightInput) heightInput.value = originalHeight;
            presetButtons.forEach(btn => btn.classList.remove('ring-2', 'ring-blue-500'));
            
            if (currentImage) {
              resizeImage(originalWidth, originalHeight);
            }
          }
        });
      }
    }

    // Resize image function
    function resizeImage(newWidth, newHeight) {
      if (!currentImage) {
        console.error('No current image available');
        return;
      }
      
      // Validate dimensions
      if (newWidth <= 0 || newHeight <= 0) {
        console.error('Invalid dimensions:', newWidth, newHeight);
        return;
      }
      
      try {
        // Create temporary canvas for resizing
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;
        
        // Draw resized image with high quality
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(currentImage, 0, 0, newWidth, newHeight);
        
        // Create new image from the resized canvas
        const newImage = new Image();
        newImage.onload = function() {
          // Update current image
          currentImage = newImage;
          
          // Update preview canvas
          const canvas = document.getElementById('preview-canvas');
          if (canvas) {
            const ctx = canvas.getContext('2d');
            canvas.width = newWidth;
            canvas.height = newHeight;
            ctx.clearRect(0, 0, newWidth, newHeight);
            ctx.drawImage(newImage, 0, 0);
            
            // Re-apply watermark if present
            updatePreview();
          }
          
          // Update image info display
          updateImageInfo();
          
          // Show success message
          showSuccessMessage(`Imagen redimensionada a ${newWidth} × ${newHeight}`);
          
          console.log('Image resized successfully to:', newWidth, 'x', newHeight);
        };
        
        newImage.onerror = function() {
          console.error('Error creating resized image');
        };
        
        // Convert canvas to data URL and set as image source
        newImage.src = tempCanvas.toDataURL('image/png');
        
      } catch (error) {
        console.error('Error during resize operation:', error);
        showSuccessMessage('Error al redimensionar la imagen');
      }
    }

    // Show success message
    function showSuccessMessage(message) {
      // Create or update success message element
      let successElement = document.getElementById('success-message');
      if (!successElement) {
        successElement = document.createElement('div');
        successElement.id = 'success-message';
        successElement.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50 transition-opacity duration-300';
        document.body.appendChild(successElement);
      }
      
      successElement.textContent = message;
      successElement.style.opacity = '1';
      
      // Hide after 3 seconds
      setTimeout(() => {
        successElement.style.opacity = '0';
        setTimeout(() => {
          if (successElement.parentNode) {
            successElement.parentNode.removeChild(successElement);
          }
        }, 300);
      }, 3000);
    }
    
    // Character counter functionality
    function initCharacterCounters() {
      const fields = [
        { id: 'metaTitle', counter: 'title-counter', limit: 60 },
        { id: 'description', counter: 'description-counter', limit: 160 },
        { id: 'keywords', counter: 'keywords-counter', limit: 200 }
      ];

      fields.forEach(field => {
        const input = document.getElementById(field.id);
        const counter = document.getElementById(field.counter);
        
        if (input && counter) {
          // Update counter on input
          input.addEventListener('input', function() {
            updateCharacterCount(this, counter, field.limit);
          });
          
          // Initial count
          updateCharacterCount(input, counter, field.limit);
        }
      });
    }

    function updateCharacterCount(input, counter, limit) {
      const length = input.value.length;
      const remaining = limit - length;
      
      // Update counter text
      counter.textContent = `${length}/${limit} caracteres`;
      
      // Update color based on usage
      counter.classList.remove('good', 'warning', 'danger');
      
      if (length <= limit * 0.7) {
        counter.classList.add('good');
      } else if (length <= limit * 0.9) {
        counter.classList.add('warning');
      } else {
        counter.classList.add('danger');
      }
      
      // Show remaining characters if close to limit
      if (remaining <= 10 && remaining >= 0) {
        counter.textContent = `${length}/${limit} (${remaining} restantes)`;
      } else if (length > limit) {
        counter.textContent = `${length}/${limit} (${Math.abs(remaining)} sobre el límite)`;
      }
    }
    
    // Image rotation functionality
    function initRotation() {
      const rotate90Btn = document.getElementById('rotate-90');
      const rotate180Btn = document.getElementById('rotate-180');
      const rotate270Btn = document.getElementById('rotate-270');
      const resetRotationBtn = document.getElementById('reset-rotation');
      const flipHorizontalBtn = document.getElementById('flip-horizontal');
      const flipVerticalBtn = document.getElementById('flip-vertical');
      
      // Rotation buttons
      if (rotate90Btn) {
        rotate90Btn.addEventListener('click', () => rotateImage(90));
      }
      
      if (rotate180Btn) {
        rotate180Btn.addEventListener('click', () => rotateImage(180));
      }
      
      if (rotate270Btn) {
        rotate270Btn.addEventListener('click', () => rotateImage(270));
      }
      
      if (resetRotationBtn) {
        resetRotationBtn.addEventListener('click', resetRotation);
      }
      
      // Flip buttons
      if (flipHorizontalBtn) {
        flipHorizontalBtn.addEventListener('click', () => flipImage('horizontal'));
      }
      
      if (flipVerticalBtn) {
        flipVerticalBtn.addEventListener('click', () => flipImage('vertical'));
      }
    }

    function rotateImage(degrees) {
      if (!currentImage) {
        console.error('No current image available');
        return;
      }
      
      try {
        // Update rotation state
        currentRotation = (currentRotation + degrees) % 360;
        
        // Apply transformation
        applyImageTransformation();
        
        // Update rotation display
        updateRotationDisplay();
        
        // Show success message
        showSuccessMessage(`Imagen rotada ${degrees}° (Total: ${currentRotation}°)`);
        
        console.log('Image rotated:', degrees, 'degrees. Total rotation:', currentRotation);
        
      } catch (error) {
        console.error('Error rotating image:', error);
        showSuccessMessage('Error al rotar la imagen');
      }
    }

    function flipImage(direction) {
      if (!currentImage) {
        console.error('No current image available');
        return;
      }
      
      try {
        if (direction === 'horizontal') {
          isFlippedHorizontally = !isFlippedHorizontally;
        } else if (direction === 'vertical') {
          isFlippedVertically = !isFlippedVertically;
        }
        
        // Apply transformation
        applyImageTransformation();
        
        // Update rotation display
        updateRotationDisplay();
        
        // Show success message
        const flipText = direction === 'horizontal' ? 'horizontalmente' : 'verticalmente';
        showSuccessMessage(`Imagen volteada ${flipText}`);
        
        console.log('Image flipped:', direction);
        
      } catch (error) {
        console.error('Error flipping image:', error);
        showSuccessMessage('Error al voltear la imagen');
      }
    }

    function applyImageTransformation() {
      if (!currentImage) return;
      
      const canvas = document.getElementById('preview-canvas');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      
      // Create a temporary canvas with original image
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      // Use original dimensions for source
      tempCanvas.width = originalWidth;
      tempCanvas.height = originalHeight;
      tempCtx.drawImage(currentImage, 0, 0, originalWidth, originalHeight);
      
      // Calculate new dimensions based on rotation
      let newWidth, newHeight;
      if (currentRotation === 90 || currentRotation === 270) {
        newWidth = originalHeight;
        newHeight = originalWidth;
      } else {
        newWidth = originalWidth;
        newHeight = originalHeight;
      }
      
      // Set canvas size
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      // Clear canvas
      ctx.clearRect(0, 0, newWidth, newHeight);
      
      // Save context state
      ctx.save();
      
      // Move to center of canvas for transformations
      ctx.translate(newWidth / 2, newHeight / 2);
      
      // Apply rotation
      if (currentRotation !== 0) {
        ctx.rotate((currentRotation * Math.PI) / 180);
      }
      
      // Apply flips
      const scaleX = isFlippedHorizontally ? -1 : 1;
      const scaleY = isFlippedVertically ? -1 : 1;
      ctx.scale(scaleX, scaleY);
      
      // Draw image centered (use original dimensions for drawing)
      ctx.drawImage(
        tempCanvas,
        -originalWidth / 2,
        -originalHeight / 2,
        originalWidth,
        originalHeight
      );
      
      // Restore context state
      ctx.restore();
      
      // Create new image from canvas for currentImage reference
      const newImageData = canvas.toDataURL('image/png');
      const newImage = new Image();
      newImage.onload = function() {
        currentImage = newImage;
        currentImage.width = newWidth;
        currentImage.height = newHeight;
        
        // Update image info
        updateImageInfo();
        
        // Update preview with watermark if present
        updatePreview();
      };
      newImage.src = newImageData;
    }

    function resetRotation() {
      if (!currentImage) return;
      
      try {
        // Reset all transformations
        currentRotation = 0;
        isFlippedHorizontally = false;
        isFlippedVertically = false;
        
        // Restore original image
        if (originalWidth && originalHeight) {
          currentImage.width = originalWidth;
          currentImage.height = originalHeight;
        }
        
        // Redraw original image
        const canvas = document.getElementById('preview-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          canvas.width = currentImage.width;
          canvas.height = currentImage.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(currentImage, 0, 0);
        }
        
        // Update displays
        updateRotationDisplay();
        updateImageInfo();
        updatePreview();
        
        showSuccessMessage('Rotación restablecida al original');
        
      } catch (error) {
        console.error('Error resetting rotation:', error);
        showSuccessMessage('Error al restablecer la rotación');
      }
    }

    function updateRotationDisplay() {
      const currentRotationElement = document.getElementById('current-rotation');
      const currentRotationDisplay = document.getElementById('current-rotation-display');
      
      if (currentRotationElement && currentRotationDisplay) {
        let displayText = `${currentRotation}°`;
        
        // Add flip indicators
        if (isFlippedHorizontally || isFlippedVertically) {
          const flips = [];
          if (isFlippedHorizontally) flips.push('H');
          if (isFlippedVertically) flips.push('V');
          displayText += ` (${flips.join(', ')})`;
        }
        
        currentRotationElement.textContent = displayText;
        
        // Show/hide display based on transformations
        if (currentRotation !== 0 || isFlippedHorizontally || isFlippedVertically) {
          currentRotationDisplay.classList.remove('hidden');
        } else {
          currentRotationDisplay.classList.add('hidden');
        }
      }
    }
    
    // Progress bar functionality
    function showProgressBar(title = 'Procesando...') {
      const overlay = document.getElementById('progress-overlay');
      const titleElement = document.getElementById('progress-title');
      const progressBar = document.getElementById('progress-bar');
      const progressText = document.getElementById('progress-text');
      const progressEta = document.getElementById('progress-eta');
      
      if (overlay && titleElement) {
        titleElement.textContent = title;
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        progressEta.textContent = 'Calculando tiempo...';
        overlay.classList.add('show');
      }
    }
    
    function updateProgress(percentage, message = '', eta = '') {
      const progressBar = document.getElementById('progress-bar');
      const progressText = document.getElementById('progress-text');
      const progressEta = document.getElementById('progress-eta');
      
      if (progressBar && progressText) {
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${Math.round(percentage)}%`;
        
        if (message) {
          const titleElement = document.getElementById('progress-title');
          if (titleElement) titleElement.textContent = message;
        }
        
        if (eta && progressEta) {
          progressEta.textContent = eta;
        }
      }
    }
    
    function hideProgressBar() {
      const overlay = document.getElementById('progress-overlay');
      if (overlay) {
        overlay.classList.remove('show');
      }
    }
    
    // Enhanced progress simulation for download operations
    async function simulateProgressSteps(steps, totalDuration = 3000) {
      const stepDuration = totalDuration / steps.length;
      const startTime = Date.now();
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const progress = ((i + 1) / steps.length) * 100;
        const elapsed = Date.now() - startTime;
        const estimatedTotal = (elapsed / (i + 1)) * steps.length;
        const remaining = Math.max(0, estimatedTotal - elapsed);
        
        const eta = remaining > 1000 
          ? `${Math.ceil(remaining / 1000)}s restantes`
          : `${Math.ceil(remaining)}ms restantes`;
        
        updateProgress(progress, step.message, eta);
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, step.duration || stepDuration));
      }
    }
    
    // Enhanced download function with progress bar
    async function downloadImageWithProgress() {
      if (!canvas) {
        showError('No hay imagen para descargar.');
        return;
      }

      if (!currentFile) {
        showError('Por favor, selecciona una imagen primero.');
        return;
      }
      
      try {
        // Show progress bar
        showProgressBar('Iniciando descarga...');
        
        // Define download steps
        const downloadSteps = [
          { message: 'Obteniendo metadatos...', duration: 300 },
          { message: 'Aplicando metadatos...', duration: 400 },
          { message: 'Generando nombre de archivo...', duration: 200 },
          { message: 'Configurando formato de salida...', duration: 300 },
          { message: 'Procesando imagen...', duration: 600 },
          { message: 'Generando archivo...', duration: 500 },
          { message: 'Iniciando descarga...', duration: 400 }
        ];
        
        // Start progress simulation
        const progressPromise = simulateProgressSteps(downloadSteps, 2800);
        
        // Obtener metadatos antes de la descarga
        const metadata = MetadataManager.getMetadata();
        const exifData = MetadataManager.applyMetadataToImage(canvas);
        
        // Wait for initial progress steps
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Mostrar resumen de metadatos si están presentes
        if (metadata.title || metadata.author || metadata.copyright || metadata.latitude) {
          console.log('Metadatos aplicados:', metadata);
          
          let metaInfo = [];
          if (metadata.title) metaInfo.push(`Título: ${metadata.title}`);
          if (metadata.author) metaInfo.push(`Autor: ${metadata.author}`);
          if (metadata.copyright) metaInfo.push(`Copyright: ${metadata.copyright}`);
          if (metadata.latitude && metadata.longitude) {
            metaInfo.push(`Ubicación: ${metadata.latitude}, ${metadata.longitude}`);
          }
          
          console.log('Resumen de metadatos aplicados:\n' + metaInfo.join('\n'));
        }
        
        // Wait for more progress
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Generar nombre del archivo basado en el título o usar uno por defecto
        let filename = 'imagen-editada';
        
        if (metadata.title && metadata.title.trim()) {
          filename = metadata.title.trim();
        } else if (currentFile && currentFile.name) {
          filename = currentFile.name.replace(/\.[^/.]+$/, '');
        }
        
        // Limpiar el nombre de archivo
        filename = sanitizeFilename(filename);
        
        // Usar el formato seleccionado en lugar de la extensión original
        const extension = getFileExtension(outputFormat);
        const fullFilename = `${filename}.${extension}`;
        
        // Wait for processing steps
        await new Promise(resolve => setTimeout(resolve, 900));
        
        // Obtener el tipo MIME basado en el formato seleccionado
        const mimeType = getMimeType(outputFormat);
        
        // Complete progress
        await progressPromise;
        
        // Fallback para navegadores que no soportan la API o si falla
        const link = document.createElement('a');
        link.download = fullFilename;
        link.href = canvas.toDataURL(mimeType, outputQuality);
        
        // Simular click
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Hide progress bar
        hideProgressBar();
        
        const qualityText = outputFormat === 'png' ? '' : ` (calidad: ${Math.round(outputQuality * 100)}%)`;
        showSuccess(`Imagen descargada en formato ${outputFormat.toUpperCase()}${qualityText}!`);
        
      } catch (error) {
        console.error('Error al descargar:', error);
        hideProgressBar();
        showError('Error al descargar la imagen.');
      }
    }
    
    
    // Hide image info when no image is loaded
    function hideImageInfo() {
      const imageInfoElement = document.getElementById('image-info');
      if (imageInfoElement) {
        imageInfoElement.classList.add('hidden');
      }
    }

    function removeSelectedFile() {
      currentImage = null;
      currentFile = null;
      originalExtension = 'jpg';
      watermarkImagePreview = null;
      customImagePosition = null;
      isPositioningMode = false;
      
      // Limpiar cache
      cache.watermarkImage = null;
      cache.lastWatermarkConfig = null;
      
      // Limpiar formularios
      document.getElementById('file-input').value = '';
      document.getElementById('metadata-form').reset();
      document.getElementById('watermark-form').reset();
      
      // Ocultar elementos
      document.getElementById('file-info').classList.add('file-info--hidden');
      document.getElementById('editor-container').classList.add('editor-container--hidden');
      
      // Ocultar controles de zoom
      const zoomControls = document.getElementById('zoom-controls');
      if (zoomControls) {
        zoomControls.classList.add('hidden');
      }
      
      hideImageInfo(); // Ocultar información de imagen
      
      // Limpiar canvas
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      
      // Limpiar marcador de posición si existe
      removePositionMarker();
      
      // Ocultar información de posicionamiento personalizado
      const customInfo = document.getElementById('custom-position-info');
      if (customInfo) {
        customInfo.style.display = 'none';
      }
      
      // Quitar clase de posicionamiento del canvas
      if (canvas) {
        canvas.classList.remove('positioning-mode');
      }
      
      // Ocultar preview de metadatos si está visible
      hideMetadataPreview();
      
      // Resetear controles de salida
      resetOutputControls();
      
      UIManager.hideError();
      UIManager.showSuccess('Archivo removido correctamente');
    }

    // Funciones de pantalla completa
    function toggleFullscreen() {
      const canvas = document.getElementById('preview-canvas');
      const container = canvas.parentElement;
      
      if (!document.fullscreenElement) {
        // Entrar en pantalla completa
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) {
          container.msRequestFullscreen();
        }
        
        // Agregar clase para estilos de pantalla completa
        container.classList.add('fullscreen-mode');
        canvas.style.maxWidth = '100vw';
        canvas.style.maxHeight = '100vh';
        canvas.style.objectFit = 'contain';
        
      } else {
        // Salir de pantalla completa
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    }

    function handleFullscreenChange() {
      const canvas = document.getElementById('preview-canvas');
      const container = canvas.parentElement;
      const fullscreenBtn = document.getElementById('fullscreen-btn');
      
      if (!document.fullscreenElement) {
        // Saliendo de pantalla completa
        container.classList.remove('fullscreen-mode');
        canvas.style.maxWidth = '';
        canvas.style.maxHeight = '';
        canvas.style.objectFit = '';
        
        if (fullscreenBtn) {
          fullscreenBtn.innerHTML = '<i class="fas fa-expand" aria-hidden="true"></i> Pantalla completa';
        }
      } else {
        // Entrando en pantalla completa
        if (fullscreenBtn) {
          fullscreenBtn.innerHTML = '<i class="fas fa-compress" aria-hidden="true"></i> Salir';
        }
      }
    }

    function showError(message) {
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-down max-w-sm';
      notification.innerHTML = `
        <div class="flex items-center">
          <i class="fas fa-exclamation-triangle mr-3"></i>
          <span>${message}</span>
          <button onclick="this.parentElement.parentElement.remove()" class="ml-3 text-white hover:text-red-200">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
      
      document.body.appendChild(notification);
      setTimeout(() => {
        if (notification.parentNode) {
          notification.classList.add('animate-fade-out');
          setTimeout(() => notification.remove(), 300);
        }
      }, 5000);
    }

    function hideError() {
      // Legacy function kept for compatibility
      const errorElement = document.getElementById('error-message');
      if (errorElement) {
        errorElement.classList.add('error--hidden');
      }
    }

    function showSuccess(message) {
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-down max-w-sm';
      notification.innerHTML = `
        <div class="flex items-center">
          <i class="fas fa-check-circle mr-3"></i>
          <span>${message}</span>
          <button onclick="this.parentElement.parentElement.remove()" class="ml-3 text-white hover:text-green-200">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
      
      document.body.appendChild(notification);
      setTimeout(() => {
        if (notification.parentNode) {
          notification.classList.add('animate-fade-out');
          setTimeout(() => notification.remove(), 300);
        }
      }, 4000);
    }

    // Enhanced download function with progress
    async function downloadImageEnhanced() {
      if (!canvas || !currentImage) {
        showError('No hay imagen para descargar');
        return;
      }
      
      try {
        showLoadingState('Preparando descarga...');
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `imagen-editada-${timestamp}.png`;
        
        // Create download with enhanced quality
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        
        // Trigger download with smooth animation
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        hideLoadingState();
        
      } catch (error) {
        console.error('Error downloading image:', error);
        hideLoadingState();
        showError('Error al descargar la imagen');
      }
    }

    // Loading state management
    function showLoadingState(message = 'Procesando...') {
      const overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in';
      
      overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 text-center animate-slide-up">
          <div class="animate-pulse mb-4">
            <div class="w-8 h-8 bg-blue-500 rounded-full mx-auto"></div>
          </div>
          <p class="text-gray-700 dark:text-gray-300 font-medium">${message}</p>
          <div class="mt-4">
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div class="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full animate-loading-bar"></div>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
    }

    function hideLoadingState() {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.classList.add('animate-fade-out');
        setTimeout(() => overlay.remove(), 300);
      }
    }

    // Enhanced clear metadata function
    function clearMetadata() {
      const form = document.getElementById('metadata-form');
      if (form) {
        form.reset();
        showSuccess('Metadatos limpiados');
      }
    }

    // Performance monitoring
    function measurePerformance(operation, fn) {
      const start = performance.now();
      const result = fn();
      const end = performance.now();
      
      if (end - start > 100) { // Log operations taking more than 100ms
        console.log(`Performance: ${operation} took ${(end - start).toFixed(2)}ms`);
      }
      
      return result;
    }

    // Enhanced error handling
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      showError('Se ha producido un error inesperado');
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      showError('Error en operación asíncrona');
    });

    // Sistema de Geolocalización y Copyright
    const MetadataManager = {
      // Configuración de copyright
      copyrightTemplates: [
        '© {year} {author}. Todos los derechos reservados.',
        '© {year} {author}',
        'Copyright {year} by {author}',
        '{author} © {year}'
      ],
      
      // Generar copyright automático
      generateCopyright: function(author = '') {
        const year = new Date().getFullYear();
        const authorName = author || document.getElementById('metaAuthor').value || 'Autor';
        const template = this.copyrightTemplates[0]; // Usar plantilla por defecto
        
        return template
          .replace('{year}', year)
          .replace('{author}', authorName);
      },
      
      // Obtener ubicación actual del usuario
      getCurrentLocation: function() {
        const locationStatus = document.getElementById('locationStatus');
        const latInput = document.getElementById('metaLatitude');
        const lonInput = document.getElementById('metaLongitude');
        const altInput = document.getElementById('metaAltitude');
        
        if (!navigator.geolocation) {
          locationStatus.textContent = 'Geolocalización no soportada en este navegador';
          locationStatus.className = 'text-red-500 text-xs mt-1 block';
          return;
        }
        
        locationStatus.textContent = 'Obteniendo ubicación...';
        locationStatus.className = 'location-status loading';
        
        const options = {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        };
        
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, altitude } = position.coords;
            
            latInput.value = latitude.toFixed(6);
            lonInput.value = longitude.toFixed(6);
            if (altitude !== null) {
              altInput.value = Math.round(altitude);
            }
            
            locationStatus.textContent = `Ubicación obtenida: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            locationStatus.className = 'location-status success';
            
            UIManager.showSuccess('Ubicación GPS obtenida correctamente');
          },
          (error) => {
            let errorMessage = 'Error al obtener ubicación: ';
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage += 'Permiso denegado por el usuario';
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage += 'Información de ubicación no disponible';
                break;
              case error.TIMEOUT:
                errorMessage += 'Tiempo de espera agotado';
                break;
              default:
                errorMessage += 'Error desconocido';
                break;
            }
            
            locationStatus.textContent = errorMessage;
            locationStatus.className = 'location-status error';
            UIManager.showError('No se pudo obtener la ubicación GPS');
          },
          options
        );
      },
      
      // Obtener todos los metadatos para exportar
      getMetadata: function() {
        return {
          title: document.getElementById('metaTitle').value || '',
          author: document.getElementById('metaAuthor').value || '',
          copyright: document.getElementById('metaCopyright').value || '',
          license: document.getElementById('metaLicense').value || '',
          latitude: parseFloat(document.getElementById('metaLatitude').value) || null,
          longitude: parseFloat(document.getElementById('metaLongitude').value) || null,
          altitude: parseFloat(document.getElementById('metaAltitude').value) || null,
          createdAt: new Date().toISOString(),
          software: 'ImageMetadataPro v2.0'
        };
      },
      
      // Aplicar metadatos a la imagen
      applyMetadataToImage: function(canvas) {
        const metadata = this.getMetadata();
        
        // Crear metadatos EXIF simulados (en un proyecto real usarías una librería como piexifjs)
        const exifData = {
          'Image Description': metadata.title,
          'Artist': metadata.author,
          'Copyright': metadata.copyright,
          'Software': metadata.software,
          'DateTime': new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),
          'GPS Latitude': metadata.latitude,
          'GPS Longitude': metadata.longitude,
          'GPS Altitude': metadata.altitude
        };
        
        // Guardar metadatos en el localStorage para persistencia
        localStorage.setItem('imageMetadata', JSON.stringify(metadata));
        
        return exifData;
      },
      
      // Cargar metadatos guardados
      loadSavedMetadata: function() {
        try {
          const saved = localStorage.getItem('imageMetadata');
          if (saved) {
            const metadata = JSON.parse(saved);
            
            // Restaurar valores en los campos
            if (metadata.author) document.getElementById('metaAuthor').value = metadata.author;
            if (metadata.license) document.getElementById('metaLicense').value = metadata.license;
            
            // No restaurar ubicación automáticamente por privacidad
          }
        } catch (error) {
          console.warn('No se pudieron cargar metadatos guardados:', error);
        }
      }
    };

    // Función para copyright automático
    function generateAutoCopyright() {
      const authorInput = document.getElementById('metaAuthor');
      const copyrightInput = document.getElementById('metaCopyright');
      
      // Si no hay autor, pedirlo
      if (!authorInput.value.trim()) {
        UIManager.showError('Por favor, ingresa el nombre del autor primero');
        authorInput.focus();
        return;
      }
      
      const autoCopyright = MetadataManager.generateCopyright(authorInput.value);
      copyrightInput.value = autoCopyright;
      
      UIManager.showSuccess('Copyright generado automáticamente');
    }

    // Sistema de Filtros Avanzados con Cache, Loading States y Workers
    const FilterManager = {
      filters: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        blur: 0,
        sepia: 0,
        hueRotate: 0
      },
      
      presets: {
        none: { brightness: 0, contrast: 0, saturation: 0, blur: 0, sepia: 0, hueRotate: 0 },
        sepia: { brightness: 20, contrast: 10, saturation: -20, blur: 0, sepia: 80, hueRotate: 0 },
        grayscale: { brightness: 0, contrast: 0, saturation: -100, blur: 0, sepia: 0, hueRotate: 0 },
        vintage: { brightness: -10, contrast: 25, saturation: -30, blur: 0.5, sepia: 30, hueRotate: 0 },
        cold: { brightness: -15, contrast: 30, saturation: -25, blur: 0, sepia: 0, hueRotate: 200 },
        warm: { brightness: 15, contrast: 10, saturation: 20, blur: 0, sepia: 10, hueRotate: -10 }
      },
      
      // Configuración para workers
      useWorkers: false,
      heavyFilterThreshold: 3, // Número de filtros para considerar "pesado"
      
      // Inicializar sistema de filtros
      initialize: function() {
        // Intentar inicializar workers
        this.useWorkers = WorkerManager.initializeWorkerPool();
        
        if (this.useWorkers) {
          console.log('🔧 FilterManager: Workers habilitados para filtros pesados');
        } else {
          console.log('⚠️ FilterManager: Usando procesamiento en hilo principal');
        }
      },
      
      // Determinar si debe usar worker
      shouldUseWorker: function() {
        if (!this.useWorkers) return false;
        
        // Contar filtros activos
        const activeFilters = Object.values(this.filters).filter(value => value !== 0).length;
        
        // Usar worker si hay muchos filtros o imagen grande
        const isHeavyProcessing = activeFilters >= this.heavyFilterThreshold;
        const isLargeImage = canvas && (canvas.width * canvas.height) > (1920 * 1080);
        
        return isHeavyProcessing || isLargeImage;
      },
      
      // Aplicar filtro individual con cache y loading
      applyFilter: function(filterName, value) {
        console.log(`🎨 Aplicando filtro ${filterName}: ${value}`);
        
        // Verificar si el valor realmente cambió
        if (this.filters[filterName] === value) {
          console.log(`⚡ Filtro ${filterName} ya tiene el valor ${value}, omitiendo actualización`);
          return;
        }
        
        // Mostrar loading state para este filtro específico
        FilterLoadingManager.showFilterLoading(filterName);
        
        // Actualizar valor
        this.filters[filterName] = value;
        this.updateFilterDisplay(filterName, value);
        
        // Marcar cache como sucio
        FilterCache.markDirty();
        
        // Guardar estado en cache
        FilterCache.saveState(`filter-${filterName}`, this.filters);
        
        console.log('📊 Estado actual de filtros:', this.filters);
        
        // Aplicar con debounce inteligente o worker
        if (this.shouldUseWorker()) {
          this.scheduleWorkerUpdate();
        } else {
          this.scheduleFilterUpdate();
        }
      },
      
      // Aplicar preset con optimizaciones y workers
      applyPreset: function(presetName) {
        const preset = this.presets[presetName];
        if (!preset) {
          console.warn(`❌ Preset "${presetName}" no encontrado`);
          return;
        }
        
        console.log(`🎭 Aplicando preset: ${presetName}`);
        
        // Verificar si ya está aplicado usando cache
        const currentHash = FilterCache.generateHash(this.filters);
        const presetHash = FilterCache.generateHash(preset);
        
        if (currentHash === presetHash) {
          console.log(`⚡ Preset ${presetName} ya está aplicado, omitiendo actualización`);
          this.highlightActivePreset(presetName);
          return;
        }
        
        // Mostrar loading global
        FilterLoadingManager.showFilterLoading();
        
        // Aplicar todos los valores del preset
        Object.keys(preset).forEach(filter => {
          this.filters[filter] = preset[filter];
          this.updateFilterDisplay(filter, preset[filter]);
          
          // Actualizar sliders
          const slider = document.getElementById(filter);
          if (slider) {
            slider.value = preset[filter];
          }
        });
        
        // Guardar en cache
        FilterCache.saveState(`preset-${presetName}`, this.filters);
        FilterCache.markDirty();
        
        // Resaltar botón activo
        this.highlightActivePreset(presetName);
        
        // Aplicar inmediatamente con workers si es necesario
        if (this.shouldUseWorker()) {
          this.applyFiltersWithWorker();
        } else {
          this.applyFiltersImmediate();
        }
      },
      
      // Programar actualización con worker
      scheduleWorkerUpdate: function() {
        SmartDebounce.intelligent('filter-worker-update', () => {
          this.applyFiltersWithWorker();
        }, 200); // Más tiempo para workers
      },
      
      // Aplicar filtros usando worker
      applyFiltersWithWorker: async function() {
        if (!canvas || !currentImage) {
          FilterLoadingManager.hideFilterLoading();
          return;
        }
        
        try {
          console.log('🔧 Aplicando filtros con worker');
          
          // Obtener ImageData actual
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // Preparar operaciones para worker
          const operations = this.prepareWorkerOperations();
          
          if (operations.length === 0) {
            console.log('⚡ No hay filtros que aplicar');
            FilterLoadingManager.hideFilterLoading();
            return;
          }
          
          // Procesar en worker
          const result = await WorkerManager.processInWorker(imageData, operations);
          
          // Aplicar resultado al canvas
          if (result instanceof ImageBitmap) {
            // Si es ImageBitmap, dibujarlo directamente
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(result, 0, 0);
          } else if (result instanceof ImageData) {
            // Si es ImageData, aplicarlo
            ctx.putImageData(result, 0, 0);
          }
          
          // Marcar como aplicado en cache
          FilterCache.markApplied(this.filters);
          
          console.log('✅ Filtros aplicados con worker exitosamente');
          
        } catch (error) {
          console.warn('⚠️ Error en worker, usando fallback:', error);
          // Fallback al procesamiento normal
          this.applyFiltersImmediate();
        } finally {
          FilterLoadingManager.hideFilterLoading();
        }
      },
      
      // Aplicar filtros usando fallback
      applyFiltersWithFallback: async function() {
        if (!canvas || !currentImage) {
          FilterLoadingManager.hideFilterLoading();
          return;
        }
        
        try {
          console.log('⚠️ Aplicando filtros con fallback');
          
          // Obtener ImageData actual
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // Preparar operaciones para fallback
          const operations = this.prepareWorkerOperations();
          
          if (operations.length === 0) {
            FilterLoadingManager.hideFilterLoading();
            return;
          }
          
          // Procesar en hilo principal
          const result = await FallbackProcessor.processInMainThread(imageData, operations);
          
          // Aplicar resultado
          ctx.putImageData(result, 0, 0);
          
          // Marcar como aplicado en cache
          FilterCache.markApplied(this.filters);
          
          console.log('✅ Filtros aplicados con fallback exitosamente');
          
        } catch (error) {
          console.error('❌ Error en fallback:', error);
          UIManager.showError('Error al aplicar filtros');
        } finally {
          FilterLoadingManager.hideFilterLoading();
        }
      },
      
      // Preparar operaciones para worker/fallback
      prepareWorkerOperations: function() {
        const operations = [];
        
        // Solo agregar filtros que tienen valores diferentes de 0
        Object.entries(this.filters).forEach(([filterName, value]) => {
          if (value !== 0) {
            operations.push({
              type: 'filter',
              config: {
                type: filterName,
                value: value
              }
            });
          }
        });
        
        return operations;
      },
      
      // Programar actualización de filtros con debounce (método original)
      scheduleFilterUpdate: function() {
        // Usar debounce inteligente para filtros individuales
        debouncedUpdatePreview();
      },
      
      // Aplicar filtros inmediatamente (para presets)
      applyFiltersImmediate: function() {
        // Verificar si realmente necesita actualización usando cache
        if (!FilterCache.hasChanged(this.filters)) {
          console.log('⚡ Estado de filtros no ha cambiado, omitiendo actualización');
          FilterLoadingManager.hideFilterLoading();
          return;
        }
        
        // Usar immediate update para respuesta rápida
        immediatePreviewUpdate();
      },
      
      // Verificar si se necesita processing pesado
      shouldUseWorker: function() {
        if (!WorkerManager.isSupported()) return false;
        
        // Detectar filtros computacionalmente pesados
        const heavyFilters = ['blur', 'contrast', 'saturation'];
        return heavyFilters.some(filter => {
          const value = Math.abs(this.filters[filter]);
          return filter === 'blur' ? value > 3 : value > 150;
        });
      },
      
      // Aplicar filtros usando worker para operaciones pesadas
      applyWithWorker: async function(imageData) {
        const filters = {...this.filters};
        
        try {
          FilterLoadingManager.showWorkerLoading();
          const result = await WorkerManager.processImage(imageData, filters);
          FilterLoadingManager.hideFilterLoading();
          return result;
        } catch (error) {
          console.warn('Worker falló, usando fallback:', error);
          FilterLoadingManager.hideFilterLoading();
          return FallbackProcessor.processImage(imageData, filters);
        }
      },
      
      // Aplicar filtros usando fallback processor
      applyWithFallback: function(imageData) {
        const filters = {...this.filters};
        return FallbackProcessor.processImage(imageData, filters);
      },
      
      // Actualizar display de valores con animaciones
      updateFilterDisplay: function(filterName, value) {
        const display = document.getElementById(`${filterName}-value`);
        if (display) {
          const formattedValue = filterName === 'blur' ? `${value}px` : value;
          
          // Animar cambio de valor
          display.style.transition = 'all 0.2s ease';
          display.style.transform = 'scale(1.1)';
          display.textContent = formattedValue;
          
          setTimeout(() => {
            display.style.transform = 'scale(1)';
          }, 150);
        }
      },
      
      // Resaltar preset activo con animaciones
      highlightActivePreset: function(activePreset) {
        const presetButtons = document.querySelectorAll('.filter-preset');
        presetButtons.forEach(btn => {
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-outline');
          btn.style.transform = 'scale(1)';
          
          if (btn.dataset.filter === activePreset) {
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-primary');
            
            // Animación de activación
            btn.style.transition = 'all 0.2s ease';
            btn.style.transform = 'scale(1.05)';
            setTimeout(() => {
              btn.style.transform = 'scale(1)';
            }, 200);
          }
        });
      },
      
      // Reset con cache clearing
      reset: function() {
        console.log('🔄 Reseteando filtros');
        
        // Mostrar loading
        FilterLoadingManager.showFilterLoading();
        
        // Reset valores
        Object.keys(this.filters).forEach(filter => {
          this.filters[filter] = 0;
          this.updateFilterDisplay(filter, 0);
          
          const slider = document.getElementById(filter);
          if (slider) {
            slider.value = 0;
          }
        });
        
        // Limpiar cache
        FilterCache.cleanup();
        FilterCache.markDirty();
        
        // Guardar estado reset
        FilterCache.saveState('reset', this.filters);
        
        this.highlightActivePreset('none');
        
        // Aplicar inmediatamente
        this.applyFiltersImmediate();
      },
      
      // Generar string de filtros CSS optimizado
      getFilterString: function() {
        const { brightness, contrast, saturation, blur, sepia, hueRotate } = this.filters;
        
        let filterStr = '';
        
        // Solo agregar filtros que tienen valores diferentes de 0
        if (brightness !== 0) {
          filterStr += `brightness(${(100 + brightness) / 100}) `;
        }
        
        if (contrast !== 0) {
          filterStr += `contrast(${(100 + contrast) / 100}) `;
        }
        
        if (saturation !== 0) {
          filterStr += `saturate(${(100 + saturation) / 100}) `;
        }
        
        if (sepia > 0) {
          filterStr += `sepia(${sepia}%) `;
        }
        
        if (hueRotate !== 0) {
          filterStr += `hue-rotate(${hueRotate}deg) `;
        }
        
        if (blur > 0) {
          filterStr += `blur(${blur}px) `;
        }
        
        const finalFilter = filterStr.trim();
        console.log('🎨 Filtro CSS generado:', finalFilter || 'none');
        
        // Marcar como aplicado en cache
        FilterCache.markApplied(this.filters);
        
        return finalFilter;
      },
      
      // Obtener rendimiento de filtros
      getPerformanceMetrics: function() {
        return {
          cacheSize: FilterCache.states.size,
          isDirty: FilterCache.isDirty,
          lastApplied: FilterCache.lastApplied,
          activeLoadings: FilterLoadingManager.activeLoadings.size
        };
      }
    };

    // Función para resetear filtros
    function resetFilters() {
      FilterManager.reset();
      UIManager.showSuccess('Filtros reseteados');
    }

    // Función para aplicar filtros al canvas con optimizaciones
    function applyCanvasFilters() {
      if (!canvas) {
        console.log('No hay canvas disponible para aplicar filtros');
        FilterLoadingManager.hideFilterLoading();
        return;
      }
      
      // Verificar si necesita actualización usando cache
      if (!FilterCache.hasChanged(FilterManager.filters)) {
        console.log('⚡ Filtros no han cambiado, omitiendo aplicación al canvas');
        FilterLoadingManager.hideFilterLoading();
        return;
      }
      
      // Usar requestAnimationFrame para mejor performance
      requestAnimationFrame(() => {
        try {
          const filterString = FilterManager.getFilterString();
          console.log('🎨 Aplicando filtros CSS al canvas:', filterString || 'none');
          
          // Aplicar filtros con transición suave
          canvas.style.transition = 'filter 0.2s ease';
          canvas.style.filter = filterString;
          
          // Ocultar loading states después de aplicar
          setTimeout(() => {
            FilterLoadingManager.hideFilterLoading();
          }, 200);
          
        } catch (error) {
          console.error('❌ Error al aplicar filtros:', error);
          FilterLoadingManager.hideFilterLoading();
        }
      });
    }
    
    // Función para aplicar solo filtros ligeros (después del worker)
    function applyCanvasFiltersLight() {
      if (!canvas) return;
      
      // Solo aplicar filtros que no son procesados por el worker
      const lightFilters = {
        hue: FilterManager.filters.hue,
        sepia: FilterManager.filters.sepia,
        grayscale: FilterManager.filters.grayscale,
        invert: FilterManager.filters.invert
      };
      
      // Generar string de filtros ligeros
      const filterParts = [];
      
      if (lightFilters.hue !== 0) {
        filterParts.push(`hue-rotate(${lightFilters.hue}deg)`);
      }
      if (lightFilters.sepia !== 0) {
        filterParts.push(`sepia(${lightFilters.sepia}%)`);
      }
      if (lightFilters.grayscale !== 0) {
        filterParts.push(`grayscale(${lightFilters.grayscale}%)`);
      }
      if (lightFilters.invert !== 0) {
        filterParts.push(`invert(${lightFilters.invert}%)`);
      }
      
      const filterString = filterParts.join(' ');
      
      requestAnimationFrame(() => {
        canvas.style.transition = 'filter 0.2s ease';
        canvas.style.filter = filterString;
      });
    }
    
    // ===== ZOOM FUNCTIONALITY =====
    
    function zoomIn() {
      if (currentZoom < maxZoom) {
        currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
        applyZoom();
        updateZoomLevel();
        UIManager.showSuccess(`Zoom: ${Math.round(currentZoom * 100)}%`);
      }
    }
    
    function zoomOut() {
      if (currentZoom > minZoom) {
        currentZoom = Math.max(currentZoom - zoomStep, minZoom);
        applyZoom();
        updateZoomLevel();
        UIManager.showSuccess(`Zoom: ${Math.round(currentZoom * 100)}%`);
      }
    }
    
    // Funciones de zoom específicas para rueda del ratón (más suaves)
    function zoomInWheel() {
      if (currentZoom < maxZoom) {
        const wheelStep = 0.05; // Paso más pequeño para rueda del ratón
        currentZoom = Math.min(currentZoom + wheelStep, maxZoom);
        applyZoom();
        updateZoomLevel();
      }
    }
    
    function zoomOutWheel() {
      if (currentZoom > minZoom) {
        const wheelStep = 0.05; // Paso más pequeño para rueda del ratón
        currentZoom = Math.max(currentZoom - wheelStep, minZoom);
        applyZoom();
        updateZoomLevel();
      }
    }
    
    function resetZoom() {
      currentZoom = 1.0;
      isZoomed = false;
      resetPan(); // Reset pan también
      applyZoom();
      updateZoomLevel();
      UIManager.showSuccess('Zoom reseteado');
    }
    
    function applyZoom() {
      if (!canvas) return;
      
      if (currentZoom !== 1.0) {
        isZoomed = true;
        canvas.classList.add('zoomed');
        canvas.style.transform = `scale(${currentZoom}) translate(${panX}px, ${panY}px)`;
        canvas.style.transformOrigin = 'center center';
        canvas.style.cursor = 'grab';
      } else {
        isZoomed = false;
        canvas.classList.remove('zoomed');
        canvas.style.transform = 'scale(1)';
        canvas.style.cursor = 'default';
        // Reset pan cuando no hay zoom
        panX = 0;
        panY = 0;
      }
      
      // Actualizar scroll del contenedor si es necesario
      const previewContainer = document.querySelector('.preview__container');
      if (previewContainer && isZoomed) {
        previewContainer.style.overflow = 'hidden'; // Cambiar a hidden para pan
      } else if (previewContainer) {
        previewContainer.style.overflow = 'hidden';
      }
    }
    
    function updateZoomLevel() {
      const zoomLevelElement = document.getElementById('zoom-level');
      if (zoomLevelElement) {
        zoomLevelElement.textContent = `${Math.round(currentZoom * 100)}%`;
      }
      
      // Actualizar estado de los botones
      const zoomInBtn = document.getElementById('zoom-in-btn');
      const zoomOutBtn = document.getElementById('zoom-out-btn');
      
      if (zoomInBtn) {
        zoomInBtn.disabled = currentZoom >= maxZoom;
        zoomInBtn.style.opacity = currentZoom >= maxZoom ? '0.5' : '1';
      }
      
      if (zoomOutBtn) {
        zoomOutBtn.disabled = currentZoom <= minZoom;
        zoomOutBtn.style.opacity = currentZoom <= minZoom ? '0.5' : '1';
      }
    }
    
    // Atajos de teclado para zoom
    function initZoomKeyboardShortcuts() {
      document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
          switch(e.key) {
            case '+':
            case '=':
              e.preventDefault();
              zoomIn();
              break;
            case '-':
              e.preventDefault();
              zoomOut();
              break;
            case '0':
              e.preventDefault();
              resetZoom();
              break;
          }
        }
      });
    }
    
    // Zoom con rueda del ratón
    function initMouseWheelZoom() {
      const previewContainer = document.querySelector('.preview__container');
      const canvas = document.getElementById('preview-canvas');
      
      if (!previewContainer) return;
      
      const handleWheelZoom = function(e) {
        // Solo hacer zoom si hay una imagen cargada
        if (!currentImage || !canvas) return;
        
        // Prevenir el scroll normal de la página
        e.preventDefault();
        
        // Determinar dirección del scroll
        const delta = e.deltaY;
        
        if (delta < 0) {
          // Scroll hacia arriba = Zoom In
          zoomInWheel();
        } else if (delta > 0) {
          // Scroll hacia abajo = Zoom Out
          zoomOutWheel();
        }
      };
      
      // Agregar event listener al contenedor del preview
      previewContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
      
      // También agregar al canvas directamente cuando esté disponible
      if (canvas) {
        canvas.addEventListener('wheel', handleWheelZoom, { passive: false });
      }
      
      console.log('Mouse wheel zoom initialized');
    }
    
    // ===== PAN FUNCTIONALITY =====
    
    function initPanNavigation() {
      const canvas = document.getElementById('preview-canvas');
      if (!canvas) return;
      
      // Mouse down - iniciar pan
      canvas.addEventListener('mousedown', function(e) {
        if (!isZoomed || !currentImage) return;
        
        isPanning = true;
        startPanX = e.clientX;
        startPanY = e.clientY;
        startOffsetX = panX;
        startOffsetY = panY;
        
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      });
      
      // Mouse move - pan activo
      document.addEventListener('mousemove', function(e) {
        if (!isPanning || !isZoomed) return;
        
        const deltaX = e.clientX - startPanX;
        const deltaY = e.clientY - startPanY;
        
        // Calcular nuevas posiciones con límites
        const maxPanX = (canvas.offsetWidth * (currentZoom - 1)) / 2;
        const maxPanY = (canvas.offsetHeight * (currentZoom - 1)) / 2;
        
        panX = Math.max(-maxPanX, Math.min(maxPanX, startOffsetX + deltaX / currentZoom));
        panY = Math.max(-maxPanY, Math.min(maxPanY, startOffsetY + deltaY / currentZoom));
        
        applyZoom();
        e.preventDefault();
      });
      
      // Mouse up - finalizar pan
      document.addEventListener('mouseup', function(e) {
        if (isPanning) {
          isPanning = false;
          if (canvas && isZoomed) {
            canvas.style.cursor = 'grab';
          }
        }
      });
      
      // Mouse leave - finalizar pan
      document.addEventListener('mouseleave', function(e) {
        if (isPanning) {
          isPanning = false;
          if (canvas && isZoomed) {
            canvas.style.cursor = 'grab';
          }
        }
      });
      
      // Touch events para móviles
      canvas.addEventListener('touchstart', function(e) {
        if (!isZoomed || !currentImage) return;
        
        const touch = e.touches[0];
        isPanning = true;
        startPanX = touch.clientX;
        startPanY = touch.clientY;
        startOffsetX = panX;
        startOffsetY = panY;
        
        e.preventDefault();
      }, { passive: false });
      
      document.addEventListener('touchmove', function(e) {
        if (!isPanning || !isZoomed) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - startPanX;
        const deltaY = touch.clientY - startPanY;
        
        // Calcular nuevas posiciones con límites
        const maxPanX = (canvas.offsetWidth * (currentZoom - 1)) / 2;
        const maxPanY = (canvas.offsetHeight * (currentZoom - 1)) / 2;
        
        panX = Math.max(-maxPanX, Math.min(maxPanX, startOffsetX + deltaX / currentZoom));
        panY = Math.max(-maxPanY, Math.min(maxPanY, startOffsetY + deltaY / currentZoom));
        
        applyZoom();
        e.preventDefault();
      }, { passive: false });
      
      document.addEventListener('touchend', function(e) {
        if (isPanning) {
          isPanning = false;
        }
      });
      
      console.log('Pan navigation initialized');
    }
    
    function resetPan() {
      panX = 0;
      panY = 0;
      isPanning = false;
      if (canvas) {
        canvas.style.cursor = isZoomed ? 'grab' : 'default';
      }
    }
    
    // ===== MOBILE RESPONSIVE FEATURES =====
    
    function initMobileFeatures() {
      if (!isMobileDevice()) return;
      
      // Initialize touch gestures
      initTouchGestures();
      
      // Initialize mobile navigation
      initMobileNavigation();
      
      // Initialize mobile canvas interactions
      initMobileCanvasInteraction();
      
      // Initialize keyboard handling for mobile
      initMobileKeyboard();
      
      // Initialize orientation change handling
      initOrientationHandling();
      
      console.log('Mobile features initialized');
    }
    
    function isMobileDevice() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             window.innerWidth <= 768 ||
             ('ontouchstart' in window) ||
             (navigator.maxTouchPoints > 0);
    }
    
    function initTouchGestures() {
      let startY = 0;
      let isScrolling = false;
      
      // Smooth scrolling for mobile
      document.addEventListener('touchstart', function(e) {
        startY = e.touches[0].clientY;
        isScrolling = false;
      }, { passive: true });
      
      document.addEventListener('touchmove', function(e) {
        if (!isScrolling) {
          const currentY = e.touches[0].clientY;
          const diffY = Math.abs(currentY - startY);
          
          if (diffY > 10) {
            isScrolling = true;
          }
        }
      }, { passive: true });
      
      // Double tap to reset zoom on canvas
      let lastTap = 0;
      const canvas = document.getElementById('preview-canvas');
      
      if (canvas) {
        canvas.addEventListener('touchend', function(e) {
          const currentTime = new Date().getTime();
          const tapLength = currentTime - lastTap;
          
          if (tapLength < 500 && tapLength > 0) {
            // Double tap detected - reset canvas view
            resetCanvasView();
            e.preventDefault();
          }
          lastTap = currentTime;
        });
      }
    }
    
    function initMobileNavigation() {
      // Auto-collapse sections on mobile after interaction
      const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
      
      collapsibleHeaders.forEach(header => {
        header.addEventListener('touchend', function() {
          // Small delay to ensure smooth animation
          setTimeout(() => {
            // Auto-scroll to the opened section
            if (!header.closest('.collapsible').classList.contains('collapsed')) {
              header.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest' 
              });
            }
          }, 100);
        });
      });
      
      // Mobile sticky navigation helper
      const actionButtons = document.querySelector('.action-buttons');
      if (actionButtons && window.innerWidth <= 767) {
        // Make action buttons sticky on mobile
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              actionButtons.classList.remove('fixed-bottom');
            } else {
              actionButtons.classList.add('fixed-bottom');
            }
          });
        });
        
        // Observe the last section
        const lastSection = document.querySelector('section:last-of-type');
        if (lastSection) {
          observer.observe(lastSection);
        }
      }
    }
    
    function initMobileCanvasInteraction() {
      const canvas = document.getElementById('preview-canvas');
      if (!canvas) return;
      
      let startX = 0;
      let startY = 0;
      let scale = 1;
      let initialDistance = 0;
      
      // Pinch to zoom
      canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
          // Two finger touch - prepare for zoom
          initialDistance = getDistance(e.touches[0], e.touches[1]);
          e.preventDefault();
        } else if (e.touches.length === 1) {
          // Single touch - prepare for pan
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        }
      }, { passive: false });
      
      canvas.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
          // Pinch zoom
          const currentDistance = getDistance(e.touches[0], e.touches[1]);
          const scaleChange = currentDistance / initialDistance;
          scale = Math.min(Math.max(0.5, scale * scaleChange), 3);
          
          canvas.style.transform = `scale(${scale})`;
          initialDistance = currentDistance;
          e.preventDefault();
        }
      }, { passive: false });
      
      canvas.addEventListener('touchend', function(e) {
        if (e.touches.length === 0) {
          // Reset if scale is too small
          if (scale < 0.8) {
            scale = 1;
            canvas.style.transform = 'scale(1)';
          }
        }
      });
    }
    
    function initMobileKeyboard() {
      // Handle virtual keyboard appearance
      let initialViewportHeight = window.innerHeight;
      
      window.addEventListener('resize', function() {
        const currentHeight = window.innerHeight;
        const heightDifference = initialViewportHeight - currentHeight;
        
        // If height decreased significantly, keyboard is likely open
        if (heightDifference > 150) {
          document.body.classList.add('keyboard-open');
          
          // Scroll focused element into view
          const focusedElement = document.activeElement;
          if (focusedElement && focusedElement.tagName !== 'BODY') {
            setTimeout(() => {
              focusedElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
              });
            }, 100);
          }
        } else {
          document.body.classList.remove('keyboard-open');
        }
      });
      
      // Prevent zoom on input focus for iOS
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        input.addEventListener('focus', function() {
          if (this.style.fontSize !== '16px') {
            this.style.fontSize = '16px';
          }
        });
      });
    }
    
    function initOrientationHandling() {
      // Handle orientation changes
      window.addEventListener('orientationchange', function() {
        setTimeout(() => {
          // Recalculate layout after orientation change
          if (canvas && currentImage) {
            updatePreview();
          }
          
          // Reset any zoom applied to canvas
          const canvas = document.getElementById('preview-canvas');
          if (canvas) {
            canvas.style.transform = 'scale(1)';
          }
          
          // Update container widths
          updateMobileLayout();
        }, 100);
      });
    }
    
    function getDistance(touch1, touch2) {
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    
    function resetCanvasView() {
      const canvas = document.getElementById('preview-canvas');
      if (canvas) {
        canvas.style.transform = 'scale(1)';
        canvas.style.transformOrigin = 'center';
      }
    }
    
    function updateMobileLayout() {
      if (!isMobileDevice()) return;
      
      // Update grid layouts for current screen size
      const grids = document.querySelectorAll('.grid');
      grids.forEach(grid => {
        if (window.innerWidth <= 480) {
          // Extra small screens - single column
          grid.style.gridTemplateColumns = '1fr';
        } else if (window.innerWidth <= 768) {
          // Small screens - adjust based on content
          if (grid.classList.contains('grid-cols-2')) {
            grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
          }
        }
      });
      
      // Update button groups
      const buttonGroups = document.querySelectorAll('.button-group');
      buttonGroups.forEach(group => {
        if (window.innerWidth <= 480) {
          group.style.flexDirection = 'column';
        } else {
          group.style.flexDirection = 'row';
        }
      });
      
      // Reajustar canvas si hay una imagen cargada
      if (currentImage && canvas) {
        setupCanvas();
        updatePreview();
      }
    }
    
    // Add mobile-specific CSS class to body
    if (isMobileDevice()) {
      document.body.classList.add('mobile-device');
    }
    
    // Initialize on window load
    window.addEventListener('load', function() {
      if (isMobileDevice()) {
        updateMobileLayout();
      }
    });
    
    // Add resize event listener for responsive canvas
    window.addEventListener('resize', function() {
      // Debounce the resize event
      clearTimeout(window.resizeTimer);
      window.resizeTimer = setTimeout(function() {
        if (isMobileDevice()) {
          updateMobileLayout();
        }
      }, 250);
    });

    // ===== FILTER OPTIMIZATION & CLEANUP =====
    
    // Limpieza automática de cache cada 5 minutos
    setInterval(() => {
      FilterCache.cleanup();
      console.log('🧹 Limpieza automática de cache de filtros ejecutada');
    }, 5 * 60 * 1000);
    
    // Cleanup al cerrar/recargar página
    window.addEventListener('beforeunload', () => {
      SmartDebounce.clear();
      FilterLoadingManager.activeLoadings.clear();
      console.log('🧹 Cleanup de debounce y loading states completado');
    });
    
    // Función para mostrar métricas de rendimiento (desarrollo)
    window.getFilterPerformanceMetrics = function() {
      const metrics = FilterManager.getPerformanceMetrics();
      console.table({
        'Cache Size': metrics.cacheSize,
        'Cache Dirty': metrics.isDirty,
        'Active Loadings': metrics.activeLoadings,
        'Smart Debounce Timers': SmartDebounce.timers.size,
        'Animation Frames': SmartDebounce.animationFrames.size
      });
      return metrics;
    };
    
    console.log('🎨 Sistema de filtros optimizado inicializado');
    console.log('💡 Usa getFilterPerformanceMetrics() para ver métricas de rendimiento');