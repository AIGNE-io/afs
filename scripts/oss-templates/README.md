# AFS — Agentic File System

AFS is a virtual filesystem abstraction that gives AI agents a unified, path-based interface to any data source. Inspired by Unix and Plan 9's "everything is a file", AFS extends this to **"everything is context"** — databases, APIs, cloud services, and local files all become paths that agents can read, write, search, and act on.

This repository contains three interconnected components:

| Component | What it is | Package |
|-----------|-----------|---------|
| **AFS** | The core virtual filesystem — mount, route, and unify any data source | `@aigne/afs` |
| **AFS-UI** | A UI provider that lets agents render web pages through AFS | `@aigne/afs-ui` |
| **AUP** | Agent UI Protocol — the declarative node tree that AFS-UI renders | `@aigne/afs-aup` |

```
                    ┌─────────────────────────────┐
                    │     Agent / Application      │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │      AFS Core                 │
                    │  mount · route · read · write │
                    │  list · search · stat · exec  │
                    └──┬─────┬─────┬─────┬─────┬───┘
                       │     │     │     │     │
           ┌───────┐ ┌─┴──┐ ┌┴───┐ ┌┴──┐ ┌────┴────┐
           │  FS   │ │Git │ │JSON│ │SQL│ │  AFS-UI  │  ← providers
           │       │ │    │ │    │ │   │ │          │
           │ local │ │repo│ │tree│ │ db│ │ AUP tree │
           │ disk  │ │    │ │    │ │   │ │→ browser │
           └───────┘ └────┘ └────┘ └───┘ └─────────┘
```

## How They Fit Together

**AFS** defines the universal interface — 8 operations (`read`, `write`, `list`, `search`, `stat`, `exec`, `explain`, `delete`) that work the same way regardless of what's behind the path. Providers plug in to expose any data source through this interface.

**AFS-UI** is an AFS provider. It exposes browser sessions as AFS paths — you `write` a UI tree to a session path, and the browser renders it. Events from the browser come back as `exec` calls. There's no special UI SDK; it's just AFS operations on `/ui/...` paths.

**AUP (Agent UI Protocol)** is the data format that AFS-UI speaks. An AUP tree is a JSON structure of typed nodes (`text`, `view`, `action`, `input`, `table`, `media`, ...) that describes *what* to show, not *how* to render it. The same tree can render on a web browser, a terminal, or a mobile client. AUP is defined as a standalone package (`@aigne/afs-aup`) with no runtime dependencies — pure types and validation.

```typescript
// AFS: read a file
const content = await afs.read("/code/src/index.ts");

// AFS: search across a Git repo
const results = await afs.search("/git", "TODO");

// AFS-UI + AUP: render a page in the browser
await afs.write(`/ui/web/sessions/${sid}/tree`, {
  content: {
    id: "root", type: "view",
    children: [
      { id: "h1", type: "text", props: { content: "Hello!", level: 1 } },
    ],
  },
  meta: { fullPage: true },
});
```

## Providers

Providers are pluggable modules that expose a data source through the AFS interface. Mount any combination at any path.

| Provider | Package | Description |
|----------|---------|-------------|
| **Filesystem** | `@aigne/afs-fs` | Local files and directories |
| **Git** | `@aigne/afs-git` | Git repositories — branches, commits, file history, diffs |
| **JSON/YAML** | `@aigne/afs-json` | Navigate JSON/YAML files as virtual directory trees |
| **TOML** | `@aigne/afs-toml` | Navigate TOML files as virtual directory trees |
| **SQLite** | `@aigne/afs-sqlite` | SQLite databases — tables as directories, rows as files, SQL via exec |
| **HTTP** | `@aigne/afs-http` | Expose any AFS instance over HTTP/REST |
| **MCP** | `@aigne/afs-mcp` | Mount external MCP servers as AFS providers |
| **UI** | `@aigne/afs-ui` | Agent UI Protocol — render web pages from declarative AUP trees |

### Writing Your Own Provider

