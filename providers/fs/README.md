# @aigne/afs-fs

**@aigne/afs-fs** is an AFS module that provides local file system access for AI agents. It allows agents to browse, read, write, and search files in specified directories through the AFS virtual file system interface.

## Overview

AFSFS mounts local directories into the AFS virtual file system, enabling AI agents to interact with your local files as if they were part of a unified file system. It provides sandboxed access with powerful search capabilities using ripgrep.

## Features

- **Directory Mounting**: Mount any local directory at a custom AFS path
- **File Operations**: List, read, and write files with full metadata
- **Recursive Listing**: Browse directories with configurable depth control
- **Fast Search**: Lightning-fast text search using ripgrep
- **Glob Support**: Pattern-based file matching
- **Metadata**: File size, timestamps, permissions, and type information
- **Sandboxed Access**: Operations are restricted to mounted directories
- **AI-Friendly**: Designed for seamless AI agent integration

## Installation

```bash
npm install @aigne/afs-fs @aigne/afs
# or
yarn add @aigne/afs-fs @aigne/afs
# or
pnpm add @aigne/afs-fs @aigne/afs
```

## Quick Start

```typescript
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

// Create AFS instance
const afs = new AFS();

// Mount a local directory
afs.mount(
  new AFSFS({
    localPath: "/path/to/documentation", // Local directory path
    description: "Project documentation", // Description for AI
  }),
);
// Accessible at /modules/fs

// List files
const { list } = await afs.list("/modules/fs");

// Read a file
const { result } = await afs.read("/modules/fs/README.md");
console.log(result.content);

// Search for content
const { list: results } = await afs.search("/modules/fs", "installation");

// Write a file
await afs.write("/modules/fs/notes.txt", {
  content: "My notes about the project",
});
```

## Configuration

### AFSFSOptions

```typescript
interface AFSFSOptions {
  localPath: string; // Local file system path to mount
  description?: string; // Optional description for AI agents
}
```

**Example:**

```typescript
afs.mount(
  new AFSFS({
    localPath: "/Users/john/my-project",
    description: "My web application source code",
  }),
);
// Accessible at /modules/fs
```

## Operations

### list(path, options?)

List files and directories:

```typescript
const { list, message } = await afs.list('/modules/fs', {
  maxDepth: 3  // Limit recursion depth
});

// list is an array of AFS entries:
[
  {
    id: '/modules/fs/README.md',
    path: '/modules/fs/README.md',
    createdAt: Date,
    updatedAt: Date,
    metadata: {
      type: 'file',      // 'file' or 'directory'
      size: 1024,        // File size in bytes
      mode: 33188        // Unix file permissions
    }
  },
  ...
]
```

**Options:**

- `maxDepth`: Maximum recursion depth (default: 1)

### read(path)

Read file contents and metadata:

```typescript
const { result } = await afs.read("/modules/fs/README.md");

console.log(result.content); // File contents as string
console.log(result.metadata); // File metadata
console.log(result.createdAt); // Creation timestamp
console.log(result.updatedAt); // Last modified timestamp
```

**Returns:**

- `result.content`: File contents (undefined for directories)
- `result.metadata`: File information (type, size, mode)
- `result.createdAt`: File creation time
- `result.updatedAt`: Last modification time

### write(path, content)

Write or update file contents:

```typescript
const { result } = await afs.write("/modules/fs/notes.txt", {
  content: "My notes",
  summary: "Personal notes about the project",
  metadata: { category: "personal" },
});
```

**Features:**

- Automatically creates parent directories if needed
- Supports string content directly
- Supports object content (automatically JSON stringified)
- Returns the written entry with updated metadata

### search(path, query, options?)

Search for files containing specific text:

```typescript
const { list, message } = await afs.search(
  "/modules/fs",
  "authentication",
);

// Results include matching files with context
list.forEach((entry) => {
  console.log(entry.path); // File path
  console.log(entry.summary); // Matching line snippet
});
```

**Features:**

- Uses ripgrep for extremely fast text search
- Automatically deduplicates results
- Returns file paths with matching line snippets

## Integration with AI Agents

AFSFS integrates seamlessly with AIGNE agents:

```typescript
import { AIAgent, AIGNE } from "@aigne/core";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { OpenAIChatModel } from "@aigne/openai";

// Setup AIGNE
const aigne = new AIGNE({
  model: new OpenAIChatModel({ apiKey: process.env.OPENAI_API_KEY }),
});

// Setup AFS with AFSFS
const afs = new AFS();

afs.mount(
  new AFSFS({
    name: "codebase",
    localPath: "./src",
    description: "Application source code",
  }),
);
// Accessible at /modules/codebase

afs.mount(
  new AFSFS({
    name: "docs",
    localPath: "./docs",
    description: "Project documentation",
  }),
);
// Accessible at /modules/docs

// Create agent with AFS access
const agent = AIAgent.from({
  name: "code-assistant",
  instructions:
    "You are a helpful coding assistant with access to the codebase and documentation",
  afs: afs,
});

// Use the agent
const context = aigne.newContext();
const result = await context.invoke(agent, {
  message: "Find all authentication-related files in the codebase",
});
```

The agent automatically gets these tools:

- **afs_list**: Browse directories
- **afs_read**: Read file contents
- **afs_write**: Create or modify files
- **afs_search**: Search for content

## Multiple Mounts

You can mount multiple directories with different names:

```typescript
// Mount source code
afs.mount(
  new AFSFS({
    name: "src",
    localPath: "./src",
    description: "Application source code",
  }),
);
// Accessible at /modules/src

// Mount tests
afs.mount(
  new AFSFS({
    name: "tests",
    localPath: "./tests",
    description: "Test files",
  }),
);
// Accessible at /modules/tests

// Mount configuration
afs.mount(
  new AFSFS({
    name: "config",
    localPath: "./config",
    description: "Configuration files",
  }),
);
// Accessible at /modules/config

// Now agents can access all mounted directories
await afs.list("/modules/src");
await afs.read("/modules/config/app.json");
await afs.search("/modules/tests", "test suite");
```

## File Metadata

AFSFS provides detailed file metadata:

```typescript
const { result } = await afs.read("/modules/fs/README.md");

result.metadata = {
  type: "file", // 'file' or 'directory'
  size: 2048, // File size in bytes
  mode: 33188, // Unix permissions (e.g., 0644)
};

result.createdAt; // File creation date
result.updatedAt; // Last modification date
```

## Security Considerations

**Sandboxed Access:**

- AFSFS operations are restricted to the mounted directory
- Cannot access files outside the mounted path
- Path traversal attempts are prevented by Node.js path operations

**Best Practices:**

- Only mount directories that should be accessible to agents
- Use descriptive mount paths (e.g., `/readonly-docs`, `/workspace`)
- Consider file permissions when mounting sensitive directories
- Review agent instructions to limit file write operations if needed

## Ripgrep Integration

AFSFS uses ripgrep for high-performance text search:

- **Fast**: Optimized for searching large codebases
- **Smart Filtering**: Automatically ignores binary files
- **Accurate**: Provides line-by-line match context
- **Reliable**: Mature and widely-used search tool

## Examples

See the [AFSFS example](../../examples/afs-local-fs) for a complete working implementation.

## TypeScript Support

This package includes full TypeScript type definitions:

```typescript
import type { AFSFS, AFSFSOptions } from "@aigne/afs-fs";
```

## Related Packages

- [@aigne/afs](../core/README.md) - AFS core package
- [@aigne/afs-user-profile-memory](../user-profile-memory/README.md) - User profile memory module

