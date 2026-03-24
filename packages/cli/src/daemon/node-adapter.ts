/**
 * Node.js ↔ Web Standard Request/Response adapter.
 *
 * Eliminates repeated IncomingMessage→Request conversion in daemon server.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Collect the full request body from an IncomingMessage stream.
 */
export async function collectBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Convert a Node.js IncomingMessage to a Web Standard Request.
 * Body must be pre-collected (Buffer) since IncomingMessage is a stream.
 */
export function nodeRequestToWebRequest(req: IncomingMessage, body: Buffer): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.append(key, Array.isArray(value) ? value.join(", ") : value);
  }

  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: body.length > 0 ? new Uint8Array(body) : undefined,
  });
}

/**
 * Write a Web Standard Response to a Node.js ServerResponse.
 */
export async function webResponseToNodeResponse(
  webRes: Response,
  res: ServerResponse,
): Promise<void> {
  const resHeaders: Record<string, string> = {};
  webRes.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });
  res.writeHead(webRes.status, resHeaders);
  const body = Buffer.from(await webRes.arrayBuffer());
  res.end(body);
}
