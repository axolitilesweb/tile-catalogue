import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const DATA_DIR = path.join(PUB, "data");
const CATALOG = path.join(DATA_DIR, "catalogue.json");

// Ensure base folders and initial catalogue file
await fs.ensureDir(DATA_DIR);
await fs.ensureFile(CATALOG);
if ((await fs.readFile(CATALOG, "utf8")).trim() === "") {
  await fs.writeJson(
    CATALOG,
    { brandLogo: "../AXOLI/DATA/logo.svg", sizeIcon: "../AXOLI/DATA/size.svg", designs: [] },
    { spaces: 2 }
  );
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUB, { extensions: ["html"] }));

app.get(["/", "/index", "/index/"], (req, res) =>
  res.sendFile(path.join(PUB, "index.html"))
);
app.get(["/admin", "/admin/"], (req, res) =>
  res.sendFile(path.join(PUB, "admin.html"))
);

// ---------- helpers ----------
const readJson = (p) => fs.readJson(p).catch(() => ({}));
const writeJson = (p, obj) => fs.writeJson(p, obj, { spaces: 2 });
const ensureDir = fs.ensureDir;

const slug = (s = "") =>
  s.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");

const safeExt = (name, allowed) => {
  const ext = String(path.extname(name)).toLowerCase().replace(".", "");
  return allowed.includes(ext) ? ext : null;
};
const samePath = (a, b) => path.resolve(a) === path.resolve(b);

// --- derive id/label from filename when not provided ---
const baseNameNoExt = (filename="") =>
  path.basename(filename, path.extname(filename));
const labelFromBase = (base="") =>
  base.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
function ensureIdAndLabel(req, file) {
  // only do this once per request
  if (req._didDeriveId) return;
  let id = slug(req.body.id || "");
  let label = req.body.label || "";
  if (!id) {
    const base = baseNameNoExt(file?.originalname || "");
    if (base) {
      id = slug(base);
      if (!label) label = labelFromBase(base);
      req.body.id = id;
      req.body.label = label;
    }
  }
  req._didDeriveId = true;
}

// ---------- multer storage (calls ensureIdAndLabel) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        ensureIdAndLabel(req, file); // <— derive id/label if empty

        const theme = req.body.theme || "default";
        const id = slug(req.body.id || "");
        const baseAX = path.join(PUB, "AXOLI", "DATA");
        const tilesDir = path.join(baseAX, "TILES", id);
        const videoDir = path.join(baseAX, "VIDEO");
        const previewDir = path.join(baseAX, "PREVIEW");
        const assetDir = path.join(baseAX, "ASSETS", id);

        let dest = assetDir;
        if (theme === "default") {
          const f = file.fieldname;
          if (f === "main") dest = tilesDir;
          else if (f.startsWith("variants")) dest = tilesDir;
          else if (f === "video") dest = videoDir;
          else if (f === "preview") dest = previewDir;
        }
        await ensureDir(dest);
        cb(null, dest);
      } catch (e) { cb(e); }
    },
    filename: (req, file, cb) => {
      ensureIdAndLabel(req, file); // <— ensure again
      const theme = req.body.theme || "default";
      const id = slug(req.body.id || "");
      const ext = path.extname(file.originalname).toLowerCase();

      if (theme === "default") {
        if (file.fieldname === "main") return cb(null, `${id}_R1${ext}`);
        if (file.fieldname.startsWith("variants")) return cb(null, `${id}_RVAR${Date.now()}${ext}`);
        if (file.fieldname === "video") return cb(null, `${id}${ext}`);
        if (file.fieldname === "preview") return cb(null, `${id}${ext}`);
        return cb(null, `${file.fieldname}${ext}`);
      }
      return cb(null, `${file.fieldname}_${Date.now()}${ext}`);
    }
  })
});

