/**
 * Temporary HTTP Server for credential collection.
 *
 * Supports two modes:
 * 1. Form collection: GET /auth renders a form from JSON Schema, POST /auth returns submitted data
 * 2. OAuth callback: GET /callback captures query params for waitForCallback()
 *
 * Security:
 * - Binds to 127.0.0.1 only (no external connections)
 * - One-time nonce per request to prevent CSRF
 * - Auto-closes after 5 minutes
 * - POST data is never logged
 */

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_PORT_RETRIES = 3;

export interface AuthServer {
  /** Base URL of the server, e.g. http://127.0.0.1:12345 */
  baseURL: string;

  /** Callback URL for OAuth redirects: baseURL + /callback */
  callbackURL: string;

  /** Wait for a callback request at /callback. Returns query params or null on timeout/close. */
  waitForCallback(options?: { timeout?: number }): Promise<Record<string, string> | null>;

  /**
   * Serve a form for collecting fields, wait for submission.
   * Returns submitted values or null on timeout/close.
   *
   * @param schema - JSON Schema describing fields to collect
   * @param options - Optional title and timeout
   */
  waitForForm(
    schema: Record<string, any>,
    options?: { title?: string; timeout?: number },
  ): Promise<Record<string, unknown> | null>;

  /** Close the server. Idempotent. */
  close(): void;

  /** The one-time nonce for this server session */
  readonly nonce: string;

  /** The port the server is listening on */
  readonly port: number;
}

export interface CreateAuthServerOptions {
  /** Timeout in ms before auto-close. Default: 5 minutes. */
  timeout?: number;
}

/**
 * Create a temporary auth server bound to 127.0.0.1 with a random port.
 */