Any data source can become an AFS provider. Extend `AFSBaseProvider` and use decorators:

```typescript
import { AFSBaseProvider, Actions, Read, List, type RouteContext } from "@aigne/afs";

class BookProvider extends AFSBaseProvider {
  name = "books";
  override readonly accessMode = "readwrite" as const;

  @List("/")
  async listBooks() {
    return { data: [{ name: "book-1", type: "file", meta: { title: "..." } }] };
  }

  @Read("/:id")
  async readBook(ctx: RouteContext<{ id: string }>) {
    return { data: `Book content for ${ctx.params.id}` };
  }

  @Actions.Exec("/", "search")
  async search(_ctx: RouteContext, args: { query: string }) {
    return { data: { results: [], total: 0 } };
  }
}
```

See the [Custom Provider example](./examples/custom-provider) for a complete walkthrough.

## Core Operations

Every provider supports the same standard operations:

| Operation | Description | Example |
|-----------|-------------|---------|
| `list` | List directory contents | `afs.list("/fs/src")` |
| `read` | Read file/resource content | `afs.read("/fs/config.json")` |
| `write` | Create or update content | `afs.write("/fs/out.txt", { content: "..." })` |
| `delete` | Remove a resource | `afs.delete("/fs/temp.txt")` |
| `search` | Find content by pattern | `afs.search("/git", "TODO")` |
| `stat` | Get metadata without content | `afs.stat("/fs/data.csv")` |
| `explain` | Get human/LLM-readable docs | `afs.explain("/sql")` |
| `exec` | Execute provider actions | `afs.exec("/sql/.actions/query", { sql: "..." })` |

## Specifications

This repository includes formal protocol specifications for both AFS and AUP:

| Spec | File | Description |
|------|------|-------------|
| **AFS Protocol** | [`spec/afs-protocol.md`](./spec/afs-protocol.md) | The filesystem protocol — entry model, 8 operations, mount semantics, error codes |
| **AUP Protocol** | [`spec/aup-protocol.md`](./spec/aup-protocol.md) | The UI protocol — node tree, primitives, patching, sessions, device capabilities |

These specs are extracted from the TypeScript reference implementation and define the contract that any language implementation must follow.

## Testing & Conformance

AFS provides two levels of testing infrastructure:

### Provider Conformance (`@aigne/afs-testing`)

A TypeScript test framework that validates provider implementations against the AFS spec. Every provider in this repo ships with conformance tests covering 21 test suites (structure validation, read/write/search/exec, error handling, path normalization, etc.):

```typescript
import { runProviderTests } from "@aigne/afs-testing";

runProviderTests({
  name: "MyProvider",
  createProvider: () => new MyProvider({ ... }),
  structure: { root: { name: "", children: [...] } },
});
```

### Protocol Conformance (`conformance/`)

A language-agnostic, YAML-driven conformance test suite for validating **any** AFS implementation — regardless of language. The runner communicates with the implementation under test via HTTP, making it suitable for verifying Swift, Kotlin, Go, Rust, or any other language that exposes the AFS protocol over HTTP.

```bash
cd conformance

# Test against a running AFS HTTP server
npx tsx src/runner.ts --url http://localhost:3000

# Or launch the TypeScript reference server automatically
npx tsx src/runner.ts --launch

# Filter by level or pattern
npx tsx src/runner.ts --launch --level l1          # Filesystem tests only
npx tsx src/runner.ts --launch --level l3          # Core compositor tests only
npx tsx src/runner.ts --launch --filter "read"     # Only read tests
```

```bash
# Run L3 core tests (requires @aigne/afs)
npx tsx src/runner.ts --launch --level l3
```

