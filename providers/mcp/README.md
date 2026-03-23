# @aigne/afs-mcp

AFS (Agentic File System) provider for MCP (Model Context Protocol) servers. This module allows you to mount any MCP server as a virtual filesystem, making its tools, prompts, and resources accessible through AFS's unified path-based API.

## Features

- **Tools as Executables**: MCP tools are exposed at `/tools/<name>` and can be executed via `afs.exec()`
- **Prompts as Readable Entries**: MCP prompts are available at `/prompts/<name>` with their arguments and content
- **Resources as Directories**: MCP resources are expanded into real AFS directory structures
- **Multiple Transport Support**: Connect via stdio (npx/uvx), HTTP, or SSE
- **Auto-generated WORLD.md**: A `/WORLD.md` file is automatically generated describing all server capabilities
- **Full Metadata**: Original MCP data is preserved in `entry.metadata.mcp`

## Installation

```bash
npm install @aigne/afs-mcp
# or
pnpm add @aigne/afs-mcp
```

## Quick Start

```typescript
import { AFS } from "@aigne/afs";
import { AFSMCP } from "@aigne/afs-mcp";

// Create an MCP provider
const mcp = new AFSMCP({
  name: "filesystem",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@anthropic-ai/mcp-server-filesystem"],
  env: {
    ALLOWED_PATHS: "/home/user/projects",
  },
});

// Mount to AFS
const afs = new AFS();
afs.mount(mcp);

// Now you can use AFS to interact with the MCP server
// List available tools
const tools = await afs.list("/modules/filesystem/tools");
console.log(tools.data);

// Execute a tool
const result = await afs.exec("/modules/filesystem/tools/read_file", {
  path: "/home/user/projects/README.md",
});
console.log(result.data);

// Read the auto-generated documentation
const worldMd = await afs.read("/modules/filesystem/WORLD.md");
console.log(worldMd.data?.content);
```

## Configuration

### AFSMCPOptions

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | string | No | Module name (used as mount path). Default: "mcp" |
| `description` | string | No | Human-readable description |
| `transport` | "stdio" \| "http" \| "sse" | Yes | Transport type |
| `command` | string | stdio only | Command to execute (e.g., "npx", "uvx") |
| `args` | string[] | No | Command arguments |
| `env` | Record<string, string> | No | Environment variables |
| `url` | string | http/sse only | Server URL |
| `headers` | Record<string, string> | No | HTTP headers for authentication |
| `timeout` | number | No | Connection timeout in milliseconds |
| `maxReconnects` | number | No | Maximum reconnection attempts |

### Transport Examples

#### Stdio (npx)

```typescript
const mcp = new AFSMCP({
  name: "github",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  },
});
```

#### Stdio (uvx)

```typescript
const mcp = new AFSMCP({
  name: "sqlite",
  transport: "stdio",
  command: "uvx",
  args: ["mcp-server-sqlite", "--db-path", "./database.db"],
});
```

#### HTTP

```typescript
const mcp = new AFSMCP({
  name: "remote",
  transport: "http",
  url: "https://mcp.example.com/api",
  headers: {
    Authorization: "Bearer your-token",
  },
});
```

#### SSE

```typescript
const mcp = new AFSMCP({
  name: "realtime",
  transport: "sse",
  url: "https://mcp.example.com/sse",
});
```

## Directory Structure

When mounted, an MCP server exposes the following structure:

```
/modules/{name}/
  WORLD.md          # Auto-generated documentation
  tools/
    {tool-name}     # Each tool as an entry
  prompts/
    {prompt-name}   # Each prompt as an entry
  {resource-path}/  # Resources expanded as directories
    {resource-id}   # Individual resources
```

## API

### Tools

```typescript
// List all tools
const tools = await afs.list("/modules/{name}/tools");

// Read tool schema
const tool = await afs.read("/modules/{name}/tools/{tool-name}");
console.log(tool.data?.metadata?.execute?.inputSchema);

// Execute a tool
const result = await afs.exec("/modules/{name}/tools/{tool-name}", {
  param1: "value1",
  param2: "value2",
});
```

### Prompts

```typescript
// List all prompts
const prompts = await afs.list("/modules/{name}/prompts");

// Read prompt metadata
const prompt = await afs.read("/modules/{name}/prompts/{prompt-name}");
console.log(prompt.data?.metadata?.arguments);

// Get prompt content with arguments
const content = await mcp.readPrompt("/prompts/{prompt-name}", {
  arg1: "value1",
});
console.log(content.data?.content); // Array of messages
```

### Resources

```typescript
// Resources are mapped to AFS paths based on their URI
// e.g., "sqlite://posts" -> "/posts"
// e.g., "github://repos/owner/repo" -> "/repos/owner/repo"

// List resources
const resources = await afs.list("/modules/{name}/{resource-path}");

// Read a resource
const resource = await afs.read("/modules/{name}/{resource-path}/{id}");
console.log(resource.data?.content);
```

### WORLD.md

The auto-generated `WORLD.md` provides a comprehensive overview of the MCP server:

```typescript
const world = await afs.read("/modules/{name}/WORLD.md");
console.log(world.data?.content);
```

This includes:
- Server information (name, transport, command/URL)
- Capabilities summary (tool/prompt/resource counts)
- Detailed tool documentation with input schemas
- Prompt documentation with arguments
- Resource listings with URIs

## Metadata Structure

All entries include MCP-specific metadata at `entry.metadata.mcp`:

### Tool Metadata

```typescript
{
  metadata: {
    execute: {
      name: "tool-name",
      description: "...",
      inputSchema: { /* JSON Schema */ }
    },
    mcp: {
      name: "tool-name",
      description: "...",
      inputSchema: { /* JSON Schema */ }
    }
  }
}
```

### Prompt Metadata

```typescript
{
  metadata: {
    arguments: [
      { name: "arg1", description: "...", required: true }
    ],
    mcp: {
      name: "prompt-name",
      description: "...",
      arguments: [...]
    }
  }
}
```

### Resource Metadata

```typescript
{
  metadata: {
    mcp: {
      uri: "sqlite://posts/123",
      name: "Post 123",
      description: "...",
      mimeType: "application/json"
    }
  }
}
```

## Static Methods

### AFSMCP.parseResourceUri(uri)

Parse a resource URI into its components:

```typescript
const parsed = AFSMCP.parseResourceUri("sqlite://posts/123");
// { scheme: "sqlite", path: "/posts/123" }
```

### AFSMCP.parseUriTemplate(template)

Extract variable names from a URI template:

```typescript
const vars = AFSMCP.parseUriTemplate("github://repos/{owner}/{repo}");
// ["owner", "repo"]
```

### AFSMCP.matchPathToTemplate(path, template)

Match a path against a URI template and extract parameters:

```typescript
const params = AFSMCP.matchPathToTemplate(
  "/repos/arcblock/afs",
  "github://repos/{owner}/{repo}"
);
// { owner: "arcblock", repo: "afs" }
```

## License

UNLICENSED - See LICENSE file for details.
