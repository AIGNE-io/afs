import type { Readable } from "node:stream";

/**
 * Koa-compatible context interface
 */
interface KoaContext {
  method: string;
  protocol: string;
  host: string;
  originalUrl: string;
  request: {
    body?: unknown;
    headers: Record<string, string | string[] | undefined>;
  };
  req: Readable;
  status: number;
  body: string;
  set(name: string, value: string): void;
}

/**
 * Koa-compatible next function
 */
type KoaNext = () => Promise<void>;

/**
 * Koa-compatible middleware
 */
type KoaMiddleware = (ctx: KoaContext, next: KoaNext) => Promise<void>;

/**
 * Collect stream data into a string
 */
async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/**
 * Convert Koa headers to Headers object
 */
function convertHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        result.append(key, v);
      }
    } else {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Koa adapter for AFS HTTP handler
 *
 * This adapter converts between Koa context and Web Standard Request/Response
 * objects, handling both scenarios where body parsing middleware is configured
 * (like koa-bodyparser) and where it isn't.
 *
 * @param handler - The AFS HTTP handler function
 * @returns A Koa-compatible middleware
 *
 * @example
 * ```typescript
 * import Koa from "koa";
 * import Router from "@koa/router";
 * import { createAFSHttpHandler, koaAdapter } from "@aigne/afs-http";
 *
 * const handler = createAFSHttpHandler({ module: provider });
 * const app = new Koa();
 * const router = new Router();
 *
 * router.post("/afs/rpc", koaAdapter(handler));
 * app.use(router.routes());
 * ```
 */
export function koaAdapter(handler: (request: Request) => Promise<Response>): KoaMiddleware {
  return async (ctx, _next) => {
    // Build URL from context
    const url = `${ctx.protocol}://${ctx.host}${ctx.originalUrl}`;

    // Get body - handle both parsed and unparsed scenarios
    let body: string | undefined;

    if (ctx.method === "POST" || ctx.method === "PUT" || ctx.method === "PATCH") {
      const requestBody = ctx.request.body;
      if (
        requestBody !== undefined &&
        requestBody !== null &&
        typeof requestBody === "object" &&
        Object.keys(requestBody).length > 0
      ) {
        // Scenario 1: Body already parsed by middleware (e.g., koa-bodyparser)
        body = JSON.stringify(requestBody);
      } else {
        // Scenario 2: Body not parsed, read from stream
        body = await streamToString(ctx.req);
      }
    }

    // Create Web Standard Request
    const request = new Request(url, {
      method: ctx.method,
      headers: convertHeaders(ctx.request.headers),
      body,
    });

    // Call the handler
    const response = await handler(request);

    // Write response back to Koa context
    ctx.status = response.status;

    // Copy headers
    response.headers.forEach((value, key) => {
      ctx.set(key, value);
    });

    // Set body
    ctx.body = await response.text();
  };
}
