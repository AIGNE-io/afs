export const VIEW_JS = `
  function renderAupView(node) {
    var el = document.createElement("div");
    el.className = "aup-view";
    var p = node.props || {};
    // Layout: string (backward compat) or object (Spatial Intent v0.3)
    var layout = p.layout;
    var _layoutAliases = { horizontal: "row", vertical: "column" };
    var layoutDir = typeof layout === "string" ? (_layoutAliases[layout] || layout) : (layout && (_layoutAliases[layout.direction] || layout.direction) || "");
    if (typeof layout === "string") {
      el.setAttribute("data-layout", layoutDir);
    } else if (layout && typeof layout === "object") {
      if (layoutDir) el.setAttribute("data-layout", layoutDir);
      if (layout.align) el.setAttribute("data-align", layout.align);
      if (layout.crossAlign) el.setAttribute("data-cross-align", layout.crossAlign);
      if (layout.gap) el.setAttribute("data-gap", layout.gap);
      if (layout.wrap) el.setAttribute("data-wrap", String(layout.wrap));
      if (layout.gridMinWidth) el.style.setProperty("--grid-min-width", layout.gridMinWidth);
      if (layout.overflow) el.setAttribute("data-overflow", layout.overflow);
    }
    if (p.mode) el.setAttribute("data-mode", p.mode);
    if (p.role) el.setAttribute("data-role", p.role);
    if (p.variant) el.setAttribute("data-variant", p.variant);
    // Spatial Intent: sizing
    var size = p.size;
    if (size && typeof size === "object") {
      if (size.width) el.setAttribute("data-width", size.width);
      if (size.maxWidth) el.setAttribute("data-max-width", size.maxWidth);
      if (size.height) el.setAttribute("data-height", size.height);
      if (typeof size.flex === "number") el.style.flex = String(size.flex);
    }
    // ── Animate ──
    if (p.animate && p.animate !== "none") {
      el.setAttribute("data-animate", p.animate);
      if (p.animateDelay) el.style.animationDelay = p.animateDelay + "ms";
      if (p.animateDuration) el.style.animationDuration = p.animateDuration + "ms";
    }
    // ── Background ──
    if (p.background) {
      var bg = p.background;
      if (typeof bg === "string") {
        // Heuristic: URL if starts with http//, / or data:
        if (/^(https?:\\/\\/|data:|\\/)/.test(bg)) {
          el.style.backgroundImage = "url(" + bg + ")";
          el.style.backgroundSize = "cover";
          el.style.backgroundPosition = "center";
        } else {
          el.style.background = bg;
        }
      } else if (bg && typeof bg === "object") {
        el.style.position = el.style.position || "relative";
        if (bg.type === "gradient") {
          el.style.background = bg.value;
        } else if (bg.type === "image") {
          el.style.backgroundImage = "url(" + (bg.src || bg.value || "") + ")";
          el.style.backgroundSize = "cover";
          el.style.backgroundPosition = "center";
          if (typeof bg.opacity === "number") el.style.setProperty("--bg-opacity", String(bg.opacity));
          if (bg.blur) el.style.setProperty("--bg-blur", bg.blur + "px");
        } else if (bg.type === "video") {
          var bgVid = document.createElement("video");
          bgVid.className = "aup-bg-video";
          var bgSrc = String(bg.src || bg.value || "");
          if (bgSrc && !bgSrc.toLowerCase().startsWith("javascript:")) bgVid.src = bgSrc;
          bgVid.autoplay = true;
          bgVid.loop = bg.loop !== false;
          bgVid.muted = bg.muted !== false;
          bgVid.playsInline = true;
          el.appendChild(bgVid);
        }
      }
    }
    // Inline style passthrough (safe subset)
    if (p.style && typeof p.style === "object") {
      var _safeStyleKeys = { padding:1, margin:1, overflow:1, gap:1, borderRadius:1, opacity:1, maxHeight:1, minHeight:1, maxWidth:1, minWidth:1 };
      for (var sk in p.style) {
        if (_safeStyleKeys[sk]) el.style[sk] = p.style[sk];
      }
    }
    // Stack layout: CSS grid with all children in same cell
    if (layoutDir === "stack") {
      el.style.display = "grid";
    }
    // Overlay theme: apply when overlay-grid has a theme prop
    if (layoutDir === "overlay-grid" && p.theme) {
      _applyOverlayTheme(el, p.theme);
    }
    // ── Tabs mode ──
    if (p.mode === "tabs" && node.children && node.children.length > 0) {
      var activeTab = (node.state && node.state.activeTab) || (node.children[0] && node.children[0].id) || "";
      var tabBar = document.createElement("div");
      tabBar.className = "aup-tab-bar";
      var panels = [];
      node.children.forEach(function(child, idx) {
        var isActive = child.id === activeTab || (!activeTab && idx === 0);
        var tab = document.createElement("button");
        tab.className = "aup-tab";
        tab.textContent = (child.props && child.props.label) || child.id || ("Tab " + idx);
        tab.setAttribute("data-active", String(isActive));
        tab.setAttribute("data-tab-id", child.id || "");
        tab.onclick = function() {
          tabBar.querySelectorAll(".aup-tab").forEach(function(t) { t.setAttribute("data-active", "false"); });
          tab.setAttribute("data-active", "true");
          panels.forEach(function(pnl) { pnl.setAttribute("data-active", String(pnl.getAttribute("data-tab-id") === (child.id || ""))); });
          _fireAupEvent(node.id, "tab-change", { activeTab: child.id });
        };
        tabBar.appendChild(tab);
        var panel = document.createElement("div");
        panel.className = "aup-tab-panel";
        panel.setAttribute("data-active", String(isActive));
        panel.setAttribute("data-tab-id", child.id || "");
        var childEl = renderAupNode(child);
        if (childEl) panel.appendChild(childEl);
        panels.push(panel);
      });
      el.appendChild(tabBar);
      panels.forEach(function(pnl) { el.appendChild(pnl); });
      return el;
    }
    // ── Collapsible panels (shell sidebar/inspector) ──
    var isCollapsible = p.role === "sidebar" || p.role === "inspector" || p.collapsible;
    if (node.state && node.state.collapsed != null) {
      el.setAttribute("data-collapsed", String(!!node.state.collapsed));
    }
    if (isCollapsible) {
      var toggleBtn = document.createElement("button");
      toggleBtn.className = "aup-collapse-toggle";
      toggleBtn.textContent = (node.state && node.state.collapsed) ? "\u25B6" : "\u25C0";
      toggleBtn.onclick = function() {
        var nowCollapsed = el.getAttribute("data-collapsed") === "true";
        var next = !nowCollapsed;
        el.setAttribute("data-collapsed", String(next));
        toggleBtn.textContent = next ? "\u25B6" : "\u25C0";
        _fireAupEvent(node.id, "toggle", { collapsed: next });
      };
      el.appendChild(toggleBtn);
      var bodyWrap = document.createElement("div");
      bodyWrap.className = "aup-view-body";
      if (node.children) {
        node.children.forEach(function(child) {
          var childEl = renderAupNode(child);
          if (childEl) {
            if (layoutDir === "stack") childEl.style.gridArea = "1 / 1";
            bodyWrap.appendChild(childEl);
          }
        });
      }
      el.appendChild(bodyWrap);
    } else if (node.children) {
      var staggerMs = (layout && typeof layout === "object" && layout.stagger) ? (typeof layout.stagger === "number" ? layout.stagger : 60) : 0;
      node.children.forEach(function(child, idx) {
        var childEl = renderAupNode(child);
        if (childEl) {
          if (layoutDir === "stack") childEl.style.gridArea = "1 / 1";
          if (staggerMs && idx > 0) childEl.style.animationDelay = (staggerMs * idx) + "ms";
          el.appendChild(childEl);
        }
      });
    }
    return el;
  }

`;
