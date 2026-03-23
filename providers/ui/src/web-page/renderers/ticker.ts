export const TICKER_JS = `
  function renderAupTicker(node) {
    var p = node.props || {};
    var mode = p.mode === "flip" || p.mode === "static" ? p.mode : "scroll";
    var intent = p.intent;
    var separator = p.separator != null ? String(p.separator) : " \\u2022 ";
    if (separator.length > 32) separator = separator.slice(0, 32);
    var speed = p.speed;
    var pauseOnHover = p.pauseOnHover !== false;
    var direction = p.direction || "rtl";
    var flipTransition = p.flipTransition || "fade";
    var children = node.children || [];
    if (children.length > 200) children = children.slice(0, 200);

    var el = document.createElement("div");
    el.className = "aup-ticker";
    el.setAttribute("data-mode", mode);
    if (intent) el.setAttribute("data-intent", intent);

    var normalizedSpeed = _normalizeTickerSpeed(mode, speed);

    if (mode === "static") {
      return _buildStaticTicker(el, children, separator);
    } else if (mode === "flip") {
      return _buildFlipTicker(el, children, normalizedSpeed, flipTransition);
    }
    // Default: scroll
    return _buildScrollTicker(el, children, separator, normalizedSpeed, pauseOnHover, direction);
  }

  function _normalizeTickerSpeed(mode, speed) {
    var n = Number(speed);
    if (!isFinite(n)) n = mode === "flip" ? 4000 : 60;
    if (mode === "flip") {
      n = Math.round(n);
      if (n < 1000) n = 1000;
      if (n > 60000) n = 60000;
      return n;
    }
    if (n < 10) n = 10;
    if (n > 400) n = 400;
    return n;
  }

  function _buildStaticTicker(el, children, separator) {
    var track = document.createElement("div");
    track.className = "aup-ticker-track";
    _appendTickerItems(track, children, separator);
    el.appendChild(track);
    return el;
  }

  function _buildScrollTicker(el, children, separator, pxPerSec, pauseOnHover, direction) {
    var track = document.createElement("div");
    track.className = "aup-ticker-track";

    // First copy
    _appendTickerItems(track, children, separator);
    // Duplicate for seamless loop
    _appendTickerItems(track, children, separator);

    el.appendChild(track);

    if (direction === "ltr") el.setAttribute("data-direction", "ltr");

    // Calculate duration after DOM insertion (need widths)
    requestAnimationFrame(function() {
      var trackWidth = track.scrollWidth / 2;
      if (trackWidth > 0 && pxPerSec > 0) {
        var duration = trackWidth / pxPerSec;
        el.style.setProperty("--ticker-duration", duration + "s");
      }
    });

    if (pauseOnHover) {
      el.addEventListener("mouseenter", function() { el.setAttribute("data-paused", "true"); });
      el.addEventListener("mouseleave", function() { el.removeAttribute("data-paused"); });
    }

    return el;
  }

  function _buildFlipTicker(el, children, intervalMs, transition) {
    var track = document.createElement("div");
    track.className = "aup-ticker-track";
    el.setAttribute("data-flip-transition", transition);

    var items = [];
    for (var i = 0; i < children.length; i++) {
      var item = document.createElement("div");
      item.className = "aup-ticker-item" + (i === 0 ? " active" : "");
      var childEl = renderAupNode(children[i]);
      if (childEl) item.appendChild(childEl);
      track.appendChild(item);
      items.push(item);
    }
    el.appendChild(track);

    if (items.length > 1) {
      var currentIdx = 0;
      var flipTimer = setInterval(function() {
        items[currentIdx].classList.remove("active");
        currentIdx = (currentIdx + 1) % items.length;
        items[currentIdx].classList.add("active");
      }, intervalMs);
      // Store timer for potential cleanup on re-render
      el._flipTimer = flipTimer;
    }

    return el;
  }

  function _appendTickerItems(track, children, separator) {
    for (var i = 0; i < children.length; i++) {
      if (i > 0 && separator) {
        var sep = document.createElement("span");
        sep.className = "aup-ticker-separator";
        sep.textContent = separator;
        track.appendChild(sep);
      }
      var item = document.createElement("div");
      item.className = "aup-ticker-item";
      var childEl = renderAupNode(children[i]);
      if (childEl) item.appendChild(childEl);
      track.appendChild(item);
    }
  }
`;
