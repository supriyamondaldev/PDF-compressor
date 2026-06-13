# 🗜️ PDF Compressor

A **free, privacy-first PDF compressor** that runs entirely in your browser. No files are uploaded to any server — all processing happens locally on your device.

## ✨ Features

- **Target any size** — set a desired KB output and the engine hits it within 97–100% accuracy
- **Batch processing** — compress up to 10 PDFs at once
- **Rename before download** — edit file names inline in the output list
- **Download individually or as ZIP** — single-click downloads
- **Drag & drop** — drop files directly or click to browse
- **Zero data collection** — no analytics, no cookies, no server calls after page load
- **Works offline** — once loaded, the page works without internet

## 🛠️ Tech Stack

| Library | Purpose | License |
|---------|---------|---------|
| [pdf.js](https://mozilla.github.io/pdf.js/) v3 | Parse & render PDF pages | Apache 2.0 |
| [jsPDF](https://github.com/parallax/jsPDF) v2 | Generate compressed PDFs | MIT |
| [JSZip](https://stuk.github.io/jszip/) v3 | Create ZIP for batch download | MIT |

All libraries are loaded from **cdnjs** (free CDN). No npm, no build step.

## 📁 Project Structure

```
pdf-compressor/
├── index.html              # App shell
├── css/
│   └── style.css           # Design system & responsive layout
├── js/
│   ├── utils.js            # Helpers (validation, formatting, toasts)
│   ├── compressor.js       # PDF compression engine (binary search)
│   └── app.js              # UI orchestration & event handling
├── assets/
│   └── favicon.svg         # App icon
└── README.md               # This file
```

## 🚀 Free Hosting — Step by Step

### Option 1: GitHub Pages (Recommended)

1. **Create a GitHub account** (free) at [github.com](https://github.com)

2. **Create a new repository**
   - Click **"+"** → **"New repository"**
   - Name it `pdf-compressor` (or anything you like)
   - Set it to **Public**
   - Click **"Create repository"**

3. **Upload your files**
   - On the repo page, click **"uploading an existing file"**
   - Drag-and-drop ALL project files (index.html, css/, js/, assets/)
   - Click **"Commit changes"**

   OR use Git CLI:
   ```bash
   cd "d:\Assignments\pdf compressor"
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/pdf-compressor.git
   git push -u origin main
   ```

4. **Enable GitHub Pages**
   - Go to **Settings** → **Pages** (left sidebar)
   - Under **"Source"**, select **"Deploy from a branch"**
   - Branch: **main**, folder: **/ (root)**
   - Click **Save**

5. **Your site is live!** 🎉
   - URL: `https://YOUR_USERNAME.github.io/pdf-compressor/`
   - Takes 1-2 minutes for the first deploy

---

### Option 2: Cloudflare Pages

1. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com) (free)
2. Connect your GitHub repository
3. Set build command to **empty** (no build needed)
4. Set output directory to **`.`** (root)
5. Deploy — you get a `*.pages.dev` URL + free SSL

---

### Option 3: Netlify

1. Go to [netlify.com](https://www.netlify.com) and sign up (free)
2. Click **"Add new site"** → **"Deploy manually"**
3. Drag-and-drop your project folder
4. Done — you get a `*.netlify.app` URL + free SSL

---

### Option 4: Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (free)
2. Import your GitHub repository
3. Framework preset: **Other**
4. Deploy — you get a `*.vercel.app` URL + free SSL

## ⚙️ How the Compression Works

1. **pdf.js** parses the uploaded PDF and renders each page to an off-screen HTML canvas
2. The canvas is converted to a JPEG image at a variable quality level
3. A **binary search algorithm** iterates on the JPEG quality (0.01–0.99) to find the highest quality that keeps the total file under the target size
4. **jsPDF** assembles the compressed JPEG images into a new PDF with the original page dimensions
5. The result is a PDF that's ≤ your target size but ≥ 97% of it (e.g., 146–150 KB for a 150 KB target)

## 📜 License

This project is **open-source** and free to use. Built by a non-profit tech team.
