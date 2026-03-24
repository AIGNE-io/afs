export const DECK_JS = `
  // ── Design presets ──
  var _DECK_PRESETS = {
    "tech-dark": {
      fonts: { heading: "Sora", body: "DM Sans", mono: "JetBrains Mono" },
      colors: { bg: "#0a0a0a", surface: "#141414", text: "#ffffff", accent: "#6366f1", accentGlow: "rgba(99,102,241,0.4)", muted: "#71717a", gradient: "linear-gradient(135deg, #0f0f23, #1a1a3e, #0f0f23)" },
      effects: { slideBackground: "grid", headingStyle: "gradient-text", cardStyle: "glass" },
      spacing: { slidePadding: "60px 80px", gap: 32, headingSize: "3.5rem" }
    },
    "corporate-clean": {
      fonts: { heading: "Manrope", body: "DM Sans", mono: "JetBrains Mono" },
      colors: { bg: "#ffffff", surface: "#f8fafc", text: "#0f172a", accent: "#2563eb", accentGlow: "rgba(37,99,235,0.2)", muted: "#64748b", gradient: "none" },
      effects: { slideBackground: "solid", headingStyle: "plain", cardStyle: "flat" },
      spacing: { slidePadding: "60px 80px", gap: 32, headingSize: "3rem" }
    },
    "keynote-dark": {
      fonts: { heading: "Outfit", body: "DM Sans", mono: "JetBrains Mono" },
      colors: { bg: "#000000", surface: "#111111", text: "#ffffff", accent: "#3b82f6", accentGlow: "rgba(59,130,246,0.3)", muted: "#9ca3af", gradient: "radial-gradient(ellipse at center, #111 0%, #000 70%)" },
      effects: { slideBackground: "spotlight", headingStyle: "plain", cardStyle: "floating" },
      spacing: { slidePadding: "80px 100px", gap: 40, headingSize: "4rem" }
    },
    "gradient-dream": {
      fonts: { heading: "Outfit", body: "DM Sans", mono: "JetBrains Mono" },
      colors: { bg: "#0c0015", surface: "#1a0030", text: "#f8f0ff", accent: "#c084fc", accentGlow: "rgba(192,132,252,0.4)", muted: "#a78bfa", gradient: "linear-gradient(135deg, #0c0015, #1a0030, #2d1b69)" },
      effects: { slideBackground: "aurora", headingStyle: "glow", cardStyle: "glass" },
      spacing: { slidePadding: "60px 80px", gap: 32, headingSize: "3.5rem" }
    },
    "neon-night": {
      fonts: { heading: "Sora", body: "DM Sans", mono: "Share Tech Mono" },
      colors: { bg: "#000000", surface: "#0a0a0a", text: "#e0ffe0", accent: "#22d3ee", accentGlow: "rgba(34,211,238,0.4)", muted: "#4ade80", gradient: "linear-gradient(180deg, #000, #001a1a)" },
      effects: { slideBackground: "noise", headingStyle: "glow", cardStyle: "neon" },
      spacing: { slidePadding: "60px 80px", gap: 32, headingSize: "3.5rem" }
    },
    "warm-earth": {
      fonts: { heading: "DM Serif Display", body: "DM Sans", mono: "JetBrains Mono" },
      colors: { bg: "#faf7f2", surface: "#f0ebe3", text: "#2c1810", accent: "#b45309", accentGlow: "rgba(180,83,9,0.2)", muted: "#78716c", gradient: "none" },
      effects: { slideBackground: "noise", headingStyle: "plain", cardStyle: "flat" },
      spacing: { slidePadding: "60px 80px", gap: 32, headingSize: "3rem" }
    },
    "retro-terminal": {
      fonts: { heading: "Space Mono", body: "Space Mono", mono: "Space Mono" },
      colors: { bg: "#0a0a0a", surface: "#111111", text: "#33ff33", accent: "#33ff33", accentGlow: "rgba(51,255,51,0.3)", muted: "#1a8f1a", gradient: "none" },
      effects: { slideBackground: "grid", headingStyle: "glow", cardStyle: "bordered" },
      spacing: { slidePadding: "40px 60px", gap: 24, headingSize: "2.5rem" }
    },
    "frosted-glass": {
      fonts: { heading: "Outfit", body: "DM Sans", mono: "JetBrains Mono" },
      colors: { bg: "#0f172a", surface: "#1e293b", text: "#f1f5f9", accent: "#818cf8", accentGlow: "rgba(129,140,248,0.3)", muted: "#94a3b8", gradient: "linear-gradient(135deg, #0f172a, #1e1b4b, #0f172a)" },
      effects: { slideBackground: "aurora", headingStyle: "gradient-text", cardStyle: "glass" },
      spacing: { slidePadding: "60px 80px", gap: 32, headingSize: "3.5rem" }
    },
    "brutalist": {
      fonts: { heading: "Instrument Serif", body: "DM Sans", mono: "Space Mono" },
      colors: { bg: "#fffff0", surface: "#f5f5dc", text: "#000000", accent: "#dc2626", accentGlow: "rgba(220,38,38,0.2)", muted: "#525252", gradient: "none" },
      effects: { slideBackground: "solid", headingStyle: "plain", cardStyle: "bordered" },
      spacing: { slidePadding: "60px 80px", gap: 32, headingSize: "4rem" }
    }
  };

  // ── Token sanitization ──
  function _sanitizeDeckToken(value) {
    if (typeof value !== "string") return value;
    return value.replace(/[;{}]/g, "").replace(/expression\\s*\\(/gi, "").replace(/javascript\\s*:/gi, "").replace(/url\\s*\\(/gi, "blocked(");
  }

  // ── CSS generation from design tokens ──
  function _buildDeckTokenCSS(design) {
    if (!design) return "";
    var c = design.colors || {};
    var f = design.fonts || {};
    var s = design.spacing || {};
    var lines = [":host {"];
    if (c.bg) lines.push("  --deck-bg: " + _sanitizeDeckToken(c.bg) + ";");
    if (c.surface) lines.push("  --deck-surface: " + _sanitizeDeckToken(c.surface) + ";");
    if (c.text) lines.push("  --deck-text: " + _sanitizeDeckToken(c.text) + ";");
    if (c.accent) lines.push("  --deck-accent: " + _sanitizeDeckToken(c.accent) + ";");
    if (c.accentGlow) lines.push("  --deck-accent-glow: " + _sanitizeDeckToken(c.accentGlow) + ";");
    if (c.muted) lines.push("  --deck-muted: " + _sanitizeDeckToken(c.muted) + ";");
    if (c.gradient) lines.push("  --deck-gradient: " + _sanitizeDeckToken(c.gradient) + ";");
    if (f.heading) lines.push("  --deck-font-heading: " + _sanitizeDeckToken(f.heading) + ";");
    if (f.body) lines.push("  --deck-font-body: " + _sanitizeDeckToken(f.body) + ";");
    if (f.mono) lines.push("  --deck-font-mono: " + _sanitizeDeckToken(f.mono) + ";");
    if (s.slidePadding) lines.push("  --deck-slide-padding: " + _sanitizeDeckToken(s.slidePadding) + ";");
    if (s.headingSize) lines.push("  --deck-heading-size: " + _sanitizeDeckToken(s.headingSize) + ";");
    if (s.gap) lines.push("  --deck-gap: " + (parseInt(s.gap) || 32) + "px;");
    lines.push("}");
    return lines.join("\\n");
  }

  // ── Allowed font URL origins ──
  var _FONT_URL_WHITELIST = ["fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net", "cdnjs.cloudflare.com"];
  function _isSafeFontURL(url) {
    try {
      var u = new URL(url);
      return _FONT_URL_WHITELIST.some(function(h) { return u.hostname === h || u.hostname.endsWith("." + h); });
    } catch(e) { return false; }
  }

  function renderAupDeck(node) {
    var p = node.props || {};
    var s = node.state || {};
    var transition = p.transition || "fade";
    var transitionDuration = p.transitionDuration || 600;
    var autoPlay = !!p.autoPlay;
    var autoPlayInterval = p.autoPlayInterval || 5000;
    var loop = !!p.loop;
    var showControls = p.showControls !== false;
    var showProgress = p.showProgress !== false;
    var keyboard = p.keyboard !== false;
    var aspectRatio = p.aspectRatio || "auto";
    var presentation = !!p.presentation;
    var slides = node.children || [];
    var total = slides.length;
    var current = Math.max(0, Math.min(parseInt(s.current) || 0, total - 1));
    var autoTimer = null;

    // ── Resolve design tokens ──
    var preset = p.designPreset ? _DECK_PRESETS[p.designPreset] : null;
    var design = {};
    if (preset) {
      design.fonts = Object.assign({}, preset.fonts);
      design.colors = Object.assign({}, preset.colors);
      design.effects = Object.assign({}, preset.effects);
      design.spacing = Object.assign({}, preset.spacing);
    }
    if (p.design) {
      if (p.design.fonts) design.fonts = Object.assign(design.fonts || {}, p.design.fonts);
      if (p.design.colors) design.colors = Object.assign(design.colors || {}, p.design.colors);
      if (p.design.effects) design.effects = Object.assign(design.effects || {}, p.design.effects);
      if (p.design.spacing) design.spacing = Object.assign(design.spacing || {}, p.design.spacing);
    }
    var effects = (design && design.effects) || {};

    // ── Shadow DOM host ──
    var host = document.createElement("div");
    host.className = "aup-deck-host";
    host.style.width = "100%";
    var shadow = host.attachShadow({ mode: "open" });

    // 1. Clone main page CSS into shadow (so child primitives render correctly)
    var mainStyle = document.querySelector("head > style");
    if (mainStyle) {
      var clonedStyle = document.createElement("style");
      clonedStyle.textContent = mainStyle.textContent;
      shadow.appendChild(clonedStyle);
    }

    // 2. Inject deck shadow CSS (from DECK_SHADOW_CSS constant embedded at build time)
    var deckStyle = document.createElement("style");
    deckStyle.textContent = _DECK_SHADOW_CSS;
    shadow.appendChild(deckStyle);

    // 3. Inject design token CSS
    if (design && (design.colors || design.fonts || design.spacing)) {
      var tokenStyle = document.createElement("style");
      tokenStyle.textContent = _buildDeckTokenCSS(design);
      shadow.appendChild(tokenStyle);
    }

    // 4. Load font URLs
    var fontUrls = (design.fonts && design.fonts.urls) || [];
    for (var fi = 0; fi < fontUrls.length; fi++) {
      if (_isSafeFontURL(fontUrls[fi])) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = fontUrls[fi];
        shadow.appendChild(link);
      }
    }

    // ── Build deck inside shadow ──
    var el = document.createElement("div");
    el.className = "aup-deck";
    el.setAttribute("data-transition", transition);
    el.style.setProperty("--deck-transition-duration", transitionDuration + "ms");

    if (presentation) {
      el.setAttribute("data-presentation", "true");
      host.style.height = "100vh";
      el.style.height = "100%";
    }
    if (aspectRatio === "16:9") el.setAttribute("data-aspect", "16-9");
    else if (aspectRatio === "4:3") el.setAttribute("data-aspect", "4-3");

    // Slide background effect
    if (effects.slideBackground && effects.slideBackground !== "solid") {
      el.setAttribute("data-slide-bg", effects.slideBackground);
    }

    // Heading style class
    if (effects.headingStyle === "gradient-text") el.classList.add("deck-heading-gradient");
    else if (effects.headingStyle === "glow") el.classList.add("deck-heading-glow");

    // Card style class
    if (effects.cardStyle === "glass") el.classList.add("deck-card-glass");
    else if (effects.cardStyle === "neon") el.classList.add("deck-card-neon");
    else if (effects.cardStyle === "bordered") el.classList.add("deck-card-bordered");

    // ── Viewport ──
    var viewport = document.createElement("div");
    viewport.className = "aup-deck-viewport";

    for (var i = 0; i < total; i++) {
      var slideEl = document.createElement("div");
      slideEl.className = "aup-deck-slide";
      if (i === current) slideEl.classList.add("active");
      var childEl = renderAupNode(slides[i]);
      if (childEl) slideEl.appendChild(childEl);
      viewport.appendChild(slideEl);
    }
    el.appendChild(viewport);

    // ── Controls ──
    if (showControls && total > 1) {
      var controls = document.createElement("div");
      controls.className = "aup-deck-controls";
      var prevBtn = document.createElement("button");
      prevBtn.className = "aup-deck-prev";
      prevBtn.innerHTML = _ICON_PATHS["arrow-left"] ?
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _ICON_PATHS["arrow-left"] + '</svg>' :
        '&#8592;';
      prevBtn.onclick = function(e) { e.stopPropagation(); goTo(current - 1); };
      controls.appendChild(prevBtn);

      var nextBtn = document.createElement("button");
      nextBtn.className = "aup-deck-next";
      nextBtn.innerHTML = _ICON_PATHS["arrow-right"] ?
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _ICON_PATHS["arrow-right"] + '</svg>' :
        '&#8594;';
      nextBtn.onclick = function(e) { e.stopPropagation(); goTo(current + 1); };
      controls.appendChild(nextBtn);
      el.appendChild(controls);

      // ── Dots ──
      var dots = document.createElement("div");
      dots.className = "aup-deck-dots";
      for (var d = 0; d < total; d++) {
        (function(idx) {
          var dot = document.createElement("button");
          dot.className = "aup-deck-dot" + (idx === current ? " active" : "");
          dot.onclick = function(e) { e.stopPropagation(); goTo(idx); };
          dots.appendChild(dot);
        })(d);
      }
      el.appendChild(dots);
    }

    // ── Progress bar ──
    if (showProgress && total > 1) {
      var progressBar = document.createElement("div");
      progressBar.className = "aup-deck-progress";
      var progressFill = document.createElement("div");
      progressFill.className = "aup-deck-progress-fill";
      progressFill.style.width = ((current + 1) / total * 100) + "%";
      progressBar.appendChild(progressFill);
      el.appendChild(progressBar);
    }

    shadow.appendChild(el);

    // ── Navigation logic ──
    function goTo(idx) {
      if (total === 0) return;
      var prev = current;
      if (idx < 0) { idx = loop ? total - 1 : 0; }
      if (idx >= total) {
        if (loop) { idx = 0; }
        else {
          emitDeckEvent(node, "complete", { current: current, total: total });
          return;
        }
      }
      if (idx === current) return;
      current = idx;
      updateSlides(prev);
      emitDeckEvent(node, "change", { current: current, previous: prev });
      resetAutoPlay();
    }

    function updateSlides(prev) {
      var slideEls = viewport.children;
      for (var j = 0; j < slideEls.length; j++) {
        var sEl = slideEls[j];
        sEl.classList.remove("active", "prev", "entering");
        if (j === current) {
          sEl.classList.add("active", "entering");
          triggerSlideAnimations(sEl);
        } else if (j === prev) {
          sEl.classList.add("prev");
        }
      }
      setTimeout(function() {
        var active = viewport.children[current];
        if (active) active.classList.remove("entering");
      }, transitionDuration);

      // Update dots
      var dotEls = el.querySelectorAll(".aup-deck-dot");
      for (var k = 0; k < dotEls.length; k++) {
        dotEls[k].classList.toggle("active", k === current);
      }
      // Update progress
      var fill = el.querySelector(".aup-deck-progress-fill");
      if (fill) fill.style.width = ((current + 1) / total * 100) + "%";
    }

    function triggerSlideAnimations(slideEl) {
      var animatedEls = slideEl.querySelectorAll("[data-animate]");
      for (var a = 0; a < animatedEls.length; a++) {
        var ae = animatedEls[a];
        ae.classList.remove("aup-animated");
        void ae.offsetWidth;
        ae.classList.add("aup-animated");
      }
      // Also trigger count-up for elements inside shadow
      var countEls = slideEl.querySelectorAll('[data-animate="count-up"]');
      for (var cu = 0; cu < countEls.length; cu++) {
        _startCountUp(countEls[cu]);
      }
    }

    // Trigger animations on the initial slide
    setTimeout(function() {
      var activeSlide = viewport.children[current];
      if (activeSlide) triggerSlideAnimations(activeSlide);
    }, 100);

    function emitDeckEvent(n, eventName, detail) {
      if (!n.events || !n.events[eventName]) return;
      var ev = n.events[eventName];
      if (ev.exec && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: "aup_event",
          nodeId: n.id,
          event: eventName,
          payload: Object.assign({}, ev.args || {}, detail)
        }));
      }
    }

    // ── AutoPlay ──
    function resetAutoPlay() {
      if (autoTimer) clearInterval(autoTimer);
      if (autoPlay && total > 1) {
        autoTimer = setInterval(function() { goTo(current + 1); }, autoPlayInterval);
      }
    }
    resetAutoPlay();

    // Pause on hover
    host.onmouseenter = function() { if (autoTimer) clearInterval(autoTimer); };
    host.onmouseleave = function() { resetAutoPlay(); };

    // ── Keyboard (on host, delegates into shadow) ──
    if (keyboard) {
      host.setAttribute("tabindex", "0");
      host.style.outline = "none";
      host.onkeydown = function(e) {
        switch (e.key) {
          case "ArrowRight": case "ArrowDown": case " ":
            e.preventDefault(); goTo(current + 1); break;
          case "ArrowLeft": case "ArrowUp":
            e.preventDefault(); goTo(current - 1); break;
          case "f": case "F":
            e.preventDefault();
            if (document.fullscreenElement) document.exitFullscreen();
            else el.requestFullscreen && el.requestFullscreen();
            break;
          case "Escape":
            if (document.fullscreenElement) document.exitFullscreen();
            break;
          default:
            var num = parseInt(e.key);
            if (num >= 1 && num <= 9 && num <= total) {
              e.preventDefault();
              goTo(num - 1);
            }
        }
      };
    }

    return host;
  }

`;
