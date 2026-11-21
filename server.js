import express from "express";
import cors from "cors";
import axios from "axios";
import { load } from "cheerio";

const app = express();
const BASE = new URL(process.env.KURAMA_BASE_URL || "https://v20.kuramanime.ing");
const TIMEOUT = Math.max(3000, Number(process.env.REQUEST_TIMEOUT || 20000));
const UA = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const SEARCH_TEMPLATE = process.env.SEARCH_PATH_TEMPLATE || "";
const http = axios.create({
  timeout: TIMEOUT, maxRedirects: 5, responseType: "text",
  headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7" },
  validateStatus: s => s >= 200 && s < 400
});
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

const clean = v => String(v || "").replace(/\s+/g, " ").trim();
function sameOrigin(raw) {
  try { const u = new URL(raw, BASE); return u.origin === BASE.origin ? u.href : null; }
  catch { return null; }
}
function pageUrl(path) {
  const u = sameOrigin(path);
  if (!u) throw new Error("URL sumber tidak valid atau berbeda domain");
  return u;
}
async function fetchPage(path="/") {
  const url = pageUrl(path);
  const r = await http.get(url);
  const finalUrl = sameOrigin(r.request?.res?.responseUrl || r.config?.url || url) || url;
  return { html: String(r.data), url: finalUrl, status: r.status, contentType: r.headers["content-type"] || null };
}
function abs(path, base) {
  if (!path) return null;
  try { return new URL(path, base).href; } catch { return null; }
}
function getText($, selectors) {
  for (const s of selectors) { const v=clean($(s).first().text()); if(v) return v; }
  return "";
}
function cardCandidates($, base) {
  const out=[], seen=new Set();
  $("a[href]").each((_,a)=>{
    const href=$(a).attr("href");
    const url=abs(href,base);
    if(!url || !url.startsWith(BASE.origin) || seen.has(url)) return;
    const node=$(a);
    const img=node.find("img").first();
    const parent=node.closest("article, .item, .card, [class*='anime'], [class*='product'], .col");
    const title=clean(node.attr("title") || img.attr("alt") || node.find("h2,h3,h4,h5,.title").first().text() || node.text());
    const image=img.attr("data-src") || img.attr("data-lazy-src") || img.attr("data-original") || img.attr("src");
    const context=clean(parent.text());
    if(!title || (!image && title.length<3)) return;
    if(/login|register|javascript:void/i.test(url)) return;
    seen.add(url);
    out.push({title,url,image:abs(image,base),description:context && context!==title ? context.slice(0,500) : null});
  });
  return out;
}
function extractPage($, base) {
  const items=cardCandidates($,base);
  const pagination=$("a[href]").map((_,a)=>({label:clean($(a).text()),url:abs($(a).attr("href"),base)})).get()
    .filter(x=>x.url && x.url.startsWith(BASE.origin) && (/page|next|older|›|»/i.test(x.label+" "+x.url)))
    .filter((x,i,arr)=>arr.findIndex(y=>y.url===x.url)===i).slice(0,30);
  return {items,count:items.length,pagination};
}
function pageError(res, label, e) {
  const status=e.response?.status;
  res.status(502).json({ok:false,error:label,detail:e.message,upstreamStatus:status||null,source:BASE.origin,
    hint:"Periksa /api/diagnostics/source. Jika halaman membutuhkan JavaScript atau memblokir server, parser HTML biasa tidak dapat mengambil datanya."});
}
app.get("/",(_q,res)=>res.json({
  name:"Kuramanime Unofficial API",version:"2.0.0",status:"online",source:BASE.origin,
  endpoints:["/health","/api/diagnostics/source","/api/home","/api/latest?page=2","/api/catalog","/api/search?q=naruto","/api/genres","/api/schedule","/api/anime?url=...","/api/episode?url=..."]
}));
app.get("/health",(_q,res)=>res.json({ok:true,version:"2.0.0",source:BASE.origin,time:new Date().toISOString()}));

