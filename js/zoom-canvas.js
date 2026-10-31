/**
 * Pinch-and-Zoom Canvas Controller
 * Enables multi-touch pinch to zoom out and see the whole Kanban tableau on mobile/iPad,
 * with pan, double-tap zoom toggle, and one-tap "Fit Tableau" overview.
 */

class ZoomCanvasController {
  constructor(viewportEl, canvasEl, options = {}) {
    this.viewport = viewportEl;
    this.canvas = canvasEl;
    this.minScale = options.minScale || 0.25;
    this.maxScale = options.maxScale || 2.2;
    
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Gesture tracking
    this.activePointers = new Map();
    this.initialPinchDistance = 0;
    this.initialScale = 1.0;
    this.pinchCenter = { x: 0, y: 0 };
    this.isPanning = false;
    this.lastPanPoint = { x: 0, y: 0 };
    this.lastTapTime = 0;

    // UI callbacks
    this.onZoomChange = options.onZoomChange || null;

    this.initEvents();
  }

  initEvents() {
    const vp = this.viewport;

    // Pointer events for unified touch and mouse handling
    vp.addEventListener('pointerdown', (e) => this.handlePointerDown(e), { passive: false });
    vp.addEventListener('pointermove', (e) => this.handlePointerMove(e), { passive: false });
    vp.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    vp.addEventListener('pointercancel', (e) => this.handlePointerUp(e));

    // Mouse wheel zoom (trackpad pinch or Ctrl + wheel)
    vp.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    // Window resize adjustments
    window.addEventListener('resize', () => {
      // If currently fitted to tableau, auto-readjust fit
      if (this.isFitted) {
        this.fitTableau(false);
      }
    });
  }

  handlePointerDown(e) {
    // If user clicked inside an input, select, textarea, or button, don't hijack
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(e.target.tagName) || e.target.closest('button, select, input, textarea')) {
      return;
    }

