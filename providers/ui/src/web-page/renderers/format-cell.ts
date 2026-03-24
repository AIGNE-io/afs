/**
 * Shared cell formatter — injected as a global function `_formatCell(val, fmt)`
 * into the browser IIFE.  Called by both list.ts and surface.ts renderers.
 *
 * Format syntax: "formatter" or "formatter:arg1:arg2" (colon-separated).
 * See blockchain-explorer-plan.md Gap 1 for the full spec.
 */
export const FORMAT_CELL_JS = `
function _formatCell(val, fmt) {
  if (!fmt) return val != null ? String(val) : "";
  var parts = fmt.split(":");
  var fn = parts[0];
  if (val == null && fn !== "default" && fn !== "count") return "";

  if (fn === "truncate") {
    var max = parseInt(parts[1]) || 12;
    var s = String(val);
    return s.length > max ? s.slice(0, max) + "..." : s;
  }

  if (fn === "timeago") {
    try {
      var diff = Date.now() - new Date(val).getTime();
      if (isNaN(diff)) return String(val);
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return mins + (mins === 1 ? " minute" : " minutes") + " ago";
      var hours = Math.floor(mins / 60);
      if (hours < 24) return hours + (hours === 1 ? " hour" : " hours") + " ago";
      var days = Math.floor(hours / 24);
      if (days < 30) return days + (days === 1 ? " day" : " days") + " ago";
      var months = Math.floor(days / 30);
      return months + (months === 1 ? " month" : " months") + " ago";
    } catch(_) { return String(val); }
  }

  if (fn === "datetime") {
    try {
      var d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toISOString().replace("T", " ").slice(0, 19);
    } catch(_) { return String(val); }
  }

  if (fn === "number") {
    var num = Number(val);
    if (isNaN(num)) return String(val);
    var decimals = parts[1] != null ? parseInt(parts[1]) : -1;
    if (decimals >= 0) {
      return num.toLocaleString("en-US", {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
      });
    }
    return num.toLocaleString("en-US");
  }

  if (fn === "bignum") {
    try {
      var dec = parseInt(parts[1]) || 0;
      var n;
      // Use BigInt for large integer strings to avoid precision loss
      var s = String(val);
      if (typeof BigInt !== "undefined" && /^-?\\d+$/.test(s) && (s.length > 15 || dec > 0)) {
        var bi = BigInt(s);
        if (dec > 0) {
          var divisor = BigInt("1" + "0".repeat(dec));
          // Integer part via BigInt, fractional part via remainder
          var intPart = bi / divisor;
          var rem = bi % divisor;
          if (rem < BigInt(0)) rem = -rem;
          // Convert to float only for the final abbreviated display
          var fracStr = rem.toString().padStart(dec, "0").slice(0, 6);
          n = Number(intPart) + Number("0." + fracStr);
        } else {
          n = Number(bi);
        }
      } else {
        n = Number(val) / Math.pow(10, dec);
      }
      if (isNaN(n)) return String(val);
      if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
      if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
      return n.toFixed(2);
    } catch(_) { return String(val); }
  }

  if (fn === "boolean") {
    var trueL = parts[1] || "Yes";
    var falseL = parts[2] || "No";
    return (val === true || val === "true") ? trueL : falseL;
  }

  if (fn === "bytes") {
    var b = Number(val);
    if (isNaN(b)) return String(val);
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1073741824).toFixed(1) + " GB";
  }

  if (fn === "json") {
    try { return JSON.stringify(val); } catch(_) { return String(val); }
  }

  if (fn === "default") {
    return (val == null || val === "") ? (parts[1] || "") : String(val);
  }

  if (fn === "uppercase") {
    return String(val).toUpperCase();
  }

  if (fn === "lowercase") {
    return String(val).toLowerCase();
  }

  if (fn === "count") {
    if (Array.isArray(val)) return String(val.length);
    if (val && typeof val === "object") return String(Object.keys(val).length);
    if (typeof val === "string") return String(val.length);
    return "0";
  }

  if (fn === "date") {
    try {
      var d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      var style = parts[1] || "medium";
      if (style === "time") {
        return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(d);
      }
      var validStyles = { short: 1, medium: 1, long: 1, full: 1 };
      if (!validStyles[style]) style = "medium";
      return new Intl.DateTimeFormat(undefined, { dateStyle: style }).format(d);
    } catch(_) { return String(val); }
  }

  return String(val);
}
`;
