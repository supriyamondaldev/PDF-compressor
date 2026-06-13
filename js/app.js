/* ============================================
   PDF Compressor — Application Controller
   ============================================ */

(function () {
  'use strict';

  /* ---- State ---- */
  const state = {
    /** @type {Map<string, {id: string, file: File, name: string, size: number}>} */
    uploadedFiles: new Map(),
    /** @type {Map<string, {id: string, blob: Blob, name: string, originalName: string, size: number, originalSize: number}>} */
    compressedFiles: new Map(),
    isCompressing: false,
  };

  /* ---- DOM Refs ---- */
  const $uploadZone     = document.getElementById('uploadZone');
  const $fileInput      = document.getElementById('fileInput');
  const $fileList       = document.getElementById('fileList');
  const $fileListEmpty  = document.getElementById('fileListEmpty');
  const $fileCount      = document.getElementById('fileCount');
  const $targetSize     = document.getElementById('targetSize');
  const $compressBtn    = document.getElementById('compressBtn');
  const $compressBtnTxt = document.getElementById('compressBtnText');
  const $compressBtnSp  = document.getElementById('compressBtnSpinner');
  const $progressSection = document.getElementById('progressSection');
  const $progressFill   = document.getElementById('progressFill');
  const $progressPercent = document.getElementById('progressPercent');
  const $progressStatus = document.getElementById('progressStatus');
  const $outputSection  = document.getElementById('outputSection');
  const $outputList     = document.getElementById('outputList');
  const $downloadAllBtn = document.getElementById('downloadAllBtn');
  const $uploadCard     = document.getElementById('uploadCard');

  /* ---- Init ---- */
  init();

  function init() {
    bindUploadEvents();
    bindControlEvents();
    updateUI();
  }

  /* ==============================
     Upload Events
     ============================== */
  function bindUploadEvents() {
    /* Click to browse (zone background) */
    $uploadZone.addEventListener('click', (e) => {
      if (!state.isCompressing && e.target === $uploadZone || e.target.closest('.upload-icon, .upload-text, .upload-subtext')) {
        $fileInput.click();
      }
    });

    /* Browse button */
    const $browseBtn = document.getElementById('browseBtn');
    $browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.isCompressing) $fileInput.click();
    });

    /* File input change */
    $fileInput.addEventListener('change', (e) => {
      addFiles(e.target.files);
      $fileInput.value = ''; // reset so same file can be re-selected
    });

    /* Drag & Drop */
    $uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      $uploadZone.classList.add('drag-over');
    });

    $uploadZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      $uploadZone.classList.remove('drag-over');
    });

    $uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      $uploadZone.classList.remove('drag-over');
      if (!state.isCompressing) addFiles(e.dataTransfer.files);
    });
  }

  /* ==============================
     Control Events
     ============================== */
  function bindControlEvents() {
    /* Compress button */
    $compressBtn.addEventListener('click', startCompression);

    /* Download All */
    $downloadAllBtn.addEventListener('click', downloadAllAsZip);

    /* Target size — enforce numeric + range */
    $targetSize.addEventListener('input', () => {
      const val = parseInt($targetSize.value, 10);
      if (val < 0) $targetSize.value = '';
    });
  }

  /* ==============================
     File Management
     ============================== */
  function addFiles(fileList) {
    const { valid, errors } = validateFiles(fileList, state.uploadedFiles.size);

    errors.forEach(err => showToast(err, 'error'));

    valid.forEach(file => {
      const id = generateId();
      state.uploadedFiles.set(id, {
        id,
        file,
        name: file.name,
        size: file.size,
      });
    });

    if (valid.length > 0) {
      // Clear any previous compression results
      state.compressedFiles.clear();
      $outputSection.classList.add('section-hidden');
      $outputList.innerHTML = '';
    }

    updateUI();
  }

  function removeFile(id) {
    state.uploadedFiles.delete(id);
    state.compressedFiles.clear();
    $outputSection.classList.add('section-hidden');
    $outputList.innerHTML = '';
    updateUI();
  }

  /* ==============================
     UI Rendering
     ============================== */
  function updateUI() {
    renderFileList();
    updateCompressButton();
  }

  function renderFileList() {
    $fileList.innerHTML = '';
    const count = state.uploadedFiles.size;
    $fileCount.textContent = count > 0 ? ` (${count})` : '';

    if (count === 0) {
      $fileListEmpty.classList.remove('section-hidden');
      return;
    }
    $fileListEmpty.classList.add('section-hidden');

    state.uploadedFiles.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.dataset.id = entry.id;
      item.innerHTML = `
        <div class="file-item-icon">📄</div>
        <div class="file-item-info">
          <span class="file-item-name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span>
          <span class="file-item-size">${formatFileSize(entry.size)}</span>
        </div>
        <button class="file-item-remove" title="Remove file" aria-label="Remove ${escapeHtml(entry.name)}">✕</button>
      `;
      item.querySelector('.file-item-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(entry.id);
      });
      $fileList.appendChild(item);
    });
  }

  function updateCompressButton() {
    const hasFiles = state.uploadedFiles.size > 0;
    $compressBtn.disabled = !hasFiles || state.isCompressing;
  }

  /* ==============================
     Compression
     ============================== */
  async function startCompression() {
    /* Validate target size */
    const targetKB = parseInt($targetSize.value, 10);
    if (!targetKB || targetKB < 10) {
      showToast('Please set a target size of at least 10 KB.', 'error');
      $targetSize.focus();
      return;
    }
    if (targetKB > 102400) {
      showToast('Target size cannot exceed 100 MB.', 'error');
      $targetSize.focus();
      return;
    }

    const targetBytes = targetKB * 1024;
    const files = Array.from(state.uploadedFiles.values());

    /* Enter compressing state */
    state.isCompressing = true;
    state.compressedFiles.clear();
    $outputSection.classList.add('section-hidden');
    $outputList.innerHTML = '';
    $uploadCard.classList.add('compressing');
    $compressBtnTxt.textContent = 'Compressing…';
    $compressBtnSp.classList.remove('section-hidden');
    $compressBtn.disabled = true;
    $progressSection.classList.remove('section-hidden');
    setProgress(0, 'Starting…');

    let completedCount = 0;
    let hadErrors = false;

    for (const entry of files) {
      const fileLabel = `"${entry.name}"`;
      try {
        /* Check if already smaller than target */
        if (entry.size <= targetBytes) {
          showToast(`${fileLabel} is already ${formatFileSize(entry.size)} — added without compression.`, 'info');
          const blob = new Blob([await entry.file.arrayBuffer()], { type: 'application/pdf' });
          state.compressedFiles.set(entry.id, {
            id: entry.id,
            blob,
            name: getBaseName(entry.name),
            originalName: entry.name,
            size: blob.size,
            originalSize: entry.size,
          });
          completedCount++;
          setProgress(completedCount / files.length, `Processed ${completedCount}/${files.length} files`);
          continue;
        }

        /* Read file */
        const arrayBuffer = await entry.file.arrayBuffer();

        /* Compress */
        const blob = await compressPdf(arrayBuffer, targetBytes, (progress, status) => {
          const overall = (completedCount + progress) / files.length;
          setProgress(overall, `${fileLabel}: ${status}`);
        });

        state.compressedFiles.set(entry.id, {
          id: entry.id,
          blob,
          name: getBaseName(entry.name),
          originalName: entry.name,
          size: blob.size,
          originalSize: entry.size,
        });

        completedCount++;
        setProgress(completedCount / files.length, `Processed ${completedCount}/${files.length} files`);

      } catch (err) {
        console.error(`Error compressing ${entry.name}:`, err);
        const reason = err.message || 'It may be password-protected or corrupt.';
        showToast(`Failed to compress ${fileLabel}: ${reason}`, 'error', 6000);
        hadErrors = true;
        completedCount++;
      }
    }

    /* Exit compressing state */
    state.isCompressing = false;
    $uploadCard.classList.remove('compressing');
    $compressBtnTxt.textContent = 'Compress';
    $compressBtnSp.classList.add('section-hidden');
    $compressBtn.disabled = false;
    updateCompressButton();

    /* Delay briefly before showing results */
    setProgress(1, 'Done!');
    await delay(400);
    $progressSection.classList.add('section-hidden');

    /* Show output */
    if (state.compressedFiles.size > 0) {
      renderOutputList();
      $outputSection.classList.remove('section-hidden');
      showToast(
        `${state.compressedFiles.size} file${state.compressedFiles.size > 1 ? 's' : ''} compressed successfully!`,
        'success'
      );
    }
    if (hadErrors) {
      showToast('Some files could not be compressed.', 'error');
    }
  }

  function setProgress(fraction, status) {
    const pct = Math.min(100, Math.round(fraction * 100));
    $progressFill.style.width = pct + '%';
    $progressPercent.textContent = pct + '%';
    $progressStatus.textContent = status || '';
  }

  /* ==============================
     Output Rendering
     ============================== */
  function renderOutputList() {
    $outputList.innerHTML = '';

    state.compressedFiles.forEach((entry) => {
      const ratio = ((1 - entry.size / entry.originalSize) * 100).toFixed(0);
      const item = document.createElement('div');
      item.className = 'output-item';
      item.dataset.id = entry.id;
      item.innerHTML = `
        <div class="output-item-icon">✅</div>
        <div class="output-item-info">
          <input
            type="text"
            class="output-item-name"
            value="${escapeHtml(entry.name)}"
            title="Click to rename"
            aria-label="File name"
            spellcheck="false"
          />
          <span class="output-item-ext">.pdf</span>
          <span class="output-item-size">${formatFileSize(entry.size)}</span>
          <div class="output-item-original">
            was ${formatFileSize(entry.originalSize)} · ${ratio}% smaller
          </div>
        </div>
        <button class="btn-download-single" title="Download" aria-label="Download ${escapeHtml(entry.name)}.pdf">⬇</button>
      `;

      /* Rename handler */
      const nameInput = item.querySelector('.output-item-name');
      nameInput.addEventListener('change', () => {
        const newName = nameInput.value.trim();
        if (newName) {
          entry.name = newName;
        } else {
          nameInput.value = entry.name; // revert if blank
        }
      });

      /* Download handler */
      item.querySelector('.btn-download-single').addEventListener('click', () => {
        downloadBlob(entry.blob, entry.name + '.pdf');
      });

      $outputList.appendChild(item);
    });

    /* Show/hide Download All button */
    $downloadAllBtn.classList.toggle('section-hidden', state.compressedFiles.size < 2);
  }

  /* ==============================
     Download All as ZIP
     ============================== */
  async function downloadAllAsZip() {
    if (state.compressedFiles.size === 0) return;

    $downloadAllBtn.disabled = true;
    $downloadAllBtn.textContent = '⏳ Creating ZIP…';

    try {
      const zip = new JSZip();
      state.compressedFiles.forEach((entry) => {
        zip.file(entry.name + '.pdf', entry.blob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, 'compressed_pdfs.zip');
      showToast('ZIP downloaded!', 'success');
    } catch (err) {
      console.error('ZIP error:', err);
      showToast('Failed to create ZIP file.', 'error');
    }

    $downloadAllBtn.disabled = false;
    $downloadAllBtn.textContent = '📦 Download All as ZIP';
  }

  /* ==============================
     Helpers
     ============================== */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
