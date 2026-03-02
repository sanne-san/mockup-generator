(() => {
  // ─── Constants ────────────────────────────────────────────────────────────
  const CANVAS_WIDTH = 1600;       // total output width (px)
  const PADDING = 64;              // transparent padding around the browser frame
  const CHROME_HEIGHT = 44;        // browser top-bar height
  const CHROME_RADIUS = 12;        // outer corner radius of the browser frame
  const SCREENSHOT_WIDTH = CANVAS_WIDTH - PADDING * 2;  // 1472px

  // Browser chrome colours
  const CHROME_BG = '#FFFFFF';
  const CHROME_BAR_BG = '#F5F5F7';
  const DOT_RED = '#FF5F57';
  const DOT_YELLOW = '#FFBD2E';
  const DOT_GREEN = '#28C840';
  const URL_BAR_BG = '#E8E8EA';
  const URL_BAR_TEXT = '#9898A0';

  // Shadow (drawn as a series of blurred fills for a realistic soft shadow)
  const SHADOW_COLOR = 'rgba(0, 0, 0, 0.18)';
  const SHADOW_BLUR = 60;
  const SHADOW_OFFSET_Y = 24;

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const canvas = document.getElementById('mockup-canvas');
  const ctx = canvas.getContext('2d');
  const dropOverlay = document.getElementById('drop-overlay');
  const fileInput = document.getElementById('file-input');
  const downloadBtn = document.getElementById('download-btn');
  const resetBtn = document.getElementById('reset-btn');
  const canvasContainer = document.getElementById('canvas-container');

  // ─── State ────────────────────────────────────────────────────────────────
  let loadedImage = null;  // HTMLImageElement or null

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Draw a rounded rectangle path (no fill/stroke — caller decides). */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /** Draw a filled circle. */
  function dot(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ─── Canvas sizing ────────────────────────────────────────────────────────

  /**
   * Given an optional loaded image, compute the total canvas height.
   * Without an image we use a placeholder height of 360px for the screenshot area.
   */
  function computeCanvasHeight(imgHeight) {
    const screenshotHeight = imgHeight ?? 360;
    return PADDING + CHROME_HEIGHT + screenshotHeight + PADDING;
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  function drawMockup(img) {
    const scaledImgH = img
      ? Math.round((img.naturalHeight / img.naturalWidth) * SCREENSHOT_WIDTH)
      : 360;

    const canvasH = computeCanvasHeight(scaledImgH);

    canvas.width = CANVAS_WIDTH;
    canvas.height = canvasH;

    // Clear to fully transparent
    ctx.clearRect(0, 0, CANVAS_WIDTH, canvasH);

    const frameX = PADDING;
    const frameY = PADDING;
    const frameW = SCREENSHOT_WIDTH;
    const frameH = CHROME_HEIGHT + scaledImgH;

    // ── Shadow ──────────────────────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = SHADOW_COLOR;
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = SHADOW_OFFSET_Y;
    roundRect(ctx, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    ctx.fillStyle = CHROME_BG;
    ctx.fill();
    ctx.restore();

    // ── Browser frame background (white) ────────────────────────────────────
    ctx.save();
    roundRect(ctx, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    ctx.fillStyle = CHROME_BG;
    ctx.fill();
    ctx.restore();

    // Clip all subsequent drawing to inside the rounded frame
    ctx.save();
    roundRect(ctx, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    ctx.clip();

    // ── Chrome top bar ───────────────────────────────────────────────────────
    ctx.fillStyle = CHROME_BAR_BG;
    ctx.fillRect(frameX, frameY, frameW, CHROME_HEIGHT);

    // Traffic light dots
    const dotY = frameY + CHROME_HEIGHT / 2;
    const dotSpacing = 20;
    const dotRadius = 6;
    const dotsStartX = frameX + 20;
    dot(ctx, dotsStartX, dotY, dotRadius, DOT_RED);
    dot(ctx, dotsStartX + dotSpacing, dotY, dotRadius, DOT_YELLOW);
    dot(ctx, dotsStartX + dotSpacing * 2, dotY, dotRadius, DOT_GREEN);

    // Fake URL bar (centred in the top bar)
    const urlBarW = 280;
    const urlBarH = 22;
    const urlBarX = frameX + (frameW - urlBarW) / 2;
    const urlBarY = frameY + (CHROME_HEIGHT - urlBarH) / 2;
    const urlBarR = 6;
    roundRect(ctx, urlBarX, urlBarY, urlBarW, urlBarH, urlBarR);
    ctx.fillStyle = URL_BAR_BG;
    ctx.fill();

    // Lock icon + placeholder URL text inside the bar
    ctx.fillStyle = URL_BAR_TEXT;
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('yoursite.com', urlBarX + urlBarW / 2, urlBarY + urlBarH / 2);

    // ── Thin separator line between chrome bar and screenshot ────────────────
    ctx.fillStyle = '#E5E5E5';
    ctx.fillRect(frameX, frameY + CHROME_HEIGHT - 1, frameW, 1);

    // ── Screenshot area ──────────────────────────────────────────────────────
    const screenshotY = frameY + CHROME_HEIGHT;
    if (img) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, frameX, screenshotY, SCREENSHOT_WIDTH, scaledImgH);
    } else {
      // White placeholder
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(frameX, screenshotY, SCREENSHOT_WIDTH, scaledImgH);
    }

    ctx.restore(); // end clip
  }

  // ─── Overlay positioning ──────────────────────────────────────────────────

  /**
   * Position the drop overlay div to exactly cover the screenshot area
   * in the scaled-down preview canvas.
   */
  function positionOverlay() {
    if (loadedImage) {
      dropOverlay.style.display = 'none';
      return;
    }

    // The canvas is CSS-scaled to fill the container width.
    const displayW = canvas.offsetWidth;
    const scale = displayW / CANVAS_WIDTH;

    const scaledImgH = 360; // placeholder height (matches drawMockup)
    const canvasH = computeCanvasHeight(scaledImgH);
    const displayH = canvasH * scale;

    // Screenshot area in display pixels
    const left = PADDING * scale;
    const top = (PADDING + CHROME_HEIGHT) * scale;
    const width = SCREENSHOT_WIDTH * scale;
    const height = scaledImgH * scale;

    dropOverlay.style.left = `${left}px`;
    dropOverlay.style.top = `${top}px`;
    dropOverlay.style.width = `${width}px`;
    dropOverlay.style.height = `${height}px`;
    dropOverlay.style.display = 'flex';
  }

  // ─── Upload handling ──────────────────────────────────────────────────────

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        drawMockup(img);
        dropOverlay.style.display = 'none';
        downloadBtn.disabled = false;
        resetBtn.classList.remove('hidden');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    loadedImage = null;
    fileInput.value = '';
    downloadBtn.disabled = true;
    resetBtn.classList.add('hidden');
    drawMockup(null);
    requestAnimationFrame(positionOverlay);
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  function downloadWebP() {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mockup.webp';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/webp', 0.92);
  }

  // ─── Event listeners ──────────────────────────────────────────────────────

  // Click on overlay → open file picker
  dropOverlay.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));

  // Drag and drop
  dropOverlay.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('drag-over');
  });
  dropOverlay.addEventListener('dragleave', () => {
    dropOverlay.classList.remove('drag-over');
  });
  dropOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('drag-over');
    loadFile(e.dataTransfer.files[0]);
  });

  downloadBtn.addEventListener('click', downloadWebP);
  resetBtn.addEventListener('click', reset);

  // Paste (Cmd+V / Ctrl+V) anywhere on the page
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        loadFile(item.getAsFile());
        break;
      }
    }
  });

  // Re-position overlay whenever the window is resized
  window.addEventListener('resize', () => {
    if (!loadedImage) positionOverlay();
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  drawMockup(null);
  // Wait for layout to settle before positioning the overlay
  requestAnimationFrame(positionOverlay);
})();
