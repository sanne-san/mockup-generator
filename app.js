(() => {
  // ─── Constants ────────────────────────────────────────────────────────────
  const CANVAS_WIDTH     = 2000;
  const PADDING          = 40;
  const CHROME_HEIGHT    = 44;
  const CHROME_RADIUS    = 12;
  const SCREENSHOT_WIDTH = CANVAS_WIDTH - PADDING * 2; // 1920px

  // Cap DPR at 2 to avoid huge canvases on 3× displays
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // Browser chrome colours
  const CHROME_BG      = '#FFFFFF';
  const CHROME_BAR_BG  = '#F5F5F7';
  const DOT_RED        = '#FF5F57';
  const DOT_YELLOW     = '#FFBD2E';
  const DOT_GREEN      = '#28C840';
  const FRAME_BORDER        = '#ECECEE';
  const PLACEHOLDER_HEIGHT  = 520; // empty-state screenshot area height


  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const canvas        = document.getElementById('mockup-canvas');
  const ctx           = canvas.getContext('2d');
  const dropOverlay   = document.getElementById('drop-overlay');
  const fileInput     = document.getElementById('file-input');
  const downloadBtn   = document.getElementById('download-btn');
  const copyBtn       = document.getElementById('copy-btn');
  const resetBtn      = document.getElementById('reset-btn');
  const cropBtn       = document.getElementById('crop-btn');
  const cropModal     = document.getElementById('crop-modal');
  const cropImage     = document.getElementById('crop-image');
  const cropApplyBtn  = document.getElementById('crop-apply-btn');
  const cropCancelBtn = document.getElementById('crop-cancel-btn');

  // ─── State ────────────────────────────────────────────────────────────────
  let loadedImage   = null;  // currently displayed image (may be cropped)
  let originalImage = null;  // the raw uploaded image (never modified)
  let cropperInstance = null;

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
    return PADDING + CHROME_HEIGHT + (imgHeight ?? PLACEHOLDER_HEIGHT) + PADDING;
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
    // Never upscale — use the image's natural width if it's smaller than the
    // target, so we always downscale (or draw 1:1) rather than interpolating up.
    const imgW = img ? Math.min(img.naturalWidth, SCREENSHOT_WIDTH) : SCREENSHOT_WIDTH;
    const scaledImgH = img
      ? Math.round((img.naturalHeight / img.naturalWidth) * imgW)
      : PLACEHOLDER_HEIGHT;

    const logicalH = computeCanvasHeight(scaledImgH);

    const frameX = PADDING;
    const frameY = PADDING;
    const frameW = imgW;
    const frameH = CHROME_HEIGHT + scaledImgH;

    // Clear to transparent
    c.clearRect(0, 0, CANVAS_WIDTH, logicalH);

    // ── Shadows (two-layer to match CSS: rgba(0,0,0,0.1) 0 20px 25px -5px, rgba(0,0,0,0.04) 0 10px 10px -5px) ──
    // Spread -5px is simulated by shrinking the shadow source rect by 5px each side.
    c.save();
    c.shadowColor   = 'rgba(0, 0, 0, 0.1)';
    c.shadowBlur    = 25;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 20;
    roundRect(c, frameX + 5, frameY + 5, frameW - 10, frameH - 10, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();
    c.restore();

    c.save();
    c.shadowColor   = 'rgba(0, 0, 0, 0.04)';
    c.shadowBlur    = 10;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 10;
    roundRect(c, frameX + 5, frameY + 5, frameW - 10, frameH - 10, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();
    c.restore();

    // ── White frame ──
    roundRect(c, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();

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


    // ── Screenshot / placeholder ──
    const screenshotY = frameY + CHROME_HEIGHT;
    if (img) {
      const scaled = scaleImageHighQuality(img, imgW, scaledImgH);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(scaled, frameX, screenshotY, imgW, scaledImgH);
    } else {
      c.fillStyle = '#FFFFFF';
      c.fillRect(frameX, screenshotY, SCREENSHOT_WIDTH, scaledImgH);
    }

    c.restore(); // end clip

    // ── Border ──
    c.save();
    roundRect(c, frameX, frameY, frameW, frameH, CHROME_RADIUS);
    c.strokeStyle = FRAME_BORDER;
    c.lineWidth   = 1;
    c.stroke();
    c.restore();

    return logicalH;
  }

  // ─── Preview canvas rendering ─────────────────────────────────────────────
  // Uses DPR scaling so the canvas is sharp on Retina displays.

  function drawMockup(img) {
    const imgW = img ? Math.min(img.naturalWidth, SCREENSHOT_WIDTH) : SCREENSHOT_WIDTH;
    const scaledImgH = img
      ? Math.round((img.naturalHeight / img.naturalWidth) * imgW)
      : PLACEHOLDER_HEIGHT;
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
    dropOverlay.style.height = `${PLACEHOLDER_HEIGHT * scale}px`;
    dropOverlay.style.display = 'flex';
  }

  // ─── Image loading ────────────────────────────────────────────────────────

  function setActiveImage(img) {
    loadedImage = img;
    drawMockup(img);
    dropOverlay.style.display = 'none';
    downloadBtn.disabled = false;
    copyBtn.disabled     = false;
    cropBtn.style.display  = 'inline-flex';
    resetBtn.style.display = 'inline-flex';
  }

  function loadImageFromFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        setActiveImage(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    loadedImage   = null;
    originalImage = null;
    fileInput.value = '';
    downloadBtn.disabled = true;
    copyBtn.disabled     = true;
    cropBtn.style.display  = 'none';
    resetBtn.style.display = 'none';
    drawMockup(null);
    requestAnimationFrame(positionOverlay);
  }

  // ─── Crop ─────────────────────────────────────────────────────────────────

  function openCropModal() {
    if (!originalImage) return;
    cropImage.src = originalImage.src;
    cropModal.style.display = 'flex';
    // Init Cropper.js after the image renders
    cropImage.onload = () => {
      if (cropperInstance) cropperInstance.destroy();
      cropperInstance = new Cropper(cropImage, {
        viewMode: 1,
        autoCropArea: 1,
        movable: true,
        zoomable: true,
        rotatable: false,
        scalable: false,
        background: false,
      });
    };
    // If already loaded (cached src), fire manually
    if (cropImage.complete) cropImage.onload();
  }

  function closeCropModal() {
    cropModal.style.display = 'none';
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
  }

  function applyCrop() {
    if (!cropperInstance) return;
    const croppedCanvas = cropperInstance.getCroppedCanvas();
    const img = new Image();
    img.onload = () => {
      setActiveImage(img);
      closeCropModal();
    };
    img.src = croppedCanvas.toDataURL();
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  async function download() {
    if (!loadedImage) return;

    const src  = loadedImage;
    const imgW = SCREENSHOT_WIDTH;
    const imgH = Math.round(src.naturalHeight * (imgW / src.naturalWidth));

    // Use createImageBitmap to scale — this uses the browser's native image
    // processing pipeline (higher quality than canvas drawImage for downscaling).
    // Falls back to a plain canvas drawImage if not supported.
    let scaledSource;
    try {
      scaledSource = await createImageBitmap(src, {
        resizeWidth:   imgW,
        resizeHeight:  imgH,
        resizeQuality: 'high',
      });
    } catch (_) {
      // Fallback: draw to intermediate canvas at target size
      const tmp  = document.createElement('canvas');
      tmp.width  = imgW;
      tmp.height = imgH;
      const tc   = tmp.getContext('2d');
      tc.imageSmoothingEnabled = true;
      tc.imageSmoothingQuality = 'high';
      tc.drawImage(src, 0, 0, imgW, imgH);
      scaledSource = tmp;
    }

    const totalW = CANVAS_WIDTH;
    const totalH = PADDING + CHROME_HEIGHT + imgH + PADDING;
    const fx = PADDING, fy = PADDING;
    const fw = imgW,    fh = CHROME_HEIGHT + imgH;

    const el = document.createElement('canvas');
    el.width  = totalW;
    el.height = totalH;
    const c = el.getContext('2d');

    // Shadows
    c.save();
    c.shadowColor   = 'rgba(0, 0, 0, 0.1)';
    c.shadowBlur    = 25;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 20;
    roundRect(c, fx + 5, fy + 5, fw - 10, fh - 10, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();
    c.restore();

    c.save();
    c.shadowColor   = 'rgba(0, 0, 0, 0.04)';
    c.shadowBlur    = 10;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 10;
    roundRect(c, fx + 5, fy + 5, fw - 10, fh - 10, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();
    c.restore();

    // Frame
    roundRect(c, fx, fy, fw, fh, CHROME_RADIUS);
    c.fillStyle = CHROME_BG;
    c.fill();

    // Clip
    c.save();
    roundRect(c, fx, fy, fw, fh, CHROME_RADIUS);
    c.clip();

    // Chrome bar
    c.fillStyle = CHROME_BAR_BG;
    c.fillRect(fx, fy, fw, CHROME_HEIGHT);

    // Dots
    const dotY = fy + CHROME_HEIGHT / 2;
    circleDot(c, fx + 20, dotY, 6, DOT_RED);
    circleDot(c, fx + 40, dotY, 6, DOT_YELLOW);
    circleDot(c, fx + 60, dotY, 6, DOT_GREEN);

    // Screenshot — already scaled to exact size, drawn 1:1
    c.drawImage(scaledSource, fx, fy + CHROME_HEIGHT);

    c.restore();

    // Border
    c.save();
    roundRect(c, fx, fy, fw, fh, CHROME_RADIUS);
    c.strokeStyle = FRAME_BORDER;
    c.lineWidth   = 1;
    c.stroke();
    c.restore();

    if (scaledSource instanceof ImageBitmap) scaledSource.close();

    el.toBlob((blob) => {
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

  // ─── Copy to clipboard ────────────────────────────────────────────────────
  // Clipboard API only supports image/png, so we export PNG for this action.

  async function copyToClipboard() {
    if (!loadedImage) return;

    const src  = loadedImage;
    const imgW = SCREENSHOT_WIDTH;
    const imgH = Math.round(src.naturalHeight * (imgW / src.naturalWidth));

    let scaledSource;
    try {
      scaledSource = await createImageBitmap(src, {
        resizeWidth: imgW, resizeHeight: imgH, resizeQuality: 'high',
      });
    } catch (_) {
      const tmp = document.createElement('canvas');
      tmp.width = imgW; tmp.height = imgH;
      const tc = tmp.getContext('2d');
      tc.imageSmoothingEnabled = true;
      tc.imageSmoothingQuality = 'high';
      tc.drawImage(src, 0, 0, imgW, imgH);
      scaledSource = tmp;
    }

    const totalW = CANVAS_WIDTH;
    const totalH = PADDING + CHROME_HEIGHT + imgH + PADDING;
    const fx = PADDING, fy = PADDING, fw = imgW, fh = CHROME_HEIGHT + imgH;

    const el = document.createElement('canvas');
    el.width = totalW; el.height = totalH;
    const c = el.getContext('2d');

    c.save();
    c.shadowColor   = 'rgba(0, 0, 0, 0.1)';
    c.shadowBlur    = 25;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 20;
    roundRect(c, fx + 5, fy + 5, fw - 10, fh - 10, CHROME_RADIUS);
    c.fillStyle = CHROME_BG; c.fill();
    c.restore();

    c.save();
    c.shadowColor   = 'rgba(0, 0, 0, 0.04)';
    c.shadowBlur    = 10;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 10;
    roundRect(c, fx + 5, fy + 5, fw - 10, fh - 10, CHROME_RADIUS);
    c.fillStyle = CHROME_BG; c.fill();
    c.restore();

    roundRect(c, fx, fy, fw, fh, CHROME_RADIUS);
    c.fillStyle = CHROME_BG; c.fill();

    c.save();
    roundRect(c, fx, fy, fw, fh, CHROME_RADIUS);
    c.clip();
    c.fillStyle = CHROME_BAR_BG;
    c.fillRect(fx, fy, fw, CHROME_HEIGHT);
    const dotY = fy + CHROME_HEIGHT / 2;
    circleDot(c, fx + 20, dotY, 6, DOT_RED);
    circleDot(c, fx + 40, dotY, 6, DOT_YELLOW);
    circleDot(c, fx + 60, dotY, 6, DOT_GREEN);
    c.drawImage(scaledSource, fx, fy + CHROME_HEIGHT);
    c.restore();

    c.save();
    roundRect(c, fx, fy, fw, fh, CHROME_RADIUS);
    c.strokeStyle = FRAME_BORDER;
    c.lineWidth   = 1;
    c.stroke();
    c.restore();

    if (scaledSource instanceof ImageBitmap) scaledSource.close();

    const originalLabel = copyBtn.textContent;
    try {
      await new Promise((resolve, reject) =>
        el.toBlob(b => b ? resolve(b) : reject(), 'image/png')
      ).then(async (blob) => {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
      });
      copyBtn.textContent = 'Copied!';
    } catch (err) {
      copyBtn.textContent = 'Failed';
    }
    setTimeout(() => { copyBtn.textContent = originalLabel; }, 2000);
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
  copyBtn.addEventListener('click', copyToClipboard);
  resetBtn.addEventListener('click', reset);
  cropBtn.addEventListener('click', openCropModal);
  cropApplyBtn.addEventListener('click', applyCrop);
  cropCancelBtn.addEventListener('click', closeCropModal);
  cropModal.addEventListener('click', (e) => { if (e.target === cropModal) closeCropModal(); });

  window.addEventListener('paste', handlePaste);
  document.addEventListener('paste', handlePaste);

  window.addEventListener('resize', () => {
    if (!loadedImage) positionOverlay();
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  resetBtn.style.display = 'none';
  cropBtn.style.display  = 'none';
  copyBtn.disabled       = true;
  drawMockup(null);
  requestAnimationFrame(positionOverlay);
})();
