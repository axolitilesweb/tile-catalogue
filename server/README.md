# Tile Catalogue (Node.js + React + JSON + Tailwind)

## Run
1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000/admin.html` to upload designs

## Folders
- `public/index.html` — public catalogue (supports `?design=ID` & `?page=N`)
- `public/admin.html` — theme-aware admin uploader
- `public/style.css` — your theme CSS (copied from your upload if present)
- `public/data/catalogue.json` — data store
- `public/AXOLI/DATA/...` — assets go here

## Themes
- `default` — main + variants + video + single preview
- `neo` — dual mains, swatches, optional badge, multiple previews

Add more themes in `public/admin.html` (themeConfigs) and renderers in `public/index.html`.
