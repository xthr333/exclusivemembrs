// EXCLUSIVEMEMBRS® public client configuration.
// The publishable key is safe for browser use. Never put a service-role key here.
window.EXM_CONFIG = {
  SUPABASE_URL: "https://ldtmapwemttqoygcqlqu.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fnnYUGRotjuA_56F1F3Yvg_l_1mYYY5",
  STORE_URL: "https://exclusivemembrs.printify.me/",
  DISCORD_URL: "https://discord.gg/NdZkx9gvb",
  INSTAGRAM_URL: "https://www.instagram.com/exclusivemembrs",
  TIKTOK_URL: "https://www.tiktok.com/@exclusivemembrs",
  YOUTUBE_URL: "https://youtube.com/@exclusivememb"
};

// Current public SongWars III field status. Keep this small block as the
// fallback source of truth for static GitHub Pages content.
window.EXM_SONGWARS = {
  approvedDuos: 12,
  maxDuos: 12,
  openSpots: 0,
  waitlistOpen: true,
  waitlistedDuos: 2,
  progress: 100
};

(function syncSongWarsPublicStatus() {
  function apply() {
    // Homepage status heading.
    document.querySelectorAll('.section-title').forEach(function (el) {
      var text = el.textContent.replace(/\s+/g, ' ').trim().toUpperCase();
      if (/^(7|8|9) LOCKED\.\s*(3|4|5) OPEN\.$/.test(text)) {
        el.innerHTML = '12 LOCKED.<br>WAITLIST OPEN.';
      }
      if (/^(7|8|9) DUOS\.\s*LOCKED IN\.$/.test(text)) {
        el.innerHTML = '12 DUOS.<br>LOCKED IN.';
      }
    });

    // SongWars registration meter.
    var reg = document.querySelector('.registration');
    if (reg) {
      var number = reg.querySelector('.registration-number');
      var bar = reg.querySelector('.progress span');
      var bottom = reg.querySelectorAll('.registration-bottom span');
      if (number) number.textContent = '12';
      if (bar) bar.style.width = '100%';
      if (bottom[0]) bottom[0].textContent = '12 APPROVED DUOS';
      if (bottom[1]) bottom[1].textContent = 'REPLACEMENT WAITLIST OPEN';
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();