app.get("/api/diagnostics/source",async(_q,res)=>{
  try {
    const p=await fetchPage("/");
    const $=load(p.html);
    const cards=cardCandidates($,p.url);
    const links=$("a[href]").map((_,a)=>({text:clean($(a).text()).slice(0,100),url:abs($(a).attr("href"),p.url)})).get()
      .filter(x=>x.url && x.url.startsWith(BASE.origin)).slice(0,100);
    const scripts=$("script[src]").map((_,s)=>abs($(s).attr("src"),p.url)).get().filter(Boolean).slice(0,30);
    res.json({ok:true,source:p.url,httpStatus:p.status,contentType:p.contentType,htmlLength:p.html.length,
      title:clean($("title").text()),h1:getText($,["h1"]),imageCount:$("img").length,anchorCount:$("a[href]").length,
      detectedCardCount:cards.length,sampleCards:cards.slice(0,10),sampleLinks:links,scripts});
  } catch(e) { pageError(res,"Gagal mendiagnosis website sumber",e); }
});
async function listing(res,path,label) {
  try { const p=await fetchPage(path); const $=load(p.html); res.json({ok:true,source:p.url,...extractPage($,p.url)}); }
  catch(e) { pageError(res,label,e); }
}
app.get("/api/home",(_q,res)=>listing(res,"/","Gagal mengambil homepage"));
app.get("/api/latest",(req,res)=>{
  const page=Math.max(1,Math.min(100,Number(req.query.page)||1));
  const path=page===1?"/":`/page/${page}`;
  listing(res,path,"Gagal mengambil anime terbaru");
});
app.get("/api/catalog",(req,res)=>{
  const page=Math.max(1,Math.min(100,Number(req.query.page)||1));
  const path=req.query.path ? String(req.query.path) : (page===1?"/":`/page/${page}`);
  listing(res,path,"Gagal mengambil katalog");
});
app.get("/api/search",async(req,res)=>{
  const q=clean(req.query.q);
  if(!q) return res.status(400).json({ok:false,error:"Parameter q wajib diisi"});
  if(!SEARCH_TEMPLATE) return res.status(501).json({ok:false,error:"Pola pencarian sumber belum dikonfigurasi",
    query:q,instruction:"Jalankan /api/diagnostics/source, periksa tautan/form pencarian, lalu isi SEARCH_PATH_TEMPLATE di Vercel. Gunakan {query} sebagai placeholder."});
  const path=SEARCH_TEMPLATE.replaceAll("{query}",encodeURIComponent(q));
  try { const p=await fetchPage(path); const $=load(p.html); res.json({ok:true,query,source:p.url,...extractPage($,p.url)}); }
  catch(e) { pageError(res,"Pencarian gagal",e); }
});
app.get("/api/genres",async(_q,res)=>{
  try {
    const p=await fetchPage("/"); const $=load(p.html);
    const values=$("a[href]").map((_,a)=>({name:clean($(a).text()),url:abs($(a).attr("href"),p.url)})).get()
      .filter(x=>x.name && x.url && x.url.startsWith(BASE.origin) && /genre|jenis|kategori/i.test(x.url+" "+x.name))
      .filter((x,i,arr)=>arr.findIndex(y=>y.url===x.url)===i);
    res.json({ok:true,source:p.url,count:values.length,genres:values});
  } catch(e) { pageError(res,"Gagal mengambil genre",e); }
});
app.get("/api/schedule",async(_q,res)=>{
  try {
    const p=await fetchPage("/"); const $=load(p.html);
    const entries=$("a[href]").map((_,a)=>({title:clean($(a).text()),url:abs($(a).attr("href"),p.url),context:clean($(a).closest("li,article,.item,.card").text())})).get()
      .filter(x=>x.title && x.url && x.url.startsWith(BASE.origin) && /senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|schedule|jadwal/i.test(x.title+" "+x.context+" "+x.url));
    res.json({ok:true,source:p.url,count:entries.length,schedule:entries});
  } catch(e) { pageError(res,"Gagal mengambil jadwal",e); }
});
async function detail(target,kind) {
  const url=sameOrigin(target);
  if(!url) throw new Error("Parameter url wajib berasal dari domain sumber "+BASE.origin);
  const p=await fetchPage(url); const $=load(p.html);
  const title=clean($("meta[property='og:title']").attr("content") || $("h1").first().text() || $("title").text());
  const description=clean($("meta[property='og:description']").attr("content") || getText($,[".synopsis",".description",".anime-synopsis","[itemprop='description']"]));
  const image=$("meta[property='og:image']").attr("content") || $("img").first().attr("src");
  const links=$("a[href]").map((_,a)=>({title:clean($(a).text() || $(a).attr("title")),url:abs($(a).attr("href"),p.url)})).get()
    .filter(x=>x.title && x.url && x.url.startsWith(BASE.origin))
    .filter((x,i,arr)=>arr.findIndex(y=>y.url===x.url)===i);
  const episodes=links.filter(x=>/episode|eps|batch|e\\d+/i.test(x.title+" "+x.url));
  const embeds=[];
  $("iframe[src],video[src],video source[src],source[src]").each((_,el)=>{
    const raw=$(el).attr("src"); if(raw) embeds.push({type:el.tagName.toLowerCase(),url:abs(raw,p.url)});
  });
  $("a[href]").each((_,el)=>{
    const raw=$(el).attr("href"); const label=clean($(el).text());
    if(raw && /stream|player|embed|video/i.test(raw+" "+label)) embeds.push({type:"link",url:abs(raw,p.url)});
  });
  return {ok:true,type:kind,url:p.url,title,description:description||null,image:abs(image,p.url),
    metadata:{status:p.status,contentType:p.contentType},episodes,links:links.slice(0,250),
    embeds:embeds.filter(x=>x.url).filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i)};
}
for(const kind of ["anime","episode"]) app.get(`/api/${kind}`,async(req,res)=>{
  if(!req.query.url) return res.status(400).json({ok:false,error:"Parameter url wajib diisi"});
  try { res.json(await detail(String(req.query.url),kind)); }
  catch(e) { pageError(res,`Gagal mengambil detail ${kind}`,e); }
});
app.use((req,res)=>res.status(404).json({ok:false,error:"Endpoint tidak ditemukan",path:req.path}));
app.use((err,_req,res,_next)=>res.status(500).json({ok:false,error:"Internal server error",detail:err.message}));
export default app;
