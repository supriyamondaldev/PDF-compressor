/* ============================================
   PDF Compressor — Utility Functions
   ============================================ */

/**
 * Format bytes into a human-readable string.
 * @param {number} bytes
 * @param {number} decimals
 * @returns {string}
 */
function formatFileSize(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return value.toFixed(decimals) + ' ' + sizes[i];
}

/**
 * Generate a short unique ID.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Validate a list of File objects.
 * @param {FileList|File[]} files
 * @param {number} currentCount - how many files are already uploaded
 * @returns {{ valid: File[], errors: string[] }}
 */
function validateFiles(files, currentCount = 0) {
  const MAX_FILES = 10;
  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB per file
  const ALLOWED_TYPE = 'application/pdf';

  const valid = [];
  const errors = [];

  const remaining = MAX_FILES - currentCount;
  if (remaining <= 0) {
    errors.push('Maximum 10 files allowed. Remove some files first.');
    return { valid, errors };
  }

  const filesToProcess = Array.from(files).slice(0, remaining);
  if (files.length > remaining) {
    errors.push(`Only ${remaining} more file(s) can be added. Extra files were skipped.`);
  }

  for (const file of filesToProcess) {
    if (file.type !== ALLOWED_TYPE && !file.name.toLowerCase().endsWith('.pdf')) {
      errors.push(`"${file.name}" is not a PDF file.`);
      continue;
    }
    if (file.size > MAX_SIZE) {
      errors.push(`"${file.name}" exceeds the 50 MB limit.`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`"${file.name}" is empty.`);
      continue;
    }
    valid.push(file);
  }

  return { valid, errors };
}

/**
 * Extract the file name without extension.
 * @param {string} filename
 * @returns {string}
 */
function getBaseName(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

/**
 * Trigger a download of a Blob.
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'error'|'success'|'info'} type
 * @param {number} duration - ms
 */
function showToast(message, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/**
 * Delay helper (for sequencing animations).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
