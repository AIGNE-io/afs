# @aigne/afs-explorer

AFS Explorer is a web-based file system explorer for the AIGNE Framework's Agentic File System (AFS). It provides a beautiful, user-friendly interface built with React, TypeScript, and Material-UI to browse, search, and view files in your AFS instances.

## Features

- 📁 Browse AFS file systems with an intuitive folder/file interface
- 🌲 **File tree navigation** - Explore directories in a collapsible tree view (left sidebar)
- 🔗 **URL-based routing** - Each directory has its own URL for easy bookmarking and sharing
- 🔍 Search files and directories across all mounted modules
- 👁️ View file contents with syntax highlighting for JSON/YAML
- 📊 Display file metadata (size, type, timestamps)
- 🎨 Modern, responsive UI built with Material-UI
- 📱 Mobile-friendly with responsive drawer navigation
- ⚡ Fast and efficient API based on Express

## Installation

```bash
pnpm add @aigne/afs-explorer
```

## Usage

### Basic Example

```typescript
import { AFS } from "@aigne/afs";
import { AFSHistory } from "@aigne/afs-history";
import { AFSFS } from "@aigne/afs-fs";
import { startExplorer } from "@aigne/afs-explorer";

// Create and configure your AFS instance
const afs = new AFS();
afs.mount(new AFSHistory({ storage: { url: "file:./memory.sqlite3" } }));
afs.mount(new AFSFS({ localPath: "./docs" }));

// Start the explorer server
const server = await startExplorer(afs, {
  port: 3000,
  host: "localhost",
});

console.log("AFS Explorer is running at http://localhost:3000");
```

### Custom Configuration

```typescript
import { ExplorerServer } from "@aigne/afs-explorer";
import { fileURLToPath } from "node:url";
import path from "node:path";

// For production: specify the path to the built frontend
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(
  __dirname,
  "node_modules/@aigne/afs-explorer/dist",
);

const server = new ExplorerServer(afs, {
  port: 8080,
  host: "0.0.0.0", // Listen on all interfaces
  distPath, // Path to the built frontend files
});

await server.start();

// Later, stop the server
await server.stop();
```

**Note:** The `distPath` option is optional. If not provided, only the API endpoints will be available. In development, you can run the Vite dev server separately and use a proxy to access the API.

### Integration with Existing Express App

If you already have an Express application, you can integrate AFS Explorer using the router or middleware functions.

**Note:** The router/middleware functions do not include CORS or body-parsing middleware. Add them yourself if needed:

#### API Routes Only

Use `createExplorerRouter` to mount only the API endpoints:

```typescript
import express from "express";
import cors from "cors";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { createExplorerRouter } from "@aigne/afs-explorer";

const app = express();
app.use(cors()); // Add CORS if needed

const afs = new AFS();
afs.mount(new AFSFS({ localPath: "./docs", name: "docs" }));

// Mount API routes at /afs/api
app.use("/afs/api", createExplorerRouter(afs));

// Your other routes
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(3000);
```

#### Full Explorer (API + Frontend)

Use `createExplorerMiddleware` for the complete explorer experience:

```typescript
import express from "express";
import cors from "cors";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { createExplorerMiddleware } from "@aigne/afs-explorer";

const app = express();
app.use(cors()); // Add CORS if needed

const afs = new AFS();
afs.mount(new AFSFS({ localPath: "./docs", name: "docs" }));

// Mount full explorer at /afs
app.use(
  "/afs",
  createExplorerMiddleware(afs, {
    distPath: "./node_modules/@aigne/afs-explorer/html",
  }),
);

// Your other routes
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(3000);
// Explorer available at http://localhost:3000/afs
// Health check at http://localhost:3000/health
```

#### Multiple AFS Instances

You can mount multiple AFS instances at different paths:

```typescript
import express from "express";
import { AFS } from "@aigne/afs";
import { createExplorerMiddleware } from "@aigne/afs-explorer";

const app = express();

const docsAfs = new AFS();
docsAfs.mount(new AFSFS({ localPath: "./docs", name: "docs" }));

const dataAfs = new AFS();
dataAfs.mount(new AFSFS({ localPath: "./data", name: "data" }));

app.use("/explorer/docs", createExplorerMiddleware(docsAfs));
app.use("/explorer/data", createExplorerMiddleware(dataAfs));

app.listen(3000);
```

## Development

### Build the Frontend

```bash
pnpm build:web
```

This builds the React application into the `dist` directory.

### Build the Library

```bash
pnpm build:lib
```

This compiles the TypeScript server code.

### Build Everything

```bash
pnpm build
```

### Development Mode

For development, you can run the Vite dev server separately:

```bash
pnpm dev
```

This will start the Vite dev server on port 5173 with hot module replacement.

## API Endpoints

The explorer provides the following REST API endpoints:

- `GET /api/list?path={path}&maxDepth={depth}` - List directory contents (start from root `/`)
- `GET /api/read?path={path}` - Read file contents
- `GET /api/search?path={path}&query={query}` - Search files and directories

## Architecture

### Backend

The backend is built with Express and provides:

- RESTful API for AFS operations
- Static file serving for the React frontend
- CORS support for development

### Frontend

The frontend is a React application built with:

- **React 19** - Modern React with hooks
- **TypeScript** - Type-safe development
- **Material-UI (MUI)** - Professional UI components
- **Vite** - Fast build tool and dev server

