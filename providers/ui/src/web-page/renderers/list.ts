export const LIST_JS = `
  // ── AFS List Primitive ──
  // Universal data view bound to AFS paths.
  // Two orthogonal dimensions: layout (how items arrange) × itemStyle (how each renders).
  // Pipeline: fetch → filter → sort → transform → render.

  // ── Kind Rendering Strategies ──
  var _listKindStrategies = {
    "fs:directory": function(entry) {
      var name = (entry.path || entry.id || "").split("/").filter(Boolean).pop() || entry.id || "";
      return {
        icon: "folder",
        label: name,
        badge: entry.meta && entry.meta.childrenCount >= 0 ? String(entry.meta.childrenCount) : null,
        description: null,
        image: null,
        cssClass: "aup-list-dir"
      };
    },
    "fs:file": function(entry) {
      var name = (entry.path || entry.id || "").split("/").filter(Boolean).pop() || entry.id || "";
      var ext = name.split(".").pop() || "";
      var iconMap = { ts: "code", js: "code", tsx: "code", jsx: "code", md: "scroll", json: "code", yaml: "code", yml: "code", png: "image", jpg: "image", svg: "image", css: "code", html: "code" };
      return {
        icon: iconMap[ext] || "edit",
        label: name,
        badge: entry.meta && entry.meta.size ? _listFormatSize(entry.meta.size) : null,
        description: entry.meta && entry.meta.mimeType ? entry.meta.mimeType : null,
        image: null,
        cssClass: "aup-list-file"
      };
    },
    "ts:task-group": function(entry) {
      var count = entry.meta && entry.meta.childrenCount;
      return {
        icon: "grid",
        label: entry.id,
        badge: count != null && count >= 0 ? String(count) : null,
        description: null,
        image: null,
        cssClass: "aup-list-group aup-list-group--" + (entry.id || "").replace(/[^a-z0-9]/gi, "-")
      };
    },
    "ts:task": function(entry) {
      var c = entry.content || {};
      var status = c.status || "";
      var parts = [];
      if (c.phase) parts.push(c.phase);
      if (c.assignee && c.assignee !== "null") parts.push(c.assignee);
      return {
        icon: status === "done" ? "check" : status === "in_progress" ? "play" : status === "review" ? "search" : status === "blocked" ? "x" : "clock",
        label: entry.id,
        badge: status || null,
        description: parts.length > 0 ? parts.join(" \\u00b7 ") : null,
        image: null,
        cssClass: "aup-list-task aup-list-task--" + (status || "unknown")
      };
    },
    "ts:queue-item": function(entry) {
      var c = entry.content || {};
      return {
        icon: "clock",
        label: c.taskPath || entry.id,
        badge: c.role || null,
        description: c.addedAt ? "Added " + c.addedAt : null,
        image: null,
        cssClass: "aup-list-queue"
      };
    },
    "ts:intent-group": function(entry) {
      var count = entry.meta && entry.meta.childrenCount;
      return {
        icon: "layers",
        label: entry.id,
        badge: count != null && count >= 0 ? String(count) : null,
        description: null,
        image: null,
        cssClass: "aup-list-group"
      };
    },
    "ts:daemon": function(entry) {
      var c = entry.content || {};
      return {
        icon: "cpu",
        label: "Daemon",
        badge: c.version || null,
        description: c.pid ? "PID " + c.pid + " \\u00b7 port " + c.port : null,
        image: null,
        cssClass: "aup-list-daemon"
      };
    },
    "_default": function(entry) {
      var isDir = _listIsDirectory(entry);
      var desc = entry.meta && entry.meta.description;
      var name = (entry.path || entry.id || "").split("/").filter(Boolean).pop() || entry.id || "";
      return {
        icon: isDir ? "folder" : "edit",
        label: name,
        badge: isDir && entry.meta.childrenCount >= 0 ? String(entry.meta.childrenCount) : null,
        description: desc ? String(desc).slice(0, 100) : null,
        image: null,
        cssClass: isDir ? "aup-list-dir" : "aup-list-item"
      };
    }
  };

  function _listResolveStrategy(entry) {
    var kind = (entry.meta && entry.meta.kind) || "";
    if (_listKindStrategies[kind]) return _listKindStrategies[kind](entry);
    var parts = kind.split(":");
    if (parts.length > 1) {
      var withSeg = parts[0] + ":" + kind.split(":")[1].split("-")[0];
      if (_listKindStrategies[withSeg]) return _listKindStrategies[withSeg](entry);
    }
    return _listKindStrategies._default(entry);
  }

  function _listResolveField(obj, dotPath, raw) {
    if (!dotPath) return null;
    var parts = dotPath.split(".");
    var val = obj;
    for (var i = 0; i < parts.length; i++) {
      if (val == null) return null;
      val = val[parts[i]];
    }
    if (val == null) return null;
    return raw ? val : String(val);
  }

  function _listIsDirectory(entry) {
    if (!entry.meta) return false;
    var cc = entry.meta.childrenCount;
    return cc != null;
  }

  function _listFormatSize(bytes) {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function _listMakeIcon(name) {
    if (!name || !_ICON_PATHS[name]) return null;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.classList.add("aup-icon-svg");
    svg.innerHTML = _ICON_PATHS[name];
    return svg;
  }

  // ── Filter/Sort/Transform helpers ──
  function _listApplyFilter(entries, filter) {
    if (!filter) return entries;
    if (typeof filter === "string") {
      var q = filter.toLowerCase();
      return entries.filter(function(e) {
        return (e.id || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filter.kind) {
      var kindFilter = filter.kind;
      return entries.filter(function(e) {
        var k = (e.meta && e.meta.kind) || "";
        return k === kindFilter || k.indexOf(kindFilter) === 0;
      });
    }
    if (filter.field && filter.match != null) {
      return entries.filter(function(e) {
        var val = _listResolveField(e, filter.field);
        if (typeof filter.match === "string") return val === filter.match;
        return val != null;
      });
    }
    if (filter.exclude) {
      var excl = Array.isArray(filter.exclude) ? filter.exclude : [filter.exclude];
      return entries.filter(function(e) {
        return excl.indexOf(e.id) < 0;
      });
    }
    return entries;
  }

  function _listApplySort(entries, sort) {
    if (!sort) return entries;
    var field = typeof sort === "string" ? sort : sort.field || "id";
    var desc = sort.desc === true;
    return entries.slice().sort(function(a, b) {
      var va = _listResolveField(a, field, true);
      var vb = _listResolveField(b, field, true);
      if (va == null) va = "";
      if (vb == null) vb = "";
      var cmp;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        va = String(va); vb = String(vb);
        cmp = va < vb ? -1 : va > vb ? 1 : 0;
      }
      return desc ? -cmp : cmp;
    });
  }

  function _listApplyTransform(entries, transform) {
    if (!transform) return entries;
    return entries.map(function(e) {
      var t = Object.assign({}, e);
      if (!t._transform) t._transform = {};
      if (transform.label) t._transform.label = _listResolveField(e, transform.label);
      if (transform.description) t._transform.description = _listResolveField(e, transform.description);
      if (transform.badge) t._transform.badge = _listResolveField(e, transform.badge);
      if (transform.icon) t._transform.icon = transform.icon;
      if (transform.image) t._transform.image = _listResolveField(e, transform.image);
      return t;
    });
  }

  function renderAupList(node) {
    var el = document.createElement("div");
    el.className = "aup-list";
    var p = node.props || {};

    // ── Two orthogonal dimensions ──
    // layout: how items are arranged in space
    // itemStyle: how each individual item renders
    var layout = p.layout || p.variant || "list";
    // Backward compat: variant "flat" → layout "list", "grouped" → "list" with grouped behavior
    if (layout === "flat") layout = "list";
    var isGrouped = layout === "grouped" || (p.variant === "grouped");
    if (isGrouped) layout = "list";

    var itemStyle = p.itemStyle || "row";
    var clickMode = p.clickMode || "select";
    var labelField = p.labelField || "id";
    var descField = p.descriptionField != null ? p.descriptionField : "meta.description";
    var emptyText = p.emptyText || "No items";
    var showBreadcrumb = p.showBreadcrumb !== false;
    var kindIconOverrides = p.kindIcons || {};
    var maxDepth = typeof p.maxDepth === "number" ? p.maxDepth : 3;
    var fields = p.fields || null;
    var filter = p.filter || null;
    var sort = p.sort || null;
    var transform = p.transform || null;
    var columns = p.columns || null;
    var gridCols = p.gridCols || null;
    var minItemWidth = p.minItemWidth || null;
    var imageFit = p.imageFit || "cover";      // cover (aspect-fill) | contain (aspect-fit) | fill
    var imageHeight = p.imageHeight || null;    // e.g. "200px", "50%", number (px)
    var imageShape = p.imageShape || "rect";   // rect (default) | circle (avatar-friendly)
    var pageSize = typeof p.pageSize === "number" && p.pageSize > 0 ? p.pageSize : 0;
    var pagination = p.pagination || "auto"; // "auto" (infinite scroll) | "none" (single page, no more loading)
    var _virtual = !!p.virtual;
    var _estimatedHeight = typeof p.estimatedItemHeight === "number" ? p.estimatedItemHeight : 48;
    var _bufferItems = typeof p.bufferItems === "number" ? p.bufferItems : 5;

    el.setAttribute("data-layout", layout);
    el.setAttribute("data-item-style", itemStyle);
    if (isGrouped) el.setAttribute("data-grouped", "true");

    // Self-sizing grid: set CSS variables for grid-template-columns
    if (layout === "grid" || layout === "masonry") {
      if (gridCols) {
        el.style.setProperty("--list-cols", String(gridCols));
      } else if (minItemWidth) {
        el.style.setProperty("--list-min-width", minItemWidth);
        el.setAttribute("data-auto-fill", "true");
      }
    }

    // ── Internal State ──
    var _currentPath = node.src || "";
    var _pathStack = [_currentPath];
    var _entries = [];
    var _expanded = {};
    var _childCache = {};
    var _selectedId = (node.state && node.state.selected) || null;
    var _unsubscribe = null;
    var _total = 0;
    var _loadedCount = 0;
    var _loadingMore = false;
    var _filterQuery = "";
    var _slideIndex = 0;
    var _itemHeights = [];
    var _virtualRenderedRange = null;
    var _srcRoot = node.src || "";

    // Build the full AFS path for an entry.
    // Prefer entry.path (full mount-aware path from AFS core) when available.
    // Fall back to constructing from entry.id + parent for legacy providers.
    function _buildEntryPath(entry, parentPath) {
      if (entry.path) return entry.path;
      var eid = entry.id || "";
      if (eid.charAt(0) === "/") {
        // Absolute provider path — join with src root
        return _srcRoot + eid;
      }
      // Relative id — join with parent
      return parentPath + (parentPath.endsWith("/") ? "" : "/") + eid;
    }

    // ── Template Detection ──
    var _itemTemplate = null;
    var _headerTemplate = null;
    var _emptyTemplate = null;
    if (node.children && node.children.length) {
      for (var ci = 0; ci < node.children.length; ci++) {
        var ch = node.children[ci];
        var chRole = ch.props && ch.props.role;
        if (chRole === "item") _itemTemplate = ch;
        else if (chRole === "header") _headerTemplate = ch;
        else if (chRole === "empty") _emptyTemplate = ch;
      }
    }

    // ── Content Auto-Read Detection ──
    // When fields or templates reference entry.content.*, entries from
    // list() may lack a content field (e.g. AFSFS).  Detect this early
    // so fetchPage can batch-read content before rendering.
    var _needsContent = false;
    if (fields) {
      for (var fk in fields) {
        if (typeof fields[fk] === "string" && fields[fk].indexOf("content") === 0) {
          _needsContent = true;
          break;
        }
      }
    }
    if (!_needsContent && _itemTemplate) {
      var _tplStr = JSON.stringify(_itemTemplate);
      if (_tplStr.indexOf("entry.content.") >= 0) {
        _needsContent = true;
      }
    }

    function _enrichEntriesWithContent(entries, parentPath) {
      if (!_needsContent || !entries.length) return Promise.resolve(entries);
      var promises = entries.map(function(entry) {
        if (entry.content != null) return Promise.resolve();
        var entryPath = entry.path || _buildEntryPath(entry, parentPath);
        return window.afs.read(entryPath).then(function(result) {
          var r = result;
          if (r && r.content !== undefined) r = r.content;
          if (typeof r === "string") {
            try { r = JSON.parse(r); } catch(_) {}
          }
          entry.content = r;
        }).catch(function() {});
      });
      return Promise.all(promises).then(function() { return entries; });
    }

    // ── Template Binding ──
    function _bindFieldPath(entry, dotPath) {
      var parts = dotPath.split(".");
      var val = entry;
      for (var bi = 0; bi < parts.length; bi++) {
        if (val == null) return null;
        // Auto-parse JSON strings when more path parts remain
        if (typeof val === "string" && bi < parts.length) {
          try { val = JSON.parse(val); } catch(_) { return null; }
        }
        val = val[parts[bi]];
      }
      return val;  // return raw value — let caller handle formatting
    }

    function _bindStringsDeep(obj, entry) {
      for (var bk in obj) {
        var bv = obj[bk];
        if (typeof bv === "string") {
          obj[bk] = bv.replace(/\\$\\{entry\\.([^}]+)\\}/g, function(_, expr) {
            var pipeIdx = expr.indexOf("|");
            var fp = pipeIdx >= 0 ? expr.slice(0, pipeIdx) : expr;
            var fmt = pipeIdx >= 0 ? expr.slice(pipeIdx + 1) : null;
            var raw = _bindFieldPath(entry, fp);
            if (raw == null) return "";
            return fmt ? _formatCell(raw, fmt) : String(raw);
          });
        } else if (Array.isArray(bv)) {
          for (var ai = 0; ai < bv.length; ai++) {
            if (bv[ai] && typeof bv[ai] === "object") {
              _bindStringsDeep(bv[ai], entry);
            }
          }
        } else if (bv && typeof bv === "object") {
          _bindStringsDeep(bv, entry);
        }
      }
    }

    function _bindTemplate(tplNode, entry) {
      var bound = JSON.parse(JSON.stringify(tplNode));
      _saveOrigBindings(bound);
      _bindStringsDeep(bound, entry);
      var _dm = document.documentElement.dataset.designMode === "true";
      _applyPlaceholders(bound, _dm);
      bound.id = tplNode.id + "--" + entry.id;
      return bound;
    }

    // ── DOM Structure ──

    // Search bar
    var searchEl = null;
    if (p.searchable) {
      searchEl = document.createElement("div");
      searchEl.className = "aup-list-search";
      var searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = p.searchPlaceholder || "Search...";
      searchInput.className = "aup-list-search-input";
      searchInput.oninput = function() {
        _filterQuery = searchInput.value;
        renderEntries();
      };
      searchEl.appendChild(searchInput);
      el.appendChild(searchEl);
    }

    // Breadcrumb
    var breadcrumbEl = null;
    if (showBreadcrumb && (clickMode === "navigate" || clickMode === "both")) {
      breadcrumbEl = document.createElement("div");
      breadcrumbEl.className = "aup-list-breadcrumb";
      el.appendChild(breadcrumbEl);
    }

    var loadingEl = document.createElement("div");
    loadingEl.className = "aup-list-loading";
    loadingEl.textContent = "Loading...";
    el.appendChild(loadingEl);

    var bodyEl = document.createElement("div");
    bodyEl.className = "aup-list-body";
    if (gridCols) bodyEl.style.setProperty("--list-cols", String(gridCols));
    bodyEl.setAttribute("tabindex", "0");
    el.setAttribute("tabindex", "-1"); // Fallback focus target (empty dirs)
    el.appendChild(bodyEl);

    // ── Keyboard Navigation (Finder-style) ──
    // Use document-level listener scoped to this list instance.
    // This ensures keyboard nav works even in empty directories where
    // neither bodyEl nor el can reliably receive focus.
    var _kbActive = false; // true when this list instance "owns" keyboard
    var _kbNavigating = false; // suppress focusout during navigation
    el.addEventListener("focusin", function() { _kbActive = true; });
    el.addEventListener("focusout", function(e) {
      // Don't deactivate during navigation (bodyEl gets hidden, triggering focusout)
      if (_kbNavigating) return;
      // Only deactivate if focus moved outside this list
      if (!el.contains(e.relatedTarget)) _kbActive = false;
    });
    // Also activate on click anywhere in the list (covers empty dirs)
    el.addEventListener("click", function() { _kbActive = true; });
    document.addEventListener("keydown", function(e) {
      if (!_kbActive) return;
      // Guard: don't handle when focus is in an input element
      var ae = document.activeElement;
      if (ae) {
        var tag = ae.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (ae.getAttribute && ae.getAttribute("contenteditable")) return;
      }

      // ArrowLeft / Backspace work even in empty directories
      if (e.key === "ArrowLeft" || e.key === "Backspace") {
        if (_pathStack.length > 1) {
          e.preventDefault();
          navigateTo(_pathStack[_pathStack.length - 2], _pathStack.length - 2);
        }
        return;
      }
      if (e.key === "Escape") {
        if (searchInput && ae === searchInput) {
          searchInput.blur();
          bodyEl.focus();
          e.preventDefault();
        }
        return;
      }

      var processed = processPipeline(_entries);
      if (processed.length === 0) return;

      // Find current selected index
      var curIdx = -1;
      if (_selectedId != null) {
        for (var i = 0; i < processed.length; i++) {
          if (processed[i].id === _selectedId) { curIdx = i; break; }
        }
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        var nextIdx = curIdx < processed.length - 1 ? curIdx + 1 : curIdx;
        if (curIdx === -1) nextIdx = 0; // Nothing selected → select first
        _kbHighlight(processed[nextIdx]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        var prevIdx = curIdx > 0 ? curIdx - 1 : 0;
        if (curIdx === -1) prevIdx = 0;
        _kbHighlight(processed[prevIdx]);
      } else if (e.key === "Enter" && _selectedId === ".." && _pathStack.length > 1) {
        e.preventDefault();
        navigateTo(_pathStack[_pathStack.length - 2], _pathStack.length - 2);
      } else if (e.key === "Enter" && curIdx >= 0) {
        e.preventDefault();
        var entry = processed[curIdx];
        var entryPath = _buildEntryPath(entry, _currentPath);
        var isDir = _listIsDirectory(entry);
        if ((clickMode === "navigate" || clickMode === "both") && isDir) {
          navigateTo(entryPath + "/", _pathStack.length);
          emitEvent("navigate", { path: entryPath, id: entry.id, meta: entry.meta || {}, previousPath: _currentPath });
        } else {
          emitEvent("select", { path: entryPath, id: entry.id, meta: entry.meta || {}, content: entry.content || {} });
        }
      } else if (e.key === "ArrowRight" && curIdx >= 0) {
        // → = enter directory (like Finder)
        var rEntry = processed[curIdx];
        var rPath = _buildEntryPath(rEntry, _currentPath);
        if (_listIsDirectory(rEntry) && (clickMode === "navigate" || clickMode === "both")) {
          e.preventDefault();
          navigateTo(rPath + "/", _pathStack.length);
          emitEvent("navigate", { path: rPath, id: rEntry.id, meta: rEntry.meta || {}, previousPath: _currentPath });
        }
      }
      // ArrowLeft, Backspace, Escape handled above (before empty-list guard)
    });

    // Keyboard highlight: swap data-selected attribute (no full re-render).
    // Emits "select" event with debounce so the server updates the preview panel
    // only after the user stops arrowing (avoids per-keystroke afs.read).
    var _kbDebounceTimer = null;
    function _kbHighlight(entry) {
      if (!entry) return;
      _selectedId = entry.id;
      // Swap data-selected attribute without full re-render
      var prev = bodyEl.querySelector("[data-selected]");
      if (prev) prev.removeAttribute("data-selected");
      // Find target by matching data-entry-id (set during render)
      var target = bodyEl.querySelector('[data-entry-id="' + CSS.escape(entry.id) + '"]');
      if (target) {
        target.setAttribute("data-selected", "true");
        target.scrollIntoView({ block: "nearest" });
      } else {
        // Fallback: full re-render if DOM lookup fails (e.g., virtual scroll)
        renderEntries();
        var sel = bodyEl.querySelector("[data-selected]");
        if (sel) sel.scrollIntoView({ block: "nearest" });
      }
      // Debounced select event — fires 150ms after last arrow key
      if (_kbDebounceTimer) clearTimeout(_kbDebounceTimer);
      var dEntry = entry;
      _kbDebounceTimer = setTimeout(function() {
        _kbDebounceTimer = null;
        var dPath = _buildEntryPath(dEntry, _currentPath);
        emitEvent("select", { path: dPath, id: dEntry.id, meta: dEntry.meta || {}, content: dEntry.content || {} });
      }, 150);
    }

    // Slideshow controls
    var slideshowNav = null;
    if (layout === "slideshow") {
      slideshowNav = document.createElement("div");
      slideshowNav.className = "aup-list-slideshow-nav";
      var prevBtn = document.createElement("button");
      prevBtn.className = "aup-list-slide-btn";
      prevBtn.textContent = "\\u25C0";
      prevBtn.onclick = function() { slideTo(_slideIndex - 1); };
      var nextBtn = document.createElement("button");
      nextBtn.className = "aup-list-slide-btn";
      nextBtn.textContent = "\\u25B6";
      nextBtn.onclick = function() { slideTo(_slideIndex + 1); };
      var slideCounter = document.createElement("span");
      slideCounter.className = "aup-list-slide-counter";
      slideshowNav.appendChild(prevBtn);
      slideshowNav.appendChild(slideCounter);
      slideshowNav.appendChild(nextBtn);
      el.appendChild(slideshowNav);
    }

    // ── Fields → Transform mapping ──
    // Semantic slot names → internal _transform keys
    // Agent writes: fields: { title: "content.name", image: "content.src" }
    // Internally: _transform.label = resolve("content.name"), _transform.image = resolve("content.src")
    var _fieldsSlotMap = {
      title: "label",
      subtitle: "description",
      image: "image",
      badge: "badge",
      icon: "icon",
      alt: "alt",
      footer: "footer"
    };

    function _listApplyFields(entries, fieldsSpec) {
      if (!fieldsSpec) return entries;
      return entries.map(function(e) {
        var t = Object.assign({}, e);
        if (!t._transform) t._transform = {};
        for (var slot in fieldsSpec) {
          var internalKey = _fieldsSlotMap[slot] || slot;
          var dotPath = fieldsSpec[slot];
          if (internalKey === "icon") {
            // Resolve dot-path to get icon name from entry data
            var iconVal = _bindFieldPath(e, dotPath);
            if (iconVal != null) t._transform.icon = iconVal;
          } else {
            // Use _bindFieldPath which auto-parses JSON strings in content
            var resolved = _bindFieldPath(e, dotPath);
            if (resolved != null) t._transform[internalKey] = resolved;
          }
        }
        return t;
      });
    }

    // ── Pipeline ──
    function processPipeline(entries) {
      var result = entries;
      result = _listApplyFilter(result, filter);
      if (_filterQuery) result = _listApplyFilter(result, _filterQuery);
      result = _listApplySort(result, sort);
      result = _listApplyTransform(result, transform);
      // fields overrides transform (more specific, agent-friendly API)
      result = _listApplyFields(result, fields);
      return result;
    }

    // ── Breadcrumb ──
    function renderBreadcrumb() {
      if (!breadcrumbEl) return;
      breadcrumbEl.innerHTML = "";
      for (var i = 0; i < _pathStack.length; i++) {
        if (i > 0) {
          var sep = document.createElement("span");
          sep.className = "aup-list-breadcrumb-sep";
          sep.textContent = " / ";
          breadcrumbEl.appendChild(sep);
        }
        var seg = document.createElement("span");
        var segPath = _pathStack[i];
        var segName = segPath.split("/").filter(Boolean).pop() || "/";
        if (i < _pathStack.length - 1) {
          seg.className = "aup-list-breadcrumb-seg";
          seg.textContent = segName;
          (function(targetPath, targetIdx) {
            seg.onclick = function() { navigateTo(targetPath, targetIdx); };
          })(segPath, i);
        } else {
          seg.className = "aup-list-breadcrumb-cur";
          seg.textContent = segName;
        }
        breadcrumbEl.appendChild(seg);
      }
    }

    // ── Item Style Renderers ──
    // Each returns a DOM element for one entry.

    function renderItemRow(entry, strategy, t) {
      var row = document.createElement("div");
      row.className = "aup-list-row " + (strategy.cssClass || "");

      var iconName = t.icon || kindIconOverrides[(entry.meta && entry.meta.kind) || ""] || strategy.icon;
      var iconWrap = document.createElement("span");
      iconWrap.className = "aup-list-icon";
      var svgIcon = _listMakeIcon(iconName);
      if (svgIcon) iconWrap.appendChild(svgIcon);
      row.appendChild(iconWrap);

      var textWrap = document.createElement("div");
      textWrap.className = "aup-list-text";
      var labelText = t.label || strategy.label || _listResolveField(entry, labelField) || entry.id || "";
      var label = document.createElement("div");
      label.className = "aup-list-label";
      label.textContent = labelText;
      textWrap.appendChild(label);
      var desc = t.description || (descField ? _listResolveField(entry, descField) : null) || strategy.description || null;
      if (desc) {
        var descEl = document.createElement("div");
        descEl.className = "aup-list-desc";
        descEl.textContent = desc;
        textWrap.appendChild(descEl);
      }
      row.appendChild(textWrap);

      var badgeText = t.badge || strategy.badge;
      if (badgeText) {
        var badge = document.createElement("span");
        badge.className = "aup-list-badge";
        badge.textContent = badgeText;
        row.appendChild(badge);
      }
      return row;
    }

    function renderItemCard(entry, strategy, t) {
      var card = document.createElement("div");
      card.className = "aup-list-card " + (strategy.cssClass || "");

      var imgSrc = t.image || strategy.image;
      if (imgSrc) {
        if (imageShape === "circle") {
          var imgWrap = document.createElement("div");
          imgWrap.className = "aup-list-card-avatar-area";
          var imgEl = document.createElement("div");
          imgEl.className = "aup-list-card-avatar";
          imgEl.style.backgroundImage = "url(" + _escapeHtml(imgSrc) + ")";
          if (t.alt) imgEl.setAttribute("role", "img");
          if (t.alt) imgEl.setAttribute("aria-label", t.alt);
          imgWrap.appendChild(imgEl);
          card.appendChild(imgWrap);
        } else {
          var img = document.createElement("div");
          img.className = "aup-list-card-image";
          img.style.backgroundImage = "url(" + _escapeHtml(imgSrc) + ")";
          img.style.backgroundSize = imageFit;
          if (imageHeight) img.style.height = typeof imageHeight === "number" ? imageHeight + "px" : imageHeight;
          if (t.alt) img.setAttribute("role", "img");
          if (t.alt) img.setAttribute("aria-label", t.alt);
          card.appendChild(img);
        }
      } else {
        var iconName = t.icon || kindIconOverrides[(entry.meta && entry.meta.kind) || ""] || strategy.icon;
        var iconArea = document.createElement("div");
        iconArea.className = "aup-list-card-icon-area";
        var svgIcon = _listMakeIcon(iconName);
        if (svgIcon) iconArea.appendChild(svgIcon);
        card.appendChild(iconArea);
      }

      var body = document.createElement("div");
      body.className = "aup-list-card-body";
      var labelText = t.label || strategy.label || _listResolveField(entry, labelField) || entry.id || "";
      var label = document.createElement("div");
      label.className = "aup-list-card-title";
      label.textContent = labelText;
      body.appendChild(label);
      var desc = t.description || (descField ? _listResolveField(entry, descField) : null) || strategy.description || null;
      if (desc) {
        var descEl = document.createElement("div");
        descEl.className = "aup-list-card-desc";
        descEl.textContent = desc;
        body.appendChild(descEl);
      }
      var badgeText = t.badge || strategy.badge;
      if (badgeText) {
        var badge = document.createElement("span");
        badge.className = "aup-list-badge";
        badge.textContent = badgeText;
        body.appendChild(badge);
      }
      var footerText = t.footer || null;
      if (footerText) {
        var footerEl = document.createElement("div");
        footerEl.className = "aup-list-card-footer";
        footerEl.textContent = footerText;
        body.appendChild(footerEl);
      }
      card.appendChild(body);
      return card;
    }

    function renderItemCompact(entry, strategy, t) {
      var row = document.createElement("div");
      row.className = "aup-list-compact " + (strategy.cssClass || "");
      var iconName = t.icon || kindIconOverrides[(entry.meta && entry.meta.kind) || ""] || strategy.icon;
      var svgIcon = _listMakeIcon(iconName);
      if (svgIcon) {
        var iconWrap = document.createElement("span");
        iconWrap.className = "aup-list-icon";
        iconWrap.appendChild(svgIcon);
        row.appendChild(iconWrap);
      }
      var label = document.createElement("span");
      label.className = "aup-list-label";
      label.textContent = t.label || strategy.label || _listResolveField(entry, labelField) || entry.id || "";
      row.appendChild(label);
      return row;
    }

    function renderItemMedia(entry, strategy, t) {
      var card = document.createElement("div");
      card.className = "aup-list-media " + (strategy.cssClass || "");

      var imgSrc = t.image || strategy.image;
      if (imgSrc) {
        var img = document.createElement("img");
        img.className = "aup-list-media-img";
        img.src = imgSrc;
        img.alt = t.alt || entry.id || "";
        img.loading = "lazy";
        img.style.objectFit = imageFit;
        card.appendChild(img);
      } else {
        var placeholder = document.createElement("div");
        placeholder.className = "aup-list-media-placeholder";
        var svgIcon = _listMakeIcon(t.icon || strategy.icon || "image");
        if (svgIcon) placeholder.appendChild(svgIcon);
        card.appendChild(placeholder);
      }

      var overlay = document.createElement("div");
      overlay.className = "aup-list-media-overlay";
      var labelText = t.label || strategy.label || _listResolveField(entry, labelField) || entry.id || "";
      if (labelText) {
        var label = document.createElement("div");
        label.className = "aup-list-media-title";
        label.textContent = labelText;
        overlay.appendChild(label);
      }
      var subtitleText = t.description || (descField ? _listResolveField(entry, descField) : null) || strategy.description || null;
      if (subtitleText) {
        var subtitle = document.createElement("div");
        subtitle.className = "aup-list-media-subtitle";
        subtitle.textContent = subtitleText;
        overlay.appendChild(subtitle);
      }
      var footerText = t.footer || null;
      if (footerText) {
        var footer = document.createElement("div");
        footer.className = "aup-list-media-footer";
        footer.textContent = footerText;
        overlay.appendChild(footer);
      }
      card.appendChild(overlay);
      return card;
    }

    function renderItemHero(entry, strategy, t) {
      var hero = document.createElement("div");
      hero.className = "aup-list-hero " + (strategy.cssClass || "");

      var imgSrc = t.image || strategy.image;
      if (imgSrc) {
        hero.style.backgroundImage = "url(" + _escapeHtml(imgSrc) + ")";
        hero.style.backgroundSize = imageFit;
      }

      var content = document.createElement("div");
      content.className = "aup-list-hero-content";
      var label = document.createElement("div");
      label.className = "aup-list-hero-title";
      label.textContent = t.label || strategy.label || _listResolveField(entry, labelField) || entry.id || "";
      content.appendChild(label);
      var desc = t.description || (descField ? _listResolveField(entry, descField) : null) || strategy.description || null;
      if (desc) {
        var descEl = document.createElement("div");
        descEl.className = "aup-list-hero-desc";
        descEl.textContent = desc;
        content.appendChild(descEl);
      }
      var footerText = t.footer || null;
      if (footerText) {
        var footerEl = document.createElement("div");
        footerEl.className = "aup-list-hero-footer";
        footerEl.textContent = footerText;
        content.appendChild(footerEl);
      }
      hero.appendChild(content);
      return hero;
    }

    function renderStyledItem(entry, strategy, t) {
      switch (itemStyle) {
        case "card": return renderItemCard(entry, strategy, t);
        case "compact": return renderItemCompact(entry, strategy, t);
        case "media": return renderItemMedia(entry, strategy, t);
        case "hero": return renderItemHero(entry, strategy, t);
        default: return renderItemRow(entry, strategy, t);
      }
    }

    // ── Table Rendering ──
    function renderTable(entries, expandable) {
      var table = document.createElement("table");
      table.className = "aup-list-table";
      var thead = document.createElement("thead");
      var headerRow = document.createElement("tr");
      var cols = columns || [{ key: "id", label: "Name" }];
      if (expandable) {
        var thExpand = document.createElement("th");
        thExpand.style.width = "28px";
        headerRow.appendChild(thExpand);
      }
      for (var ci = 0; ci < cols.length; ci++) {
        var th = document.createElement("th");
        th.textContent = cols[ci].label || cols[ci].key;
        if (cols[ci].width) th.style.width = cols[ci].width;
        if (cols[ci].align) th.style.textAlign = cols[ci].align;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      renderTableRows(entries, tbody, cols, 0, expandable);
      table.appendChild(tbody);
      return table;
    }

    function renderTableRows(entries, tbody, cols, depth, expandable) {
      for (var ri = 0; ri < entries.length; ri++) {
        var entry = entries[ri];
        var tr = document.createElement("tr");
        tr.className = "aup-list-table-row";
        tr.setAttribute("data-depth", String(depth));
        var entryPath = _buildEntryPath(entry, _currentPath);
        var isDir = _listIsDirectory(entry);
        tr.setAttribute("data-entry-id", entry.id);
        if (_selectedId === entry.id) tr.setAttribute("data-selected", "true");

        if (expandable) {
          var tdExp = document.createElement("td");
          tdExp.className = "aup-list-table-expand";
          tdExp.style.paddingLeft = (8 + depth * 16) + "px";
          if (isDir && depth < maxDepth) {
            var chevron = document.createElement("span");
            chevron.className = "aup-list-chevron";
            chevron.textContent = _expanded[entryPath] ? "\\u25BC" : "\\u25B6";
            tdExp.appendChild(chevron);
            (function(ent, ep, d) {
              tdExp.onclick = function(e) {
                e.stopPropagation();
                toggleGroup(ent, ep, d);
              };
            })(entry, entryPath, depth);
          }
          tr.appendChild(tdExp);
        }

        for (var cj = 0; cj < cols.length; cj++) {
          var td = document.createElement("td");
          var rawVal = _listResolveField(entry, cols[cj].key, !!cols[cj].format);
          var cellVal = cols[cj].format
            ? _formatCell(rawVal, cols[cj].format)
            : (rawVal != null ? String(rawVal) : "");
          td.textContent = cellVal;
          if (cols[cj].align) td.style.textAlign = cols[cj].align;
          tr.appendChild(td);
        }

        (function(ent, ep) {
          tr.onclick = function(e) {
            if (e.target.closest && e.target.closest(".aup-list-table-expand")) return;
            _selectedId = ent.id;
            renderEntries();
            emitEvent("select", { path: ep, id: ent.id, meta: ent.meta || {}, content: ent.content || {} });
            bodyEl.focus(); // Enable subsequent keyboard navigation
          };
        })(entry, entryPath);

        tbody.appendChild(tr);

        // Expanded children rows (tree-table)
        if (expandable && isDir && _expanded[entryPath] && _childCache[entryPath]) {
          var childEntries = processPipeline(_childCache[entryPath]);
          renderTableRows(childEntries, tbody, cols, depth + 1, expandable);
        }
      }
    }

    // ── Grouped Item Rendering ──
    function renderGroupedItem(entry, parentPath, parentEl, depth) {
      var strategy = _listResolveStrategy(entry);
      var t = entry._transform || {};
      var isDir = _listIsDirectory(entry);
      var canExpand = isDir && depth < maxDepth;
      var entryPath = _buildEntryPath(entry, parentPath);

      var wrap = document.createElement("div");
      wrap.className = "aup-list-grouped-item";
      wrap.setAttribute("data-depth", String(depth));

      var header = document.createElement("div");
      header.className = "aup-list-row " + (strategy.cssClass || "");
      header.setAttribute("data-kind", (entry.meta && entry.meta.kind) || "");

      if (canExpand) {
        var chevron = document.createElement("span");
        chevron.className = "aup-list-chevron";
        chevron.textContent = _expanded[entryPath] ? "\\u25BC" : "\\u25B6";
        header.appendChild(chevron);
      }

      // Reuse the chosen item style but within the grouped row
      var styledEl = renderStyledItem(entry, strategy, t);
      // Extract inner content from styled element to flatten into header
      while (styledEl.firstChild) header.appendChild(styledEl.firstChild);

      header.setAttribute("data-entry-id", entry.id);
      if (_selectedId === entry.id) header.setAttribute("data-selected", "true");

      header.onclick = function(e) {
        e.stopPropagation();
        if (canExpand) {
          toggleGroup(entry, entryPath, depth);
        } else {
          _selectedId = entry.id;
          renderEntries();
          emitEvent("select", { path: entryPath, id: entry.id, meta: entry.meta || {}, content: entry.content || {} });
        }
        bodyEl.focus();
      };
      if (!canExpand && isDir && (clickMode === "navigate" || clickMode === "both")) {
        header.ondblclick = function(e) {
          e.stopPropagation();
          navigateTo(entryPath + "/", _pathStack.length);
          emitEvent("navigate", { path: entryPath, id: entry.id, meta: entry.meta || {}, previousPath: _currentPath });
        };
      }

      wrap.appendChild(header);

      if (canExpand) {
        var childrenEl = document.createElement("div");
        childrenEl.className = "aup-list-children";
        childrenEl.setAttribute("data-expanded", String(!!_expanded[entryPath]));
        if (_expanded[entryPath] && _childCache[entryPath]) {
          var childEntries = processPipeline(_childCache[entryPath]);
          for (var ci = 0; ci < childEntries.length; ci++) {
            renderGroupedItem(childEntries[ci], entryPath, childrenEl, depth + 1);
          }
        }
        wrap.appendChild(childrenEl);
      }

      parentEl.appendChild(wrap);
    }

    // ── Flat Item Rendering ──
    function renderFlatItem(entry, parentPath, parentEl) {
      var strategy = _listResolveStrategy(entry);
      var t = entry._transform || {};
      var kind = (entry.meta && entry.meta.kind) || "";
      var isDir = _listIsDirectory(entry);
      var entryPath = _buildEntryPath(entry, parentPath);

      var item = renderStyledItem(entry, strategy, t);
      item.setAttribute("data-kind", kind);
      item.setAttribute("data-entry-id", entry.id);
      item.style.cursor = "pointer";
      if (_selectedId === entry.id) item.setAttribute("data-selected", "true");

      // Single click = always select (even folders). Double click = navigate into folder.
      item.onclick = function(e) {
        e.stopPropagation();
        _selectedId = entry.id;
        renderEntries();
        emitEvent("select", { path: entryPath, id: entry.id, meta: entry.meta || {}, content: entry.content || {} });
        bodyEl.focus();
      };
      if (isDir && (clickMode === "navigate" || clickMode === "both")) {
        item.ondblclick = function(e) {
          e.stopPropagation();
          navigateTo(entryPath + "/", _pathStack.length);
          emitEvent("navigate", { path: entryPath, id: entry.id, meta: entry.meta || {}, previousPath: _currentPath });
        };
      }

      parentEl.appendChild(item);
    }

    // ── Slideshow ──
    function slideTo(idx) {
      var items = bodyEl.children;
      if (!items.length) return;
      _slideIndex = Math.max(0, Math.min(idx, items.length - 1));
      for (var i = 0; i < items.length; i++) {
        items[i].style.display = i === _slideIndex ? "" : "none";
      }
      if (slideshowNav) {
        var counter = slideshowNav.querySelector(".aup-list-slide-counter");
        if (counter) counter.textContent = (_slideIndex + 1) + " / " + items.length;
      }
    }

    // ── Virtual Scroll Math ──
    function _vsFindStartIndex(scrollTop) {
      var acc = 0;
      for (var i = 0; i < _entries.length; i++) {
        var h = _itemHeights[i] || _estimatedHeight;
        if (acc + h > scrollTop) return i;
        acc += h;
      }
      return Math.max(0, _entries.length - 1);
    }

    function _vsSumHeights(from, to) {
      var sum = 0;
      for (var i = from; i < to; i++) {
        sum += _itemHeights[i] || _estimatedHeight;
      }
      return sum;
    }

    var _vsTopSpacer = null;
    var _vsBottomSpacer = null;
    var _vsContentEl = null;
    var _vsScrollHandler = null;

    if (_virtual) {
      bodyEl.style.overflow = "auto";
      bodyEl.style.position = "relative";
      _vsTopSpacer = document.createElement("div");
      _vsTopSpacer.className = "aup-list-virtual-spacer";
      _vsBottomSpacer = document.createElement("div");
      _vsBottomSpacer.className = "aup-list-virtual-spacer";
      _vsContentEl = document.createElement("div");
      _vsContentEl.className = "aup-list-virtual-content";

      _vsScrollHandler = function() {
        _renderVirtualRange();
      };
      bodyEl.addEventListener("scroll", _vsScrollHandler);
    }

    function _renderVirtualRange() {
      if (!_virtual || !_vsContentEl) return;
      var processed = processPipeline(_entries);
      if (processed.length === 0) return;

      var scrollTop = bodyEl.scrollTop;
      var viewportH = bodyEl.clientHeight;

      var rawStart = _vsFindStartIndex(scrollTop);
      var rawEnd = rawStart;
      var acc = 0;
      for (var i = rawStart; i < processed.length; i++) {
        acc += _itemHeights[i] || _estimatedHeight;
        rawEnd = i;
        if (acc >= viewportH) break;
      }

      var startIdx = Math.max(0, rawStart - _bufferItems);
      var endIdx = Math.min(processed.length - 1, rawEnd + _bufferItems);

      // Check if range changed
      if (_virtualRenderedRange &&
          _virtualRenderedRange[0] === startIdx &&
          _virtualRenderedRange[1] === endIdx) {
        return;
      }
      _virtualRenderedRange = [startIdx, endIdx];

      // Update spacers
      _vsTopSpacer.style.height = _vsSumHeights(0, startIdx) + "px";
      _vsBottomSpacer.style.height = _vsSumHeights(endIdx + 1, processed.length) + "px";

      // Render visible items
      _vsContentEl.innerHTML = "";
      for (var vi = startIdx; vi <= endIdx; vi++) {
        var vEntry = processed[vi];
        renderFlatItem(vEntry, _currentPath, _vsContentEl);
        // Measure item height after render
        var lastChild = _vsContentEl.lastElementChild;
        if (lastChild) {
          _itemHeights[vi] = lastChild.offsetHeight || _estimatedHeight;
        }
      }

      // Pagination: trigger fetch when near end (skip when pagination="none")
      if (pageSize > 0 && pagination !== "none" && endIdx >= _loadedCount - _bufferItems && _loadedCount < _total && !_loadingMore) {
        fetchPage(_currentPath, _loadedCount, false);
      }
    }

    // ── Main Render ──
    function renderEntries() {
      bodyEl.innerHTML = "";

      // Header template
      if (_headerTemplate && typeof renderAupNode === "function") {
        var headerBound = JSON.parse(JSON.stringify(_headerTemplate));
        headerBound.id = (_headerTemplate.id || "header") + "--header";
        var headerEl = renderAupNode(headerBound);
        if (headerEl) {
          headerEl.classList.add("aup-list-template-header");
          bodyEl.appendChild(headerEl);
        }
      }

      var processed = processPipeline(_entries);
      if (processed.length === 0) {
        // Empty template or default
        if (_emptyTemplate && typeof renderAupNode === "function") {
          var emptyBound = JSON.parse(JSON.stringify(_emptyTemplate));
          emptyBound.id = (_emptyTemplate.id || "empty") + "--empty";
          var emptyNodeEl = renderAupNode(emptyBound);
          if (emptyNodeEl) {
            emptyNodeEl.classList.add("aup-list-template-empty");
            bodyEl.appendChild(emptyNodeEl);
          }
        } else {
          var empty = document.createElement("div");
          empty.className = "aup-list-empty";
          empty.textContent = _filterQuery ? "No matches" : emptyText;
          bodyEl.appendChild(empty);
        }
        if (slideshowNav) slideshowNav.style.display = "none";
        return;
      }

      // Virtual scroll mode
      if (_virtual && _vsTopSpacer && _vsBottomSpacer && _vsContentEl) {
        bodyEl.appendChild(_vsTopSpacer);
        bodyEl.appendChild(_vsContentEl);
        bodyEl.appendChild(_vsBottomSpacer);
        _virtualRenderedRange = null;
        _renderVirtualRange();
        return;
      }

      // Three-layer template resolution: role="item" > kind registry > built-in
      // _resolveTemplate returns a template node or null (null = use built-in)
      function _resolveTemplate(entry) {
        // Priority 1: explicit role="item" child
        if (_itemTemplate) return _itemTemplate;
        // Priority 2: kind registry
        if (window.aup && window.aup.getKindTemplate) {
          var entryKind = (entry.meta && entry.meta.kind) || "";
          var kindTpl = window.aup.getKindTemplate(entryKind);
          if (kindTpl) return kindTpl;
        }
        // Priority 3: built-in
        return null;
      }

      // Check if ANY entry has a template (to decide render path)
      var _useTemplateMode = false;
      if (typeof renderAupNode === "function") {
        if (_itemTemplate) {
          _useTemplateMode = true;
        } else if (window.aup && window.aup.getKindTemplate) {
          for (var ci = 0; ci < processed.length; ci++) {
            if (_resolveTemplate(processed[ci])) { _useTemplateMode = true; break; }
          }
        }
      }

      if (_useTemplateMode) {
        for (var ti = 0; ti < processed.length; ti++) {
          var tEntry = processed[ti];
          var tpl = _resolveTemplate(tEntry);
          if (tpl) {
            var boundNode = _bindTemplate(tpl, tEntry);
            var tplEl = renderAupNode(boundNode);
            if (tplEl) {
              tplEl.classList.add("aup-list-template-item");
              (function(entry) {
                tplEl.addEventListener("click", function(e) {
                  // Don't swallow clicks on <a> tags — let browser handle navigation
                  var t = e.target;
                  while (t && t !== tplEl) {
                    if (t.tagName === "A") return;
                    t = t.parentElement;
                  }
                  _selectedId = entry.id;
                  emitEvent("select", { path: entry.path, id: entry.id, meta: entry.meta, content: entry.content });
                });
              })(tEntry);
              bodyEl.appendChild(tplEl);
            }
          } else {
            // Fallback to built-in for entries without template
            renderFlatItem(tEntry, _currentPath, bodyEl);
          }
        }
      } else if (layout === "table") {
        bodyEl.appendChild(renderTable(processed, isGrouped));
      } else if (isGrouped) {
        for (var i = 0; i < processed.length; i++) {
          renderGroupedItem(processed[i], _currentPath, bodyEl, 0);
        }
      } else {
        for (var i = 0; i < processed.length; i++) {
          renderFlatItem(processed[i], _currentPath, bodyEl);
        }
      }

      if (layout === "slideshow") {
        slideTo(_slideIndex);
        if (slideshowNav) slideshowNav.style.display = "";
      }

      // Pagination: infinite scroll via IntersectionObserver (skip when pagination="none")
      if (pageSize > 0 && _loadedCount < _total && pagination !== "none") {
        var sentinel = document.createElement("div");
        sentinel.className = "aup-list-load-more";
        sentinel.textContent = _loadedCount + " of " + _total;
        bodyEl.appendChild(sentinel);
        if (typeof IntersectionObserver !== "undefined") {
          var obs = new IntersectionObserver(function(entries) {
            if (entries[0].isIntersecting && !_loadingMore) {
              sentinel.textContent = "Loading...";
              fetchPage(_currentPath, _loadedCount, false);
              obs.disconnect();
            }
          }, { rootMargin: "200px" });
          obs.observe(sentinel);
        } else {
          // Fallback: click to load
          sentinel.style.cursor = "pointer";
          sentinel.addEventListener("click", function() {
            if (!_loadingMore) {
              sentinel.textContent = "Loading...";
              fetchPage(_currentPath, _loadedCount, false);
            }
          });
        }
      }
    }

    // ── Navigation ──
    function navigateTo(path, stackIdx) {
      _currentPath = path;
      if (stackIdx != null && stackIdx < _pathStack.length) {
        _pathStack = _pathStack.slice(0, stackIdx);
      }
      _pathStack.push(path);
      _selectedId = null;
      _expanded = {};
      _childCache = {};
      _slideIndex = 0;
      _kbNavigating = true; // Suppress focusout during fetch
      fetchAndRender(path);
      subscribePath(path);
      renderBreadcrumb();
    }

    // ── Group Toggle ──
    function toggleGroup(entry, entryPath, depth) {
      var wasExpanded = !!_expanded[entryPath];
      _expanded[entryPath] = !wasExpanded;

      if (!wasExpanded && !_childCache[entryPath]) {
        window.afs.list(entryPath + "/").then(function(result) {
          var data = result && result.data ? result.data : (Array.isArray(result) ? result : []);
          var children = Array.isArray(data) ? data : [];
          _childCache[entryPath] = children;
          return _enrichEntriesWithContent(children, entryPath);
        }).then(function() {
          renderEntries();
        }).catch(function() {
          _childCache[entryPath] = [];
          renderEntries();
        });
        emitEvent("expand", { path: entryPath, id: entry.id, childrenCount: entry.meta && entry.meta.childrenCount });
      } else {
        renderEntries();
        emitEvent(wasExpanded ? "collapse" : "expand", { path: entryPath, id: entry.id });
      }
    }

    // ── Data Fetching ──
    function fetchAndRender(path) {
      _entries = [];
      _total = 0;
      _loadedCount = 0;
      fetchPage(path, 0, true);
    }

    function fetchPage(path, offset, isInitial) {
      if (isInitial) {
        loadingEl.style.display = "block";
        bodyEl.style.display = "none";
      }
      _loadingMore = true;
      var opts = pageSize > 0 ? { offset: offset, limit: pageSize } : {};
      window.afs.list(path, opts).then(function(result) {
        // Handle both new { data, total } format and legacy array format
        var data = result && result.data ? result.data : (Array.isArray(result) ? result : []);
        var newEntries = Array.isArray(data) ? data : [];
        // No filtering — explorer shows everything transparently
        if (offset === 0) {
          _entries = newEntries;
        } else {
          _entries = _entries.concat(newEntries);
        }
        _total = result && result.total != null ? result.total : _entries.length;
        _loadedCount = _entries.length;
        // Auto-read content for entries when fields/templates need it
        return _enrichEntriesWithContent(newEntries, path);
      }).then(function() {
        _loadingMore = false;
        if (isInitial) {
          loadingEl.style.display = "none";
          bodyEl.style.display = "";
        }
        // Always inject ".." parent entry so user can navigate back (except at root)
        if (_pathStack.length > 1) {
          _entries = [{
            id: "..",
            path: _pathStack[_pathStack.length - 2],
            meta: { kind: "fs:directory", childrenCount: 0 }
          }].concat(_entries);
        }
        renderEntries();
        // Auto-select first item when nothing is selected (Finder behavior)
        if (_selectedId == null && _entries.length > 0) {
          var first = processPipeline(_entries)[0];
          if (first) {
            _selectedId = first.id;
            var firstEl = bodyEl.querySelector('[data-entry-id="' + CSS.escape(first.id) + '"]');
            if (firstEl) firstEl.setAttribute("data-selected", "true");
            emitEvent("select", { path: _buildEntryPath(first, _currentPath), id: first.id, meta: first.meta || {}, content: first.content || {} });
          }
        }
        // Ensure keyboard navigation is active after fetch
        _kbNavigating = false;
        _kbActive = true;
        if (_entries.length > 0) {
          bodyEl.focus();
        }
      }).catch(function(e) {
        _loadingMore = false;
        if (isInitial) {
          var errStr = String(e && e.message || e || "");
          if (errStr.indexOf("not found") >= 0 || errStr.indexOf("Not found") >= 0 || errStr.indexOf("Path not found") >= 0) {
            loadingEl.textContent = "This entry cannot be browsed as a directory";
          } else {
            loadingEl.textContent = "Unable to list: " + (errStr || "unknown error");
          }
          bodyEl.style.display = "none";
        }
        _kbNavigating = false;
        _kbActive = true; // Keep keyboard nav active so ← can navigate back
      });
    }

    // ── Live Subscription ──
    function subscribePath(path) {
      if (_unsubscribe) _unsubscribe();
      if (window.afs && window.afs.subscribe) {
        _unsubscribe = window.afs.subscribe(
          { type: "afs:write", path: path },
          function() { fetchAndRender(_currentPath); }
        );
      }
    }

    // ── Event Emission ──
    function emitEvent(eventName, data) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: "aup_event",
          nodeId: node.id,
          event: eventName,
          data: data
        }));
      }
      // Also dispatch DOM CustomEvent for client-side listeners (e.g., device surface)
      el.dispatchEvent(new CustomEvent("aup-list:" + eventName, { detail: data, bubbles: true }));
    }

    // ── Initial Load ──
    if (node.data && Array.isArray(node.data)) {
      // Inline data mode — no AFS call, render directly.
      // Disable pagination: all data is already present.
      pageSize = 0;
      loadingEl.style.display = "none";
      bodyEl.style.display = "";
      _entries = node.data;
      _total = node.data.length;
      _loadedCount = node.data.length;
      renderEntries();
    } else if (node.src && window.afs) {
      fetchAndRender(_currentPath);
      subscribePath(_currentPath);
      renderBreadcrumb();
    } else {
      loadingEl.style.display = "none";
      bodyEl.style.display = "";
      var empty = document.createElement("div");
      empty.className = "aup-list-empty";
      empty.textContent = node.src ? "Connecting..." : emptyText;
      bodyEl.appendChild(empty);
    }

    return el;
  }
`;
