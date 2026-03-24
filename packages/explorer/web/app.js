(() => {
  const S = window.AFSState;

  // ── Theme ──────────────────────────────────────────
  function getPreferredTheme() {
    const saved = localStorage.getItem("afs-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("afs-theme", theme);
    const btn = document.getElementById("btn-theme");
    if (btn) btn.textContent = theme === "light" ? "\u263E" : "\u2600";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  applyTheme(getPreferredTheme());

  // ── Column Resize + Settings ─────────────────────────
  const SETTINGS_KEY = "afs-explorer-settings";
  const COL_LIMITS = { tree: { min: 120, max: 500 }, props: { min: 200, max: 600 } };
  const colWidths = { tree: 220, props: 380 };
  let workspacePath = null; // set after getMounts if writable workspace found

  function loadLocalSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.colWidths) {
          if (s.colWidths.tree) colWidths.tree = clampCol("tree", s.colWidths.tree);
          if (s.colWidths.props) colWidths.props = clampCol("props", s.colWidths.props);
        }
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function clampCol(which, value) {
    const lim = COL_LIMITS[which];
    return Math.max(lim.min, Math.min(lim.max, value));
  }

  function applyColWidths() {
    const el = document.getElementById("content");
    if (el) el.style.gridTemplateColumns = `${colWidths.tree}px 4px 1fr 4px ${colWidths.props}px`;
  }

  function saveSettings() {
    const data = JSON.stringify({ colWidths: { tree: colWidths.tree, props: colWidths.props } });
    localStorage.setItem(SETTINGS_KEY, data);
    if (workspacePath) {
      rpc("write", { path: `${workspacePath}/.explorer/settings.json`, content: data }).catch(
        () => {},
      );
    }
  }

  async function loadWorkspaceSettings() {
    if (!workspacePath) return;
    try {
      const result = await rpc("read", { path: `${workspacePath}/.explorer/settings.json` });
      if (result?.content) {
        const s = typeof result.content === "string" ? JSON.parse(result.content) : result.content;
        if (s.colWidths) {
          if (s.colWidths.tree) colWidths.tree = clampCol("tree", s.colWidths.tree);
          if (s.colWidths.props) colWidths.props = clampCol("props", s.colWidths.props);
        }
        applyColWidths();
      }
    } catch (_e) {
      /* no workspace settings yet */
    }
  }

  function initResizers() {
    const resizerLeft = document.getElementById("resizer-left");
    const resizerRight = document.getElementById("resizer-right");
    if (resizerLeft) setupResizer(resizerLeft, "tree");
    if (resizerRight) setupResizer(resizerRight, "props");
  }

  function setupResizer(handle, which) {
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = colWidths[which];
      handle.classList.add("active");
      document.body.classList.add("col-resizing");

      function onMove(ev) {
        const delta = which === "tree" ? ev.clientX - startX : startX - ev.clientX;
        colWidths[which] = clampCol(which, startWidth + delta);
        applyColWidths();
      }

      function onUp() {
        handle.classList.remove("active");
        document.body.classList.remove("col-resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveSettings();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // Load localStorage settings immediately (sync)
  loadLocalSettings();

  // ── Icons ───────────────────────────────────────────
  const ICONS = {
    directory: "\uD83D\uDCC1",
    file: "\uD83D\uDCC4",
    up: "\u21A9",
    exec: "\u26A1",
    link: "\uD83D\uDD17",
  };
  function getIcon(type) {
    return ICONS[type] || ICONS.file;
  }

  // ── State ───────────────────────────────────────────
  const state = {
    currentPath: "/",
    entries: [],
    filteredEntries: [],
    selectedIndex: 0,
    loading: false,
    error: null,
    metadata: null,
    filterActive: false,
    filterText: "",
    modalOpen: false,
    wsConnected: false,
    viewingFile: null, // path of file being viewed inline, null = dir view
    vaultMounts: [], // paths of vault provider mounts
    isVaultPath: false, // true when navigating under a vault mount
    vaultSecretRevealed: false, // true when secret value is shown
    activeTab: "browse", // "browse" | "mounts" | "registry"
    mountEditPath: null, // path of mount being edited, null = add mode
    pageSize: 50,
    currentPage: 1,
    totalItems: null,
    totalPages: 1,
    isPaginated: false,
  };

  const dom = {};

  // ── Tree State ──────────────────────────────────────
  const treeState = {
    mounts: [],
    expanded: {},
    children: {},
    loading: {},
  };

  // ── WebSocket ───────────────────────────────────────
  let ws = null;
  let rpcId = 0;
  const rpcCallbacks = {};
  let reconnectTimer = null;

  function getWSUrl() {
    const loc = window.location;
    return `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}/ws`;
  }

  function connectWS() {
    if (ws && ws.readyState <= 1) return;
    try {
      ws = new WebSocket(getWSUrl());
    } catch (_e) {
      state.wsConnected = false;
      state.error = "WebSocket connection failed";
      renderStatusBar();
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      state.wsConnected = true;
      state.error = null;
      updateConnStatus(true);
      renderStatusBar();
      initTree();
      if (state.activeTab === "browse") {
        navigate(state.currentPath);
      } else if (state.activeTab === "mounts") {
        loadMountList();
        // Handle deferred hash routing for mount forms
        const h = window.location.hash.slice(1);
        if (h === "mounts/add") showMountForm(null);
        else if (h.indexOf("mounts/edit?path=") === 0) {
          showMountForm(decodeURIComponent(h.slice("mounts/edit?path=".length)));
        }
      } else if (state.activeTab === "registry") {
        loadRegistry();
      }
    };
    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (_e) {
        return;
      }
      // Push notification (no id) from server broadcast
      if (!data.id && data.method) {
        handlePushNotification(data.method, data.params);
        return;
      }
      const cb = rpcCallbacks[data.id];
      if (cb) {
        delete rpcCallbacks[data.id];
        if (data.error) cb.reject(new Error(data.error.message));
        else cb.resolve(data.result);
      }
    };
    ws.onclose = () => {
      state.wsConnected = false;
      updateConnStatus(false);
      renderStatusBar();
      scheduleReconnect();
    };
    ws.onerror = () => {
      state.wsConnected = false;
      updateConnStatus(false);
    };
  }

  function updateConnStatus(connected) {
    const el = document.getElementById("conn-status");
    if (!el) return;
    el.className = `conn-status ${connected ? "connected" : "disconnected"}`;
    el.title = connected ? "Connected" : "Reconnecting\u2026";
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWS();
    }, 2000);
  }

  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== 1) {
        reject(new Error("Not connected"));
        return;
      }
      const id = ++rpcId;
      const timer = setTimeout(() => {
        delete rpcCallbacks[id];
        reject(new Error(`RPC timeout: ${method}`));
      }, 15000);
      rpcCallbacks[id] = {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  // ── Navigation ──────────────────────────────────────
  let navigationVersion = 0;

  function isVaultPath(path) {
    for (let i = 0; i < state.vaultMounts.length; i++) {
      if (path === state.vaultMounts[i] || path.indexOf(`${state.vaultMounts[i]}/`) === 0) {
        return true;
      }
    }
    return false;
  }

  function getVaultMount(path) {
    for (let i = 0; i < state.vaultMounts.length; i++) {
      if (path === state.vaultMounts[i] || path.indexOf(`${state.vaultMounts[i]}/`) === 0) {
        return state.vaultMounts[i];
      }
    }
    return null;
  }

  /** Get vault depth: 0=root, 1=group, 2=secret */
  function getVaultDepth(path) {
    const mount = getVaultMount(path);
    if (!mount) return -1;
    const rel = path.slice(mount.length).replace(/^\//, "");
    if (!rel) return 0;
    return rel.split("/").filter(Boolean).length;
  }

  function navigate(path, page) {
    page = page || 1;
    const version = ++navigationVersion;
    state.currentPath = path;
    state.currentPage = page;
    state.loading = true;
    state.error = null;
    state.filterActive = false;
    state.filterText = "";
    state.isVaultPath = isVaultPath(path);
    state.vaultSecretRevealed = false;
    state.entries = [];
    state.filteredEntries = [];
    state.selectedIndex = 0;
    dom.searchInput.value = "";
    showDirView();
    renderBreadcrumb();
    renderVaultToolbar();
    renderFileList();
    renderStatusBar();
    syncHash();

    var offset = (page - 1) * state.pageSize;
    var rpcParams = { path: path, maxDepth: 1, offset: offset, limit: state.pageSize };

    rpc("list", rpcParams)
      .then((result) => {
        if (version !== navigationVersion) return;
        var total = result.total;
        var children = S.buildImmediateChildren(path, result.list || []);
        var entries = [];
        if (path !== "/") entries.push({ name: "..", path: S.getParentPath(path), type: "up" });
        entries = entries.concat(S.sortEntries(children));

        // Pagination state
        if (total !== undefined && total !== null && total > state.pageSize) {
          state.isPaginated = true;
          state.totalItems = total;
          state.totalPages = Math.ceil(total / state.pageSize);
        } else {
          state.isPaginated = false;
          state.totalItems = total !== undefined && total !== null ? total : children.length;
          state.totalPages = 1;
          state.currentPage = 1;
        }

        state.entries = entries;
        state.filteredEntries = entries;
        state.selectedIndex = 0;
        state.loading = false;
        state.metadata = null;

        renderFileList();
        renderVaultToolbar();
        renderStatusBar();
        renderSidebar();
        syncTreeHighlight();

        if (entries.length > 0 && entries[0].type !== "up") loadMetadata(entries[0].path);
      })
      .catch((err) => {
        if (version !== navigationVersion) return;
        state.loading = false;
        state.error = err.message;
        state.entries = [];
        state.filteredEntries = [];
        state.selectedIndex = 0;
        state.isPaginated = false;
        state.totalItems = null;
        state.totalPages = 1;
        state.currentPage = 1;
        renderFileList();
        renderStatusBar();
        renderSidebar();
      });
  }

  function enter() {
    const entry = getSelectedEntry();
    if (!entry) return;
    if (entry.type === "directory" || entry.type === "up") navigate(entry.path);
    else showFileInline(entry.path);
  }

  function goBack() {
    if (state.viewingFile) {
      goBackToDir();
      return;
    }
    if (state.currentPath === "/") return;
    navigate(S.getParentPath(state.currentPath));
  }

  function refresh() {
    navigate(state.currentPath, state.currentPage);
  }

  // ── Pagination ───────────────────────────────────
  function goToPage(page) {
    if (page < 1) page = 1;
    if (page > state.totalPages) page = state.totalPages;
    if (page === state.currentPage) return;
    navigate(state.currentPath, page);
  }
  function nextPage() {
    if (state.isPaginated && state.currentPage < state.totalPages) goToPage(state.currentPage + 1);
  }
  function prevPage() {
    if (state.isPaginated && state.currentPage > 1) goToPage(state.currentPage - 1);
  }
  function firstPage() {
    if (state.isPaginated && state.currentPage !== 1) goToPage(1);
  }
  function lastPage() {
    if (state.isPaginated && state.currentPage !== state.totalPages) goToPage(state.totalPages);
  }

  // ── Selection ───────────────────────────────────────
  function getSelectedEntry() {
    return state.filteredEntries[state.selectedIndex] || null;
  }

  function setSelection(index) {
    state.selectedIndex = S.clampIndex(index, state.filteredEntries.length);
    renderFileList();
    const entry = getSelectedEntry();
    if (entry && entry.type !== "up") loadMetadata(entry.path);
    else {
      state.metadata = null;
      renderSidebar();
    }
  }

  function moveUp() {
    setSelection(state.selectedIndex - 1);
  }
  function moveDown() {
    setSelection(state.selectedIndex + 1);
  }
  function moveHome() {
    setSelection(0);
  }
  function moveEnd() {
    setSelection(state.filteredEntries.length - 1);
  }
  function getPageSize() {
    return dom.fileList ? Math.max(1, Math.floor(dom.fileList.clientHeight / 36) - 1) : 10;
  }
  function pageUp() {
    setSelection(state.selectedIndex - getPageSize());
  }
  function pageDown() {
    setSelection(state.selectedIndex + getPageSize());
  }

  // ── Metadata ────────────────────────────────────────
  let metadataVersion = 0;

  function loadMetadata(path) {
    const version = ++metadataVersion;
    rpc("stat", { path: path })
      .then((result) => {
        if (version !== metadataVersion) return;
        state.metadata = S.extractMetadata(result);
        renderSidebar();
      })
      .catch(() => {
        if (version !== metadataVersion) return;
        state.metadata = null;
        renderSidebar();
      });
  }

  // ── Escape HTML ─────────────────────────────────────
  const escapeEl = document.createElement("div");
  function esc(str) {
    escapeEl.textContent = str;
    return escapeEl.innerHTML;
  }

  // ── Render: Breadcrumb ──────────────────────────────
  function renderBreadcrumb() {
    if (!dom.breadcrumb) return;
    const path = state.currentPath;
    const segments = path === "/" ? [""] : path.split("/");
    let html = '<span class="bc-seg" data-path="/">~</span>';
    let built = "";
    for (let i = 1; i < segments.length; i++) {
      built += `/${segments[i]}`;
      html += '<span class="bc-sep">/</span>';
      const isCurrent = i === segments.length - 1;
      html +=
        '<span class="bc-seg' +
        (isCurrent ? " current" : "") +
        '" data-path="' +
        esc(built) +
        '">' +
        esc(segments[i]) +
        "</span>";
    }
    dom.breadcrumb.innerHTML = html;
  }

  // ── Render: File List ───────────────────────────────
  function renderFileList() {
    if (!dom.fileList) return;
    const entries = state.filteredEntries;
    let html = "";
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const sel = i === state.selectedIndex ? " selected" : "";
      const cls = `row row-${e.type}${sel}`;
      html +=
        '<div class="' +
        cls +
        '" data-index="' +
        i +
        '">' +
        '<span class="col-icon">' +
        getIcon(e.type) +
        "</span>" +
        '<span class="col-name">' +
        esc(e.name) +
        (e.type === "directory" ? "/" : "") +
        "</span>" +
        '<span class="col-size">' +
        esc(S.formatSize(e.size)) +
        "</span>" +
        '<span class="col-date">' +
        esc(S.formatDate(e.modified)) +
        "</span>" +
        "</div>";
    }
    const realCount = entries.filter((e) => e.type !== "up").length;
    if (state.loading) {
      html =
        '<div class="empty-msg"><span class="spinner" style="width:20px;height:20px"></span></div>';
    } else if (realCount === 0) {
      html += `<div class="empty-msg">${state.error ? esc(state.error) : "Empty directory"}</div>`;
    }
    dom.fileList.innerHTML = html;
    const selected = dom.fileList.querySelector(".row.selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  // ── Render: Sidebar ─────────────────────────────────
  function renderSidebar() {
    if (!dom.sidebar) return;
    const entry = getSelectedEntry();
    const meta = state.metadata;
    if (!entry) {
      dom.sidebar.innerHTML = "";
      return;
    }
    if (entry.type === "up") {
      dom.sidebar.innerHTML = `<div class="sb-name">${getIcon("up")} ..<span class="sb-type">parent</span></div>`;
      return;
    }

    let html =
      '<div class="sb-name">' +
      getIcon(entry.type) +
      " " +
      esc(entry.name) +
      '<span class="sb-type">' +
      esc(entry.type) +
      "</span></div>";

    if (!meta) {
      html += '<div class="loading">Loading details...</div>';
      dom.sidebar.innerHTML = html;
      return;
    }

    // Details section
    html += '<div class="sb-section"><div class="sb-section-title">Details</div>';
    if (meta.path) html += sbField("Path", meta.path, "path");
    if (meta.size !== undefined && meta.size !== null)
      html += sbField("Size", `${S.formatSize(meta.size)} (${meta.size} B)`);
    if (meta.childrenCount !== undefined && meta.childrenCount >= 0)
      html += sbField("Items", meta.childrenCount);
    if (meta.modified) html += sbField("Modified", fmtDate(meta.modified));
    if (meta.provider) html += sbField("Provider", meta.provider);
    if (meta.hash)
      html += sbField(
        "Hash",
        meta.hash.length > 16 ? `${meta.hash.slice(0, 16)}\u2026` : meta.hash,
        "mono",
      );
    if (meta.mountPath) html += sbField("Mount", meta.mountPath, "mono");
    if (meta.uri) html += sbField("URI", meta.uri, "mono");
    if (meta.description) html += sbField("Description", meta.description);
    if (meta.kinds && meta.kinds.length > 0) html += sbField("Kinds", meta.kinds.join(" \u2192 "));
    else if (meta.kind) html += sbField("Kind", meta.kind);
    if (meta.permissions && meta.permissions.length > 0)
      html += sbField("Permissions", meta.permissions.join(", "));
    html += "</div>";

    // InputSchema
    if (meta.inputSchema?.properties) {
      html += '<div class="sb-section"><div class="sb-section-title">Input Schema</div>';
      const schemaProps = meta.inputSchema.properties;
      const schemaReq = meta.inputSchema.required || [];
      for (const pn in schemaProps) {
        if (!Object.hasOwn(schemaProps, pn)) continue;
        const sp = schemaProps[pn];
        const isReq = schemaReq.indexOf(pn) >= 0;
        html +=
          '<div class="sb-schema-prop">' +
          esc(pn) +
          (isReq ? '<span class="req">*</span>' : "") +
          ': <span class="type">' +
          esc(sp.type || "any") +
          "</span>" +
          (sp.description ? ` &mdash; ${esc(sp.description)}` : "") +
          "</div>";
      }
      html += "</div>";
    }

    // Extra metadata
    if (meta.extra) {
      const eKeys = Object.keys(meta.extra);
      if (eKeys.length > 0) {
        html += '<div class="sb-section"><div class="sb-section-title">Metadata</div>';
        for (let k = 0; k < eKeys.length; k++) {
          html += sbField(capitalize(eKeys[k]), fmtVal(meta.extra[eKeys[k]]));
        }
        html += "</div>";
      }
    }

    // Actions
    if (meta.actions && meta.actions.length > 0) {
      html += '<div class="sb-section"><div class="sb-section-title">Actions</div>';
      for (let a = 0; a < meta.actions.length; a++) {
        const act = meta.actions[a];
        html +=
          '<div class="sb-action" data-action-index="' +
          a +
          '">' +
          '<span class="sb-action-icon">\u26A1</span>' +
          '<div><div class="action-option-name">' +
          esc(act.name || act.path) +
          "</div>" +
          (act.description ? `<div class="sb-action-desc">${esc(act.description)}</div>` : "") +
          "</div></div>";
      }
      html += "</div>";
    }

    // Vault actions (edit/delete for vault secrets)
    if (state.isVaultPath && entry.type === "file") {
      const depth = getVaultDepth(entry.path);
      if (depth === 2) {
        html += '<div class="sb-section"><div class="sb-section-title">Vault Actions</div>';
        html += `<div class="sb-action vault-sb-edit" data-vault-edit="${esc(entry.path)}">`;
        html += '<span class="sb-action-icon">&#9998;</span>';
        html += '<div><div class="action-option-name">Edit Secret</div>';
        html += '<div class="sb-action-desc">Modify the secret value</div></div></div>';
        html += `<div class="sb-action vault-sb-delete" data-vault-delete="${esc(entry.path)}">`;
        html += '<span class="sb-action-icon" style="color:var(--red)">&#128465;</span>';
        html += '<div><div class="action-option-name">Delete Secret</div>';
        html += '<div class="sb-action-desc">Permanently remove this secret</div></div></div>';
        html += "</div>";
      }
    }

    // Raw JSON
    html += '<details class="sb-raw-json"><summary>Raw JSON</summary>';
    html += `<pre>${esc(JSON.stringify(state.metadata, null, 2))}</pre>`;
    html += "</details>";

    dom.sidebar.innerHTML = html;
  }

  function sbField(label, value, cls) {
    const str = String(value);
    if (str.length > 40) {
      return (
        '<details class="sb-field-expandable"><summary><span class="sb-label">' +
        esc(label) +
        '</span><span class="sb-value' +
        (cls ? ` ${cls}` : "") +
        '">' +
        esc(str.slice(0, 36)) +
        "\u2026" +
        "</span></summary>" +
        '<div class="sb-expand-value">' +
        esc(str) +
        "</div></details>"
      );
    }
    return (
      '<div class="sb-field"><span class="sb-label">' +
      esc(label) +
      '</span><span class="sb-value' +
      (cls ? ` ${cls}` : "") +
      '">' +
      esc(str) +
      "</span></div>"
    );
  }

  function fmtDate(date) {
    if (!date) return "";
    if (typeof date === "string") date = new Date(date);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return (
      mo[date.getMonth()] +
      " " +
      String(date.getDate()).padStart(2, "0") +
      ", " +
      date.getFullYear() +
      " " +
      String(date.getHours()).padStart(2, "0") +
      ":" +
      String(date.getMinutes()).padStart(2, "0")
    );
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function fmtVal(val) {
    if (val === null || val === undefined) return "";
    if (typeof val !== "object") return String(val);
    if (Array.isArray(val))
      return val.length === 0
        ? "[]"
        : typeof val[0] !== "object"
          ? val.join(", ")
          : JSON.stringify(val, null, 2);
    return JSON.stringify(val, null, 2);
  }

  // ── Render: Status Bar ──────────────────────────────
  function fmtNum(n) {
    return n.toLocaleString();
  }

  function renderStatusBar() {
    if (!dom.statusLeft) return;
    var count = 0;
    var i, start, end, pg, tp, html;
    var left = "";
    for (i = 0; i < state.entries.length; i++) {
      if (state.entries[i].type !== "up") count++;
    }

    if (state.isPaginated && state.totalItems !== null) {
      start = (state.currentPage - 1) * state.pageSize + 1;
      end = Math.min(state.currentPage * state.pageSize, state.totalItems);
      left += `<span>${fmtNum(start)}\u2013${fmtNum(end)} of ${fmtNum(state.totalItems)} items</span>`;
      if (state.filterText)
        left += '<span style="color:var(--yellow)">Filtering current page only</span>';
    } else {
      if (count > 0) left += `<span>${count} items</span>`;
    }
    if (state.loading) left += "<span>Loading\u2026</span>";
    if (state.error) left += `<span style="color:var(--red)">${esc(state.error)}</span>`;
    left += `<span><span class="st-dot ${state.wsConnected ? "on" : "off"}"></span>${state.wsConnected ? "Connected" : "Disconnected"}</span>`;
    dom.statusLeft.innerHTML = left;

    // Pagination controls on the right
    if (state.isPaginated) {
      pg = state.currentPage;
      tp = state.totalPages;
      html = '<div class="pagination-controls">';
      html += `<button class="pg-btn pg-first"${pg <= 1 ? " disabled" : ""} title="First page">\u00AB</button>`;
      html += `<button class="pg-btn pg-prev"${pg <= 1 ? " disabled" : ""} title="Previous page">\u2039</button>`;
      html += `<span class="pg-info">Page ${pg} of ${tp}</span>`;
      html += `<button class="pg-btn pg-next"${pg >= tp ? " disabled" : ""} title="Next page">\u203A</button>`;
      html += `<button class="pg-btn pg-last"${pg >= tp ? " disabled" : ""} title="Last page">\u00BB</button>`;
      html += "</div>";
      dom.statusRight.innerHTML = html;
    } else {
      dom.statusRight.innerHTML = "";
    }
  }

  // ── Detail View (inline file content) ──────────────
  const IMAGE_EXTS = { png: 1, jpg: 1, jpeg: 1, gif: 1, svg: 1, webp: 1, bmp: 1, ico: 1 };
  const MD_EXTS = { md: 1, mdx: 1, markdown: 1 };
  const LANG_MAP = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    sh: "bash",
    yml: "yaml",
    rs: "rust",
    go: "go",
    java: "java",
    json: "json",
    css: "css",
    html: "html",
    xml: "xml",
    sql: "sql",
    c: "c",
    cpp: "cpp",
    toml: "toml",
  };

  function getFileExt(path) {
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
  }

  function showDirView() {
    state.viewingFile = null;
    if (dom.dirView) dom.dirView.classList.remove("hidden");
    if (dom.detailView) dom.detailView.classList.add("hidden");
  }

  function showDetailView(path) {
    state.viewingFile = path;
    const name = path.split("/").pop() || path;
    if (dom.dirView) dom.dirView.classList.add("hidden");
    if (dom.detailView) dom.detailView.classList.remove("hidden");
    if (dom.detailFilename) dom.detailFilename.textContent = name;
    if (dom.detailContent) dom.detailContent.innerHTML = '<div class="loading">Loading\u2026</div>';
  }

  function showFileInline(path) {
    showDetailView(path);
    const ext = getFileExt(path);

    // Images: use /api/read HTTP endpoint
    if (IMAGE_EXTS[ext]) {
      const src = `/api/read?path=${encodeURIComponent(path)}`;
      dom.detailContent.innerHTML =
        '<div class="detail-image"><img src="' +
        esc(src) +
        '" alt="' +
        esc(path.split("/").pop()) +
        '"></div>';
      return;
    }

    // Text content: fetch via WS RPC
    rpc("read", { path: path })
      .then((result) => {
        if (state.viewingFile !== path) return; // stale
        let content = result.content;
        if (content === undefined || content === null) content = "";
        if (typeof content !== "string") content = JSON.stringify(content, null, 2);

        // Vault secret masking
        if (state.isVaultPath && getVaultDepth(path) === 2) {
          state.vaultSecretRevealed = false;
          renderVaultSecretView(path, content);
          return;
        }

        if (MD_EXTS[ext]) {
          dom.detailContent.innerHTML = `<div class="detail-markdown">${renderMarkdown(content, path)}</div>`;
          // Highlight code blocks in markdown
          const codeBlocks = dom.detailContent.querySelectorAll("pre code[class]");
          for (const cb of codeBlocks) lazyHighlight(cb);
        } else {
          // Code / plain text
          const lang = LANG_MAP[ext] || ext;
          dom.detailContent.innerHTML =
            '<pre class="detail-pre"><code class="language-' +
            esc(lang) +
            '">' +
            esc(content) +
            "</code></pre>";
          lazyHighlight(dom.detailContent.querySelector("code"));
        }
      })
      .catch((err) => {
        if (state.viewingFile !== path) return;
        dom.detailContent.innerHTML = `<div class="modal-error">Error: ${esc(err.message)}</div>`;
      });
  }

  function renderVaultSecretView(path, value) {
    const name = path.split("/").pop() || path;
    const masked = "\u2022".repeat(Math.min(value.length, 40));
    const revealed = state.vaultSecretRevealed;
    let h = '<div class="vault-secret-view">';
    h += '<div class="vault-secret-header">';
    h += `<span class="vault-secret-name">${esc(name)}</span>`;
    h += '<div class="vault-secret-actions">';
    h +=
      '<button class="vault-btn vault-btn-sm" id="vault-toggle-reveal">' +
      (revealed ? "Hide" : "Reveal") +
      "</button>";
    h += '<button class="vault-btn vault-btn-sm" id="vault-copy-btn">Copy</button>';
    h += '<button class="vault-btn vault-btn-sm" id="vault-edit-btn">Edit</button>';
    h +=
      '<button class="vault-btn vault-btn-sm vault-btn-danger" id="vault-delete-btn">Delete</button>';
    h += "</div></div>";
    h += '<div class="vault-secret-value">';
    if (revealed) {
      h += `<pre class="vault-secret-pre">${esc(value)}</pre>`;
    } else {
      h += `<div class="vault-secret-masked">${masked}</div>`;
    }
    h += "</div></div>";
    dom.detailContent.innerHTML = h;

    // Event listeners
    const toggleBtn = document.getElementById("vault-toggle-reveal");
    const copyBtn = document.getElementById("vault-copy-btn");
    const editBtn = document.getElementById("vault-edit-btn");
    const deleteBtn = document.getElementById("vault-delete-btn");

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        state.vaultSecretRevealed = !state.vaultSecretRevealed;
        renderVaultSecretView(path, value);
      });
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(value).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1500);
        });
      });
    }
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        showEditSecretModal(path, value);
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        showDeleteSecretConfirm(path);
      });
    }
  }

  function goBackToDir() {
    showDirView();
    dom.fileList.focus();
  }

  // ── Markdown Renderer ─────────────────────────────
  function renderMarkdown(text, filePath) {
    const basePath = filePath ? filePath.slice(0, filePath.lastIndexOf("/")) || "/" : "/";
    const lines = text.split("\n");
    let html = "";
    let inCode = false;
    let codeLang = "";
    let codeLines = [];
    let inList = false;
    let listType = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.trimStart().startsWith("```")) {
        if (inCode) {
          html +=
            "<pre><code" +
            (codeLang ? ` class="language-${esc(codeLang)}"` : "") +
            ">" +
            esc(codeLines.join("\n")) +
            "</code></pre>";
          inCode = false;
          codeLines = [];
          codeLang = "";
        } else {
          closeList();
          inCode = true;
          codeLang = line.trim().slice(3).trim();
        }
        continue;
      }
      if (inCode) {
        codeLines.push(line);
        continue;
      }

      // Blank line
      if (line.trim() === "") {
        closeList();
        continue;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        closeList();
        const level = headingMatch[1].length;
        html += `<h${level}>${inlineMd(headingMatch[2])}</h${level}>`;
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
        closeList();
        html += "<hr>";
        continue;
      }

      // Blockquote
      if (line.trimStart().startsWith("> ")) {
        closeList();
        html += `<blockquote><p>${inlineMd(line.trimStart().slice(2))}</p></blockquote>`;
        continue;
      }

      // Unordered list
      const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)/);
      if (ulMatch) {
        if (!inList || listType !== "ul") {
          closeList();
          html += "<ul>";
          inList = true;
          listType = "ul";
        }
        html += `<li>${inlineMd(ulMatch[2])}</li>`;
        continue;
      }

      // Ordered list
      const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
      if (olMatch) {
        if (!inList || listType !== "ol") {
          closeList();
          html += "<ol>";
          inList = true;
          listType = "ol";
        }
        html += `<li>${inlineMd(olMatch[2])}</li>`;
        continue;
      }

      // Table (simple: lines starting with |)
      if (line.trimStart().startsWith("|")) {
        closeList();
        // Collect table lines
        const tableLines = [line];
        while (i + 1 < lines.length && lines[i + 1].trimStart().startsWith("|")) {
          tableLines.push(lines[++i]);
        }
        html += renderTable(tableLines);
        continue;
      }

      // Paragraph
      closeList();
      html += `<p>${inlineMd(line)}</p>`;
    }

    // Close any open blocks
    if (inCode) {
      html +=
        "<pre><code" +
        (codeLang ? ` class="language-${esc(codeLang)}"` : "") +
        ">" +
        esc(codeLines.join("\n")) +
        "</code></pre>";
    }
    closeList();

    // Resolve relative image paths
    html = html.replace(/(<img[^>]+src=")([^"]+)(")/g, (m, pre, src, post) => {
      if (/^(https?:|\/|data:)/.test(src)) return m;
      const resolved = basePath === "/" ? `/${src}` : `${basePath}/${src}`;
      return `${pre}/api/read?path=${encodeURIComponent(resolved)}${post}`;
    });

    return html;

    function closeList() {
      if (inList) {
        html += listType === "ul" ? "</ul>" : "</ol>";
        inList = false;
        listType = "";
      }
    }
  }

  function inlineMd(text) {
    let s = esc(text);
    // Images: ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    // Links: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Bold: **text** or __text__
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // Italic: *text* or _text_
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    s = s.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
    // Strikethrough: ~~text~~
    s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
    // Inline code: `code`
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  }

  function renderTable(lines) {
    if (lines.length < 2) return "";
    const parseRow = (line) =>
      line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c !== "");

    const headers = parseRow(lines[0]);
    // Skip separator line (line[1] is typically |---|---|)
    const startRow = /^[\s|:-]+$/.test(lines[1]?.replace(/\|/g, "").replace(/[-: ]/g, "")) ? 2 : 1;

    let h = "<table><thead><tr>";
    for (const hdr of headers) h += `<th>${inlineMd(hdr)}</th>`;
    h += "</tr></thead><tbody>";
    for (let r = startRow; r < lines.length; r++) {
      const cells = parseRow(lines[r]);
      if (cells.length === 0) continue;
      h += "<tr>";
      for (const cell of cells) h += `<td>${inlineMd(cell)}</td>`;
      h += "</tr>";
    }
    h += "</tbody></table>";
    return h;
  }

  // ── Syntax Highlighting (lazy hljs) ───────────────
  let hljsLoading = false;
  let hljsLoaded = false;

  function lazyHighlight(codeEl) {
    if (!codeEl) return;
    if (typeof hljs !== "undefined") {
      hljs.highlightElement(codeEl);
      return;
    }
    if (hljsLoaded) return;
    if (hljsLoading) {
      // Queue: check again after load
      const check = setInterval(() => {
        if (typeof hljs !== "undefined") {
          clearInterval(check);
          hljs.highlightElement(codeEl);
        }
        if (hljsLoaded && typeof hljs === "undefined") clearInterval(check);
      }, 100);
      return;
    }
    hljsLoading = true;
    const theme =
      document.documentElement.getAttribute("data-theme") === "light" ? "github" : "github-dark";
    loadCdn(
      "css",
      `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${theme}.min.css`,
    );
    loadCdn(
      "js",
      "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js",
      () => {
        hljsLoaded = true;
        hljsLoading = false;
        if (typeof hljs !== "undefined") hljs.highlightElement(codeEl);
      },
    );
  }

  function loadCdn(type, url, onload) {
    if (type === "css") {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      document.head.appendChild(link);
    } else {
      const script = document.createElement("script");
      script.src = url;
      if (onload) script.onload = onload;
      document.head.appendChild(script);
    }
  }

  // ── Tree Panel ──────────────────────────────────────
  function initTree() {
    rpc("getMounts")
      .then((result) => {
        const rawMounts = result?.mounts || result || [];
        // Group mounts by top-level path segment to avoid duplicates
        // e.g. multiple mounts under /registry → single "registry" root at /registry
        const rootMap = {};
        for (const m of rawMounts) {
          const path = m.path || m.mountPath || m;
          const segments = path.split("/").filter(Boolean);
          const topSegment = segments[0];
          if (!topSegment) continue;
          const rootPath = `/${topSegment}`;
          if (!rootMap[rootPath]) {
            rootMap[rootPath] = { name: topSegment, path: rootPath };
          }
        }
        treeState.mounts = Object.values(rootMap);
        for (const m of treeState.mounts) {
          treeState.expanded[m.path] = false;
        }
        renderTree();
        syncTreeHighlight();

        // Detect writable workspace mount for settings persistence
        for (const m of rawMounts) {
          if (m.name === "workspace" && m.accessMode === "readwrite") {
            workspacePath = m.path || m.mountPath;
            break;
          }
        }
        loadWorkspaceSettings();

        // Detect vault mounts (category=security with vault tag, or name=vault)
        state.vaultMounts = [];
        for (const m of rawMounts) {
          const path = m.path || m.mountPath;
          const isVault =
            (m.tags && m.tags.indexOf("vault") >= 0) ||
            (m.category === "security" && m.name === "vault");
          if (isVault && path) {
            state.vaultMounts.push(path);
          }
        }
      })
      .catch(() => {
        treeState.mounts = [];
        renderTree();
      });
  }

  function loadTreeChildren(path) {
    if (treeState.loading[path] || treeState.children[path]) return;
    treeState.loading[path] = true;
    renderTree();
    rpc("list", { path: path, maxDepth: 1 })
      .then((result) => {
        const children = S.buildImmediateChildren(path, result.list || []);
        // Only keep directories
        treeState.children[path] = S.sortEntries(children).filter((e) => e.type === "directory");
        treeState.loading[path] = false;
        renderTree();
      })
      .catch(() => {
        treeState.children[path] = [];
        treeState.loading[path] = false;
        renderTree();
      });
  }

  function renderTree() {
    if (!dom.treeBody) return;
    let html = "";
    for (const mount of treeState.mounts) {
      html += renderTreeNode(mount.path, mount.name, 0);
    }
    if (treeState.mounts.length === 0) {
      html = '<div class="tree-loading">No mounts</div>';
    }
    dom.treeBody.innerHTML = html;
  }

  function renderTreeNode(path, name, depth) {
    const isExpanded = treeState.expanded[path];
    const isActive = state.currentPath === path;
    const hasChildren = treeState.children[path] && treeState.children[path].length > 0;
    const isLoading = treeState.loading[path];
    const isLoaded = !!treeState.children[path];
    const showChevron = !isLoaded || hasChildren;

    let html =
      '<div class="tree-node' +
      (isActive ? " active" : "") +
      '" data-tree-path="' +
      esc(path) +
      '" style="padding-left:' +
      (8 + depth * 16) +
      'px">';

    if (showChevron) {
      html += `<span class="tree-chevron${isExpanded ? " expanded" : ""}">\u25B6</span>`;
    } else {
      html += '<span class="tree-chevron"></span>';
    }
    html += '<span class="tree-icon">\uD83D\uDCC1</span>';
    html += `<span class="tree-label">${esc(name)}</span>`;
    if (isLoading) {
      html += ' <span class="spinner" style="margin-left:6px"></span>';
    }
    html += "</div>";

    if (isExpanded) {
      if (isLoaded) {
        const children = treeState.children[path] || [];
        for (const child of children) {
          html += renderTreeNode(child.path, child.name, depth + 1);
        }
      }
    }

    return html;
  }

  function handleTreeClick(e) {
    const node = e.target.closest(".tree-node");
    if (!node) return;
    const path = node.getAttribute("data-tree-path");
    if (!path) return;

    // Toggle expand/collapse
    if (treeState.expanded[path]) {
      treeState.expanded[path] = false;
      renderTree();
    } else {
      treeState.expanded[path] = true;
      loadTreeChildren(path);
      renderTree();
    }

    // Navigate center panel
    navigate(path);
  }

  function syncTreeHighlight() {
    // Auto-expand tree nodes matching current path ancestry
    const path = state.currentPath;
    if (path === "/") {
      renderTree();
      return;
    }
    const parts = path.split("/").filter(Boolean);
    let built = "";
    for (const part of parts) {
      built += `/${part}`;
      // Find if this is a known mount or child
      const isMount = treeState.mounts.some((m) => m.path === built);
      const isKnownChild = Object.values(treeState.children).some((children) =>
        children?.some((c) => c.path === built),
      );
      if (isMount || isKnownChild) {
        if (!treeState.expanded[built] && built !== path) {
          treeState.expanded[built] = true;
          loadTreeChildren(built);
        }
      }
    }
    renderTree();
  }

  // ── Hash Routing ────────────────────────────────────
  function syncHash() {
    if (state.activeTab === "browse") {
      const hash = `#${state.currentPath}`;
      if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    }
    // mounts/registry tabs update hash via switchTab
  }
  function getPathFromHash() {
    const h = window.location.hash;
    return !h || h === "#" ? "/" : h.slice(1) || "/";
  }
  function onHashChange() {
    const h = window.location.hash;
    if (!h || h === "#") {
      switchTab("browse", true);
      navigate("/");
      return;
    }
    const raw = h.slice(1);
    if (raw === "mounts") {
      switchTab("mounts", true);
      return;
    }
    if (raw === "mounts/add") {
      switchTab("mounts", true);
      showMountForm(null);
      return;
    }
    if (raw.indexOf("mounts/edit?path=") === 0) {
      switchTab("mounts", true);
      showMountForm(decodeURIComponent(raw.slice("mounts/edit?path=".length)));
      return;
    }
    if (raw === "registry") {
      switchTab("registry", true);
      return;
    }
    // Default: browse path
    if (state.activeTab !== "browse") switchTab("browse", true);
    const path = raw || "/";
    if (path !== state.currentPath) navigate(path);
  }

  // ── Modal System ────────────────────────────────────
  let modalKeyHandler = null;

  function showModal(title, bodyHtml, footerText, opts) {
    opts = opts || {};
    state.modalOpen = true;
    dom.modalTitle.textContent = title;
    dom.modalBody.innerHTML = bodyHtml;
    dom.modal.style.width = opts.width || "60%";
    dom.modal.style.maxWidth = opts.maxWidth || "800px";
    dom.modal.style.minWidth = opts.minWidth || "320px";
    dom.modalBackdrop.classList.remove("hidden");
    dom.modal.classList.remove("hidden");

    // Footer: buttons or text
    if (opts.footerButtons && opts.footerButtons.length > 0) {
      let fHtml = '<div class="modal-btn-group">';
      for (const btn of opts.footerButtons) {
        fHtml +=
          '<button class="modal-btn ' +
          (btn.cls || "btn-secondary") +
          '" data-modal-action="' +
          esc(btn.action || "") +
          '">' +
          esc(btn.label) +
          "</button>";
      }
      fHtml += "</div>";
      dom.modalFooter.innerHTML = fHtml;
      dom.modalFooter.addEventListener("click", handleModalFooterClick);
    } else {
      dom.modalFooter.textContent = footerText || "";
    }

    if (opts.onKey) {
      modalKeyHandler = opts.onKey;
    } else {
      modalKeyHandler = (e) => {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          closeModal();
        }
      };
    }
    document.addEventListener("keydown", modalKeyHandler, true);
  }

  let modalFooterCallback = null;
  function handleModalFooterClick(e) {
    const btn = e.target.closest(".modal-btn");
    if (!btn) return;
    const action = btn.getAttribute("data-modal-action");
    if (modalFooterCallback) {
      modalFooterCallback(action);
    }
  }

  function closeModal() {
    state.modalOpen = false;
    dom.modalBackdrop.classList.add("hidden");
    dom.modal.classList.add("hidden");
    dom.modalBody.innerHTML = "";
    dom.modalFooter.innerHTML = "";
    dom.modalFooter.removeEventListener("click", handleModalFooterClick);
    modalFooterCallback = null;
    if (modalKeyHandler) {
      document.removeEventListener("keydown", modalKeyHandler, true);
      modalKeyHandler = null;
    }
  }

  // ── Help Modal ──────────────────────────────────────
  function showHelp() {
    let h = '<div class="help-grid">';
    h += '<div class="help-section">Navigation</div>';
    h += hk("\u2191 / \u2193", "Move up / down");
    h += hk("Enter", "Open directory or view file");
    h += hk("Backspace", "Go to parent directory");
    h += hk("Home / End", "First / last item");
    h += hk("Page Up / Down", "Page up / down");
    h += hk("[ / ]", "Previous / next page");
    h += hk("Escape", "Clear filter / unfocus input");
    h += "</div>";
    showModal("Keyboard Shortcuts", h, "", {
      width: "480px",
      maxWidth: "480px",
      footerButtons: [{ label: "Close", cls: "btn-secondary", action: "close" }],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
      },
    });
    modalFooterCallback = () => closeModal();
  }
  function hk(key, desc) {
    return (
      '<span class="help-key">' +
      esc(key) +
      '</span><span class="help-desc">' +
      esc(desc) +
      "</span>"
    );
  }

  // ── Action Picker ───────────────────────────────────
  function showActionPicker(entry, actions) {
    if (!actions || actions.length === 0) {
      showError("No Actions", "No actions available.");
      return;
    }
    if (actions.length === 1) {
      const s = actions[0];
      handleActionSelected(s.path || `${entry.path}/.actions/${s.name}`, s);
      return;
    }

    let sel = 0;
    function renderPicker() {
      let h = "";
      for (let i = 0; i < actions.length; i++) {
        h +=
          '<div class="action-option' +
          (i === sel ? " selected" : "") +
          '" data-action="' +
          i +
          '">' +
          '<div class="action-option-name">\u26A1 ' +
          esc(actions[i].name || actions[i].path) +
          "</div>" +
          (actions[i].description
            ? `<div class="action-option-desc">${esc(actions[i].description)}</div>`
            : "") +
          "</div>";
      }
      return h;
    }

    const entryName = entry.name || entry.path.split("/").pop();
    showModal(`Actions: ${entryName}`, renderPicker(), "", {
      width: "480px",
      maxWidth: "480px",
      footerButtons: [{ label: "Cancel", cls: "btn-secondary", action: "cancel" }],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        } else if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          sel = Math.max(0, sel - 1);
          dom.modalBody.innerHTML = renderPicker();
        } else if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          sel = Math.min(actions.length - 1, sel + 1);
          dom.modalBody.innerHTML = renderPicker();
        } else if (e.key === "Enter") {
          e.preventDefault();
          const a = actions[sel];
          closeModal();
          handleActionSelected(a.path || `${entry.path}/.actions/${a.name}`, a);
        } else if (e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          const idx = parseInt(e.key, 10) - 1;
          if (idx < actions.length) {
            const a2 = actions[idx];
            closeModal();
            handleActionSelected(a2.path || `${entry.path}/.actions/${a2.name}`, a2);
          }
        }
      },
    });

    // Click handler for action options
    dom.modalBody.addEventListener("click", (e) => {
      const opt = e.target.closest(".action-option");
      if (!opt) return;
      const idx = parseInt(opt.getAttribute("data-action"), 10);
      if (Number.isNaN(idx) || idx >= actions.length) return;
      const a = actions[idx];
      closeModal();
      handleActionSelected(a.path || `${entry.path}/.actions/${a.name}`, a);
    });

    modalFooterCallback = () => closeModal();
  }

  function handleActionSelected(actionPath, action) {
    if (action.inputSchema?.properties && Object.keys(action.inputSchema.properties).length > 0) {
      showParamsForm(actionPath, action.name, action.inputSchema);
    } else {
      executeAction(actionPath, action.name, {});
    }
  }

  // ── Params Form ─────────────────────────────────────
  function showParamsForm(actionPath, actionName, schema) {
    const props = schema.properties || {};
    const required = schema.required || [];
    const propNames = Object.keys(props);
    const _focusedField = 0;

    function renderForm() {
      let h = "";
      for (let i = 0; i < propNames.length; i++) {
        const name = propNames[i];
        const prop = props[name];
        const isReq = required.indexOf(name) >= 0;
        h += '<div class="param-group">';
        h +=
          '<div class="param-name">' +
          esc(name) +
          (isReq ? '<span class="req">*</span>' : "") +
          '<span class="ptype">' +
          esc(prop.type || "string") +
          "</span></div>";
        if (prop.description) h += `<div class="param-desc">${esc(prop.description)}</div>`;
        h +=
          '<input class="param-input" data-param="' +
          esc(name) +
          '" data-type="' +
          esc(prop.type || "string") +
          '" type="text">';
        h += "</div>";
      }
      return h;
    }

    function submitForm() {
      const inputs = dom.modalBody.querySelectorAll(".param-input");
      const args = {};
      let hasError = false;

      // Clear previous errors
      for (const inp of inputs) {
        inp.classList.remove("error");
        const errEl = inp.parentElement.querySelector(".param-error");
        if (errEl) errEl.remove();
      }

      // Validate required fields
      for (let i = 0; i < inputs.length; i++) {
        const paramName = inputs[i].getAttribute("data-param");
        const isReq = required.indexOf(paramName) >= 0;
        const trimmed = inputs[i].value.trim();
        if (isReq && !trimmed) {
          inputs[i].classList.add("error");
          const errEl = document.createElement("div");
          errEl.className = "param-error";
          errEl.textContent = "Required field";
          inputs[i].parentElement.appendChild(errEl);
          hasError = true;
        }
        const v = S.coerceParamValue(inputs[i].value, inputs[i].getAttribute("data-type"));
        if (v !== undefined) args[paramName] = v;
      }

      if (hasError) return;
      closeModal();
      executeAction(actionPath, actionName, args);
    }

    showModal(`Execute: ${actionName || actionPath}`, renderForm(), "", {
      width: "520px",
      maxWidth: "520px",
      footerButtons: [
        { label: "Cancel", cls: "btn-secondary", action: "cancel" },
        { label: "Submit", cls: "btn-primary", action: "submit" },
      ],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
        // Let Enter, Tab, and other keys work normally in inputs
      },
    });

    modalFooterCallback = (action) => {
      if (action === "submit") submitForm();
      else closeModal();
    };

    setTimeout(() => {
      const f = dom.modalBody.querySelector(".param-input");
      if (f) f.focus();
    }, 50);
  }

  // ── Action Execution ────────────────────────────────
  let executingAction = false;

  function executeAction(actionPath, actionName, args) {
    if (executingAction) return;
    executingAction = true;
    showModal("Executing", `<div class="loading">${esc(actionName || "action")}\u2026</div>`, "", {
      width: "360px",
      maxWidth: "360px",
      onKey: (e) => {
        e.preventDefault();
      },
    });
    rpc("exec", { path: actionPath, args: args })
      .then((result) => {
        executingAction = false;
        closeModal();
        showActionResult(actionName, { success: true, data: result });
      })
      .catch((err) => {
        executingAction = false;
        closeModal();
        showActionResult(actionName, { success: false, message: err.message });
      });
  }

  function showActionResult(name, result) {
    let h = "";
    if (result.success) h += '<div class="modal-success">\u2713 Completed successfully</div>';
    else h += '<div class="modal-error">\u2717 Action failed</div>';
    if (result.message) h += `<div style="margin-top:8px">${esc(result.message)}</div>`;
    if (result.data !== undefined && result.data !== null) {
      const s =
        typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
      h += `<pre style="margin-top:12px">${esc(s)}</pre>`;
    }
    showModal(`Action: ${name || ""}`, h, "", {
      width: "60%",
      footerButtons: [{ label: "Close", cls: "btn-secondary", action: "close" }],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
      },
    });
    modalFooterCallback = () => closeModal();
  }

  // ── Confirm / Error ─────────────────────────────────
  function _showConfirm(message, onYes) {
    showModal("Confirm", `<div class="confirm-msg">${esc(message)}</div>`, "", {
      width: "400px",
      maxWidth: "400px",
      footerButtons: [
        { label: "Cancel", cls: "btn-secondary", action: "cancel" },
        { label: "Confirm", cls: "btn-primary", action: "confirm" },
      ],
      onKey: (e) => {
        if (e.key === "Escape" || e.key === "n" || e.key === "N") {
          e.preventDefault();
          closeModal();
        } else if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          closeModal();
          if (onYes) onYes();
        }
      },
    });
    modalFooterCallback = (action) => {
      closeModal();
      if (action === "confirm" && onYes) onYes();
    };
  }

  function showError(title, message) {
    showModal(title, `<div class="modal-error">${esc(message)}</div>`, "Esc to close", {
      width: "420px",
      maxWidth: "420px",
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
      },
    });
  }

  // ── Exec Handler ────────────────────────────────────
  function handleExec() {
    const entry = getSelectedEntry();
    if (!entry || entry.type === "up") return;
    if (state.metadata?.actions && state.metadata.actions.length > 0) {
      showActionPicker(entry, state.metadata.actions);
    } else {
      rpc("stat", { path: entry.path })
        .then((result) => {
          const meta = S.extractMetadata(result);
          if (meta?.actions && meta.actions.length > 0) showActionPicker(entry, meta.actions);
          else showError("No Actions", `No actions available for ${entry.name}`);
        })
        .catch(() => {
          showError("No Actions", `No actions available for ${entry.name}`);
        });
    }
  }

  // ── Vault Management ────────────────────────────────

  function renderVaultToolbar() {
    if (!dom.vaultToolbar) return;
    if (!state.isVaultPath) {
      dom.vaultToolbar.classList.add("hidden");
      return;
    }
    dom.vaultToolbar.classList.remove("hidden");
    const depth = getVaultDepth(state.currentPath);
    let html = '<span class="vault-badge">Vault</span>';
    if (depth === 0) {
      // At vault root — can create groups
      html += '<button class="vault-btn" data-vault-action="new-group">+ Group</button>';
    } else if (depth === 1) {
      // Inside a group — can create secrets and delete group
      html += '<button class="vault-btn" data-vault-action="new-secret">+ Secret</button>';
      html +=
        '<button class="vault-btn vault-btn-danger" data-vault-action="delete-group">Delete Group</button>';
    }
    dom.vaultToolbar.innerHTML = html;
  }

  function handleVaultToolbarClick(e) {
    const btn = e.target.closest("[data-vault-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-vault-action");
    if (action === "new-group") showNewGroupModal();
    else if (action === "new-secret") showNewSecretModal();
    else if (action === "delete-group") showDeleteGroupConfirm();
  }

  function showNewGroupModal() {
    let h = '<div class="param-group">';
    h += '<div class="param-name">Group Name</div>';
    h +=
      '<div class="param-desc">Organizational grouping for secrets (e.g. aws, github, mcp)</div>';
    h += '<input class="param-input" id="vault-new-group-name" type="text" placeholder="e.g. aws">';
    h += "</div>";

    showModal("New Secret Group", h, "", {
      width: "420px",
      maxWidth: "420px",
      footerButtons: [
        { label: "Cancel", cls: "btn-secondary", action: "cancel" },
        { label: "Create", cls: "btn-primary", action: "create" },
      ],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          createNewGroup();
        }
      },
    });
    modalFooterCallback = (action) => {
      if (action === "create") createNewGroup();
      else closeModal();
    };
    setTimeout(() => {
      const inp = document.getElementById("vault-new-group-name");
      if (inp) inp.focus();
    }, 50);
  }

  function createNewGroup() {
    const inp = document.getElementById("vault-new-group-name");
    const groupName = (inp?.value || "").trim();
    if (!groupName) {
      if (inp) inp.classList.add("error");
      return;
    }
    // Create group by writing a placeholder secret, then deleting it
    // Actually, vault groups are created implicitly when a secret is written.
    // Navigate into the group path — vault will handle it.
    closeModal();
    // Write a placeholder to create the group, then show new-secret modal
    const groupPath = `${state.currentPath}/${groupName}`;
    showNewSecretModalAt(groupPath, groupName);
  }

  function showNewSecretModal() {
    showNewSecretModalAt(state.currentPath, null);
  }

  function showNewSecretModalAt(groupPath, newGroupName) {
    let h = "";
    if (newGroupName) {
      h += '<div class="param-group"><div class="param-name">Group</div>';
      h += `<div class="param-desc">${esc(newGroupName)}</div></div>`;
    }
    h += '<div class="param-group">';
    h += '<div class="param-name">Secret Name<span class="req">*</span></div>';
    h += '<div class="param-desc">Name of the secret (e.g. access-key-id, token)</div>';
    h += '<input class="param-input" id="vault-secret-name" type="text" placeholder="e.g. token">';
    h += "</div>";
    h += '<div class="param-group">';
    h += '<div class="param-name">Secret Value<span class="req">*</span></div>';
    h += '<div class="param-desc">The secret value to store (will be encrypted)</div>';
    h +=
      '<textarea class="param-input vault-textarea" id="vault-secret-value" placeholder="Enter secret value..." rows="3"></textarea>';
    h += "</div>";

    showModal("New Secret", h, "", {
      width: "480px",
      maxWidth: "480px",
      footerButtons: [
        { label: "Cancel", cls: "btn-secondary", action: "cancel" },
        { label: "Save", cls: "btn-primary", action: "save" },
      ],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
      },
    });
    modalFooterCallback = (action) => {
      if (action === "save") saveNewSecret(groupPath);
      else closeModal();
    };
    setTimeout(() => {
      const inp = document.getElementById("vault-secret-name");
      if (inp) inp.focus();
    }, 50);
  }

  function saveNewSecret(groupPath) {
    const nameInp = document.getElementById("vault-secret-name");
    const valueInp = document.getElementById("vault-secret-value");
    const name = (nameInp?.value || "").trim();
    const value = valueInp?.value || "";

    let hasError = false;
    if (!name) {
      nameInp?.classList.add("error");
      hasError = true;
    }
    if (!value) {
      valueInp?.classList.add("error");
      hasError = true;
    }
    if (hasError) return;

    const writePath = `${groupPath}/${name}`;
    closeModal();
    showModal("Saving", '<div class="loading">Encrypting and saving secret\u2026</div>', "", {
      width: "320px",
      maxWidth: "320px",
      onKey: () => {},
    });

    rpc("write", { path: writePath, content: value })
      .then(() => {
        closeModal();
        showActionResult("Save Secret", { success: true, data: `Secret saved: ${name}` });
        refresh();
      })
      .catch((err) => {
        closeModal();
        showError("Save Failed", err.message);
      });
  }

  function showEditSecretModal(path, currentValue) {
    const name = path.split("/").pop() || path;
    let h = '<div class="param-group">';
    h += `<div class="param-name">Secret: ${esc(name)}</div>`;
    h += '<div class="param-desc">Edit the secret value below</div>';
    h +=
      '<textarea class="param-input vault-textarea" id="vault-edit-value" rows="4">' +
      esc(currentValue || "") +
      "</textarea>";
    h += "</div>";

    showModal("Edit Secret", h, "", {
      width: "480px",
      maxWidth: "480px",
      footerButtons: [
        { label: "Cancel", cls: "btn-secondary", action: "cancel" },
        { label: "Save", cls: "btn-primary", action: "save" },
      ],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
      },
    });
    modalFooterCallback = (action) => {
      if (action === "save") {
        const valueInp = document.getElementById("vault-edit-value");
        const newValue = valueInp?.value || "";
        if (!newValue) {
          valueInp?.classList.add("error");
          return;
        }
        closeModal();
        rpc("write", { path: path, content: newValue })
          .then(() => {
            showActionResult("Edit Secret", { success: true, data: `Secret updated: ${name}` });
            refresh();
          })
          .catch((err) => showError("Save Failed", err.message));
      } else closeModal();
    };
    setTimeout(() => {
      const inp = document.getElementById("vault-edit-value");
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 50);
  }

  function showDeleteSecretConfirm(path) {
    const name = path.split("/").pop() || path;
    showConfirm(`Delete secret "${name}"? This cannot be undone.`, () => {
      rpc("delete", { path: path })
        .then(() => {
          showActionResult("Delete", { success: true, data: `Deleted: ${name}` });
          refresh();
        })
        .catch((err) => showError("Delete Failed", err.message));
    });
  }

  function showDeleteGroupConfirm() {
    const group = state.currentPath.split("/").pop() || state.currentPath;
    showConfirm(
      `Delete entire group "${group}" and all its secrets? This cannot be undone.`,
      () => {
        rpc("delete", { path: state.currentPath })
          .then(() => {
            showActionResult("Delete Group", { success: true, data: `Deleted group: ${group}` });
            navigate(S.getParentPath(state.currentPath));
          })
          .catch((err) => showError("Delete Failed", err.message));
      },
    );
  }

  function showConfirm(message, onYes) {
    showModal("Confirm", `<div class="confirm-msg">${esc(message)}</div>`, "", {
      width: "440px",
      maxWidth: "440px",
      footerButtons: [
        { label: "Cancel", cls: "btn-secondary", action: "cancel" },
        { label: "Delete", cls: "btn-danger", action: "confirm" },
      ],
      onKey: (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          closeModal();
          if (onYes) onYes();
        }
      },
    });
    modalFooterCallback = (action) => {
      closeModal();
      if (action === "confirm" && onYes) onYes();
    };
  }

  // ── Filter ──────────────────────────────────────────
  function updateFilter() {
    state.filterText = dom.searchInput.value;
    state.filteredEntries = S.filterEntries(state.entries, state.filterText);
    state.selectedIndex = S.clampIndex(state.selectedIndex, state.filteredEntries.length);
    renderFileList();
  }

  function endFilter(apply) {
    const selectedEntry = apply ? getSelectedEntry() : null;
    state.filterActive = false;
    if (!apply) {
      state.filterText = "";
      dom.searchInput.value = "";
      state.filteredEntries = state.entries;
    }
    if (selectedEntry && apply) {
      for (let i = 0; i < state.filteredEntries.length; i++) {
        if (state.filteredEntries[i].path === selectedEntry.path) {
          state.selectedIndex = i;
          break;
        }
      }
    }
    state.selectedIndex = S.clampIndex(state.selectedIndex, state.filteredEntries.length);
    renderFileList();
    dom.searchInput.blur();
    dom.fileList.focus();
  }

  // ── Keyboard Handler ────────────────────────────────
  function handleKeydown(e) {
    if (state.modalOpen) return;

    // Don't intercept keys when an input/textarea is focused
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") {
        e.preventDefault();
        document.activeElement.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        moveUp();
        break;
      case "ArrowDown":
        e.preventDefault();
        moveDown();
        break;
      case "Enter":
        e.preventDefault();
        enter();
        break;
      case "Backspace":
        e.preventDefault();
        goBack();
        break;
      case "Home":
        e.preventDefault();
        moveHome();
        break;
      case "End":
        e.preventDefault();
        moveEnd();
        break;
      case "PageUp":
        e.preventDefault();
        pageUp();
        break;
      case "PageDown":
        e.preventDefault();
        pageDown();
        break;
      case "Escape":
        e.preventDefault();
        endFilter(false);
        break;
      case "[":
        if (state.isPaginated) {
          e.preventDefault();
          prevPage();
        }
        break;
      case "]":
        if (state.isPaginated) {
          e.preventDefault();
          nextPage();
        }
        break;
    }
  }

  // ── Click Handlers ──────────────────────────────────
  function handleFileListClick(e) {
    const row = e.target.closest(".row");
    if (!row) return;
    const index = parseInt(row.getAttribute("data-index"), 10);
    if (Number.isNaN(index)) return;
    const entry = state.filteredEntries[index];
    if (e.detail === 2) {
      // Double-click: navigate into directories
      state.selectedIndex = index;
      if (entry && (entry.type === "directory" || entry.type === "up")) navigate(entry.path);
      else enter();
    } else {
      setSelection(index);
      // Single-click on a file: show content inline
      if (entry && entry.type !== "directory" && entry.type !== "up") {
        showFileInline(entry.path);
      }
    }
  }

  function handleBreadcrumbClick(e) {
    const seg = e.target.closest(".bc-seg");
    if (!seg || seg.classList.contains("current")) return;
    const path = seg.getAttribute("data-path");
    if (path) navigate(path);
  }

  function handleSidebarActionClick(e) {
    // Vault edit/delete
    const editEl = e.target.closest("[data-vault-edit]");
    if (editEl) {
      const path = editEl.getAttribute("data-vault-edit");
      rpc("read", { path: path })
        .then((result) => {
          let content = result.content;
          if (typeof content !== "string") content = JSON.stringify(content);
          showEditSecretModal(path, content || "");
        })
        .catch((err) => showError("Read Failed", err.message));
      return;
    }
    const deleteEl = e.target.closest("[data-vault-delete]");
    if (deleteEl) {
      showDeleteSecretConfirm(deleteEl.getAttribute("data-vault-delete"));
      return;
    }

    const actionEl = e.target.closest(".sb-action");
    if (!actionEl) return;
    handleExec();
  }

  // ── Tab Switching ──────────────────────────────────
  function switchTab(tab, fromHash) {
    if (state.activeTab === tab) return;
    state.activeTab = tab;

    // Update tab button active state
    const btns = document.querySelectorAll("#tab-bar .tab-btn");
    for (const b of btns) {
      b.classList.toggle("active", b.getAttribute("data-tab") === tab);
    }

    // Show/hide view panels
    const views = { browse: "content", mounts: "mounts-view", registry: "registry-view" };
    for (const [key, id] of Object.entries(views)) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("hidden", key !== tab);
    }
    // Also hide mount form when switching away
    const formView = document.getElementById("mount-form-view");
    if (formView && tab !== "mounts") formView.classList.add("hidden");

    if (!fromHash) {
      const hash = tab === "browse" ? `#${state.currentPath}` : `#${tab}`;
      window.history.pushState(null, "", hash);
    }

    // Load data when switching to mounts/registry tabs
    if (tab === "mounts") loadMountList();
    if (tab === "registry") loadRegistry();
  }

  // ── Push Notifications ────────────────────────────
  function handlePushNotification(method, _params) {
    if (method === "configReloaded") {
      // Refresh tree and mount list if on mounts tab
      initTree();
      registryCache = null; // invalidate registry cache
      if (state.activeTab === "mounts") loadMountList();
      if (state.activeTab === "registry") loadRegistry();
    }
  }

  // ── Mount Manager ─────────────────────────────────
  function loadMountList() {
    const listEl = document.getElementById("mounts-list");
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading">Loading mounts\u2026</div>';

    rpc("mount.list", {})
      .then((result) => {
        const mounts = result?.mounts || [];
        const failures = result?.failures || [];
        renderMountList(mounts);
        renderMountFailures(failures);
      })
      .catch((err) => {
        listEl.innerHTML =
          '<div class="mount-empty">' +
          '<p class="text-secondary">Failed to load mounts: ' +
          esc(err.message) +
          "</p></div>";
      });
  }

  function renderMountList(mounts) {
    const listEl = document.getElementById("mounts-list");
    if (!listEl) return;

    if (mounts.length === 0) {
      listEl.innerHTML =
        '<div class="mount-empty">' +
        "<p>No providers mounted.</p>" +
        '<p class="text-secondary">Add a mount to connect to a data source.</p>' +
        "</div>";
      return;
    }

    let html = "";
    for (const m of mounts) {
      const path = m.path || "";
      const name = m.name || "Unknown";
      const desc = m.description || "";
      const access = m.accessMode || "readonly";
      const category = m.category || "";
      const uri = m.uri || "";

      html += `<div class="mount-card" data-mount-path="${esc(path)}">`;
      html += '<div class="mount-card-header">';
      html += '<div class="mount-card-info">';
      html += `<span class="mount-card-path">${esc(path)}</span>`;
      html += `<span class="mount-card-name">${esc(name)}</span>`;
      html += "</div>";
      html += '<div class="mount-card-actions">';
      html += `<span class="mount-card-access ${access}">${esc(access)}</span>`;
      if (m.url) {
        html +=
          '<a class="tb-btn mount-open-btn" href="' +
          esc(m.url) +
          '" target="_blank" rel="noopener" title="Open UI">\u2197 Open</a>';
      }
      html +=
        '<button class="tb-btn mount-edit-btn" data-edit-path="' +
        esc(path) +
        '" title="Edit">\u270E</button>';
      html +=
        '<button class="tb-btn mount-remove-btn" data-remove-path="' +
        esc(path) +
        '" title="Remove">\u2715</button>';
      html += "</div></div>";
      if (desc || uri || category) {
        html += '<div class="mount-card-body">';
        if (desc) html += `<span class="mount-card-desc">${esc(desc)}</span>`;
        if (uri) html += `<span class="mount-card-uri">${esc(uri)}</span>`;
        if (category) html += `<span class="mount-card-category">${esc(category)}</span>`;
        html += "</div>";
      }
      html += "</div>";
    }
    listEl.innerHTML = html;
  }

  function renderMountFailures(failures) {
    const container = document.getElementById("mounts-failed");
    const listEl = document.getElementById("mounts-failed-list");
    if (!container || !listEl) return;

    if (failures.length === 0) {
      container.classList.add("hidden");
      listEl.innerHTML = "";
      return;
    }

    container.classList.remove("hidden");
    let html = "";
    for (const f of failures) {
      html += `<div class="mount-card failed" data-mount-path="${esc(f.path)}">`;
      html += '<div class="mount-card-header">';
      html += '<div class="mount-card-info">';
      html += `<span class="mount-card-path">${esc(f.path)}</span>`;
      html += `<span class="mount-card-error">${esc(f.reason)}</span>`;
      html += "</div>";
      html += '<div class="mount-card-actions">';
      html += `<button class="tb-btn mount-retry-btn" data-retry-path="${esc(f.path)}" title="Retry">↻</button>`;
      html += `<button class="tb-btn mount-remove-btn" data-remove-path="${esc(f.path)}" title="Remove">✕</button>`;
      html += "</div></div></div>";
    }
    listEl.innerHTML = html;
  }

  function handleMountRetry(_path) {
    rpc("config.reload", {})
      .then(() => {
        loadMountList();
        initTree();
      })
      .catch((err) => {
        showModal("Error", `<p>Retry failed: ${esc(err.message)}</p>`, "", {
          width: "400px",
          footerButtons: [{ label: "OK", cls: "btn-secondary", action: "close" }],
        });
        modalFooterCallback = () => closeModal();
      });
  }

  function showMountForm(editPath) {
    state.mountEditPath = editPath;
    const formView = document.getElementById("mount-form-view");
    const mountsView = document.getElementById("mounts-view");
    const title = document.getElementById("mount-form-title");
    const status = document.getElementById("mount-form-status");

    if (mountsView) mountsView.classList.add("hidden");
    if (formView) formView.classList.remove("hidden");
    if (title) title.textContent = editPath ? "Edit Mount" : "Add Mount";
    if (status) {
      status.classList.add("hidden");
      status.textContent = "";
    }

    // Reset form
    document.getElementById("mf-uri").value = "";
    document.getElementById("mf-path").value = "";
    document.getElementById("mf-desc").value = "";
    document.getElementById("mf-auth").value = "";
    document.getElementById("mf-namespace").value = "";
    document.getElementById("mf-options").value = "";
    const readonlyRadio = document.querySelector('input[name="mf-access"][value="readonly"]');
    if (readonlyRadio) readonlyRadio.checked = true;

    // Enable URI+path for new mounts, disable for edit
    document.getElementById("mf-uri").disabled = !!editPath;
    document.getElementById("mf-path").disabled = !!editPath;

    if (editPath) {
      // Pre-fill from mount list data
      rpc("mount.list", {}).then((result) => {
        const mounts = result?.mounts || [];
        const m = mounts.find((x) => x.path === editPath);
        if (m) {
          document.getElementById("mf-uri").value = m.uri || "";
          document.getElementById("mf-path").value = m.path || "";
          document.getElementById("mf-desc").value = m.description || "";
          const modeRadio = document.querySelector(
            `input[name="mf-access"][value="${m.accessMode || "readonly"}"]`,
          );
          if (modeRadio) modeRadio.checked = true;
        }
      });
      if (!window.location.hash.startsWith("#mounts/edit")) {
        window.history.pushState(null, "", `#mounts/edit?path=${encodeURIComponent(editPath)}`);
      }
    } else {
      if (window.location.hash !== "#mounts/add") {
        window.history.pushState(null, "", "#mounts/add");
      }
    }
  }

  function hideMountForm() {
    const formView = document.getElementById("mount-form-view");
    const mountsView = document.getElementById("mounts-view");
    if (formView) formView.classList.add("hidden");
    if (mountsView) mountsView.classList.remove("hidden");
    state.mountEditPath = null;
    window.history.pushState(null, "", "#mounts");
    loadMountList();
  }

  function showMountStatus(msg, isError) {
    const status = document.getElementById("mount-form-status");
    if (!status) return;
    status.textContent = msg;
    status.className = isError ? "error" : "success";
    status.classList.remove("hidden");
  }

  function handleMountFormSubmit(e) {
    e.preventDefault();
    const uri = document.getElementById("mf-uri").value.trim();
    const path = document.getElementById("mf-path").value.trim();
    const desc = document.getElementById("mf-desc").value.trim();
    const access = document.querySelector('input[name="mf-access"]:checked')?.value || "readonly";
    const auth = document.getElementById("mf-auth").value.trim();
    const namespace = document.getElementById("mf-namespace").value.trim();
    const optionsRaw = document.getElementById("mf-options").value.trim();

    let options;
    if (optionsRaw) {
      try {
        options = JSON.parse(optionsRaw);
      } catch (_e) {
        showMountStatus("Invalid JSON in Options field", true);
        return;
      }
    }

    const saveBtn = document.getElementById("btn-mount-save");
    if (saveBtn) saveBtn.disabled = true;

    if (state.mountEditPath) {
      // Update existing mount
      rpc("mount.update", {
        path: state.mountEditPath,
        description: desc || undefined,
        accessMode: access,
        auth: auth || undefined,
      })
        .then(() => {
          showMountStatus("Mount updated successfully", false);
          setTimeout(hideMountForm, 800);
        })
        .catch((err) => {
          showMountStatus(`Update failed: ${err.message}`, true);
        })
        .finally(() => {
          if (saveBtn) saveBtn.disabled = false;
        });
    } else {
      // Add new mount
      const payload = { uri, path, accessMode: access };
      if (desc) payload.description = desc;
      if (auth) payload.auth = auth;
      if (namespace) payload.namespace = namespace;
      if (options) payload.options = options;

      rpc("mount.add", payload)
        .then(() => {
          showMountStatus("Mount added successfully", false);
          initTree();
          setTimeout(hideMountForm, 800);
        })
        .catch((err) => {
          showMountStatus(`Add failed: ${err.message}`, true);
        })
        .finally(() => {
          if (saveBtn) saveBtn.disabled = false;
        });
    }
  }

  function handleMountTest() {
    const uri = document.getElementById("mf-uri").value.trim();
    const auth = document.getElementById("mf-auth").value.trim();
    if (!uri) {
      showMountStatus("URI is required to test", true);
      return;
    }

    const testBtn = document.getElementById("btn-mount-test");
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = "Testing\u2026";
    }

    rpc("mount.test", { uri, auth: auth || undefined })
      .then((result) => {
        if (result.success) {
          const name = result.providerName ? ` (${result.providerName})` : "";
          showMountStatus(`Connection successful${name}`, false);
        } else {
          showMountStatus(`Connection failed: ${result.error || "Unknown error"}`, true);
        }
      })
      .catch((err) => {
        showMountStatus(`Test failed: ${err.message}`, true);
      })
      .finally(() => {
        if (testBtn) {
          testBtn.disabled = false;
          testBtn.textContent = "Test Connection";
        }
      });
  }

  function handleMountRemove(path) {
    showModal(
      "Remove Mount",
      "<p>Remove mount at <strong>" +
        esc(path) +
        "</strong>?</p>" +
        "<p>This will unmount the provider and remove it from config.</p>",
      "",
      {
        width: "440px",
        maxWidth: "440px",
        footerButtons: [
          { label: "Cancel", cls: "btn-secondary", action: "cancel" },
          { label: "Remove", cls: "btn-danger", action: "remove" },
        ],
      },
    );
    modalFooterCallback = (action) => {
      closeModal();
      if (action === "remove") {
        rpc("mount.remove", { path })
          .then(() => {
            initTree();
            loadMountList();
          })
          .catch((err) => {
            showModal("Error", `<p>Remove failed: ${esc(err.message)}</p>`, "", {
              width: "400px",
              footerButtons: [{ label: "OK", cls: "btn-secondary", action: "close" }],
            });
            modalFooterCallback = () => closeModal();
          });
      }
    };
  }

  function handleMountsListClick(e) {
    const retryBtn = e.target.closest(".mount-retry-btn");
    if (retryBtn) {
      const path = retryBtn.getAttribute("data-retry-path");
      if (path) handleMountRetry(path);
      return;
    }
    const editBtn = e.target.closest(".mount-edit-btn");
    if (editBtn) {
      const path = editBtn.getAttribute("data-edit-path");
      if (path) showMountForm(path);
      return;
    }
    const removeBtn = e.target.closest(".mount-remove-btn");
    if (removeBtn) {
      const path = removeBtn.getAttribute("data-remove-path");
      if (path) handleMountRemove(path);
      return;
    }
    // Click on card body navigates to that path in browse
    const card = e.target.closest(".mount-card");
    if (card && !card.classList.contains("failed") && !e.target.closest("button")) {
      const path = card.getAttribute("data-mount-path");
      if (path) {
        switchTab("browse");
        navigate(path);
      }
    }
  }

  // ── Registry ─────────────────────────────────────────

  const CATEGORY_META = {
    storage: { label: "Storage", icon: "\uD83D\uDCC1" },
    "version-control": { label: "Version Control", icon: "\uD83D\uDD00" },
    database: { label: "Database", icon: "\uD83D\uDDC3" },
    "structured-data": { label: "Structured Data", icon: "\uD83D\uDCC4" },
    compute: { label: "Compute", icon: "\u2699" },
    composite: { label: "Composite", icon: "\uD83D\uDCE6" },
    integration: { label: "Integration", icon: "\uD83D\uDD0C" },
    "cloud-storage": { label: "Cloud Storage", icon: "\u2601" },
    "cloud-compute": { label: "Cloud Compute", icon: "\uD83D\uDDA5" },
    "cloud-dns": { label: "Cloud DNS", icon: "\uD83C\uDF10" },
    "cloud-platform": { label: "Cloud Platform", icon: "\u26A1" },
    ai: { label: "AI", icon: "\uD83E\uDD16" },
    device: { label: "Device", icon: "\uD83D\uDCF1" },
    infrastructure: { label: "Infrastructure", icon: "\uD83C\uDFD7" },
    iot: { label: "IoT", icon: "\uD83C\uDFE0" },
    network: { label: "Network", icon: "\uD83C\uDF10" },
    security: { label: "Security", icon: "\uD83D\uDD12" },
    recipe: { label: "Recipes", icon: "\uD83D\uDCCB" },
  };

  let registryCache = null;
  let registryFilter = "";

  function loadRegistry() {
    const listEl = document.getElementById("registry-list");
    if (!listEl) return;

    // Use cache if available
    if (registryCache) {
      renderRegistry(registryCache);
      return;
    }

    listEl.innerHTML = '<div class="loading">Loading providers\u2026</div>';

    // Try registry.list RPC first (scan mode), fall back to AFS list+read
    rpc("registry.list", {})
      .then((result) => {
        const providers = result?.providers || [];
        if (providers.length > 0) {
          registryCache = providers;
          renderRegistry(providers);
          return;
        }
        // Fall back to AFS path-based discovery
        return loadRegistryFromAFS(listEl);
      })
      .catch(() => {
        // registry.list not available — fall back to AFS path-based discovery
        return loadRegistryFromAFS(listEl);
      });
  }

  function loadRegistryFromAFS(listEl) {
    const source = "/registry/providers";
    rpc("list", { path: source })
      .then((result) => {
        const providerMap = {};
        const entries = result?.list || [];
        for (const entry of entries) {
          const entryId = entry.id || entry.name;
          if (entryId && !providerMap[entryId]) {
            providerMap[entryId] = source;
          }
        }
        const providerNames = Object.keys(providerMap);
        if (providerNames.length === 0) {
          listEl.innerHTML =
            '<div class="mount-empty"><p>No providers found.</p>' +
            '<p class="text-secondary">Registry may not be mounted.</p></div>';
          return;
        }

        const reads = providerNames.map((name) =>
          rpc("read", { path: `${providerMap[name]}/${name}/manifest.json` })
            .then((r) => {
              const raw = r?.content;
              if (!raw) return null;
              try {
                return typeof raw === "string" ? JSON.parse(raw) : raw;
              } catch (_e) {
                return null;
              }
            })
            .catch(() => null),
        );

        return Promise.all(reads).then((manifests) => {
          const providers = manifests.filter(Boolean);
          registryCache = providers;
          renderRegistry(providers);
        });
      })
      .catch((err) => {
        listEl.innerHTML =
          '<div class="mount-empty"><p class="text-secondary">Failed to load registry: ' +
          esc(err.message) +
          "</p></div>";
      });
  }

  function renderRegistry(providers) {
    const listEl = document.getElementById("registry-list");
    if (!listEl) return;

    // Apply filter
    const query = registryFilter.toLowerCase();
    const filtered = query
      ? providers.filter(
          (p) =>
            p.name?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query) ||
            p.category?.toLowerCase().includes(query) ||
            p.tags?.some((t) => t.toLowerCase().includes(query)),
        )
      : providers;

    if (filtered.length === 0) {
      listEl.innerHTML =
        '<div class="mount-empty"><p class="text-secondary">' +
        (query ? "No providers match the filter." : "No providers found.") +
        "</p></div>";
      return;
    }

    // Group by category
    const groups = {};
    for (const p of filtered) {
      const cat = p.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }

    // Sort categories by predefined order
    const categoryOrder = Object.keys(CATEGORY_META);
    const sortedCats = Object.keys(groups).sort((a, b) => {
      const ai = categoryOrder.indexOf(a);
      const bi = categoryOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    let html = "";
    for (const cat of sortedCats) {
      const meta = CATEGORY_META[cat] || { label: cat, icon: "\uD83D\uDCE6" };
      html += '<div class="registry-group">';
      html +=
        '<h3 class="registry-group-title">' +
        meta.icon +
        " " +
        esc(meta.label) +
        '<span class="registry-group-count">' +
        groups[cat].length +
        "</span></h3>";

      for (const p of groups[cat]) {
        const name = p.name || "unknown";
        const desc = (p.description || "").split("\n")[0]; // first line only
        const uri = p.uriTemplate || "";
        const tags = p.tags || [];

        html +=
          '<div class="registry-card" data-provider="' +
          esc(name) +
          '" data-type="' +
          esc(p.type || "provider") +
          '">';
        html += '<div class="registry-card-header">';
        html += '<div class="registry-card-info">';
        html += `<span class="registry-card-name">${esc(name)}`;
        if (p.type === "recipe") {
          html += ' <span class="registry-recipe-badge">Recipe</span>';
        }
        html += "</span>";
        html += `<span class="registry-card-uri">${esc(uri)}</span>`;
        html += "</div>";
        html +=
          '<button class="primary-btn registry-mount-btn" data-provider="' +
          esc(name) +
          '" data-uri="' +
          esc(uri) +
          '">+ Mount</button>';
        html += "</div>";
        if (desc) html += `<div class="registry-card-desc">${esc(desc)}</div>`;
        if (tags.length > 0) {
          html += '<div class="registry-card-tags">';
          for (const t of tags) {
            html += `<span class="registry-tag">${esc(t)}</span>`;
          }
          html += "</div>";
        }
        html += "</div>";
      }
      html += "</div>";
    }

    listEl.innerHTML = html;
  }

  function handleRegistryClick(e) {
    const mountBtn = e.target.closest(".registry-mount-btn");
    if (mountBtn) {
      const uri = mountBtn.getAttribute("data-uri") || "";
      const providerName = mountBtn.getAttribute("data-provider") || "";
      // Switch to mount form with URI pre-filled
      switchTab("mounts");
      showMountForm(null);
      const uriInput = document.getElementById("mf-uri");
      const pathInput = document.getElementById("mf-path");
      if (uriInput) uriInput.value = uri;
      if (pathInput) pathInput.value = `/modules/${providerName}`;
      return;
    }
    // Click on card body → browse the registry path
    const card = e.target.closest(".registry-card");
    if (card && !e.target.closest("button")) {
      const name = card.getAttribute("data-provider");
      const type = card.getAttribute("data-type") || "provider";
      if (name) {
        switchTab("browse");
        const subdir = type === "recipe" ? "recipes" : "providers";
        navigate(`/registry/${subdir}/${name}`);
      }
    }
  }

  function handleRegistrySearch(e) {
    registryFilter = e.target.value.trim();
    if (registryCache) renderRegistry(registryCache);
  }

  // ── Init ────────────────────────────────────────────
  function init() {
    dom.treeBody = document.getElementById("tree-body");
    dom.breadcrumb = document.getElementById("breadcrumb");
    dom.searchInput = document.getElementById("search-input");
    dom.dirView = document.getElementById("dir-view");
    dom.vaultToolbar = document.getElementById("vault-toolbar");
    dom.fileList = document.getElementById("file-list");
    dom.detailView = document.getElementById("detail-view");
    dom.detailFilename = document.getElementById("detail-filename");
    dom.detailContent = document.getElementById("detail-content");
    dom.sidebar = document.getElementById("sidebar");
    dom.statusLeft = document.getElementById("status-left");
    dom.statusRight = document.getElementById("status-right");
    dom.modalBackdrop = document.getElementById("modal-backdrop");
    dom.modal = document.getElementById("modal");
    dom.modalTitle = document.getElementById("modal-title");
    dom.modalBody = document.getElementById("modal-body");
    dom.modalFooter = document.getElementById("modal-footer");
    dom.modalClose = document.getElementById("modal-close");

    document.addEventListener("keydown", handleKeydown);
    dom.treeBody.addEventListener("click", handleTreeClick);
    dom.fileList.addEventListener("click", handleFileListClick);
    dom.breadcrumb.addEventListener("click", handleBreadcrumbClick);
    dom.sidebar.addEventListener("click", handleSidebarActionClick);
    dom.vaultToolbar.addEventListener("click", handleVaultToolbarClick);
    dom.statusRight.addEventListener("click", (e) => {
      var btn = e.target.closest(".pg-btn");
      if (!btn || btn.disabled) return;
      if (btn.classList.contains("pg-first")) firstPage();
      else if (btn.classList.contains("pg-prev")) prevPage();
      else if (btn.classList.contains("pg-next")) nextPage();
      else if (btn.classList.contains("pg-last")) lastPage();
    });
    dom.searchInput.addEventListener("input", updateFilter);
    dom.modalBackdrop.addEventListener("click", () => {
      if (state.modalOpen) closeModal();
    });
    dom.modalClose.addEventListener("click", () => {
      if (state.modalOpen) closeModal();
    });
    document.getElementById("detail-back").addEventListener("click", goBackToDir);
    document.getElementById("btn-theme").addEventListener("click", toggleTheme);
    document.getElementById("btn-refresh").addEventListener("click", refresh);
    document.getElementById("btn-help").addEventListener("click", showHelp);

    // Tab bar
    const tabBar = document.getElementById("tab-bar");
    if (tabBar) {
      tabBar.addEventListener("click", (e) => {
        const btn = e.target.closest(".tab-btn");
        if (!btn) return;
        const tab = btn.getAttribute("data-tab");
        if (tab) switchTab(tab);
      });
    }

    // Mount manager events
    const mountsList = document.getElementById("mounts-list");
    if (mountsList) mountsList.addEventListener("click", handleMountsListClick);
    const addMountBtn = document.getElementById("btn-add-mount");
    if (addMountBtn) addMountBtn.addEventListener("click", () => showMountForm(null));
    const mountForm = document.getElementById("mount-form");
    if (mountForm) mountForm.addEventListener("submit", handleMountFormSubmit);
    const mountCancelBtn = document.getElementById("btn-mount-cancel");
    if (mountCancelBtn) mountCancelBtn.addEventListener("click", hideMountForm);
    const mountTestBtn = document.getElementById("btn-mount-test");
    if (mountTestBtn) mountTestBtn.addEventListener("click", handleMountTest);
    const failedList = document.getElementById("mounts-failed-list");
    if (failedList) failedList.addEventListener("click", handleMountsListClick);

    // Registry events
    const registryList = document.getElementById("registry-list");
    if (registryList) registryList.addEventListener("click", handleRegistryClick);
    const registrySearch = document.getElementById("registry-search");
    if (registrySearch) registrySearch.addEventListener("input", handleRegistrySearch);

    initResizers();
    applyColWidths();

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    window.addEventListener("resize", () => {
      const s = dom.fileList.querySelector(".row.selected");
      if (s) s.scrollIntoView({ block: "nearest" });
    });

    // Determine initial view from hash
    const initialHash = window.location.hash.slice(1);
    if (initialHash === "mounts" || initialHash.indexOf("mounts/") === 0) {
      state.activeTab = "mounts";
      // Update tab button states
      for (const b of document.querySelectorAll("#tab-bar .tab-btn")) {
        b.classList.toggle("active", b.getAttribute("data-tab") === "mounts");
      }
      document.getElementById("content").classList.add("hidden");
      document.getElementById("mounts-view").classList.remove("hidden");
    } else if (initialHash === "registry") {
      state.activeTab = "registry";
      for (const b of document.querySelectorAll("#tab-bar .tab-btn")) {
        b.classList.toggle("active", b.getAttribute("data-tab") === "registry");
      }
      document.getElementById("content").classList.add("hidden");
      document.getElementById("registry-view").classList.remove("hidden");
    } else {
      state.currentPath = getPathFromHash();
    }

    renderBreadcrumb();
    renderStatusBar();
    renderFileList();
    connectWS();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
