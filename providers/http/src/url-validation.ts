/**
 * SSRF (Server-Side Request Forgery) protection for AFSHttpClient.
 *
 * Validates URLs to prevent requests to internal/private network resources.
 * Blocks requests to:
 * - Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
 * - Loopback addresses (::1, 127.0.0.1)
 * - Link-local addresses (fe80::)
 * - localhost and 0.0.0.0
 * - Non-HTTP(S) schemes
 */

/**
 * Error thrown when a URL is blocked by SSRF validation.
 */
export class SSRFError extends Error {
  constructor(
    url: string,
    public readonly reason: string,
  ) {
    super(`SSRF protection: URL ${url} is blocked — ${reason}`);
    this.name = "SSRFError";
  }
}

/**
 * Check if a hostname is a private/internal address.
 */
function isPrivateHostname(hostname: string): string | null {
  const lower = hostname.toLowerCase();

  // Localhost variants
  if (lower === "localhost" || lower === "localhost.localdomain") {
    return "localhost is not allowed";
  }

  // 0.0.0.0
  if (lower === "0.0.0.0") {
    return "0.0.0.0 is not allowed";
  }

  // IPv6 loopback
  if (lower === "::1" || lower === "[::1]") {
    return "IPv6 loopback is not allowed";
  }

  return null;
}

/**
 * Check if an IP address is in a private/reserved range.
 */
function isPrivateIP(ip: string): string | null {
  // Remove IPv6 brackets
  const cleanIP = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;

  // IPv4 checks
  const ipv4Parts = cleanIP.split(".");
  if (ipv4Parts.length === 4) {
    const octets = ipv4Parts.map(Number);
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
      return null; // Not a valid IPv4, let it through (hostname resolution will validate)
    }

    const [a, b] = octets;

    // 127.x.x.x — loopback
    if (a === 127) return "loopback address (127.0.0.0/8)";

    // 10.x.x.x — private
    if (a === 10) return "private network (10.0.0.0/8)";

    // 172.16.0.0 - 172.31.255.255 — private
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
      return "private network (172.16.0.0/12)";
    }

    // 192.168.x.x — private
    if (a === 192 && b === 168) return "private network (192.168.0.0/16)";

    // 169.254.x.x — link-local (AWS IMDS lives at 169.254.169.254)
    if (a === 169 && b === 254) return "link-local address (169.254.0.0/16)";

    // 0.0.0.0 — unspecified
    if (a === 0) return "unspecified address (0.0.0.0/8)";
  }

  // IPv6 checks (simplified)
  if (cleanIP.includes(":")) {
    const lower = cleanIP.toLowerCase();

    // ::1 — loopback
    if (lower === "::1" || lower === "0000:0000:0000:0000:0000:0000:0000:0001") {
      return "IPv6 loopback (::1)";
    }

    // fe80:: — link-local
    if (lower.startsWith("fe80:")) {
      return "IPv6 link-local (fe80::/10)";
    }

    // fc00:: / fd00:: — unique local address
    if (lower.startsWith("fc") || lower.startsWith("fd")) {
      return "IPv6 unique local (fc00::/7)";
    }

    // :: — unspecified
    if (lower === "::" || lower === "0000:0000:0000:0000:0000:0000:0000:0000") {
      return "IPv6 unspecified (::)";
    }
  }

  return null;
}

/**
 * Validate a URL for SSRF safety.
 *
 * @param url - The URL to validate
 * @param allowPrivateNetwork - If true, skip private network checks (for local development)
 * @throws SSRFError if the URL is blocked
 */
export function validateUrl(url: string, allowPrivateNetwork = false): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SSRFError(url, "invalid URL");
  }

  // Only allow HTTP and HTTPS schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SSRFError(url, `scheme "${parsed.protocol}" is not allowed, only http: and https:`);
  }

  // Skip private network checks if explicitly allowed
  if (allowPrivateNetwork) return;

  const hostname = parsed.hostname;

  // Check hostname-based blocks
  const hostnameReason = isPrivateHostname(hostname);
  if (hostnameReason) {
    throw new SSRFError(url, hostnameReason);
  }

  // Check IP-based blocks
  const ipReason = isPrivateIP(hostname);
  if (ipReason) {
    throw new SSRFError(url, ipReason);
  }
}
