(() => {
  // ─── Constants ────────────────────────────────────────────────────────────
  const CANVAS_WIDTH = 1600;
  const PADDING = 64;
  const CHROME_HEIGHT = 44;
  const CHROME_RADIUS = 12;
  const SCREENSHOT_WIDTH = CANVAS_WIDTH - PADDING * 2; // 1472px

  // Cap DPR at 2 to avoid unnecessarily large canvases on 3x displays
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // Browser chrome colours
  const CHROME_BG      = '#FFFFFF';
  const CHROME_BAR_BG  = '#F5F5F7';
  const DOT_RED        = '#FF5F57';
  const DOT_YELLOW     = '#FFBD2E';
  const DOT_GREEN      = '#28C840';
  const URL_BAR_BG     = '#E8E8EA';
  const URL_BAR_TEXT   = '#9898A0';
  const SHADOW_COLOR   = 'rgba(0, 0, 0, 0.18)';
  const SHADOW_BLUR    = 60;
  const SHADOW_OFFSET_Y = 24;

  // ─── WebP support detection ───────────────────────────────────────────────
  function supportsWebP() {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  const USE_WEBP = supportsWebP();

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const canvas      = document.getElementById('mockup-canvas');
  const ctx         = canvas.getContext('2d');
  const dropOverlay = document.getElementById('drop-overlay');
  const fileInput   = document.getElementById('file-input');
  const downloadBtn = document.getElementById('download-btn');
  const downloadLabel = document.getElementById('download-label');
  const resetBtn    = document.getElementById('reset-btn');

  downloadLabel.textContent = USE_WEBP ? 'Download WebP' : 'Download PNG';

  // ─── State ────────────────────────────────────────────────────────────────
  let loadedImage = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y,     x + w, y + r,     r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x,     y + h, x,     y + h - r,  r);
    c.lineTo(x, y + r);
    c.arcTo(x,     y,     x + r, y,           r);
    c.closePath();
  }

  function dot(c, x, y, r, color) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  }

  function computeCanvasHeight(imgHeight) {
    return PADDING + CHROME_HEIGHT + (imgHeight ?? 360) + PADDING;
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────
  // All coordinates are in LOGICAL pixels (1600px space).
  // The canvas physical size is multiplied by DPR so it stays sharp on Retina.

  function drawMockup(img) {
    const scaledImgH = img
      ? Math.round((img.naturalHeight / img.naturalWidth) * SCREENSHOT_WIDTH)
      : 360;

    const logicalH = computeCanvasHeight(scaledImgH);

    // Set physical canvas size scaled by DPR for sharp rendering
    canvas.width  = CANVAS_WIDTH * DPR;
    canvas.height = logicalH * DPR;
    // Scale context so all drawing uses logical (1600px) coordinates
    ctx.scale(DPR, DPR);

    ctx.clearRect(0, 0, CANVAS_WIDTH, logicalH);

    const frameX = PADDING;
    const frameY = PADDING;
    const frameW = SCREENSHOT_WIDTH;
    const frameH = CHROME_HEIGHT + scaledImgH;

    // ── Shadow ──
    ctx.save();
    ctx.shadowColor   = SHADOW_COLOR;
    ctx.shadowBlur    = SHADOW_BLUR;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = SHADOW_OFFSET_Y;
    roundRect(ctx, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    ctx.fillStyle = CHROME_BG;
    ctx.fill();
    ctx.restore();

    // ── White frame background ──
    ctx.save();
    roundRect(ctx, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    ctx.fillStyle = CHROME_BG;
    ctx.fill();
    ctx.restore();

    // Clip to inside the rounded frame
    ctx.save();
    roundRect(ctx, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    ctx.clip();

    // ── Chrome bar ──
    ctx.fillStyle = CHROME_BAR_BG;
    ctx.fillRect(frameX, frameY, frameW, CHROME_HEIGHT);

    // Traffic light dots
    const dotY       = frameY + CHROME_HEIGHT / 2;
    const dotSpacing = 20;
    const dotR       = 6;
    const dotsX      = frameX + 20;
    dot(ctx, dotsX,                 dotY, dotR, DOT_RED);
    dot(ctx, dotsX + dotSpacing,    dotY, dotR, DOT_YELLOW);
    dot(ctx, dotsX + dotSpacing * 2, dotY, dotR, DOT_GREEN);

    // Fake URL bar
    const urlW = 280, urlH = 22, urlR = 6;
    const urlX = frameX + (frameW - urlW) / 2;
    const urlY = frameY + (CHROME_HEIGHT - urlH) / 2;
    roundRect(ctx, urlX, urlY, urlW, urlH, urlR);
    ctx.fillStyle = URL_BAR_BG;
    ctx.fill();
    ctx.fillStyle = URL_BAR_TEXT;
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('yoursite.com', urlX + urlW / 2, urlY + urlH / 2);

    // Separator line
    ctx.fillStyle = '#E5E5E5';
    ctx.fillRect(frameX, frameY + CHROME_HEIGHT - 1, frameW, 1);

    // ── Screenshot / placeholder ──
    const screenshotY = frameY + CHROME_HEIGHT;
    if (img) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, frameX, screenshotY, SCREENSHOT_WIDTH, scaledImgH);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(frameX, screenshotY, SCREENSHOT_WIDTH, scaledImgH);
    }

    ctx.restore(); // end clip
  }

  // ─── Overlay positioning ──────────────────────────────────────────────────
  // The overlay div sits over the canvas screenshot area.
  // canvas.offsetWidth is in CSS pixels; we compare against CANVAS_WIDTH logical px.

  function positionOverlay() {
    if (loadedImage) {
      dropOverlay.style.display = 'none';
      return;
    }

    const displayW = canvas.offsetWidth;
    const scale    = displayW / CANVAS_WIDTH; // CSS px per logical px

    dropOverlay.style.left   = `${PADDING * scale}px`;
    dropOverlay.style.top    = `${(PADDING + CHROME_HEIGHT) * scale}px`;
    dropOverlay.style.width  = `${SCREENSHOT_WIDTH * scale}px`;
    dropOverlay.style.height = `${360 * scale}px`; // 360 = placeholder height
    dropOverlay.style.display = 'flex';
  }

  // ─── Image loading ────────────────────────────────────────────────────────

  function loadImageFromFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

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
  // Export via an off-screen 1600px canvas so the download is always 1600px wide
  // regardless of the DPR used for display.

  function download() {
    const logicalH = Math.round(canvas.height / DPR);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width  = CANVAS_WIDTH;
    exportCanvas.height = logicalH;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = 'high';
    exportCtx.drawImage(canvas, 0, 0, CANVAS_WIDTH, logicalH);

    const mime = USE_WEBP ? 'image/webp' : 'image/png';
    const ext  = USE_WEBP ? 'webp' : 'png';
    const quality = USE_WEBP ? 0.92 : undefined;

    exportCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mockup.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, mime, quality);
  }

  // ─── Paste handling ───────────────────────────────────────────────────────

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

  // Hide reset via inline style (avoids any Tailwind class conflicts)
  resetBtn.style.display = 'none';

  drawMockup(null);
  requestAnimationFrame(positionOverlay);
})();
