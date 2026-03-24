export const SURFACE_JS = `
  // ── Surface Renderer (universal surface — AFS path or remote WebSocket) ──

  function _resolveSurfaceUrl(url) {
    if (!url || typeof url !== "string") return null;
    url = url.trim();
    if (url.indexOf("ws://") === 0 || url.indexOf("wss://") === 0) return url;
    if (url.indexOf("https://") === 0) return "wss://" + url.slice(8);
    if (url.indexOf("http://") === 0) return "ws://" + url.slice(7);
    // Shorthand: ":3300" or "localhost:3300"
    if (/^:\\\\d+/.test(url)) return "ws://localhost" + url;
    if (/^localhost:\\\\d+/.test(url)) return "ws://" + url;
    return null;
  }

  function renderSurfaceFallback(node) {
    var el = document.createElement("div");
    el.className = "aup-surface-fallback";
    el.innerHTML = '<span style="font-size:1.2em">\\\\u26a0</span> '
      + '<strong>' + _escapeHtml(String(node.type)) + '</strong>'
      + ' (not supported on this surface)';
    return el;
  }

  function renderAupSurface(node) {
    var el = document.createElement("div");
    el.className = "aup-surface";
    var p = node.props || {};
    var src = node.src || p.url || p.src || "";
    var showStatus = p.showStatus !== false;

    // Sizing modes: "fixed" (default if height set) — scroll internally;
    // "fit" — auto-size to content within min/maxHeight range
    var sizing = p.sizing || (p.height ? "fixed" : "fit");
    if (sizing === "fixed") {
      if (p.height) el.style.height = p.height;
      el.style.overflow = "hidden";
      el.setAttribute("data-aup-surface-sizing", "fixed");
    } else {
      // "fit" mode — content determines height, constrained by min/maxHeight
      el.style.height = "auto";
      el.style.overflow = "visible";
      if (p.minHeight) el.style.minHeight = p.minHeight;
      if (p.maxHeight) { el.style.maxHeight = p.maxHeight; el.style.overflow = "auto"; }
      el.setAttribute("data-aup-surface-sizing", "fit");
    }
    if (p.capabilities && p.capabilities.maxWidth) el.style.maxWidth = p.capabilities.maxWidth;
    // Spatial Intent: sizing (same as view)
    var size = p.size;
    if (size && typeof size === "object") {
      if (typeof size.flex === "number") el.style.flex = String(size.flex);
      if (size.width) el.style.width = size.width;
      if (size.maxWidth) el.style.maxWidth = size.maxWidth;
    }

    // Route 1: WebSocket URL → remote AUP connection
    var wsUrl = _resolveSurfaceUrl(src);
    if (wsUrl) {
      return _renderSurfaceWs(el, node, p, wsUrl, showStatus);
    }

    // Route 2: AFS path → introspect and auto-render
    if (src && src.indexOf("/") === 0 && window.afs) {
      return _renderSurfaceAfs(el, node, p, src, showStatus);
    }

    // No valid source
    var placeholder = document.createElement("div");
    placeholder.className = "aup-surface-fallback";
    placeholder.innerHTML = '<span style="font-size:1.2em">\\\\u26a0</span> '
      + '<span>Surface: set <code>src</code> (AFS path) or <code>url</code> (ws://)</span>';
    el.appendChild(placeholder);
    return el;
  }

  // ── Route 1: Remote AUP via WebSocket (existing behavior) ──

  function _renderSurfaceWs(el, node, p, wsUrl, showStatus) {
    // Status indicator
    var statusEl = document.createElement("div");
    statusEl.className = "aup-surface-status";
    if (showStatus) el.appendChild(statusEl);

    // Content container
    var contentEl = document.createElement("div");
    contentEl.className = "aup-surface-content";
    el.appendChild(contentEl);

    // Disconnected message
    var disconnectEl = document.createElement("div");
    disconnectEl.className = "aup-surface-fallback";
    disconnectEl.style.display = "none";
    disconnectEl.textContent = "Surface disconnected";
    el.appendChild(disconnectEl);

    // Capability filter — recursively replaces unsupported nodes before rendering
    var allowedPrimitives = p.capabilities && p.capabilities.primitives;
    function _filterTree(n) {
      if (!n) return n;
      if (allowedPrimitives && n.type && allowedPrimitives.indexOf(n.type) < 0) {
        return {
          id: n.id, type: "view", props: {},
          children: [{ id: (n.id || "x") + "-fb", type: "text",
            props: { content: "\\\\u26a0 " + n.type + " (not supported on this surface)", intent: "info", scale: "sm" } }]
        };
      }
      if (n.children) {
        var fc = [];
        for (var ci = 0; ci < n.children.length; ci++) fc.push(_filterTree(n.children[ci]));
        var copy = {}; for (var k in n) copy[k] = n[k];
        copy.children = fc;
        return copy;
      }
      return n;
    }
    function renderFiltered(n) {
      if (!n || !n.type) return null;
      if (allowedPrimitives) n = _filterTree(n);
      return renderAupNode(n);
    }

    // Store surface WS on the element for event routing
    el.setAttribute("data-aup-surface-id", node.id || ("surface-" + Math.random().toString(36).slice(2)));
    var surfaceWs = null;
    var reconnectTimer = null;
    var reconnectDelay = 1000;
    var destroyed = false;
    var surfaceNodeTree = null;

    function connectSurface() {
      if (destroyed) return;
      try {
        surfaceWs = new WebSocket(wsUrl);
      } catch (ex) {
        statusEl.className = "aup-surface-status error";
        return;
      }
      el._aupSurfaceWs = surfaceWs;

      surfaceWs.onopen = function() {
        statusEl.className = "aup-surface-status connected";
        disconnectEl.style.display = "none";
        reconnectDelay = 1000;
        // Handshake
        var handshake = { type: "join_session" };
        if (allowedPrimitives) {
          handshake.caps = { primitives: allowedPrimitives };
        }
        surfaceWs.send(JSON.stringify(handshake));
        // Always report connection status to server
        _fireAupEvent(node.id, "src:connected", { url: wsUrl });
      };

      surfaceWs.onmessage = function(e) {
        var msg;
        try { msg = JSON.parse(e.data); } catch (_ex) { return; }

        if (msg.type === "aup" && msg.action === "render") {
          surfaceNodeTree = msg.root;
          contentEl.innerHTML = "";
          var rendered = renderFiltered(msg.root);
          if (rendered) {
            contentEl.appendChild(rendered);
            // Trigger animations for surface-rendered content immediately
            var anims = contentEl.querySelectorAll("[data-animate]");
            for (var ai = 0; ai < anims.length; ai++) anims[ai].classList.add("aup-animated");
          }
        } else if (msg.type === "aup" && msg.action === "patch") {
          // Apply patches to surface node tree and re-render affected nodes
          if (surfaceNodeTree && msg.ops) {
            _applySurfacePatches(contentEl, surfaceNodeTree, msg.ops, renderFiltered);
          }
        }
        // Ignore other message types (session, etc.)
      };

      surfaceWs.onclose = function(e) {
        statusEl.className = "aup-surface-status";
        el._aupSurfaceWs = null;
        surfaceWs = null;
	if (e.code >= 4000 || destroyed) return;
	disconnectEl.style.display = "";
	// Always report disconnection to server
	_fireAupEvent(node.id, "src:disconnected", { url: wsUrl });
	// Auto-reconnect with exponential backoff
	reconnectTimer = setTimeout(function() {
	  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
	  connectSurface();
	}, reconnectDelay);
      };

      surfaceWs.onerror = function() {
        statusEl.className = "aup-surface-status error";
      };
    }

    connectSurface();

    // Cleanup on DOM removal
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        for (var j = 0; j < mutations[i].removedNodes.length; j++) {
          if (mutations[i].removedNodes[j] === el || mutations[i].removedNodes[j].contains(el)) {
            destroyed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (surfaceWs) { try { surfaceWs.close(); } catch (_ex) {} }
            el._aupSurfaceWs = null;
            observer.disconnect();
            return;
          }
        }
      }
    });
    if (el.parentNode) {
      observer.observe(el.parentNode, { childList: true, subtree: true });
    } else {
      // Defer until appended
      setTimeout(function() {
        if (el.parentNode) observer.observe(el.parentNode, { childList: true, subtree: true });
      }, 0);
    }

    return el;
  }

  // ── Route 2: AFS path → introspect and auto-render ──

  function _renderSurfaceAfs(el, node, p, src, showStatus) {
    el.setAttribute("data-aup-id", node.id || "");
    el.setAttribute("data-aup-surface-src", src);

    // Capability filter — same as WS surface, replaces unsupported nodes with fallback
    var allowedPrimitives = p.capabilities && p.capabilities.primitives;
    function _filterTreeAfs(n) {
      if (!n) return n;
      if (allowedPrimitives && n.type && allowedPrimitives.indexOf(n.type) < 0) {
        return {
          id: n.id, type: "view", props: {},
          children: [{ id: (n.id || "x") + "-fb", type: "text",
            props: { content: "\\\\u26a0 " + n.type + " (not supported on this surface)", intent: "info", scale: "sm" } }]
        };
      }
      if (n.children) {
        var fc = [];
        for (var ci = 0; ci < n.children.length; ci++) fc.push(_filterTreeAfs(n.children[ci]));
        var copy = {}; for (var k in n) copy[k] = n[k];
        copy.children = fc;
        return copy;
      }
      return n;
    }
    function renderFilteredAfs(n) {
      if (!n || !n.type) return null;
      if (allowedPrimitives) n = _filterTreeAfs(n);
      return renderAupNode(n);
    }

    // Status dot
    var statusEl = document.createElement("div");
    statusEl.className = "aup-surface-status";
    if (showStatus) el.appendChild(statusEl);

    // Navigation breadcrumb (surface-level, above content)
    var breadcrumbEl = document.createElement("div");
    breadcrumbEl.className = "aup-surface-breadcrumb";
    breadcrumbEl.style.display = "none";

    // View selector container (tabs or dropdown for multi-view .aup/)
    var viewSelectorEl = document.createElement("div");
    viewSelectorEl.className = "aup-surface-view-selector";
    viewSelectorEl.style.display = "none";

    // Content container
    var contentEl = document.createElement("div");
    contentEl.className = "aup-surface-content";

    // Sidebar navigation (if p.nav is provided)
    var navItems = p.nav || null;
    var navEl = null;
    if (navItems && navItems.length > 0) {
      var layoutEl = document.createElement("div");
      layoutEl.className = "aup-surface-layout";
      el.appendChild(layoutEl);
      navEl = document.createElement("nav");
      navEl.className = "aup-surface-nav";
      for (var ni = 0; ni < navItems.length; ni++) {
        var navBtn = document.createElement("div");
        navBtn.className = "aup-surface-nav-item";
        navBtn.textContent = navItems[ni].label || navItems[ni].path.split("/").filter(Boolean).pop() || "?";
        navBtn.setAttribute("data-nav-path", navItems[ni].path);
        (function(itemPath) {
          navBtn.onclick = function() {
            navStack = [{ path: itemPath, isLeaf: false }];
            currentSrc = itemPath;
            resolveAndRender(itemPath);
            updateBreadcrumb();
            updateNavActive();
          };
        })(navItems[ni].path);
        navEl.appendChild(navBtn);
      }
      layoutEl.appendChild(navEl);
      var mainEl = document.createElement("div");
      mainEl.className = "aup-surface-main";
      mainEl.appendChild(breadcrumbEl);
      mainEl.appendChild(viewSelectorEl);
      mainEl.appendChild(contentEl);
      layoutEl.appendChild(mainEl);
      el.style.overflow = "hidden";
    } else {
      el.appendChild(breadcrumbEl);
      el.appendChild(viewSelectorEl);
      el.appendChild(contentEl);
    }

    var prefix = node.id || "dev";
    var rootSrc = src;
    var currentSrc = src;
    // Navigation stack: [{path, isLeaf}]
    var navStack = [{ path: src, isLeaf: false }];
    // Track current active view name and all discovered views
    var activeViewName = (node.state && node.state.activeView) || "default";
    var discoveredViews = null;
    // Track in-flight view switch to prevent races
    var viewSwitchSeq = 0;

    function updateBreadcrumb() {
      breadcrumbEl.innerHTML = "";
      if (navStack.length <= 1) {
        breadcrumbEl.style.display = "none";
        return;
      }
      breadcrumbEl.style.display = "";
      for (var i = 0; i < navStack.length; i++) {
        if (i > 0) {
          var sep = document.createElement("span");
          sep.className = "aup-surface-breadcrumb-sep";
          sep.textContent = "/";
          breadcrumbEl.appendChild(sep);
        }
        var seg = document.createElement("span");
        var segPath = navStack[i].path;
        var segName = segPath === rootSrc ? (rootSrc.split("/").filter(Boolean).pop() || "/") : segPath.split("/").filter(Boolean).pop() || "/";
        if (i < navStack.length - 1) {
          seg.className = "aup-surface-breadcrumb-seg";
          seg.textContent = segName;
          (function(targetIdx) {
            seg.onclick = function() { navigateToStack(targetIdx); };
          })(i);
        } else {
          seg.className = "aup-surface-breadcrumb-cur";
          seg.textContent = segName;
        }
        breadcrumbEl.appendChild(seg);
      }
    }

    function navigateToStack(idx) {
      navStack = navStack.slice(0, idx + 1);
      currentSrc = navStack[navStack.length - 1].path;
      resolveAndRender(currentSrc);
      updateBreadcrumb();
      updateNavActive();
    }

    function navigateToPath(path, isLeaf) {
      // Don't navigate above root
      if (path.indexOf(rootSrc) !== 0 && rootSrc.indexOf(path) !== 0) return;
      currentSrc = path;
      navStack.push({ path: path, isLeaf: !!isLeaf });
      resolveAndRender(path);
      updateBreadcrumb();
      updateNavActive();
    }

    function updateNavActive() {
      if (!navEl) return;
      var items = navEl.querySelectorAll(".aup-surface-nav-item");
      for (var i = 0; i < items.length; i++) {
        var itemPath = items[i].getAttribute("data-nav-path");
        if (currentSrc === itemPath || currentSrc.indexOf(itemPath + "/") === 0) {
          items[i].classList.add("active");
        } else {
          items[i].classList.remove("active");
        }
      }
    }

    function resolveAndRender(targetSrc) {
      contentEl.innerHTML = "";
      var loader = document.createElement("div");
      loader.className = "aup-src-loading";
      loader.innerHTML = '<div class="aup-src-loading-bar"></div>';
      contentEl.appendChild(loader);

      window.afs.stat(targetSrc).then(function(statResult) {
        loader.remove();
        statusEl.className = "aup-surface-status connected";
        var entry = statResult || {};
        var meta = entry.meta || {};
        var kind = meta.kind || "";
        var childrenCount = meta.childrenCount;
        var isDir = childrenCount != null && childrenCount >= 0;

        // Priority 1: Check for .aup/ recipe (with multi-view discovery)
        _tryAupRecipe(targetSrc, p).then(function(recipe) {
          if (recipe) {
            // Check for multi-view metadata attached by _discoverAupViews
            var views = recipe._aupViews;
            if (views && views.length > 1) {
              discoveredViews = views;
              _renderViewSelector(viewSelectorEl, views, activeViewName, function(viewName) {
                _switchToView(targetSrc, viewName);
              });
            } else {
              discoveredViews = null;
              viewSelectorEl.style.display = "none";
              viewSelectorEl.innerHTML = "";
            }
            // Clean up internal metadata before rendering
            delete recipe._aupViews;
            // Check if recipe has template bindings — if so, fetch data and bind
            var recipeStr = JSON.stringify(recipe);
            if (recipeStr.indexOf("$" + "{") >= 0) {
              window.afs.read(targetSrc).then(function(data) {
                var _dm = document.documentElement.dataset.designMode === "true";
                var boundRecipe = _surfaceBindDeep(recipe, data || {}, _dm);
                var rendered = renderFilteredAfs(boundRecipe);
                if (rendered) contentEl.appendChild(rendered);
              }).catch(function() {
                var rendered = renderFilteredAfs(recipe);
                if (rendered) contentEl.appendChild(rendered);
              });
            } else {
              var rendered = renderFilteredAfs(recipe);
              if (rendered) contentEl.appendChild(rendered);
            }
          } else if (isDir) {
            discoveredViews = null;
            viewSelectorEl.style.display = "none";
            viewSelectorEl.innerHTML = "";
            _renderSurfaceAsDir(contentEl, el, prefix, targetSrc, p, kind, navigateToPath, renderFilteredAfs);
          } else {
            discoveredViews = null;
            viewSelectorEl.style.display = "none";
            viewSelectorEl.innerHTML = "";
            // Try leaf recipe from parent collection before generic fallback
            _tryLeafRecipe(targetSrc).then(function(leafResult) {
              if (leafResult) {
                var _dm2 = document.documentElement.dataset.designMode === "true";
                var boundRecipe = _surfaceBindDeep(leafResult.recipe, leafResult.data, _dm2);
                var rendered = renderFilteredAfs(boundRecipe);
                if (rendered) contentEl.appendChild(rendered);
              } else {
                _renderSurfaceAsLeaf(contentEl, prefix, targetSrc, meta, renderFilteredAfs);
              }
            });
          }
        });

        // Fire connect event on initial load
        if (targetSrc === rootSrc && node.events && node.events.connect) {
          _fireAupEvent(node.id, "connect", { src: targetSrc, kind: kind });
        }
      }).catch(function(err) {
        loader.remove();
        statusEl.className = "aup-surface-status error";
        var errEl = document.createElement("div");
        errEl.className = "aup-surface-fallback";
        errEl.textContent = "Failed to resolve: " + targetSrc + " (" + (err.message || "error") + ")";
        contentEl.appendChild(errEl);

        if (node.events && node.events.error) {
          _fireAupEvent(node.id, "error", { src: targetSrc, message: err.message });
        }
      });
    }

    /**
     * Switch to a different .aup/ view by name.
     * Loads the recipe from the selected view and re-renders content.
     */
    function _switchToView(targetSrc, viewName) {
      if (!discoveredViews) return;
      var seq = ++viewSwitchSeq;
      activeViewName = viewName;
      // Persist selection in node.state
      if (node.state) node.state.activeView = viewName;
      else node.state = { activeView: viewName };

      // Find the view entry
      var view = null;
      for (var i = 0; i < discoveredViews.length; i++) {
        if (discoveredViews[i].name === viewName) {
          view = discoveredViews[i];
          break;
        }
      }
      if (!view) return;

      // Determine preferred variant
      var preferCompact = false;
      if (p && p.capabilities) {
        var caps = p.capabilities;
        if (caps.maxWidth || (caps.primitives && caps.primitives.length <= 4)) {
          preferCompact = true;
        }
      }
      var variants = preferCompact ? ["compact.json", "default.json"] : ["default.json"];

      contentEl.innerHTML = "";
      var loader = document.createElement("div");
      loader.className = "aup-src-loading";
      loader.innerHTML = '<div class="aup-src-loading-bar"></div>';
      contentEl.appendChild(loader);

      _tryViewVariants(view, variants, 0).then(function(recipe) {
        // Check if a newer switch has been initiated
        if (seq !== viewSwitchSeq) return;
        loader.remove();
        if (recipe) {
          var rendered = renderFilteredAfs(recipe);
          if (rendered) contentEl.appendChild(rendered);
        } else {
          var errEl = document.createElement("div");
          errEl.className = "aup-surface-fallback";
          errEl.textContent = "No recipe found for view: " + viewName;
          contentEl.appendChild(errEl);
        }
      }).catch(function(err) {
        if (seq !== viewSwitchSeq) return;
        loader.remove();
        var errEl = document.createElement("div");
        errEl.className = "aup-surface-fallback";
        errEl.textContent = "Failed to load view: " + viewName + " (" + (err.message || "error") + ")";
        contentEl.appendChild(errEl);
      });

      // Update selector UI (mark active)
      _updateViewSelectorActive(viewSelectorEl, viewName);
    }

    // F4: Bridge aup-list:select events to surface navigation (recipe + dir paths)
    el.addEventListener("aup-list:select", function(evt) {
      var d = evt.detail;
      if (d && d.path) {
        navigateToPath(d.path, true);
        evt.stopPropagation();
      }
    });

    // Initial resolve
    resolveAndRender(src);
    updateNavActive();

    // Live subscription — re-resolve when data changes
    if (window.afs.subscribe) {
      window.afs.subscribe({ type: "afs:write", path: src }, function() {
        resolveAndRender(currentSrc);
      });
    }

    return el;
  }

  // ── AFS rendering strategies ──

  function _renderSurfaceAsDir(contentEl, surfaceEl, prefix, src, props, kind, onNavigate, renderFn) {
    renderFn = renderFn || renderAupNode;
    // Generate an afs-list node and render it inline
    var listNode = {
      id: prefix + "-list",
      type: "afs-list",
      src: src,
      props: {
        layout: "list",
        itemStyle: "row",
        showBreadcrumb: false,
        clickMode: "both"
      }
    };
    // Kind-aware layout hints
    if (kind === "gallery" || kind === "media") {
      listNode.props.layout = "masonry";
      listNode.props.itemStyle = "media";
    } else if (kind === "themes-directory" || kind === "overlay-themes-directory") {
      listNode.props.layout = "grid";
      listNode.props.itemStyle = "card";
    }
    var rendered = renderFn(listNode);
    if (rendered) {
      contentEl.appendChild(rendered);
    }
  }

  function _renderSurfaceAsLeaf(contentEl, prefix, src, meta, renderFn) {
    renderFn = renderFn || renderAupNode;
    window.afs.read(src).then(function(result) {
      var content = result;
      var tree;

      if (typeof content === "string") {
        tree = {
          id: prefix + "-text",
          type: "text",
          props: { content: content, format: "markdown" }
        };
      } else if (content && typeof content === "object") {
        tree = _buildSurfaceDetailView(prefix, content, meta);
      } else {
        tree = {
          id: prefix + "-empty",
          type: "text",
          props: { content: "(empty)", intent: "info" }
        };
      }

      var rendered = renderFn(tree);
      if (rendered) contentEl.appendChild(rendered);
    }).catch(function(err) {
      var errEl = document.createElement("div");
      errEl.className = "aup-surface-fallback";
      errEl.textContent = "Read failed: " + (err.message || "error");
      contentEl.appendChild(errEl);
    });
  }

  function _buildSurfaceDetailView(prefix, obj, meta) {
    var children = [];
    // Title from meta if available
    if (meta && meta.description) {
      children.push({
        id: prefix + "-desc",
        type: "text",
        props: { content: String(meta.description), intent: "info", scale: "sm" }
      });
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = obj[k];
      var valStr = v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
      children.push({
        id: prefix + "-kv-" + i,
        type: "view",
        props: { layout: { direction: "row", gap: "sm" }, mode: "inline" },
        children: [
          { id: prefix + "-k-" + i, type: "text", props: { content: k + ":", intent: "info", scale: "sm" } },
          { id: prefix + "-v-" + i, type: "text", props: { content: valStr, scale: "sm" } }
        ]
      });
    }
    return {
      id: prefix + "-detail",
      type: "view",
      props: { layout: { gap: "xs" }, mode: "card" },
      children: children
    };
  }

  // ── Surface patch helpers ──
  function _applySurfacePatches(contentEl, tree, ops, renderFn) {
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.op === "update") {
        var target = _findSurfaceNode(tree, op.id);
        if (target) {
          if (op.props) target.props = Object.assign(target.props || {}, op.props);
          if (op.state) target.state = Object.assign(target.state || {}, op.state);
          if (op.events !== undefined) target.events = op.events;
        }
        // Re-render the specific node in the DOM
        var domEl = contentEl.querySelector('[data-aup-id="' + op.id + '"]');
        if (domEl && target) {
          var newEl = renderFn(target);
          if (newEl) domEl.replaceWith(newEl);
        }
      } else if (op.op === "create") {
        var parent = _findSurfaceNode(tree, op.parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          var newNode = Object.assign({}, op.node, { id: op.id });
          if (typeof op.index === "number") parent.children.splice(op.index, 0, newNode);
          else parent.children.push(newNode);
        }
        var parentDom = contentEl.querySelector('[data-aup-id="' + op.parentId + '"]');
        var createdNode = _findSurfaceNode(tree, op.id);
        if (parentDom && createdNode) {
          var createdEl = renderFn(createdNode);
          if (createdEl) {
            if (typeof op.index === "number" && parentDom.children[op.index]) {
              parentDom.insertBefore(createdEl, parentDom.children[op.index]);
            } else {
              parentDom.appendChild(createdEl);
            }
          }
        }
      } else if (op.op === "remove") {
        _removeSurfaceNode(tree, op.id);
        var removeDom = contentEl.querySelector('[data-aup-id="' + op.id + '"]');
        if (removeDom) removeDom.remove();
      }
    }
  }

  function _findSurfaceNode(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var found = _findSurfaceNode(node.children[i], id);
        if (found) return found;
      }
    }
    return null;
  }

  function _removeSurfaceNode(root, id) {
    if (!root.children) return;
    for (var i = 0; i < root.children.length; i++) {
      if (root.children[i].id === id) { root.children.splice(i, 1); return; }
      _removeSurfaceNode(root.children[i], id);
    }
  }

  // ── .aup/ view selector ──

  /**
   * Render the view selector (tabs for <=5 views, dropdown for >5).
   * @param container - The view selector container element
   * @param views - Array of { name, path } view entries
   * @param activeView - Currently active view name
   * @param onSwitch - Callback when user selects a different view
   */
  function _renderViewSelector(container, views, activeView, onSwitch) {
    container.innerHTML = "";
    if (!views || views.length <= 1) {
      container.style.display = "none";
      return;
    }
    container.style.display = "";

    // Resolve display labels: try meta.json for each view, fall back to name
    // For now, use directory name directly (meta.json loading is async, done lazily)
    var labels = {};
    for (var i = 0; i < views.length; i++) {
      labels[views[i].name] = _viewDisplayLabel(views[i].name);
    }

    // Determine if the active view exists; if not, pick "default" or first
    var found = false;
    for (var j = 0; j < views.length; j++) {
      if (views[j].name === activeView) { found = true; break; }
    }
    if (!found) {
      // Try "default", then first alphabetically
      activeView = "default";
      found = false;
      for (var k = 0; k < views.length; k++) {
        if (views[k].name === activeView) { found = true; break; }
      }
      if (!found) activeView = views[0].name;
    }

    if (views.length <= 5) {
      // Tab bar mode
      for (var ti = 0; ti < views.length; ti++) {
        var tab = document.createElement("span");
        tab.className = "aup-surface-view-tab" + (views[ti].name === activeView ? " active" : "");
        tab.textContent = labels[views[ti].name] || views[ti].name;
        tab.setAttribute("data-view-name", views[ti].name);
        (function(viewName) {
          tab.onclick = function() {
            if (!tab.classList.contains("active")) onSwitch(viewName);
          };
        })(views[ti].name);
        container.appendChild(tab);
      }
    } else {
      // Dropdown mode
      var select = document.createElement("select");
      select.className = "aup-surface-view-dropdown";
      for (var di = 0; di < views.length; di++) {
        var option = document.createElement("option");
        option.value = views[di].name;
        option.textContent = labels[views[di].name] || views[di].name;
        if (views[di].name === activeView) option.selected = true;
        select.appendChild(option);
      }
      select.onchange = function() {
        onSwitch(select.value);
      };
      container.appendChild(select);
    }

    // Async: try loading meta.json for each view to get better labels
    _loadViewMetaLabels(views, function(updatedLabels) {
      if (!updatedLabels) return;
      var changed = false;
      for (var m in updatedLabels) {
        if (updatedLabels[m] && updatedLabels[m] !== labels[m]) {
          labels[m] = updatedLabels[m];
          changed = true;
        }
      }
      if (changed) {
        // Update displayed labels
        if (views.length <= 5) {
          var tabs = container.querySelectorAll(".aup-surface-view-tab");
          for (var t = 0; t < tabs.length; t++) {
            var vn = tabs[t].getAttribute("data-view-name");
            if (vn && labels[vn]) tabs[t].textContent = labels[vn];
          }
        } else {
          var options = container.querySelectorAll("option");
          for (var o = 0; o < options.length; o++) {
            var ov = options[o].value;
            if (ov && labels[ov]) options[o].textContent = labels[ov];
          }
        }
      }
    });
  }

  /**
   * Generate a human-readable display label from a view directory name.
   */
  function _viewDisplayLabel(name) {
    if (!name) return "";
    // Capitalize first letter, replace hyphens/underscores with spaces
    var label = name.replace(/[-_]/g, " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /**
   * Load meta.json from each view to get display labels.
   * Calls callback with { viewName: label } map, or null if nothing found.
   */
  function _loadViewMetaLabels(views, callback) {
    if (!window.afs || !window.afs.read) { callback(null); return; }
    var results = {};
    var pending = views.length;
    var anyFound = false;

    for (var i = 0; i < views.length; i++) {
      (function(view) {
        var metaPath = view.path + "/meta.json";
        window.afs.read(metaPath).then(function(result) {
          var meta = result;
          if (meta && meta.content !== undefined) meta = meta.content;
          if (typeof meta === "string") {
            try { meta = JSON.parse(meta); } catch(_e) { meta = null; }
          }
          if (meta && typeof meta === "object" && meta.label) {
            results[view.name] = meta.label;
            anyFound = true;
          }
          if (--pending === 0) callback(anyFound ? results : null);
        }).catch(function() {
          if (--pending === 0) callback(anyFound ? results : null);
        });
      })(views[i]);
    }
  }

  /**
   * Update the active state on the view selector (tab bar or dropdown).
   */
  function _updateViewSelectorActive(container, activeViewName) {
    // Tab mode
    var tabs = container.querySelectorAll(".aup-surface-view-tab");
    for (var i = 0; i < tabs.length; i++) {
      var vn = tabs[i].getAttribute("data-view-name");
      if (vn === activeViewName) {
        tabs[i].className = "aup-surface-view-tab active";
      } else {
        tabs[i].className = "aup-surface-view-tab";
      }
    }
    // Dropdown mode
    var select = container.querySelector(".aup-surface-view-dropdown");
    if (select) {
      select.value = activeViewName;
    }
  }

  // ── .aup/ recipe discovery ──

  /**
   * Discover all .aup/ views via list(), then load the best recipe.
   * Returns { recipe, views } where views is the full list of discovered entries.
   * Falls back to probing hardcoded variant filenames if list is unavailable.
   */
  function _tryAupRecipe(src, props) {
    if (!window.afs || !window.afs.read) {
      return Promise.resolve(null);
    }

    // Determine preferred variants based on capabilities
    var preferCompact = false;
    if (props && props.capabilities) {
      var caps = props.capabilities;
      if (caps.maxWidth || (caps.primitives && caps.primitives.length <= 4)) {
        preferCompact = true;
      }
    }

    // Strategy 1: list-based discovery (supports supplementary providers)
    if (window.afs.list) {
      return _discoverAupViews(src, preferCompact);
    }

    // Strategy 2: fallback to probing hardcoded variant filenames
    var variants = preferCompact ? ["compact", "default"] : ["default"];
    return _tryAupVariants(src, variants, 0);
  }

  /**
   * List .aup/ directory to discover all available view entries.
   * Returns the recipe for the best matching view, or null if none found.
   * Stores discovered views on the result for Phase 1 view switching.
   */
  function _discoverAupViews(src, preferCompact) {
    var aupPath = src + "/.aup";
    return window.afs.list(aupPath).then(function(result) {
      // list() returns {data: [...]} — unwrap
      var entries = result && result.data ? result.data : (Array.isArray(result) ? result : null);
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        // No .aup/ entries — fall back to probe-based
        var variants = preferCompact ? ["compact", "default"] : ["default"];
        return _tryAupVariants(src, variants, 0);
      }

      // Separate flat recipe files (.json leaves) from view directories.
      // AFSJSON stores recipes as stringified JSON leaves — they appear as
      // ".aup/default.json" (a file), not ".aup/default/" (a directory).
      var views = [];
      var flatRecipes = []; // { name, path, content? }
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var entryPath = entry.path || "";
        var name = entryPath.split("/").filter(Boolean).pop() || "";
        if (!name) continue;
        var isLeaf = name.indexOf(".json") === name.length - 5;
        var meta = entry.meta || {};
        // Also detect leaves by childrenCount (directories have childrenCount >= 0)
        if (isLeaf || (meta.childrenCount == null && entry.content != null)) {
          flatRecipes.push({ name: name.replace(/\\.json$/, ""), path: entryPath, content: entry.content });
        } else {
          views.push({ name: name, path: entryPath });
        }
      }

      // If we found flat recipe files, try reading them directly
      if (flatRecipes.length > 0 && views.length === 0) {
        // Pure flat structure — pick best recipe by preference order
        var preferred = preferCompact ? ["compact", "default"] : ["default"];
        return _tryFlatRecipes(flatRecipes, preferred, 0);
      }

      if (views.length === 0 && flatRecipes.length === 0) {
        var fallbackVariants = preferCompact ? ["compact", "default"] : ["default"];
        return _tryAupVariants(src, fallbackVariants, 0);
      }

      // Sort views: "default" first, then "compact", then alphabetical
      views.sort(function(a, b) {
        if (a.name === "default") return -1;
        if (b.name === "default") return 1;
        if (a.name === "compact") return preferCompact ? -1 : 1;
        if (b.name === "compact") return preferCompact ? 1 : -1;
        return a.name < b.name ? -1 : 1;
      });

      // Try loading recipe from the best view
      // For each view, try reading {viewPath}/default.json
      return _tryViewRecipes(views, preferCompact ? "compact" : "default", 0).then(function(result) {
        if (result && result.recipe) {
          // Attach views metadata to the recipe for Phase 1 view switching
          result.recipe._aupViews = views;
          return result.recipe;
        }
        return null;
      });
    }).catch(function() {
      // List failed — fall back to probe-based discovery
      var variants = preferCompact ? ["compact", "default"] : ["default"];
      return _tryAupVariants(src, variants, 0);
    });
  }

  /**
   * Try loading a recipe from each discovered view in order.
   * For each view, tries {viewPath}/default.json (and compact.json if preferred).
   */
  function _tryViewRecipes(views, preferredVariant, idx) {
    if (idx >= views.length) return Promise.resolve(null);
    var view = views[idx];

    // For the selected view, try variant files
    var variants = preferredVariant === "compact"
      ? ["compact.json", "default.json"]
      : ["default.json"];

    return _tryViewVariants(view, variants, 0).then(function(recipe) {
      if (recipe) {
        return { recipe: recipe, viewName: view.name };
      }
      return _tryViewRecipes(views, preferredVariant, idx + 1);
    });
  }

  /**
   * Try reading recipe variant files from a specific view directory.
   */
  function _tryViewVariants(view, variants, idx) {
    if (idx >= variants.length) return Promise.resolve(null);
    var recipePath = view.path + "/" + variants[idx];
    return window.afs.read(recipePath).then(function(result) {
      var recipe = result;
      if (recipe && recipe.content !== undefined) {
        recipe = recipe.content;
      }
      if (typeof recipe === "string") {
        try { recipe = JSON.parse(recipe); } catch(_e) { recipe = null; }
      }
      if (recipe && typeof recipe === "object" && recipe.type) {
        return recipe;
      }
      return _tryViewVariants(view, variants, idx + 1);
    }).catch(function() {
      return _tryViewVariants(view, variants, idx + 1);
    });
  }

  /**
   * Legacy fallback: probe specific variant filenames without list().
   */
  function _tryAupVariants(src, variants, idx) {
    if (idx >= variants.length) return Promise.resolve(null);
    var variant = variants[idx];
    var recipePath = src + "/.aup/" + variant + ".json";
    return window.afs.read(recipePath).then(function(result) {
      var recipe = _unwrapRecipe(result);
      if (recipe) return recipe;
      // Flat probe invalid — try directory-based path if variant is a simple name
      if (variant.indexOf("/") === -1) {
        return _tryAupDirVariant(src, variant).then(function(dirRecipe) {
          return dirRecipe || _tryAupVariants(src, variants, idx + 1);
        });
      }
      return _tryAupVariants(src, variants, idx + 1);
    }).catch(function() {
      // Flat probe failed — try directory-based path (supplementary mount)
      if (variant.indexOf("/") === -1) {
        return _tryAupDirVariant(src, variant).then(function(dirRecipe) {
          return dirRecipe || _tryAupVariants(src, variants, idx + 1);
        }).catch(function() {
          return _tryAupVariants(src, variants, idx + 1);
        });
      }
      return _tryAupVariants(src, variants, idx + 1);
    });
  }

  /** Try reading a recipe from a view directory: .aup/{variant}/default.json */
  function _tryAupDirVariant(src, variant) {
    var dirPath = src + "/.aup/" + variant + "/default.json";
    return window.afs.read(dirPath).then(function(result) {
      return _unwrapRecipe(result);
    }).catch(function() {
      return null;
    });
  }

  /** Unwrap and validate a recipe from a read result. */
  function _unwrapRecipe(result) {
    var recipe = result;
    if (recipe && recipe.content !== undefined) {
      recipe = recipe.content;
    }
    if (typeof recipe === "string") {
      try { recipe = JSON.parse(recipe); } catch(_e) { recipe = null; }
    }
    if (recipe && typeof recipe === "object" && recipe.type) {
      return recipe;
    }
    return null;
  }

  /**
   * Try flat recipe files from .aup/ list results.
   * These are leaf entries (e.g. default.json) rather than view directories.
   * Picks the best match from the preferred order, then falls back to first available.
   */
  function _tryFlatRecipes(flatRecipes, preferred, idx) {
    // First try preferred names in order
    if (idx < preferred.length) {
      var target = preferred[idx];
      for (var i = 0; i < flatRecipes.length; i++) {
        if (flatRecipes[i].name === target) {
          return _parseFlatRecipe(flatRecipes[i]).then(function(recipe) {
            if (recipe) return recipe;
            return _tryFlatRecipes(flatRecipes, preferred, idx + 1);
          });
        }
      }
      return _tryFlatRecipes(flatRecipes, preferred, idx + 1);
    }
    // No preferred match — try first available
    if (flatRecipes.length > 0) {
      return _parseFlatRecipe(flatRecipes[0]);
    }
    return Promise.resolve(null);
  }

  /**
   * Parse a flat recipe entry — may have inline content or need a read().
   */
  function _parseFlatRecipe(entry) {
    // If content was included in the list result, use it directly
    if (entry.content != null) {
      var recipe = entry.content;
      if (typeof recipe === "string") {
        try { recipe = JSON.parse(recipe); } catch(_e) { return Promise.resolve(null); }
      }
      if (recipe && typeof recipe === "object" && recipe.type) {
        return Promise.resolve(recipe);
      }
    }
    // Otherwise read the file
    return window.afs.read(entry.path).then(function(result) {
      var r = result;
      if (r && r.content !== undefined) r = r.content;
      if (typeof r === "string") {
        try { r = JSON.parse(r); } catch(_e) { r = null; }
      }
      if (r && typeof r === "object" && r.type) return r;
      return null;
    }).catch(function() { return null; });
  }

  // ── Leaf Recipe Discovery ──

  /**
   * Attempt to find an item recipe in the parent collection's .aup/ directory.
   * Also reads the leaf's data for binding.
   * @returns Promise<{ recipe, data } | null>
   */
  function _tryLeafRecipe(leafPath) {
    var segments = leafPath.split("/").filter(Boolean);
    if (segments.length < 2) return Promise.resolve(null);
    segments.pop();
    var parentPath = "/" + segments.join("/");

    var recipeP = _tryItemRecipe(parentPath);
    var dataP = window.afs.read(leafPath).then(function(result) {
      if (result && typeof result === "object") return result;
      return { content: result };
    }).catch(function() { return null; });

    return Promise.all([recipeP, dataP]).then(function(results) {
      var recipe = results[0];
      var data = results[1];
      if (!recipe || !data) return null;
      return { recipe: recipe, data: data };
    });
  }

  /**
   * Probe parentPath/.aup/ for item recipe.
   * Order: item.json → item/default.json
   */
  function _tryItemRecipe(parentPath) {
    var itemPath = parentPath + "/.aup/item.json";
    return window.afs.read(itemPath).then(function(result) {
      var recipe = result;
      if (recipe && recipe.content !== undefined) recipe = recipe.content;
      if (typeof recipe === "string") {
        try { recipe = JSON.parse(recipe); } catch(_) { recipe = null; }
      }
      if (recipe && typeof recipe === "object" && recipe.type) return recipe;
      return _tryAupVariants(parentPath, ["item/default"], 0);
    }).catch(function() {
      return _tryAupVariants(parentPath, ["item/default"], 0);
    });
  }

  // ── Surface Data Binding Engine ──

  function _surfaceBindField(obj, dotPath) {
    var parts = dotPath.split(".");
    var val = obj;
    for (var i = 0; i < parts.length; i++) {
      if (val == null) return null;
      if (typeof val === "string" && i < parts.length) {
        try { val = JSON.parse(val); } catch(_) { return null; }
      }
      val = val[parts[i]];
    }
    return val;
  }

  function _surfaceBindDeep(node, data, designMode) {
    var bound = JSON.parse(JSON.stringify(node));
    _saveOrigBindings(bound);
    _surfaceReplace(bound, data);
    _applyPlaceholders(bound, designMode);
    return bound;
  }

  function _surfaceReplace(obj, data) {
    for (var k in obj) {
      var v = obj[k];
      if (typeof v === "string" && v.indexOf("$" + "{") >= 0) {
        obj[k] = v.replace(/\\$\\{([^}]+)\\}/g, function(_, expr) {
          var pipeIdx = expr.indexOf("|");
          var fp = pipeIdx >= 0 ? expr.slice(0, pipeIdx) : expr;
          var fmt = pipeIdx >= 0 ? expr.slice(pipeIdx + 1) : null;
          var raw = _surfaceBindField(data, fp);
          if (raw == null) return "";
          return fmt ? _formatCell(raw, fmt) : String(raw);
        });
      } else if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          if (typeof v[i] === "string" && v[i].indexOf("$" + "{") >= 0) {
            v[i] = v[i].replace(/\\$\\{([^}]+)\\}/g, function(_, expr) {
              var pipeIdx = expr.indexOf("|");
              var fp = pipeIdx >= 0 ? expr.slice(0, pipeIdx) : expr;
              var fmt = pipeIdx >= 0 ? expr.slice(pipeIdx + 1) : null;
              var raw = _surfaceBindField(data, fp);
              if (raw == null) return "";
              return fmt ? _formatCell(raw, fmt) : String(raw);
            });
          } else if (v[i] && typeof v[i] === "object") {
            _surfaceReplace(v[i], data);
          }
        }
      } else if (v && typeof v === "object") {
        _surfaceReplace(v, data);
      }
    }
  }
`;