// ---------- API: get designs (manual position first) ----------
app.get("/api/designs", async (req, res) => {
  try {
    const data = await readJson(CATALOG);
    if (Array.isArray(data.designs)) {
      data.designs.sort((a, b) => {
        const pa = (a.position ?? 1e12);
        const pb = (b.position ?? 1e12);
        return pa !== pb ? pa - pb : (a.createdAt || 0) - (b.createdAt || 0);
      });
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to read catalogue" });
  }
});

// ---------- API: upload (updatedAt every time; createdAt first time) ----------
app.post("/api/upload", upload.any(), async (req, res) => {
  try {
    const id = slug(req.body.id || "");
    if (!id) return res.status(400).json({ error: "Missing id (couldn't derive from filename)" });

    const label = req.body.label || id;
    const finish = req.body.finish || "";
    const faces  = Number.parseInt(req.body.faces || "0", 10) || 0;
    const theme  = req.body.theme || "default";
    const now    = Date.now();

    const baseAX = path.join(PUB, "AXOLI", "DATA");
    const tilesDir   = path.join(baseAX, "TILES", id);
    const videoDir   = path.join(baseAX, "VIDEO");
    const previewDir = path.join(baseAX, "PREVIEW");
    const assetDir   = path.join(baseAX, "ASSETS", id);
    if (theme === "default") {
  // default theme uses TILES / VIDEO / PREVIEW
  await Promise.all([ensureDir(tilesDir), ensureDir(videoDir), ensureDir(previewDir)]);
} else {
  // flexible themes (e.g., 12x18theme) save into ASSETS/<id>
  await ensureDir(assetDir);

  // If you ever special-case 12x18 preview to PREVIEW/, then also:
  // const has12x18Preview = !!(filesByField["files[preview]"] || filesByField["preview"]);
  // if (has12x18Preview) await ensureDir(previewDir);
}


    const data = await readJson(CATALOG);
    data.brandLogo = data.brandLogo || "../AXOLI/DATA/logo.svg";
    data.sizeIcon  = data.sizeIcon  || "../AXOLI/DATA/size.svg";
    data.designs   = Array.isArray(data.designs) ? data.designs : [];

    const filesByField = {};
    (req.files || []).forEach(f => { (filesByField[f.fieldname] ||= []).push(f); });

    if (theme === "default") {
      let mainRel, previewRel, videoRel;
      const variantRels = [];

      const main = (filesByField["main"] || [])[0];
      if (main) {
        const ext = safeExt(main.originalname, ["jpg","jpeg","png","webp"]);
        if (!ext) return res.status(400).json({ error: "Main: invalid image type" });
        mainRel = `../AXOLI/DATA/TILES/${id}/${path.basename(main.path)}`;
      }

      let counter = 2;
      const variants = filesByField["variants[]"] || filesByField["variants"] || [];
      for (const f of variants) {
        const ext = safeExt(f.originalname, ["jpg","jpeg","png","webp"]);
        if (!ext) continue;
        const newName = `${id}_R${counter}.${ext}`;
        const dest = path.join(tilesDir, newName);
        await fs.move(f.path, dest, { overwrite: true });
        variantRels.push(`../AXOLI/DATA/TILES/${id}/${newName}`);
        counter++;
      }

      const vid = (filesByField["video"] || [])[0];
      if (vid) {
        const ext = safeExt(vid.originalname, ["mp4"]);
        if (!ext) return res.status(400).json({ error: "Video: only mp4 allowed" });
        const dest = path.join(videoDir, `${id}.mp4`);
        if (!samePath(vid.path, dest)) await fs.move(vid.path, dest, { overwrite: true });
        videoRel = `../AXOLI/DATA/VIDEO/${id}.mp4`;
      }

      const prev = (filesByField["preview"] || [])[0];
      if (prev) {
        const ext = safeExt(prev.originalname, ["jpg","jpeg","png","webp"]);
        if (!ext) return res.status(400).json({ error: "Preview: invalid image type" });
        const dest = path.join(previewDir, `${id}.${ext}`);
        if (!samePath(prev.path, dest)) await fs.move(prev.path, dest, { overwrite: true });
        previewRel = `../AXOLI/DATA/PREVIEW/${id}.${ext}`;
      }

      const sizeText = req.body?.["data[size_text]"] ?? req.body?.data?.size_text ?? null;

      const idx = data.designs.findIndex((d) => d.id === id);
      const payload = {
        id,
        theme: "default",
        label,
        finish,
        faces,
        updatedAt: now,
        ...(mainRel ? { main: mainRel } : {}),
        ...(variantRels.length ? { variants: variantRels } : {}),
        ...(videoRel ? { video: videoRel } : {}),
        ...(previewRel ? { preview: previewRel } : {}),
        ...(sizeText !== null ? { sizeText } : {}),
        ...(idx < 0 ? { createdAt: now } : {}),
      };

      if (idx >= 0) data.designs[idx] = { ...data.designs[idx], ...payload };
      else data.designs.push(payload);

      await writeJson(CATALOG, data);
      return res.json(data);
    }

    // flexible themes
    const themeData = {};
    Object.keys(req.body).forEach(k => {
      const m = k.match(/^data\[(.+)\]$/);
      if (m) themeData[m[1]] = req.body[k];
    });
    if (req.body.data && typeof req.body.data === "object") Object.assign(themeData, req.body.data);

    for (const [field, arr] of Object.entries(filesByField)) {
  if (["main","variants","variants[]","video","preview"].includes(field)) continue;
  if (!arr || !arr.length) continue;

  // Clean up the field name: remove 'files[', trailing ']', and trailing '[]'
  const cleanFieldName = field
    .replace(/^files\[/, '')   // remove leading files[
    .replace(/\]\[\]$/, '')    // remove ending ][]
    .replace(/\]$/, '');       // remove ending ]

  if (arr.length === 1) {
    const f = arr[0];
    themeData[cleanFieldName] = `../AXOLI/DATA/ASSETS/${id}/${path.basename(f.path)}`;
  } else {
    themeData[cleanFieldName] = arr.map(f => `../AXOLI/DATA/ASSETS/${id}/${path.basename(f.path)}`);
  }
}


    const idx = data.designs.findIndex((d) => d.id === id);
    const payload = {
      id,
      theme,
      label,
      finish,
      faces,
      updatedAt: now,
      themeData: { ...(idx >= 0 ? data.designs[idx].themeData : {}), ...themeData },
      ...(idx < 0 ? { createdAt: now } : {}),
    };

    if (idx >= 0) data.designs[idx] = { ...data.designs[idx], ...payload };
    else data.designs.push(payload);

    await writeJson(CATALOG, data);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Upload failed" });
  }
});





