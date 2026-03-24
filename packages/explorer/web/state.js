((root) => {
  // ── Formatting ───────────────────────────────────────────

  function formatSize(bytes) {
    if (bytes === undefined || bytes === null) return "";
    if (bytes === 0) return "0B";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  function formatDate(date) {
    if (!date) return "";
    if (typeof date === "string") date = new Date(date);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0 && now.getDate() === date.getDate()) {
      const h = String(date.getHours()).padStart(2, "0");
      const m = String(date.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    }
    if (diffDays < 7 && diffDays >= 0) {
      return `${diffDays || 1}d ago`;
    }
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}`;
  }

  // ── Type inference ───────────────────────────────────────

  function inferType(entry) {
    const meta = entry.meta || {};
    const kinds = meta.kinds || [];
    const kind = meta.kind || "";

    if (kinds.indexOf("afs:executable") >= 0) return "exec";
    if (kind === "afs:link" || kinds.indexOf("afs:link") >= 0) return "link";
    const cc =
      entry.childrenCount !== undefined
        ? entry.childrenCount
        : meta.childrenCount !== undefined
          ? meta.childrenCount
          : undefined;
    if (cc === -1 || cc > 0) return "directory";
    return "file";
  }

  function getEntryIcon(type) {
    switch (type) {
      case "directory":
        return "[D]";
      case "up":
        return "[D]";
      case "exec":
        return "[X]";
      case "link":
        return "[L]";
      default:
        return "   ";
    }
  }

  // ── Entry conversion ─────────────────────────────────────

  function toExplorerEntry(afsEntry) {
    const pathParts = afsEntry.path.split("/");
    const name = pathParts[pathParts.length - 1] || afsEntry.path;
    const meta = afsEntry.meta || {};
    const type = inferType(afsEntry);

    return {
      name: name,
      path: afsEntry.path,
      type: type,
      size: afsEntry.size || meta.size,
      modified: afsEntry.updatedAt || meta.modified,
      childrenCount:
        afsEntry.childrenCount !== undefined ? afsEntry.childrenCount : meta.childrenCount,
      hash: meta.hash,
      description: meta.description || afsEntry.description,
      provider: meta.provider,
      icon: meta.icon,
      kind: meta.kind,
      kinds: meta.kinds,
      label: meta.label,
      tags: meta.tags,
      actions: afsEntry.actions,
      raw: afsEntry,
    };
  }

  // ── Sorting ──────────────────────────────────────────────

  function sortEntries(entries) {
    return entries.slice().sort((a, b) => {
      if (a.type === "up") return -1;
      if (b.type === "up") return 1;
      const aDir = a.type === "directory" ? 0 : 1;
      const bDir = b.type === "directory" ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }

  // ── Virtual directory building ───────────────────────────

  function buildImmediateChildren(basePath, afsEntries) {
    const normalizedBase = basePath === "/" ? "" : basePath;
    const seen = {};
    const result = [];

    for (let i = 0; i < afsEntries.length; i++) {
      const entry = afsEntries[i];
      const entryPath = entry.path;

      // Skip the base itself
      if (entryPath === basePath || entryPath === normalizedBase) continue;

      // Get relative path
      let rel = entryPath;
      if (normalizedBase && entryPath.indexOf(`${normalizedBase}/`) === 0) {
        rel = entryPath.slice(normalizedBase.length + 1);
      } else if (normalizedBase === "" && entryPath.charAt(0) === "/") {
        rel = entryPath.slice(1);
      }

      const parts = rel.split("/");
      const immediateName = parts[0];

      if (!immediateName) continue;

      if (parts.length === 1) {
        // Direct child
        if (!seen[immediateName]) {
          seen[immediateName] = true;
          result.push(toExplorerEntry(entry));
        }
      } else {
        // Deeper path — create virtual directory
        if (!seen[immediateName]) {
          seen[immediateName] = true;
          const virtualPath = normalizedBase
            ? `${normalizedBase}/${immediateName}`
            : `/${immediateName}`;
          result.push({
            name: immediateName,
            path: virtualPath,
            type: "directory",
            childrenCount: -1,
          });
        }
      }
    }

    return result;
  }

  // ── Filtering ────────────────────────────────────────────

  function filterEntries(entries, filterText) {
    if (!filterText) return entries;
    const lower = filterText.toLowerCase();
    return entries.filter((e) => e.type === "up" || e.name.toLowerCase().indexOf(lower) >= 0);
  }

  // ── Navigation ───────────────────────────────────────────

  function getParentPath(path) {
    if (!path || path === "/") return "/";
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    return parts.length === 0 ? "/" : `/${parts.join("/")}`;
  }

  function clampIndex(index, length) {
    if (length === 0) return 0;
    return Math.max(0, Math.min(length - 1, index));
  }

  // ── Explain formatting ───────────────────────────────────

  function formatExplain(entry) {
    const lines = [];
    lines.push(`OBJECT ${entry.path || "/"}`);
    lines.push("");

    const meta = entry.meta || {};
    const desc = meta.description || entry.description;
    if (desc) {
      lines.push("DESCRIPTION");
      lines.push(desc);
      lines.push("");
    }

    const size = entry.size || meta.size;
    if (size !== undefined) {
      lines.push("SIZE");
      lines.push(`${size} bytes`);
      lines.push("");
    }

    const cc = entry.childrenCount !== undefined ? entry.childrenCount : meta.childrenCount;
    if (cc !== undefined && cc >= 0) {
      lines.push("CHILDREN");
      lines.push(`${cc} items`);
      lines.push("");
    }

    const provider = meta.provider;
    if (provider) {
      lines.push("PROVIDER");
      lines.push(provider);
      lines.push("");
    }

    const hash = meta.hash;
    if (hash) {
      lines.push("HASH");
      lines.push(hash);
      lines.push("");
    }

    return lines.join("\n");
  }

  // ── Metadata extraction ──────────────────────────────────

  function extractMetadata(statEntry) {
    if (!statEntry) return null;
    const meta = statEntry.meta || {};
    const builtinKeys = [
      "size",
      "hash",
      "provider",
      "description",
      "kind",
      "kinds",
      "label",
      "tags",
      "icon",
      "childrenCount",
      "mountPath",
      "severity",
    ];
    const extra = {};
    for (const key in meta) {
      if (Object.hasOwn(meta, key) && builtinKeys.indexOf(key) < 0 && meta[key] !== undefined) {
        extra[key] = meta[key];
      }
    }

    return {
      path: statEntry.path,
      size: statEntry.size || meta.size,
      modified: statEntry.updatedAt || meta.modified,
      childrenCount:
        statEntry.childrenCount !== undefined ? statEntry.childrenCount : meta.childrenCount,
      hash: meta.hash,
      description: meta.description || statEntry.description,
      provider: meta.provider,
      mountPath: meta.mountPath,
      uri: meta.uri,
      kind: meta.kind,
      kinds: meta.kinds,
      permissions: meta.permissions,
      actions: statEntry.actions,
      extra: extra,
      inputSchema: meta.inputSchema,
    };
  }

  // ── Params type coercion ─────────────────────────────────

  function coerceParamValue(value, type) {
    const trimmed = (value || "").trim();
    if (!trimmed) return undefined;

    switch (type) {
      case "number":
      case "integer": {
        const n = Number(trimmed);
        return Number.isNaN(n) ? trimmed : n;
      }
      case "boolean":
        return trimmed.toLowerCase() === "true";
      case "object":
      case "array":
        try {
          return JSON.parse(trimmed);
        } catch (_e) {
          return trimmed;
        }
      default:
        try {
          return JSON.parse(trimmed);
        } catch (_e) {
          return trimmed;
        }
    }
  }

  // ── Exports ──────────────────────────────────────────────

  const exports = {
    formatSize: formatSize,
    formatDate: formatDate,
    inferType: inferType,
    getEntryIcon: getEntryIcon,
    toExplorerEntry: toExplorerEntry,
    sortEntries: sortEntries,
    buildImmediateChildren: buildImmediateChildren,
    filterEntries: filterEntries,
    getParentPath: getParentPath,
    clampIndex: clampIndex,
    formatExplain: formatExplain,
    extractMetadata: extractMetadata,
    coerceParamValue: coerceParamValue,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exports;
  } else {
    root.AFSState = exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this);
