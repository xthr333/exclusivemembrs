// EXCLUSIVEMEMBRS® public client configuration.
// The publishable key is safe for browser use. Never put a service-role key here.
window.EXM_CONFIG = {
  SUPABASE_URL: "https://ldtmapwemttqoygcqlqu.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fnnYUGRotjuA_56F1F3Yvg_l_1mYYY5",
  STORE_URL: "https://exclusivemembrs.printify.me/",
  DISCORD_URL: "https://discord.gg/WguA7bAV39",
  INSTAGRAM_URL: "https://www.instagram.com/exclusivemembrs",
  TIKTOK_URL: "https://www.tiktok.com/@exclusivemembrs",
  YOUTUBE_URL: "https://youtube.com/@exclusivememb"
};

// Current public SongWars III field status. Keep this small block as the
// fallback source of truth for static GitHub Pages content.
window.EXM_SONGWARS = {
  approvedDuos: 9,
  maxDuos: 12,
  openSpots: 3,
  progress: 75
};

(function syncSongWarsPublicStatus() {
  function apply() {
    // Homepage status heading.
    document.querySelectorAll('.section-title').forEach(function (el) {
      var text = el.textContent.replace(/\s+/g, ' ').trim().toUpperCase();
      if (/^(7|8) LOCKED\.\s*(4|5) OPEN\.$/.test(text)) {
        el.innerHTML = '9 LOCKED.<br>3 OPEN.';
      }
      if (/^(7|8) DUOS\.\s*LOCKED IN\.$/.test(text)) {
        el.innerHTML = '9 DUOS.<br>LOCKED IN.';
      }
    });

    // SongWars registration meter.
    var reg = document.querySelector('.registration');
    if (reg) {
      var number = reg.querySelector('.registration-number');
      var bar = reg.querySelector('.progress span');
      var bottom = reg.querySelectorAll('.registration-bottom span');
      if (number) number.textContent = '09';
      if (bar) bar.style.width = '75%';
      if (bottom[0]) bottom[0].textContent = '9 APPROVED DUOS';
      if (bottom[1]) bottom[1].textContent = '3 OPEN POSITIONS';
    }

    // Replace the first open field slot (09) with the newly approved duo.
    var field = document.querySelector('.field-board');
    if (field) {
      var openSlots = field.querySelectorAll('.duo-slot.open');
      if (openSlots.length === 4) {
        var slot9 = openSlots[0];
        var approved = document.createElement('div');
        approved.className = 'duo-slot reveal visible';
        approved.innerHTML = '<span class="card-index">FIELD SLOT // 09</span><h3>Splash bros. 🌹</h3><p>APPROVED DUO // ROSTER LOCKED</p>';
        slot9.replaceWith(approved);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
