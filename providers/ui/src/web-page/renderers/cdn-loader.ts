export const CDN_LOADER_JS = `
  // ── CDN Lazy-Load Utilities ──
  var _loadedScripts = {};
  function loadScript(url, cb) {
    if (_loadedScripts[url]) { if (cb) cb(); return; }
    var s = document.createElement("script");
    s.src = url;
    s.onload = function() { _loadedScripts[url] = true; if (cb) cb(); };
    s.onerror = function() { console.error("Failed to load: " + url); };
    document.head.appendChild(s);
  }
  function loadCSS(url) {
    if (document.querySelector('link[href="' + url + '"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = url;
    document.head.appendChild(l);
  }

`;
