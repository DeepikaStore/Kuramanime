import express from "express";
import cors from "cors";
import { load } from "cheerio";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.KURAMA_BASE_URL || "https://v20.kuramanime.ing").replace(/\/+$/, "");
const TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 15000);

app.use(cors());
app.use(express.json());

const http = axios.create({
  timeout: TIMEOUT,
  headers: {
    "User-Agent": process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"
  },
  maxRedirects: 5
});

function absolute(url) {
  if (!url) return null;
  try { return new URL(url, BASE_URL).href; } catch { return null; }
}
function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

async function getPage(path = "/") {
  const url = absolute(path);
  if (!url || !url.startsWith(BASE_URL)) throw new Error("URL tujuan tidak valid");
  const response = await http.get(url);
  return { html: response.data, url: response.request?.res?.responseUrl || url };
}

function extractCards($, base) {
  const found = [];
  const seen = new Set();
  const selectors = [
    ". anime-card", ".anime-card", ".product-item", ".list-episode-item",
    ".col-lg-2", ".col-md-3", ".col-6", ".card", "article"
  ];
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const node = $(el);
      const a = node.find("a[href]").first();
      const href = a.attr("href");
      const title = clean(node.find(".anime-title, .title, h3, h4, h5, .card-title").first().text() || a.attr("title") || a.text());
      const image = node.find("img").first();
      const imageUrl = image.attr("data-src") || image.attr("data-lazy-src") || image.attr("src");
      if (!href || !title) return;
      const link = absolute(href);
      if (!link || seen.has(link)) return;
      seen.add(link);
      found.push({ title, url: link, image: absolute(imageUrl), description: clean(node.find(".description, .synopsis").first().text()) || null });
    });
    if (found.length >= 5) break;
  }
  return found;
}

async function scrapeListing(path) {
  const { html, url } = await getPage(path);
  const $ = load(html);
  const items = extractCards($, url);
  const pagination = $("a[rel='next'], .pagination a").map((_, a) => ({
    label: clean($(a).text()), url: absolute($(a).attr("href"))
  })).get().filter(x => x.url);
  return { source: url, count: items.length, items, pagination };
}

app.get("/", (_req, res) => res.json({
  name: "Kuramanime Unofficial API",
  status: "online",
  source: BASE_URL,
  disclaimer: "Unofficial HTML parser. Source selectors and availability may change.",
  endpoints: ["/health", "/api/home", "/api/latest", "/api/search?q=naruto", "/api/anime?url=...", "/api/episode?url=..."]
}));
app.get("/health", (_req, res) => res.json({ ok: true, source: BASE_URL, time: new Date().toISOString() }));

app.get("/api/home", async (_req, res) => {
  try { res.json(await scrapeListing("/")); }
  catch (e) { res.status(502).json({ error: "Gagal mengambil halaman utama", detail: e.message }); }
});
app.get("/api/latest", async (req, res) => {
  try {
    const path = req.query.page ? `/page/${encodeURIComponent(req.query.page)}` : "/";
    res.json(await scrapeListing(path));
  } catch (e) { res.status(502).json({ error: "Gagal mengambil daftar terbaru", detail: e.message }); }
});
app.get("/api/search", async (req, res) => {
  const q = clean(req.query.q);
  if (!q) return res.status(400).json({ error: "Parameter q wajib diisi" });
  try {
    const path = `/search?search=${encodeURIComponent(q)}`;
    const data = await scrapeListing(path);
    res.json({ query: q, ...data });
  } catch (e) { res.status(502).json({ error: "Pencarian gagal", detail: e.message, hint: "Format URL pencarian situs mungkin berbeda; sesuaikan SEARCH_PATH di server.js." }); }
});

async function scrapeDetail(target, kind) {
  const url = absolute(target);
  if (!url || !url.startsWith(BASE_URL)) throw new Error("URL harus berasal dari domain sumber yang dikonfigurasi");
  const { html } = await getPage(url);
  const $ = load(html);
  const title = clean($("h1").first().text() || $("title").text());
  const description = clean($(".synopsis, .description, .anime-synopsis, [itemprop='description']").first().text());
  const image = $("meta[property='og:image']").attr("content") || $("img").first().attr("src");
  const links = $("a[href]").map((_, a) => {
    const label = clean($(a).text());
    const href = absolute($(a).attr("href"));
    return { title: label, url: href };
  }).get().filter(x => x.title && x.url && x.url.startsWith(BASE_URL));
  const episodes = links.filter(x => /episode|eps|batch/i.test(x.url + " " + x.title));
  const videoSources = $("video source, source[src], iframe[src]").map((_, el) => ({
    type: el.tagName.toLowerCase(), url: absolute($(el).attr("src"))
  })).get().filter(x => x.url);
  return { type: kind, url, title, description: description || null, image: absolute(image), episodes, links, videoSources };
}
app.get("/api/anime", async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: "Parameter url wajib diisi" });
  try { res.json(await scrapeDetail(req.query.url, "anime")); }
  catch (e) { res.status(502).json({ error: "Gagal mengambil detail anime", detail: e.message }); }
});
app.get("/api/episode", async (req, res) => {
  if (!req.query.url) return res.status(400).json({ error: "Parameter url wajib diisi" });
  try { res.json(await scrapeDetail(req.query.url, "episode")); }
  catch (e) { res.status(502).json({ error: "Gagal mengambil detail episode", detail: e.message }); }
});

app.use((err, _req, res, _next) => res.status(500).json({ error: "Internal server error", detail: err.message }));
export default app;
