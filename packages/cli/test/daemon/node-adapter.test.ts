/**
 * Node adapter tests — IncomingMessage ↔ Web Request/Response conversion.
 */

import { describe, expect, it } from "bun:test";
import { IncomingMessage, type ServerResponse } from "node:http";
import { Socket } from "node:net";
import {
  collectBody,
  nodeRequestToWebRequest,
  webResponseToNodeResponse,
} from "../../src/daemon/node-adapter.js";

/** Create a minimal IncomingMessage from raw data. */
function createMockReq(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[]>;
  body?: string;
}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method || "GET";
  req.url = options.url || "/";
  req.headers = {
    host: "localhost:4900",
    ...(options.headers || {}),
  };

  // Push body data if provided
  if (options.body) {
    req.push(Buffer.from(options.body));
  }
  req.push(null); // signal end

  return req;
}

describe("collectBody", () => {
  it("collects body from stream", async () => {
    const req = createMockReq({ body: "hello world" });
    const body = await collectBody(req);
    expect(body.toString()).toBe("hello world");
  });

  it("returns empty buffer for no body", async () => {
    const req = createMockReq({});
    const body = await collectBody(req);
    expect(body.length).toBe(0);
  });
});

describe("nodeRequestToWebRequest", () => {
  it("converts GET request", () => {
    const req = createMockReq({ method: "GET", url: "/api/test?q=1" });
    const webReq = nodeRequestToWebRequest(req, Buffer.alloc(0));

    expect(webReq.method).toBe("GET");
    expect(new URL(webReq.url).pathname).toBe("/api/test");
    expect(new URL(webReq.url).searchParams.get("q")).toBe("1");
    expect(webReq.body).toBeNull();
  });

  it("converts POST request with body", () => {
    const body = Buffer.from(JSON.stringify({ key: "value" }));
    const req = createMockReq({
      method: "POST",
      url: "/api/data",
      headers: { "content-type": "application/json" },
    });
    const webReq = nodeRequestToWebRequest(req, body);

    expect(webReq.method).toBe("POST");
    expect(webReq.headers.get("content-type")).toBe("application/json");
    expect(webReq.body).not.toBeNull();
  });

  it("preserves array header values", () => {
    const req = createMockReq({
      headers: { "x-custom": ["a", "b"] as unknown as string },
    });
    const webReq = nodeRequestToWebRequest(req, Buffer.alloc(0));
    // Array headers are joined with ", "
    expect(webReq.headers.get("x-custom")).toBe("a, b");
  });
});

describe("webResponseToNodeResponse", () => {
  it("writes status and headers and body", async () => {
    const webRes = new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json", "X-Custom": "test" },
    });

    // Minimal ServerResponse mock — webResponseToNodeResponse only uses writeHead/end
    let endData: Buffer | undefined;
    let headStatus: number | undefined;
    let headHeaders: Record<string, string> = {};
    const res = {
      writeHead(statusCode: number, headers?: Record<string, string>) {
        headStatus = statusCode;
        if (headers) headHeaders = headers;
        return this;
      },
      end(data?: string | Buffer) {
        if (data !== undefined) {
          endData = typeof data === "string" ? Buffer.from(data) : data;
        }
      },
    } as unknown as ServerResponse;

    await webResponseToNodeResponse(webRes, res);

    expect(headStatus).toBe(201);
    expect(headHeaders["content-type"]).toBe("application/json");
    expect(headHeaders["x-custom"]).toBe("test");
    expect(endData?.toString()).toBe('{"ok":true}');
  });

  it("preserves binary response body without text re-encoding", async () => {
    const binary = new Uint8Array([0x00, 0xff, 0x7f, 0x01, 0xfe]);
    const webRes = new Response(binary, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    });

    let endData: Buffer | undefined;
    const res = {
      writeHead() {
        return this;
      },
      end(data?: string | Buffer) {
        if (data !== undefined) {
          endData = typeof data === "string" ? Buffer.from(data) : data;
        }
      },
    } as unknown as ServerResponse;

    await webResponseToNodeResponse(webRes, res);

    expect(endData).toBeDefined();
    expect([...endData!]).toEqual([...binary]);
  });
});
