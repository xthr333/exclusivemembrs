(() => {
  const cfg = window.EXM_CONFIG || {};
  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => [...p.querySelectorAll(s)];

  // Shared mobile nav
  const toggle = $(".nav-toggle");
  const links = $(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  // Active nav item
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  $$(".nav-links a[data-page]").forEach(a => {
    if (a.dataset.page === page) a.classList.add("active");
  });

  // Reveal animation
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("is-visible");
        reveal.unobserve(e.target);
      }
    });
  }, { threshold: .08 });
  $$(".reveal").forEach(el => reveal.observe(el));

  // Supabase public client
  window.getEXMClient = () => {
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) return null;
    if (!window.__EXM_DB__) {
      window.__EXM_DB__ = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_PUBLISHABLE_KEY
      );
    }
    return window.__EXM_DB__;
  };

  const safeUrl = (url) => {
    if (!url) return "";
    const v = String(url).trim();
    if (/^(https?:\/\/|mailto:|#|[a-z0-9_-]+\.html(?:[?#].*)?$)/i.test(v)) return v;
    return "";
  };

  const updateCard = (u) => {
    const article = document.createElement("article");
    article.className = "transmission-card reveal";
    if (u.featured) article.classList.add("featured");

    const meta = document.createElement("div");
    meta.className = "transmission-meta";
    meta.textContent = `${String(u.category || "EXM").toUpperCase()} // ${u.featured ? "FEATURED" : "TRANSMISSION"}`;

    const h = document.createElement("h3");
    h.textContent = u.headline || "EXM UPDATE";

    const p = document.createElement("p");
    p.textContent = u.description || "";

    article.append(meta, h, p);

    const href = safeUrl(u.link_url);
    if (href) {
      const a = document.createElement("a");
      a.className = "text-link";
      a.href = href;
      a.textContent = `${u.link_text || "OPEN"} ↗`;
      if (/^https?:\/\//i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      article.appendChild(a);
    }
    return article;
  };

  window.loadEXMUpdates = async (targetId, limit=0) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const db = window.getEXMClient();
    if (!db) {
      target.innerHTML = '<div class="system-message">EXM://DATABASE OFFLINE</div>';
      return;
    }

    let q = db.from("exm_updates")
      .select("id,created_at,category,headline,description,link_text,link_url,featured,published")
      .eq("published", true)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (limit) q = q.limit(limit);
    const { data, error } = await q;

    target.innerHTML = "";
    if (error) {
      console.error(error);
      target.innerHTML = '<div class="system-message">EXM://TRANSMISSION ERROR</div>';
      return;
    }
    if (!data?.length) {
      target.innerHTML = '<div class="system-message">NO ACTIVE TRANSMISSIONS.</div>';
      return;
    }
    data.forEach(u => target.appendChild(updateCard(u)));
    $$(".reveal", target).forEach(el => reveal.observe(el));
  };

  // SongWars countdown: Nov 21, 2026 8:00 PM ET (UTC-5 in November)
  const countdown = $("#songwarsCountdown");
  if (countdown) {
    const target = new Date("2026-11-21T20:00:00-05:00").getTime();
    const tick = () => {
      let d = Math.max(0, target - Date.now());
      const days = Math.floor(d / 86400000); d %= 86400000;
      const hrs = Math.floor(d / 3600000); d %= 3600000;
      const mins = Math.floor(d / 60000); d %= 60000;
      const secs = Math.floor(d / 1000);
      const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = String(v).padStart(2,"0"); };
      set("cdDays", days); set("cdHours", hrs); set("cdMinutes", mins); set("cdSeconds", secs);
      if (target <= Date.now()) countdown.classList.add("live-now");
    };
    tick(); setInterval(tick, 1000);
  }
})();
