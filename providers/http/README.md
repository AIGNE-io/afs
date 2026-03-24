# @aigne/afs-http

HTTP Transport Provider for AFS (Agentic File System), allowing transparent mounting of remote AFS providers over HTTP.

## Features

- 🌐 **RPC-style REST API** - Simple POST /rpc endpoint with method parameter
- 🔄 **Automatic Retry** - Exponential backoff with configurable options
- 🎯 **Dual-layer Error Codes** - HTTP status codes + CLI error codes for AFS consistency
- 🔌 **Framework Agnostic** - Web Standard Request/Response API
- 🚀 **Express/Koa Adapters** - Ready-to-use middleware for popular frameworks
- 📦 **Type Safe** - Full TypeScript support with Zod validation

## Installation

```bash
pnpm add @aigne/afs-http
```

## Quick Start

### Server Side

#### Express

```typescript
import express from "express";
import { createAFSExpressHandler } from "@aigne/afs-http";
import { AFSLocalProvider } from "@aigne/afs-local";

const app = express();

// Create a local AFS provider to expose
const provider = new AFSLocalProvider({
  name: "local",
  rootPath: "./data",
});

// Mount the AFS HTTP handler
app.use("/afs", createAFSExpressHandler({ provider }));

app.listen(3000, () => {
  console.log("AFS HTTP server listening on http://localhost:3000");
});
```

#### Koa

```typescript
import Koa from "koa";
import { createAFSKoaHandler } from "@aigne/afs-http";
import { AFSLocalProvider } from "@aigne/afs-local";

const app = new Koa();

const provider = new AFSLocalProvider({
  name: "local",
  rootPath: "./data",
});

app.use(createAFSKoaHandler({ provider }));

app.listen(3000);
```

#### Custom Framework

```typescript
import { createAFSHttpHandler } from "@aigne/afs-http";
import { AFSLocalProvider } from "@aigne/afs-local";

const provider = new AFSLocalProvider({
  name: "local",
  rootPath: "./data",
});

const handler = createAFSHttpHandler({ provider });

// Use with any framework that supports Web Standard Request/Response
async function handleRequest(request: Request): Promise<Response> {
  return await handler(request);
}
```

### Client Side

```typescript
import { AFS } from "@aigne/afs";
import { AFSHttpClient } from "@aigne/afs-http";

// Create HTTP client
const httpClient = new AFSHttpClient({
  url: "http://localhost:3000/afs",
  name: "remote",
  description: "Remote AFS over HTTP",
});

// Mount to AFS
const afs = new AFS();
afs.mount(httpClient);

// Use like any other AFS provider
const files = await afs.list("/remote");
const content = await afs.read("/remote/file.txt");
await afs.write("/remote/new.txt", "Hello, World!");
```

## Configuration

### Server Options

```typescript
interface AFSHttpHandlerOptions {
  /** AFS provider to expose */
  provider: AFSModule;

  /** Maximum request body size in bytes (default: 10MB) */
  maxBodySize?: number;

  /** Enable debug logging (default: false) */
  debug?: boolean;
}
```

### Client Options

```typescript
interface AFSHttpClientOptions {
  /** Server URL (e.g., "http://localhost:3000/afs") */
  url: string;

  /** Provider name for AFS mounting */
  name: string;

  /** Optional description */
  description?: string;

  /** Access mode: "readonly" or "readwrite" (default: "readwrite") */
  accessMode?: AFSAccessMode;

  /** Authorization token - sent as Bearer token in Authorization header */
  token?: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Maximum request body size in bytes (default: 10MB) */
  maxBodySize?: number;

  /** Retry configuration */
  retry?: {
    maxAttempts?: number;      // Default: 3
    initialDelay?: number;     // Default: 1000ms
    maxDelay?: number;         // Default: 10000ms
    multiplier?: number;       // Default: 2
  };
}
```

## API Methods

The HTTP transport supports all standard AFS operations:

- `list(path)` - List files and directories
- `read(path)` - Read file content
- `write(path, content, options)` - Write file content
- `delete(path)` - Delete file or directory
- `rename(oldPath, newPath)` - Rename/move file or directory
- `search(path, query, options)` - Search for files
- `exec(path, input)` - Execute command or script

## Error Handling

The HTTP transport uses dual-layer error codes:

### HTTP Status Codes

- `200 OK` - Success
- `400 Bad Request` - Invalid request format
- `404 Not Found` - Resource not found
- `409 Conflict` - Operation conflict (e.g., file exists)
- `413 Payload Too Large` - Request body exceeds maxBodySize
- `500 Internal Server Error` - Server error

### CLI Error Codes

Consistent with AFS CLI tools:

```typescript
enum AFSErrorCode {
  OK = 0,
  NOT_FOUND = 1,
  PERMISSION_DENIED = 2,
  CONFLICT = 3,
  PARTIAL = 4,
  RUNTIME_ERROR = 5,
}
```

## Protocol

The HTTP transport uses a simple RPC-style protocol:

### Request

```http
POST /rpc HTTP/1.1
Content-Type: application/json

{
  "method": "read",
  "params": {
    "path": "/file.txt"
  }
}
```

### Response (Success)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "data": {
    "content": "file content",
    "mimeType": "text/plain"
  }
}
```

### Response (Error)

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "code": 1,
  "error": "File not found: /file.txt"
}
```

## Retry Behavior

The client automatically retries failed requests with exponential backoff:

- Retries on network errors and 5xx status codes
- Does not retry 4xx errors (client errors)
- Default: 3 attempts with 1s → 2s → 4s delays
- Configurable via `retry` options

```typescript
const client = new AFSHttpClient({
  url: "http://localhost:3000/afs",
  name: "remote",
  retry: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 30000,
    multiplier: 2,
  },
});
```

## Advanced Usage

### Authentication

Use the built-in `token` option for Bearer token authentication:

```typescript
const client = new AFSHttpClient({
  url: "http://localhost:3000/afs",
  name: "remote",
  token: process.env.AFS_TOKEN,  // Sent as "Authorization: Bearer <token>"
});
```

### Custom Error Handling

```typescript
try {
  const content = await afs.read("/remote/file.txt");
} catch (error) {
  if (error instanceof AFSHttpError) {
    console.error(`HTTP ${error.status}: ${error.message}`);
    console.error(`AFS Error Code: ${error.code}`);
  }
}
```

## Performance Considerations

- **File Size Limits**: Configure `maxBodySize` based on your needs
- **Timeouts**: Adjust client timeout for slow networks
- **Retry Strategy**: Tune retry parameters for your use case
- **Caching**: Not implemented (prioritizes data consistency)

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm check-types

# Lint
pnpm lint
```
