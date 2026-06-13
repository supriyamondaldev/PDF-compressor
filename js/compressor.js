/* ============================================
   PDF Compressor — Compression Engine v2
   ============================================
   Strategy: Maximise quality by searching TWO dimensions —
   render scale (DPI) AND JPEG quality — instead of only quality.

   Key improvements over v1:
   1. Start at a generous DPI and keep JPEG quality HIGH (≥ 0.25).
   2. If quality would drop below the floor, reduce DPI instead —
      a slightly lower resolution at good JPEG quality looks far
      better than a high resolution with heavy JPEG artefacts.
   3. If quality is maxed out and file is still too small, INCREASE
      DPI to spend the budget on extra sharpness.
   ============================================ */

/* Quality floor — never produce JPEGs uglier than this */
const MIN_QUALITY = 0.25;
/* Quality ceiling */
const MAX_QUALITY = 0.98;
/* Target accuracy band: output will be [target*0.97 … target] */
const ACCURACY = 0.97;

/**
 * Compress a single PDF file to a target size.
 *
 * @param {ArrayBuffer} pdfArrayBuffer - The raw PDF bytes.
 * @param {number} targetSizeBytes     - Desired output size in bytes.
 * @param {(progress: number, status: string) => void} onProgress
 * @returns {Promise<Blob>}
 */
async function compressPdf(pdfArrayBuffer, targetSizeBytes, onProgress) {
  /* Pre-flight: make sure CDN libraries loaded */
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js library failed to load. Please check your internet connection and refresh.');
  }
  if (typeof window.jspdf === 'undefined') {
    throw new Error('jsPDF library failed to load. Please check your internet connection and refresh.');
  }

  onProgress(0, 'Loading PDF…');

  /* ---- 1. Load the PDF ---- */
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfArrayBuffer) }).promise;
  const numPages = pdf.numPages;

  /* ---- 2. Pick a generous starting scale ---- */
  const bytesPerPage = targetSizeBytes / numPages;
  let scale = pickStartingScale(bytesPerPage);

  /* ---- 3. Iterative scale + quality search ---- */
  const MAX_SCALE_ATTEMPTS = 5;
  let bestBlob = null;
  let bestSize = 0;
  let bestQuality = 0;

  for (let attempt = 0; attempt < MAX_SCALE_ATTEMPTS; attempt++) {
    /* Render pages at the current scale */
    onProgress(0.05 + attempt * 0.02, `Rendering at ${Math.round(scale * 72)} DPI…`);
    const pages = await renderAllPages(pdf, scale, (done) => {
      const pct = 0.05 + attempt * 0.02 + (done / numPages) * 0.15;
      onProgress(Math.min(pct, 0.90), `Rendered page ${done}/${numPages}`);
    });

    /* Binary search quality at this scale */
    onProgress(0.25 + attempt * 0.05, 'Optimising quality…');
    const result = binarySearchQuality(pages, targetSizeBytes, (iter, total) => {
      const pct = 0.25 + attempt * 0.05 + (iter / total) * 0.40;
      onProgress(Math.min(pct, 0.92), `Quality pass ${iter}/${total}`);
    });

    /* Evaluate result */
    if (result.success) {
      /* Perfect — within the accuracy band */
      if (result.quality > bestQuality || bestBlob === null) {
        bestBlob = result.blob;
        bestSize = result.size;
        bestQuality = result.quality;
      }

      /* If quality is near MAX and still room, try higher scale for more sharpness */
      if (result.quality >= 0.90 && attempt < MAX_SCALE_ATTEMPTS - 1) {
        scale *= 1.3;
        continue;
      }
      break;
    }

    if (result.blob) {
      /* Not in band but keep as fallback */
      if (bestBlob === null || (result.size <= targetSizeBytes && result.size > bestSize)) {
        bestBlob = result.blob;
        bestSize = result.size;
        bestQuality = result.quality;
      }
    }

    if (result.needsLowerScale) {
      /* Even at MIN_QUALITY the file is too big — reduce DPI */
      scale *= 0.7;
      onProgress(0.5 + attempt * 0.05, `Reducing resolution (attempt ${attempt + 2})…`);
      continue;
    }

    if (result.needsHigherScale) {
      /* At MAX_QUALITY the file is too small — increase DPI for more sharpness */
      scale *= 1.35;
      onProgress(0.5 + attempt * 0.05, `Increasing resolution for sharper output…`);
      continue;
    }

    break; // No adjustment needed or possible
  }

  if (!bestBlob) {
    throw new Error('Could not compress to the requested size. Try a larger target.');
  }

  onProgress(1, 'Done!');
  return bestBlob;
}