**Test levels:**
- **L1 — Filesystem protocol** (24 tests): read, list, stat, write, delete, search, error handling
- **L2 — Integration protocol** (9+ tests): write-read cycles, delete verification, search-after-write, AUP sessions
- **L3 — Core routing** (16 tests): multi-mount routing, cross-mount isolation, root listing, cross-mount search
- **L4 — Core explain** (8 tests): auto-explain generation, provider capabilities, stat-based fallback
- **L5 — Core security** (6 tests): exec guard, action policy enforcement, blocked/allowed actions
- **L6 — Change propagation** (3 tests): write/delete consistency, cross-mount search after mutation

Test specs are declarative YAML files in `conformance/specs/`:

```yaml
name: "read - existing text file"
operation: read
params:
  path: "/hello.txt"
expect:
  success: true
  data:
    data:
      content: "Hello, World!"
      meta:
        size:
          gte: 1
```

## Quick Start

```bash
npm install @aigne/afs @aigne/afs-fs
```

```typescript
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

const afs = new AFS();
await afs.mount(new AFSFS({ localPath: "./my-project" }), "/code");

// Read a file
const content = await afs.read("/code/src/index.ts");

// List a directory
const { data } = await afs.list("/code/src");

// Search for content
const results = await afs.search("/code", "TODO");
```

## CLI

```bash
npm install -g @aigne/afs-cli

# Mount and explore interactively
afs mount fs ./my-project --path /code
afs ls /code/src
afs read /code/README.md
afs search /code "function"

# Start an HTTP server
afs serve --port 3000

# Start as MCP server (for Claude, Cursor, etc.)
afs serve --transport mcp-stdio
```

## MCP Integration

AFS works as an MCP (Model Context Protocol) server, making all mounted providers available to any MCP-compatible AI tool:

```bash
# In Claude Desktop or Cursor config:
afs serve --transport mcp-stdio
```

Or mount external MCP servers into AFS:

```typescript
import { AFSMcp } from "@aigne/afs-mcp";

afs.mount(new AFSMcp({ command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] }));
```

## Examples

Self-contained examples in the [`examples/`](./examples) directory:

| Example | Description | Run |
|---------|-------------|-----|
| **[Basic Usage](./examples/basic)** | Mount files + JSON, read/list/search/write/stat | `bun examples/basic/index.ts` |
| **[Custom Provider](./examples/custom-provider)** | Build your own provider with decorators | `bun examples/custom-provider/index.ts` |
| **[Hello AUP](./examples/hello-aup)** | Render a live web page via Agent UI Protocol | `bun examples/hello-aup/index.ts` |

## Repository Structure

```
spec/
  afs-protocol.md     # AFS protocol specification
  aup-protocol.md     # AUP protocol specification

conformance/
  specs/l1/           # L1 filesystem protocol tests (YAML)
  specs/l2/           # L2 integration protocol tests (YAML)
  src/                # Language-agnostic test runner

packages/
  core/               # @aigne/afs — core virtual filesystem
  aup/                # @aigne/afs-aup — AUP types and validation (zero deps)
  cli/                # @aigne/afs-cli — command-line tool
  testing/            # @aigne/afs-testing — provider conformance test framework
  explorer/           # AFS explorer utilities
  provider-utils/     # Shared provider utilities

providers/
  fs/                 # Local filesystem
  git/                # Git repositories
  json/               # JSON/YAML virtual directories
  toml/               # TOML virtual directories
  sqlite/             # SQLite databases
  http/               # HTTP/REST server
  mcp/                # MCP server bridge
  ui/                 # AFS-UI — Agent UI Protocol renderer

examples/
  basic/              # Core AFS operations
  custom-provider/    # Build your own provider
  hello-aup/          # AUP web rendering
```

## Development

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm test           # Run tests
pnpm lint           # Lint + type check
pnpm check-types    # TypeScript type check only
```

## License

AFS is licensed under the [Business Source License 1.1](./LICENSE).

- **Use freely** for any purpose, including commercial, except as a competing managed service.
- **Converts to Apache 2.0** on 2030-03-07 (or 4 years after each version's release).
- For managed service licensing, contact [legal@arcblock.io](mailto:legal@arcblock.io).

Copyright (c) 2024-2026 ArcBlock, Inc.
