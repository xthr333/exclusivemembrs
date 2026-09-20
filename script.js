(() => {
  const cfg = window.EXM_CONFIG || {};
  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => [...p.querySelectorAll(s)];

  const toggle = $(".nav-toggle");
  const links = $(".nav-links");
  if (toggle && links) {
    const closeNav = () => { links.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); };
    toggle.addEventListener("click", e => { e.stopPropagation(); const open = links.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open)); });
    links.addEventListener("click", e => { if (e.target.closest("a")) closeNav(); });
    document.addEventListener("click", e => { if (!links.contains(e.target) && e.target !== toggle) closeNav(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeNav(); toggle.focus(); } });
  }

  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  $$(".nav-links a[data-page]").forEach(a => { if (a.dataset.page === page) { a.classList.add("active"); a.setAttribute("aria-current", "page"); } });

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveal = reducedMotion ? null : new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-visible"); reveal.unobserve(e.target); } }), { threshold: .08 });
  $$(".reveal").forEach(el => reducedMotion ? el.classList.add("is-visible") : reveal.observe(el));

  window.getEXMClient = () => {
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) return null;
    if (!window.__EXM_DB__) window.__EXM_DB__ = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
    return window.__EXM_DB__;
  };

  const safeUrl = url => {
    if (!url) return "";
    const v = String(url).trim();
    return /^(https?:\/\/|mailto:|#|[a-z0-9_-]+\.html(?:[?#].*)?$)/i.test(v) ? v : "";
  };

  const normalizeUpdate = u => ({
    id: String(u.id || u.created_at || u.date || "update"),
    created_at: u.created_at || u.date || "",
    category: u.category || "EXM",
    headline: u.headline || "EXM UPDATE",
    description: u.description || "",
    link_text: u.link_text || u.linkText || "OPEN",
    link_url: u.link_url || u.link || "",
    featured: Boolean(u.featured)
  });

  const updateCard = raw => {
    const u = normalizeUpdate(raw), article = document.createElement("article");
    article.className = "transmission-card reveal";
    if (u.featured) article.classList.add("featured");
    const meta = document.createElement("div"); meta.className = "transmission-meta"; meta.textContent = `${String(u.category).toUpperCase()} // ${u.featured ? "FEATURED" : "TRANSMISSION"}`;
    const h = document.createElement("h3"); h.textContent = u.headline;
    const p = document.createElement("p"); p.textContent = u.description;
    article.append(meta,h,p);
    const href = safeUrl(u.link_url);
    if (href) { const a=document.createElement("a"); a.className="text-link"; a.href=href; a.textContent=`${u.link_text} ↗`; if(/^https?:\/\//i.test(href)){a.target="_blank";a.rel="noopener noreferrer";} article.appendChild(a); }
    return article;
  };

  const renderUpdates = (target, data, label="") => {
    target.innerHTML="";
    if (label) { const note=document.createElement("div"); note.className="system-message sync-label"; note.textContent=label; target.appendChild(note); }
    if (!data.length) { const empty=document.createElement("div"); empty.className="system-message"; empty.textContent="NO PUBLISHED TRANSMISSIONS YET."; target.appendChild(empty); return; }
    data.forEach(u=>target.appendChild(updateCard(u)));
    $$(".reveal",target).forEach(el=>reducedMotion?el.classList.add("is-visible"):reveal.observe(el));
  };

  const loadFallback = async limit => {
    try { const r=await fetch("updates.json",{cache:"no-store"}); if(!r.ok) throw new Error(`HTTP ${r.status}`); const j=await r.json(); const list=Array.isArray(j)?j:(j.updates||[]); return (limit?list.slice(0,limit):list).map(normalizeUpdate); }
    catch(e){ console.warn("EXM synced fallback unavailable",e); return []; }
  };

  window.loadEXMUpdates = async (targetId, limit=0) => {
    const target=document.getElementById(targetId); if(!target)return;
    target.innerHTML='<div class="system-message">CONNECTING…</div>';
    const db=window.getEXMClient();
    try {
      if(!db) throw new Error("Public database client unavailable");
      let q=db.from("exm_updates").select("id,created_at,category,headline,description,link_text,link_url,featured,published").eq("published",true).order("featured",{ascending:false}).order("created_at",{ascending:false});
      if(limit)q=q.limit(limit);
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error("Public updates request timed out")),3500));
      const result=await Promise.race([q,timeout]);
      if(result.error)throw result.error;
      renderUpdates(target,(result.data||[]).map(normalizeUpdate));
    } catch(e) {
      console.warn("EXM live transmissions unavailable; using last synced copy",e);
      const fallback=await loadFallback(limit);
      renderUpdates(target,fallback,"LAST SYNCED TRANSMISSIONS");
    }
  };

  const countdown=$("#songwarsCountdown");
  if(countdown){const target=new Date("2026-11-21T20:00:00-05:00").getTime();const tick=()=>{let d=Math.max(0,target-Date.now());const days=Math.floor(d/86400000);d%=86400000;const hrs=Math.floor(d/3600000);d%=3600000;const mins=Math.floor(d/60000);d%=60000;const secs=Math.floor(d/1000);const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=String(v).padStart(2,"0");};set("cdDays",days);set("cdHours",hrs);set("cdMinutes",mins);set("cdSeconds",secs);if(target<=Date.now())countdown.classList.add("live-now");};tick();setInterval(tick,1000);}
})();