/**
 * Pick a generous starting scale. We start HIGH and let the
 * quality/scale loop reduce it only if necessary.
 * This ensures maximum sharpness for the given file budget.
 */
function pickStartingScale(bytesPerPage) {
  if (bytesPerPage > 500_000) return 3.0;
  if (bytesPerPage > 250_000) return 2.8;
  if (bytesPerPage > 120_000) return 2.4;
  if (bytesPerPage > 60_000)  return 2.0;
  if (bytesPerPage > 30_000)  return 1.7;
  if (bytesPerPage > 15_000)  return 1.4;
  if (bytesPerPage > 8_000)   return 1.2;
  return 1.0;
}

/**
 * Render all pages of a PDF to canvas elements.
 */
async function renderAllPages(pdf, scale, onPage) {
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const origViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    pages.push({
      canvas,
      origWidth: origViewport.width,
      origHeight: origViewport.height,
    });
    onPage(i);
  }
  return pages;
}

/**
 * Binary search on JPEG quality within [MIN_QUALITY, MAX_QUALITY].
 *
 * Returns:
 *   { success, blob, size, quality, needsLowerScale, needsHigherScale }
 */
function binarySearchQuality(pages, targetSizeBytes, onIteration) {
  const MAX_ITER = 20;
  const LOWER_BOUND = targetSizeBytes * ACCURACY;

  /* --- Quick boundary checks --- */
  // Check if even at minimum quality the output is too big
  const minBlob = buildPdfBlob(pages, MIN_QUALITY);
  if (minBlob.size > targetSizeBytes) {
    return {
      success: false,
      blob: minBlob,
      size: minBlob.size,
      quality: MIN_QUALITY,
      needsLowerScale: true,
      needsHigherScale: false,
    };
  }

  // Check if at maximum quality the output is still under lower bound
  const maxBlob = buildPdfBlob(pages, MAX_QUALITY);
  if (maxBlob.size <= targetSizeBytes) {
    // Max quality fits — perfect! (best quality possible)
    const inBand = maxBlob.size >= LOWER_BOUND;
    return {
      success: inBand,
      blob: maxBlob,
      size: maxBlob.size,
      quality: MAX_QUALITY,
      needsLowerScale: false,
      needsHigherScale: !inBand, // too small even at max quality
    };
  }

  /* --- Main binary search --- */
  let low = MIN_QUALITY;
  let high = MAX_QUALITY;
  let bestBlob = minBlob;
  let bestSize = minBlob.size;
  let bestQuality = MIN_QUALITY;

  for (let iter = 1; iter <= MAX_ITER; iter++) {
    const quality = (low + high) / 2;
    const blob = buildPdfBlob(pages, quality);
    const size = blob.size;

    onIteration(iter, MAX_ITER);

    if (size <= targetSizeBytes && size > bestSize) {
      bestBlob = blob;
      bestSize = size;
      bestQuality = quality;
    }

    if (size > targetSizeBytes) {
      high = quality;
    } else if (size < LOWER_BOUND) {
      low = quality;
    } else {
      // In the sweet spot
      bestBlob = blob;
      bestSize = size;
      bestQuality = quality;
      break;
    }

    if (high - low < 0.003) break;
  }

  const success = bestSize <= targetSizeBytes && bestSize >= LOWER_BOUND;
  return {
    success,
    blob: bestBlob,
    size: bestSize,
    quality: bestQuality,
    needsLowerScale: false,
    needsHigherScale: false,
  };
}

/**
 * Build a PDF Blob from rendered page canvases at a given JPEG quality.
 */
function buildPdfBlob(pages, quality) {
  const { jsPDF } = window.jspdf;
  const firstPage = pages[0];

  const doc = new jsPDF({
    orientation: firstPage.origWidth > firstPage.origHeight ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [firstPage.origWidth, firstPage.origHeight],
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    const { canvas, origWidth, origHeight } = pages[i];

    if (i > 0) {
      doc.addPage(
        [origWidth, origHeight],
        origWidth > origHeight ? 'landscape' : 'portrait'
      );
    }

    const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
    doc.addImage(jpegDataUrl, 'JPEG', 0, 0, origWidth, origHeight, undefined, 'FAST');
  }

  return doc.output('blob');
}