export async function createAuthServer(options?: CreateAuthServerOptions): Promise<AuthServer> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const nonce = randomBytes(16).toString("hex");

  let closed = false;
  let callbackResolve: ((value: Record<string, string> | null) => void) | null = null;
  let formResolve: ((value: Record<string, unknown> | null) => void) | null = null;
  let formSchema: Record<string, any> | null = null;
  let formTitle = "AFS Credential Collection";

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1`);
    const pathname = url.pathname;

    // CORS headers for local browser forms
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === "/callback") {
      handleCallback(url, req, res, nonce);
    } else if (pathname === "/auth" && req.method === "GET") {
      handleFormGet(url, res, nonce);
    } else if (pathname === "/auth" && req.method === "POST") {
      handleFormPost(req, res, nonce, url);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  function handleCallback(
    url: URL,
    _req: IncomingMessage,
    res: ServerResponse,
    expectedNonce: string,
  ): void {
    const reqNonce = url.searchParams.get("nonce");
    if (reqNonce !== expectedNonce) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: invalid nonce");
      return;
    }

    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== "nonce") {
        params[key] = value;
      }
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<html><body><h2>Authorization complete.</h2><p>You can close this tab.</p></body></html>",
    );

    if (callbackResolve) {
      callbackResolve(params);
      callbackResolve = null;
    }
  }

  function handleFormGet(url: URL, res: ServerResponse, expectedNonce: string): void {
    const reqNonce = url.searchParams.get("nonce");
    if (reqNonce !== expectedNonce) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: invalid nonce");
      return;
    }

    if (!formSchema) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("No form schema available");
      return;
    }

    const html = renderFormHTML(formSchema, formTitle, expectedNonce);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }

  function handleFormPost(
    req: IncomingMessage,
    res: ServerResponse,
    expectedNonce: string,
    url: URL,
  ): void {
    const reqNonce = url.searchParams.get("nonce");
    if (reqNonce !== expectedNonce) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: invalid nonce");
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      let data: Record<string, unknown>;
      const contentType = req.headers["content-type"] || "";

      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid JSON");
          return;
        }
      } else {
        // URL-encoded form data
        const params = new URLSearchParams(body);
        data = {};
        for (const [key, value] of params.entries()) {
          if (key !== "nonce") {
            data[key] = value;
          }
        }
        // Coerce string values to match schema types (HTML forms always submit strings)
        if (formSchema?.properties) {
          for (const [key, value] of Object.entries(data)) {
            const prop = (formSchema.properties as Record<string, any>)[key];
            if (!prop) continue;
            const strValue = String(value);
            if (prop.type === "number" || prop.type === "integer") {
              const num = Number(strValue);
              if (!Number.isNaN(num) && strValue !== "") data[key] = num;
            } else if (prop.type === "boolean") {
              if (strValue === "true" || strValue === "1") data[key] = true;
              else if (strValue === "false" || strValue === "0" || strValue === "")
                data[key] = false;
            } else if (prop.type === "array") {
              if (strValue !== "") {
                data[key] = strValue
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean);
              }
            }
            // Remove empty strings for non-string optional fields (let defaults apply)
            if (strValue === "" && prop.type !== "string") {
              delete data[key];
            }
          }
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));

      if (formResolve) {
        formResolve(data);
        formResolve = null;
      }
    });
  }

  // Start server with port retry
  const port = await startServer(server, MAX_PORT_RETRIES);

  // Auto-close timeout
  const autoCloseTimer = setTimeout(() => {
    closeServer();
  }, timeout);

  function closeServer(): void {
    if (closed) return;
    closed = true;
    clearTimeout(autoCloseTimer);
    server.close();

    // Resolve any pending waiters with null
    if (callbackResolve) {
      callbackResolve(null);
      callbackResolve = null;
    }
    if (formResolve) {
      formResolve(null);
      formResolve = null;
    }
  }

  const baseURL = `http://127.0.0.1:${port}`;

  return {
    baseURL,
    callbackURL: `${baseURL}/callback?nonce=${nonce}`,
    nonce,
    port,

    waitForCallback(opts?: { timeout?: number }): Promise<Record<string, string> | null> {
      if (closed) return Promise.resolve(null);

      return new Promise((resolve) => {
        callbackResolve = resolve;

        if (opts?.timeout) {
          setTimeout(() => {
            if (callbackResolve === resolve) {
              callbackResolve = null;
              resolve(null);
            }
          }, opts.timeout);
        }
      });
    },

    waitForForm(
      schema: Record<string, any>,
      opts?: { title?: string; timeout?: number },
    ): Promise<Record<string, unknown> | null> {
      if (closed) return Promise.resolve(null);

      formSchema = schema;
      if (opts?.title) formTitle = opts.title;

      return new Promise((resolve) => {
        formResolve = resolve;

        if (opts?.timeout) {
          setTimeout(() => {
            if (formResolve === resolve) {
              formResolve = null;
              resolve(null);
            }
          }, opts.timeout);
        }
      });
    },

    close: closeServer,
  };
}

