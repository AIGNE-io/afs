import type { Readable } from "node:stream";

/**
 * Express-compatible request interface
 */
interface ExpressRequest {
  method: string;
  protocol: string;
  originalUrl: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  get(name: string): string | undefined;
  on(event: string, callback: (chunk: Buffer) => void): void;
  pipe<T extends NodeJS.WritableStream>(destination: T): T;
}

/**
 * Express-compatible response interface
 */
interface ExpressResponse {
  status(code: number): ExpressResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

/**
 * Express-compatible next function
 */
type ExpressNextFunction = (error?: Error) => void;

/**
 * Express-compatible request handler
 */
type ExpressRequestHandler = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction,
) => void | Promise<void>;

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
 * Convert Express headers to Headers object
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
 * Express adapter for AFS HTTP handler
 *
 * This adapter converts between Express request/response objects and
 * Web Standard Request/Response objects, handling both scenarios where
 * body parsing middleware is configured and where it isn't.
 *
 * @param handler - The AFS HTTP handler function
 * @returns An Express-compatible request handler
 *
 * @example
 * ```typescript
 * import express from "express";
 * import { createAFSHttpHandler, expressAdapter } from "@aigne/afs-http";
 *
 * const handler = createAFSHttpHandler({ module: provider });
 * const app = express();
 *
 * // Works with or without express.json() middleware
 * app.post("/afs/rpc", expressAdapter(handler));
 * ```
 */
export function expressAdapter(
  handler: (request: Request) => Promise<Response>,
): ExpressRequestHandler {
  return async (req, res, next) => {
    try {
      // Build URL from request
      const host = req.get("host") || "localhost";
      const url = `${req.protocol}://${host}${req.originalUrl}`;

      // Get body - handle both parsed and unparsed scenarios
      let body: string | undefined;

      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        if (
          req.body !== undefined &&
          req.body !== null &&
          typeof req.body === "object" &&
          Object.keys(req.body).length > 0
        ) {
          // Scenario 1: Body already parsed by middleware (e.g., express.json())
          body = JSON.stringify(req.body);
        } else {
          // Scenario 2: Body not parsed, read from stream
          body = await streamToString(req as unknown as Readable);
        }
      }

      // Create Web Standard Request
      const request = new Request(url, {
        method: req.method,
        headers: convertHeaders(req.headers),
        body,
      });

      // Call the handler
      const response = await handler(request);

      // Write response back to Express
      res.status(response.status);

      // Copy headers
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // Send body
      const responseBody = await response.text();
      res.send(responseBody);
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
}
