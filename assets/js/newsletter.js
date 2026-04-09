/**
 * newsletter.js — Web mode only.
 * Email clients strip <script> tags; this only runs in browsers.
 * Loads the site design system and injects the shared header/footer partials.
 */
(function() {
  // ── Inject main.css ──────────────────────────────────────────────────
  var link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = '/assets/css/main.css';
  document.head.appendChild(link);

  // ── Inject header + footer placeholder divs ──────────────────────────
  var headerDiv = document.createElement('div');
  headerDiv.id  = 'site-header-wrap';
  document.body.insertBefore(headerDiv, document.body.firstChild);

  var footerDiv = document.createElement('div');
  footerDiv.id  = 'site-footer-wrap';
  document.body.appendChild(footerDiv);

  // ── Load partials ────────────────────────────────────────────────────
  function loadPartial(el, url, onLoad) {
    fetch(url, { credentials: 'same-origin' })
      .then(function(r) { return r.ok ? r.text() : ''; })
      .then(function(html) {
        el.innerHTML = html;
        if (onLoad) onLoad();
      })
      .catch(function() { el.innerHTML = ''; });
  }

  loadPartial(headerDiv, '/assets/partials/header.html', function() {
    // ── Offset body for fixed header ───────────────────────────────────
    document.body.style.paddingTop = '64px';

    // ── Scroll progress bar ────────────────────────────────────────────
    var bar = document.getElementById('myBar');
    if (bar) {
      window.addEventListener('scroll', function() {
        var scrolled = document.body.scrollTop || document.documentElement.scrollTop;
        var height   = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        bar.style.width = (height > 0 ? (scrolled / height) * 100 : 0) + '%';
      }, { passive: true });
    }
  });

  loadPartial(footerDiv, '/assets/partials/footer.html');

  // ── Hide email-only elements ─────────────────────────────────────────
  var headerRow = document.getElementById('header');
  if (headerRow) headerRow.style.display = 'none';

  document.querySelectorAll('.w').forEach(function(el) { el.style.display = 'none'; });
})();
