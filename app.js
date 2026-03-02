(() => {
  // ─── Constants ────────────────────────────────────────────────────────────
  const CANVAS_WIDTH     = 2000;
  const PADDING          = 64;
  const CHROME_HEIGHT    = 44;
  const CHROME_RADIUS    = 12;
  const SCREENSHOT_WIDTH = CANVAS_WIDTH - PADDING * 2; // 1872px

  // Cap DPR at 2 to avoid huge canvases on 3× displays
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // Browser chrome colours
  const CHROME_BG     = '#FFFFFF';
  const CHROME_BAR_BG = '#F5F5F7';
  const DOT_RED       = '#FF5F57';
  const DOT_YELLOW    = '#FFBD2E';
  const DOT_GREEN     = '#28C840';
  const SHADOW_COLOR  = 'rgba(0, 0, 0, 0.18)';
  const SHADOW_BLUR   = 60;
  const SHADOW_OFFSET_Y = 24;


  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const canvas        = document.getElementById('mockup-canvas');
  const ctx           = canvas.getContext('2d');
  const dropOverlay   = document.getElementById('drop-overlay');
  const fileInput     = document.getElementById('file-input');
  const downloadBtn   = document.getElementById('download-btn');
  const downloadLabel = document.getElementById('download-label');
  const resetBtn      = document.getElementById('reset-btn');

  downloadLabel.textContent = 'Download';

  // ─── State ────────────────────────────────────────────────────────────────
  let loadedImage = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y,     x + w, y + r,      r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h,  r);
    c.lineTo(x + r, y + h);
    c.arcTo(x,     y + h, x,     y + h - r,  r);
    c.lineTo(x, y + r);
    c.arcTo(x,     y,     x + r, y,           r);
    c.closePath();
  }

  function circleDot(c, x, y, r, color) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  }

  function computeCanvasHeight(imgHeight) {
    return PADDING + CHROME_HEIGHT + (imgHeight ?? 360) + PADDING;
  }

  // ─── High-quality image scaling ───────────────────────────────────────────
  // A single canvas drawImage call is blurry when downscaling by more than 2×
  // (common with retina screenshots). Halving repeatedly gives Lanczos-like
  // quality by keeping each step within a 2× ratio.

  function scaleImageHighQuality(source, targetW, targetH) {
    let srcW = source.naturalWidth || source.width;
    let srcH = source.naturalHeight || source.height;

    // Already within 2× — one final drawImage step is fine
    if (srcW <= targetW * 2 && srcH <= targetH * 2) return source;

    let current = source;
    while (srcW > targetW * 2 || srcH > targetH * 2) {
      const nextW = Math.max(Math.ceil(srcW / 2), targetW);
      const nextH = Math.max(Math.ceil(srcH / 2), targetH);
      const step  = document.createElement('canvas');
      step.width  = nextW;
      step.height = nextH;
      const sc = step.getContext('2d');
      sc.imageSmoothingEnabled = true;
      sc.imageSmoothingQuality = 'high';
      sc.drawImage(current, 0, 0, nextW, nextH);
      current = step;
      srcW = nextW;
      srcH = nextH;
    }
    return current;
  }

  // ─── Core drawing function ────────────────────────────────────────────────
  // Draws the mockup onto any 2D context in LOGICAL coordinates (2000px space).
  // Called both for the preview canvas (DPR-scaled) and the export canvas (1×).

  function drawMockupOnContext(c, img) {
    const scaledImgH = img
      ? Math.round((img.naturalHeight / img.naturalWidth) * SCREENSHOT_WIDTH)
      : 360;

    const logicalH = computeCanvasHeight(scaledImgH);

    const frameX = PADDING;
    const frameY = PADDING;
    const frameW = SCREENSHOT_WIDTH;
    const frameH = CHROME_HEIGHT + scaledImgH;

    // Clear to transparent
    c.clearRect(0, 0, CANVAS_WIDTH, logicalH);

    // ── Shadow ──
    c.save();
    c.shadowColor    = SHADOW_COLOR;
    c.shadowBlur     = SHADOW_BLUR;
    c.shadowOffsetX  = 0;
    c.shadowOffsetY  = SHADOW_OFFSET_Y;
    roundRect(c, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();
    c.restore();

    // ── White frame ──
    c.save();
    roundRect(c, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();
    c.restore();

    // Clip to inside rounded frame
    c.save();
    roundRect(c, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    c.clip();

    // ── Chrome bar ──
    c.fillStyle = CHROME_BAR_BG;
    c.fillRect(frameX, frameY, frameW, CHROME_HEIGHT);

    // Traffic light dots
    const dotY  = frameY + CHROME_HEIGHT / 2;
    const dotGap = 20;
    const dotR  = 6;
    const dotsX = frameX + 20;
    circleDot(c, dotsX,           dotY, dotR, DOT_RED);
    circleDot(c, dotsX + dotGap,  dotY, dotR, DOT_YELLOW);
    circleDot(c, dotsX + dotGap * 2, dotY, dotR, DOT_GREEN);

    // Separator
    c.fillStyle = '#E5E5E5';
    c.fillRect(frameX, frameY + CHROME_HEIGHT - 1, frameW, 1);

    // ── Screenshot / placeholder ──
    const screenshotY = frameY + CHROME_HEIGHT;
    if (img) {
      const scaled = scaleImageHighQuality(img, SCREENSHOT_WIDTH, scaledImgH);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(scaled, frameX, screenshotY, SCREENSHOT_WIDTH, scaledImgH);
    } else {
      c.fillStyle = '#FFFFFF';
      c.fillRect(frameX, screenshotY, SCREENSHOT_WIDTH, scaledImgH);
    }

    c.restore(); // end clip

    return logicalH;
  }

  // ─── Preview canvas rendering ─────────────────────────────────────────────
  // Uses DPR scaling so the canvas is sharp on Retina displays.

  function drawMockup(img) {
    const scaledImgH = img
      ? Math.round((img.naturalHeight / img.naturalWidth) * SCREENSHOT_WIDTH)
      : 360;
    const logicalH = computeCanvasHeight(scaledImgH);

    canvas.width  = CANVAS_WIDTH * DPR;
    canvas.height = logicalH * DPR;
    ctx.scale(DPR, DPR);

    drawMockupOnContext(ctx, img);
  }

  // ─── Overlay positioning ──────────────────────────────────────────────────

  function positionOverlay() {
    if (loadedImage) {
      dropOverlay.style.display = 'none';
      return;
    }
    const displayW = canvas.offsetWidth;
    const scale    = displayW / CANVAS_WIDTH;

    dropOverlay.style.left   = `${PADDING * scale}px`;
    dropOverlay.style.top    = `${(PADDING + CHROME_HEIGHT) * scale}px`;
    dropOverlay.style.width  = `${SCREENSHOT_WIDTH * scale}px`;
    dropOverlay.style.height = `${360 * scale}px`;
    dropOverlay.style.display = 'flex';
  }

  // ─── Image loading ────────────────────────────────────────────────────────

  function loadImageFromFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        drawMockup(img);
        dropOverlay.style.display = 'none';
        downloadBtn.disabled = false;
        resetBtn.style.display = 'inline-flex';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    loadedImage = null;
    fileInput.value = '';
    downloadBtn.disabled = true;
    resetBtn.style.display = 'none';
    drawMockup(null);
    requestAnimationFrame(positionOverlay);
  }

  // ─── Download ─────────────────────────────────────────────────────────────
  // Redraws the mockup fresh on a 1× off-screen canvas so the output is always
  // a clean 1600px render — no downsampling from the DPR display canvas.

  function download() {
    const scaledImgH = loadedImage
      ? Math.round((loadedImage.naturalHeight / loadedImage.naturalWidth) * SCREENSHOT_WIDTH)
      : 360;
    const logicalH = computeCanvasHeight(scaledImgH);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width  = CANVAS_WIDTH;
    exportCanvas.height = logicalH;

    const exportCtx = exportCanvas.getContext('2d');
    drawMockupOnContext(exportCtx, loadedImage);

    exportCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'mockup.webp';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/webp', 0.95);
  }

  // ─── Paste ────────────────────────────────────────────────────────────────

  function handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        loadImageFromFile(item.getAsFile());
        return;
      }
    }
  }

  // ─── Event listeners ──────────────────────────────────────────────────────

  dropOverlay.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => loadImageFromFile(e.target.files[0]));

  dropOverlay.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('drag-over');
  });
  dropOverlay.addEventListener('dragleave', () => dropOverlay.classList.remove('drag-over'));
  dropOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('drag-over');
    loadImageFromFile(e.dataTransfer.files[0]);
  });

  downloadBtn.addEventListener('click', download);
  resetBtn.addEventListener('click', reset);

  window.addEventListener('paste', handlePaste);
  document.addEventListener('paste', handlePaste);

  window.addEventListener('resize', () => {
    if (!loadedImage) positionOverlay();
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  resetBtn.style.display = 'none';
  drawMockup(null);
  requestAnimationFrame(positionOverlay);
})();