async function startServer(server: Server, maxRetries: number): Promise<number> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise<number>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            resolve(addr.port);
          } else {
            reject(new Error("Failed to get server address"));
          }
        });
        server.on("error", reject);
      });
    } catch (err: any) {
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to start auth server after ${maxRetries + 1} attempts: ${err.message}`,
        );
      }
      // Close and retry
      server.close();
    }
  }
  throw new Error("Failed to start auth server");
}

function renderFormHTML(schema: Record<string, any>, title: string, nonce: string): string {
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);

  let fields = "";
  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    const label = prop.description || key;
    const isSensitive = prop.sensitive === true;
    const isRequired = required.has(key);
    const defaultValue = prop.default != null ? prop.default : "";

    if (prop.type === "boolean") {
      const checked = defaultValue === true || defaultValue === "true";
      fields += `
      <div style="margin-bottom: 12px;">
        <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer;">
          <input type="hidden" name="${escapeHTML(key)}" value="false" />
          <input
            type="checkbox"
            name="${escapeHTML(key)}"
            value="true"
            ${checked ? "checked" : ""}
            style="width: 18px; height: 18px;"
          />
          ${escapeHTML(label)}
        </label>
      </div>`;
    } else if (isSensitive) {
      fields += `
      <div style="margin-bottom: 12px;">
        <label for="${escapeHTML(key)}" style="display: block; font-weight: 600; margin-bottom: 4px;">
          ${escapeHTML(label)}${isRequired ? " *" : ""}
        </label>
        <div style="position: relative;">
          <input
            type="password"
            id="${escapeHTML(key)}"
            name="${escapeHTML(key)}"
            value="${escapeHTML(String(defaultValue))}"
            ${isRequired ? "required" : ""}
            style="width: 100%; padding: 8px; padding-right: 36px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; box-sizing: border-box;"
            autocomplete="off"
            data-lpignore="true"
            data-1p-ignore
          />
          <button type="button" onclick="togglePassword('${escapeHTML(key)}')" class="toggle-btn" title="Toggle visibility">
            <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg class="eye-hide" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </button>
        </div>
      </div>`;
    } else {
      const placeholder = prop.type === "array" ? ' placeholder="comma-separated values"' : "";
      const displayDefault =
        prop.type === "array" && Array.isArray(defaultValue)
          ? defaultValue.join(", ")
          : String(defaultValue);
      fields += `
      <div style="margin-bottom: 12px;">
        <label for="${escapeHTML(key)}" style="display: block; font-weight: 600; margin-bottom: 4px;">
          ${escapeHTML(label)}${isRequired ? " *" : ""}
        </label>
        <input
          type="text"
          id="${escapeHTML(key)}"
          name="${escapeHTML(key)}"
          value="${escapeHTML(displayDefault)}"
          ${isRequired ? "required" : ""}${placeholder}
          style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; box-sizing: border-box;"
          autocomplete="off"
        />
      </div>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 20px; }
    h2 { color: #333; }
    .submit-btn { background: #2563eb; color: white; border: none; padding: 10px 24px; border-radius: 4px; font-size: 14px; cursor: pointer; }
    .submit-btn:hover { background: #1d4ed8; }
    .toggle-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px; color: #999; line-height: 1; display: flex; align-items: center; }
    .toggle-btn:hover { color: #333; }
    .toggle-btn svg { width: 18px; height: 18px; }
    .success-view { display: none; text-align: center; }
    .success-icon { width: 56px; height: 56px; margin: 0 auto 12px; color: #16a34a; }
    .countdown { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div id="formView">
    <h2>${escapeHTML(title)}</h2>
    <div>
      ${fields}
      <button type="button" class="submit-btn" onclick="submitForm()">Submit</button>
    </div>
  </div>
  <div id="successView" class="success-view">
    <svg class="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <h2>Credentials saved successfully.</h2>
    <p class="countdown">This page will close in <span id="timer">3</span> seconds...</p>
    <p class="countdown" id="closeHint" style="display:none;">You can safely close this tab.</p>
  </div>
  <script>
    function togglePassword(id) {
      var input = document.getElementById(id);
      var btn = input.parentElement.querySelector('.toggle-btn');
      var show = btn.querySelector('.eye-show');
      var hide = btn.querySelector('.eye-hide');
      if (input.type === 'password') {
        input.type = 'text';
        show.style.display = 'none';
        hide.style.display = '';
      } else {
        input.type = 'password';
        show.style.display = '';
        hide.style.display = 'none';
      }
    }
    function submitForm() {
      var inputs = document.querySelectorAll('#formView input');
      var params = new URLSearchParams();
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (el.type === 'checkbox') {
          params.set(el.name, el.checked ? 'true' : 'false');
        } else if (el.type !== 'hidden' || !document.querySelector('#formView input[type="checkbox"][name="' + el.name + '"]')) {
          params.set(el.name, el.value);
        }
      }
      // Check required fields
      var missing = [];
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].required && !inputs[i].value) missing.push(inputs[i].name);
      }
      if (missing.length) { inputs[0].parentElement.closest && alert('Please fill in required fields.'); return; }
      fetch('/auth?nonce=${escapeHTML(nonce)}', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
        .then(function() { showSuccess(); })
        .catch(function() { alert('Submit failed. Please try again.'); });
    }
    function showSuccess() {
      document.getElementById('formView').style.display = 'none';
      var sv = document.getElementById('successView');
      sv.style.display = 'block';
      var seconds = 3;
      var timer = document.getElementById('timer');
      var interval = setInterval(function() {
        seconds--;
        timer.textContent = seconds;
        if (seconds <= 0) {
          clearInterval(interval);
          try { window.close(); } catch(e) {}
          setTimeout(function() { document.getElementById('closeHint').style.display = ''; }, 300);
        }
      }, 1000);
    }
  </script>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