    // Check if dragging a task card in interactive mode
    if (e.target.closest('.kanban-card') && this.activePointers.size === 0 && this.scale >= 0.85) {
      // Allow card interactions when zoomed in
      // Still record pointer in case a second finger joins for pinch
    }

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Handle 2-finger pinch gesture start
    if (this.activePointers.size === 2) {
      e.preventDefault();
      const points = Array.from(this.activePointers.values());
      this.initialPinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      this.initialScale = this.scale;
      this.pinchCenter = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
      };
      this.isPanning = false;
      this.isFitted = false;
    } else if (this.activePointers.size === 1) {
      // Detect double-tap to toggle Fit Tableau / 100%
      const now = Date.now();
      if (now - this.lastTapTime < 300) {
        this.handleDoubleTap(e);
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = now;

      // Start 1-finger pan if on background, column header, or if zoomed out (where dragging moves the board)
      const isCard = e.target.closest('.kanban-card');
      if (!isCard || this.scale < 0.85 || e.pointerType === 'mouse' && e.buttons === 4 /* middle click */) {
        this.isPanning = true;
        this.lastPanPoint = { x: e.clientX, y: e.clientY };
      }
    }
  }

  handlePointerMove(e) {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two fingers: Pinch-to-zoom!
    if (this.activePointers.size === 2) {
      e.preventDefault();
      const points = Array.from(this.activePointers.values());
      const currentDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (this.initialPinchDistance > 10) {
        const factor = currentDistance / this.initialPinchDistance;
        const targetScale = Math.min(Math.max(this.initialScale * factor, this.minScale), this.maxScale);
        
        // Current center of pinch
        const currentCenter = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2
        };

        this.zoomTo(targetScale, currentCenter);
      }
      return;
    }

    // One finger or mouse pan
    if (this.isPanning && this.activePointers.size === 1) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };

      this.panX += dx;
      this.panY += dy;
      this.isFitted = false;
      this.applyTransform();
    }
  }

  handlePointerUp(e) {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.initialPinchDistance = 0;
    }
    if (this.activePointers.size === 0) {
      this.isPanning = false;
    }
  }

  handleDoubleTap(e) {
    e.preventDefault();
    // Toggle between Fit Tableau and 100%
    if (this.scale < 0.75) {
      // Zoom into 100% at double tap position
      this.zoomTo(1.0, { x: e.clientX, y: e.clientY }, true);
      this.isFitted = false;
    } else {
      // Zoom out to fit whole tableau
      this.fitTableau(true);
    }
  }

  handleWheel(e) {
    // Zoom on trackpad pinch or Ctrl + wheel or if wheel within canvas
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const targetScale = Math.min(Math.max(this.scale * factor, this.minScale), this.maxScale);
      this.zoomTo(targetScale, { x: e.clientX, y: e.clientY });
      this.isFitted = false;
    }
  }

  zoomTo(targetScale, focalPoint = null, animated = false) {
    if (!focalPoint) {
      const rect = this.viewport.getBoundingClientRect();
      focalPoint = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }

    const rect = this.viewport.getBoundingClientRect();
    const focalX = focalPoint.x - rect.left;
    const focalY = focalPoint.y - rect.top;

    // Adjust pan so point under cursor/finger stays stationary
    const scaleDiff = targetScale / this.scale;
    this.panX = focalX - (focalX - this.panX) * scaleDiff;
    this.panY = focalY - (focalY - this.panY) * scaleDiff;
    this.scale = targetScale;

    this.applyTransform(animated);
  }

  /**
   * Fit the entire Kanban tableau so all columns are visible on screen
   * Perfect for phone screens and iPad displays.
   */
  fitTableau(animated = true) {
    const vpRect = this.viewport.getBoundingClientRect();
    const vpWidth = vpRect.width;
    const vpHeight = vpRect.height;

    // Measure full unscaled tableau size
    // Columns typically total ~1200px - 1400px wide
    const columns = this.canvas.querySelectorAll('.kanban-column');
    if (!columns || columns.length === 0) return;

    // Calculate natural content dimensions
    let totalColsWidth = 0;
    let maxColHeight = 500;
    columns.forEach(col => {
      totalColsWidth += col.offsetWidth + 18; // width + gap
      maxColHeight = Math.max(maxColHeight, col.offsetHeight);
    });
    totalColsWidth += 24; // padding

    // Available viewport margins
    const availableW = Math.max(vpWidth - 24, 150);
    const availableH = Math.max(vpHeight - 32, 200);

    // Compute scale to fit entire board in both width and height
    const scaleW = availableW / totalColsWidth;
    const scaleH = availableH / Math.max(maxColHeight, 600);
    
    // Pick scale so width is visible; limit scale to fit nicely
    let fitScale = Math.min(scaleW, scaleH * 1.15);
    fitScale = Math.min(Math.max(fitScale, this.minScale), 1.0);

    this.scale = fitScale;
    
    // Center tableau inside viewport
    const scaledBoardW = totalColsWidth * this.scale;
    const scaledBoardH = maxColHeight * this.scale;

    this.panX = Math.max((vpWidth - scaledBoardW) / 2, 8);
    this.panY = Math.max((vpHeight - scaledBoardH) / 4, 12);

    this.isFitted = true;
    this.applyTransform(animated);
  }

  resetZoom(animated = true) {
    this.scale = 1.0;
    this.panX = 16;
    this.panY = 16;
    this.isFitted = false;
    this.applyTransform(animated);
  }

  zoomIn(step = 0.2) {
    const target = Math.min(this.scale + step, this.maxScale);
    this.zoomTo(target, null, true);
    this.isFitted = false;
  }

  zoomOut(step = 0.2) {
    const target = Math.max(this.scale - step, this.minScale);
    this.zoomTo(target, null, true);
    this.isFitted = false;
  }

  setScaleFromSlider(val) {
    const target = Math.min(Math.max(val / 100, this.minScale), this.maxScale);
    this.zoomTo(target, null, false);
    this.isFitted = false;
  }

  applyTransform(animated = false) {
    if (animated) {
      this.canvas.style.transition = 'transform 0.24s cubic-bezier(0.2, 0, 0, 1)';
      setTimeout(() => {
        this.canvas.style.transition = '';
      }, 250);
    } else {
      this.canvas.style.transition = '';
    }

    this.canvas.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0px) scale(${this.scale})`;

    // Update zoom indicator in UI
    if (this.onZoomChange) {
      this.onZoomChange({
        scale: this.scale,
        percentage: Math.round(this.scale * 100),
        isFitted: this.isFitted
      });
    }
  }
}

window.ZoomCanvasController = ZoomCanvasController;