// ---------- API: save manual order ----------
app.put("/api/designs/order", async (req, res) => {
  try {
    const { theme, order } = req.body; // array of IDs
    if (!Array.isArray(order) || !order.length) {
      return res.status(400).json({ error: "Provide 'order' as a non-empty array of IDs." });
    }
    const data = await readJson(CATALOG);
    const designs = Array.isArray(data.designs) ? data.designs : [];
    const byId = new Map(designs.map(d => [d.id, d]));

    const current = designs.slice().sort((a, b) => {
      const pa = (a.position ?? 1e12), pb = (b.position ?? 1e12);
      return pa !== pb ? pa - pb : (a.createdAt || 0) - (b.createdAt || 0);
    });

    let newIds = [];
    if (theme && theme !== "all") {
      const set = new Set(order);
      const it = order[Symbol.iterator]();
      newIds = current.map(d => (set.has(d.id) ? it.next().value : d.id));
    } else {
      const allIds = new Set(current.map(d => d.id));
      if (order.length !== allIds.size || order.some(id => !allIds.has(id))) {
        return res.status(400).json({ error: "Global reorder must include all existing design IDs." });
      }
      newIds = order.slice();
    }

    newIds.forEach((id, i) => {
      const d = byId.get(id);
      if (d) d.position = i + 1;
    });

    data.designs = newIds.map(id => byId.get(id));
    await writeJson(CATALOG, data);
    res.json({ designs: data.designs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save order" });
  }
});

// ---------- API: delete a design + files ----------
app.delete("/api/designs/:id", async (req, res) => {
  try {
    const id = slug(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });

    const data = await readJson(CATALOG);
    const designs = Array.isArray(data.designs) ? data.designs : [];
    const exists = designs.some(d => d.id === id);
    data.designs = designs.filter(d => d.id !== id);
    await writeJson(CATALOG, data);

    const baseAX = path.join(PUB, "AXOLI", "DATA");
    const tilesDir   = path.join(baseAX, "TILES", id);
    const assetDir   = path.join(baseAX, "ASSETS", id);
    const previewDir = path.join(baseAX, "PREVIEW");
    const videoDir   = path.join(baseAX, "VIDEO");
    await fs.remove(tilesDir).catch(() => {});
    await fs.remove(assetDir).catch(() => {});

    const upper = id.toUpperCase();
    const safeStarts = (name) => name.toUpperCase().startsWith(upper + ".");
    try {
      const prevFiles = await fs.readdir(previewDir);
      await Promise.all(prevFiles.filter(safeStarts).map(n => fs.remove(path.join(previewDir, n))));
    } catch {}
    try {
      const vidFiles = await fs.readdir(videoDir);
      await Promise.all(vidFiles.filter(safeStarts).map(n => fs.remove(path.join(videoDir, n))));
    } catch {}

    return res.json({ designs: data.designs, removed: exists });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete design" });
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // add this
app.listen(PORT, HOST, () => {
  console.log(`Tile Catalogue running at http://${HOST}:${PORT}`);
});




