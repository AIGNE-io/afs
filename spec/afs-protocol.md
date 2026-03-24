# AFS Protocol Specification

**Version:** 0.1-draft
**Status:** Phase 0a — extracted from TypeScript reference implementation

## 1. Overview

AFS (Agentic File System) is a uniform interface for agents and applications to
interact with heterogeneous data sources. Every data source — local files, databases,
APIs, AI models, IoT devices — is exposed through the same set of operations via
a filesystem-like namespace.

### Design Intent

The filesystem metaphor is deliberate: agents already understand paths, directories,
and files. AFS extends this with `exec` (actions), `explain` (self-description),
and `search` (cross-source queries) to cover what traditional filesystems cannot.

Providers implement the operations they support. A read-only provider implements
`read` and `list` only. An AI provider implements `exec` and `explain`. The protocol
accommodates partial implementation — unsupported operations return clear errors.

### Key Principles

1. **Uniform interface** — All providers expose the same operations
2. **Mount-based composition** — Multiple providers compose into a single namespace
3. **Transport-agnostic** — Protocol defines message semantics, not wire format
4. **Partial implementation** — Providers only implement relevant operations
5. **Self-describing** — `explain` and `stat` enable agent discovery

---

## 2. Entry Model

An **entry** is the atomic unit of AFS. Every path resolves to an entry.

### AFSEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Provider-assigned unique identifier |
| `path` | string | Yes | Absolute path within AFS namespace |
| `content` | unknown | No | Entry payload (type varies by provider). See §10.3 for serialization rules. |
| `meta` | AFSEntryMetadata | No | Structural metadata |
| `actions` | ActionSummary[] | No | Available exec actions on this entry |
| `summary` | string | No | Short human/agent-readable summary of the entry |
| `linkTo` | string | No | AFS path this entry links/redirects to |
| `createdAt` | string (ISO 8601) | No | Creation timestamp |
| `updatedAt` | string (ISO 8601) | No | Last modification timestamp |
| `agentId` | string | No | Agent that created/modified this entry |
| `userId` | string | No | User that created/modified this entry |
| `sessionId` | string | No | Session context |

### AFSEntryMetadata

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Primary type identifier (e.g., `"file"`, `"directory"`, `"action"`) |
| `kinds` | string[] | Inheritance chain (most specific first) |
| `childrenCount` | number \| undefined | `-1` = unknown, `0` = leaf, `N` = exact count, `undefined` = not applicable |
| `size` | number \| undefined | Content size in bytes. `undefined` if unknown. |
| `description` | string \| undefined | Human/agent-readable description |
| `contentType` | string \| undefined | MIME type for binary content (e.g., `"image/jpeg"`) |
| `events` | AFSEventDeclaration[] | Events this entry can emit |

### ActionSummary

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Action identifier |
| `description` | string \| undefined | Human/agent-readable description (optional) |
| `inputSchema` | JSONSchema7 \| undefined | Input validation schema (optional) |
| `severity` | ActionSeverity | Risk level: `"ambient"` \| `"boundary"` \| `"critical"` |

---

## 3. Operations

### 3.1 read

Read an entry's content.

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Absolute path |
| `filter` | Record<string, unknown> | No | Provider-specific content filtering |
| `startLine` | number | No | Line-range start (1-based) |
| `endLine` | number | No | Line-range end (inclusive) |

**Response:** `AFSReadResult`

| Field | Type | Description |
|-------|------|-------------|
| `data` | AFSEntry \| undefined | The entry with content, or undefined if not found |
| `message` | string \| undefined | Optional status message |

**Errors:**
- `AFS_NOT_FOUND` — Path does not exist
- `AFS_ACCESS_MODE` — Operation denied by access mode

**Behavior:**
- Returns the full entry including `content`, `meta`, and `actions`
- `startLine`/`endLine` apply to text content only
- Binary content is returned as-is (base64 encoding is transport-dependent)
- Provider may return `undefined` for entries that exist but have no readable content

---

### 3.2 list

List entries in a directory.

**Request:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | Yes | — | Absolute directory path |
| `filter` | { agentId?, userId?, sessionId?, before?, after? } | No | — | Entry filtering by attribution and time range |
| `maxDepth` | number | No | 1 | Recursion depth (1 = immediate children) |
| `offset` | number | No | 0 | Pagination offset |
| `limit` | number | No | 1000 | Maximum entries to return |
| `orderBy` | [string, "asc" \| "desc"][] | No | — | Sort fields with direction |
| `pattern` | string | No | — | Glob pattern filter |
| `maxChildren` | number | No | — | Max children per directory in recursive listing |
| `onOverflow` | `"truncate"` | No | — | Behavior when results exceed limit (optional) |
| `disableGitignore` | boolean | No | — | Disable .gitignore filtering (provider-specific) |

**Response:** `AFSListResult`

| Field | Type | Description |
|-------|------|-------------|
| `data` | AFSEntry[] | Array of entries (content typically omitted) |
| `total` | number \| undefined | Total count if known (for pagination) |
| `message` | string \| undefined | Optional status message |

**Behavior:**
- Returns entries **without content** by default (content stripped for efficiency)
- `maxDepth: 1` returns immediate children only
- `maxDepth: N` triggers breadth-first expansion up to N levels
- Default: `DEFAULT_MAX_DEPTH = 1`, no upper bound enforcement
- Entries include `meta`, `actions`, and path information
- Order is provider-dependent unless `orderBy` is specified

---

### 3.3 stat

Get entry metadata without content.

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Absolute path |

**Response:** `AFSStatResult`

| Field | Type | Description |
|-------|------|-------------|
| `data` | AFSEntry (no content) | Entry with metadata but no content field |
| `message` | string \| undefined | Optional status message |

**Behavior:**
- Like `read` but never returns `content`
- Fallback chain: tries provider's `stat()`, then `read()` (strips content), then throws `AFS_NOT_FOUND`
- Cheaper than `read` for providers that optimize metadata-only access

**Errors:**
- `AFS_NOT_FOUND` — Path does not exist

---

### 3.4 write

Create or modify an entry.

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Absolute path |
| `content` | unknown | Yes (for create/replace) | Content to write |
| `meta` | Record<string, unknown> | No | Metadata to set |
| `mode` | WriteMode | No | Write strategy (default: `"replace"`) |

**WriteMode values:**

| Mode | Behavior | Idempotent? |
|------|----------|-------------|
| `"replace"` | Overwrite entire content (default) | Yes |
| `"append"` | Append to existing content | No |
| `"prepend"` | Prepend to existing content | No |
| `"patch"` | Merge into existing content (for structured data) | Yes |
| `"create"` | Create only — error if exists | Yes |
| `"update"` | Update only — error if not exists | Yes |

> **Note:** `write` has its own semantics defined by `mode`. Some modes are idempotent (`replace`, `patch`, `create`, `update`), others are not (`append`, `prepend`). Do not assume `write` maps to any single HTTP method — see §10.2 for transport-specific bindings.

**Response:** `AFSWriteResult`

| Field | Type | Description |
|-------|------|-------------|
| `data` | AFSEntry | The written entry (with updated content/meta) |
| `message` | string \| undefined | Optional status message |

**Errors:**
- `AFS_READONLY` — Provider is read-only
- `AFS_ALREADY_EXISTS` — `mode: "create"` and path exists
- `AFS_NOT_FOUND` — `mode: "update"` and path does not exist
- `AFS_ACCESS_MODE` — Operation denied by access mode

---

### 3.5 delete

Remove an entry.

**Request:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | Yes | — | Absolute path |
| `recursive` | boolean | No | false | Delete directory contents recursively |

**Response:** `AFSDeleteResult`

| Field | Type | Description |
|-------|------|-------------|
| `message` | string \| undefined | Optional status message |

**Errors:**
- `AFS_READONLY` — Provider is read-only
- `AFS_ACCESS_MODE` — Operation denied by access mode

**Behavior:**
- Deleting a non-existent path: provider-dependent (may be idempotent or error)
- Deleting a directory without `recursive: true`: provider-dependent

---

### 3.6 search

Full-text search across entries.

**Request:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | Yes | — | Search scope (directory path) |
| `query` | string | Yes | — | Search query |
| `limit` | number | No | — | Maximum results |
| `caseSensitive` | boolean | No | false | Case-sensitive matching |

**Response:** `AFSSearchResult`

| Field | Type | Description |
|-------|------|-------------|
| `data` | AFSEntry[] | Matching entries |
| `message` | string \| undefined | Optional status message |

**Behavior:**
- Search is scoped to the given path and its descendants
- Cross-mount search: AFS dispatches to all providers mounted under the scope
- Result format is provider-dependent (may include match highlights)

---

### 3.7 exec

Execute an action.

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Action path (typically `.../.actions/<name>`) |
| `args` | Record<string, unknown> | No | Action arguments |
| `onChunk` | callback | No | Streaming callback for progressive output |

**Response:** `AFSExecResult`

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the action succeeded |
| `data` | Record<string, unknown> \| undefined | Action result |
| `error` | { code: string, message: string, details?: Record<string, unknown> } | Error details (if failed) |
| `usage` | { tokens?: TokenUsage, cost?: number, durationMs?: number } | Resource usage. `TokenUsage = { input: number, output: number, total: number }` |

**Streaming Chunks:** `AFSExecChunk`

| Field | Type | Description |
|-------|------|-------------|
| `text` | string \| undefined | Incremental text output |
| `thoughts` | string \| undefined | Agent reasoning (if exposed) |
| `[key: string]` | unknown | Open index — provider-specific streaming fields |

**Security:**
- Actions have severity levels: `ambient` (safe), `boundary` (side effects), `critical` (destructive)
- AFS enforces action policy: `safe` (ambient only), `standard` (ambient + boundary), `full` (all)
- `AFS_SEVERITY_DENIED` if action severity exceeds policy

**Input Validation:**
- Actions may declare `inputSchema` (JSON Schema)
- AFS validates input before dispatch
- `AFS_VALIDATION_ERROR` on schema mismatch

**Errors:**
- `AFS_SEVERITY_DENIED` — Action severity exceeds policy
- `AFS_VALIDATION_ERROR` — Input doesn't match schema
- `AFS_READONLY` — Exec not permitted on read-only mount
- `AFS_NOT_FOUND` — Action path not found

---

### 3.8 explain

Self-description for humans and agents.

**Request:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Path to explain |
| `format` | string | No | `"markdown"` (default) or `"text"` |

**Response:** `AFSExplainResult`

| Field | Type | Description |
|-------|------|-------------|
| `format` | string | `"markdown"` or `"text"` |
| `content` | string | Human/agent-readable explanation |

**Behavior:**
- Provider-level explain (root path): describes the provider's purpose and capabilities
- Path-level explain: describes what's at the path and what operations are available
- Used by agents for tool discovery and context building

---

### 3.9 rename

Move/rename an entry within the same provider.

**Request:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | Yes | — | Source path |
| `newPath` | string | Yes | — | Destination path |
| `overwrite` | boolean | No | false | Overwrite if destination exists |

**Response:** `AFSRenameResult`

| Field | Type | Description |
|-------|------|-------------|
| `message` | string \| undefined | Optional status message |

**Behavior:**
- Source and destination must be within the same mount (same provider)
- Cross-mount rename is not supported (use write + delete)

---

### 3.10 Batch Operations

#### batchWrite

Write multiple entries atomically (per-entry fail-safe).

**Request:**

| Field | Type | Description |
|-------|------|-------------|
| `entries` | { path, content, meta?, mode? }[] | Entries to write |

**Response:** `AFSBatchWriteResult`

| Field | Type | Description |
|-------|------|-------------|
| `results` | { path, success, data?, error? }[] | Per-entry results |
| `succeeded` | number | Count of successful writes |
| `failed` | number | Count of failed writes |

#### batchDelete

Delete multiple entries (per-entry fail-safe).

**Request:**

| Field | Type | Description |
|-------|------|-------------|
| `entries` | { path, recursive? }[] | Entries to delete |

**Response:** `AFSBatchDeleteResult`

| Field | Type | Description |
|-------|------|-------------|
| `results` | { path, success, error? }[] | Per-entry results |
| `succeeded` | number | Count of successful deletes |
| `failed` | number | Count of failed deletes |

**Behavior:**
- Batch operations are **fail-safe per entry** — one failure does not abort the batch
- Each entry is processed independently

---

## 4. Mount System

### Mount Semantics

Providers are mounted at paths in the AFS namespace. Multiple providers compose
into a unified tree.

```
AFS root /
├── /data     → FSProvider (local files)
├── /db       → SQLiteProvider (database)
├── /ai       → AIProvider (LLM)
└── /ui       → UIProvider (real-time UI)
```

### Mount Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Mount point (absolute path) |
| `namespace` | string \| null | No | Isolation namespace (default: null) |
| `replace` | boolean | No | Replace existing mount at same path |
| `lenient` | boolean | No | Skip health check on mount |

### Conflict Rules

- Two providers cannot mount at the same path (unless `replace: true`)
- Parent-child mount conflicts are forbidden (e.g., `/data` and `/data/sub`)
- Root `/` conflicts with all other mounts
- Exception: `.aup/{name}` overlay mounts are allowed

### Namespace Isolation

- Namespaces provide complete isolation
- Canonical paths: `@namespace:path`
- Default namespace: `null`
- Mounts in different namespaces never conflict

### Path Resolution

Operations on a path are dispatched to the provider whose mount point is the
longest prefix match. The provider receives a **relative path** (mount prefix stripped).

Example: `read("/data/users/alice.json")` dispatches to the provider mounted at
`/data` with relative path `users/alice.json`.

### Core Compositor Behavior

The AFS Core (compositor) is the layer that manages mounts, dispatches operations,
and enforces cross-cutting concerns. **Any language implementation** of AFS Core
MUST implement these behaviors (verified by L3 conformance tests).

#### Multi-Mount Routing

When multiple providers are mounted at different paths, the compositor MUST:

1. **Route by longest prefix match** — `read("/a/b/file")` goes to the provider at
   `/a/b` (if it exists), not `/a`.
2. **Strip mount prefix** — The provider receives the relative path. A provider mounted
   at `/alpha` receiving `read("/alpha/foo.txt")` sees path `/foo.txt`.
3. **Isolate mount state** — Writing to `/alpha/file.txt` MUST NOT create or modify
   anything under `/beta/`, even if both are backed by the same provider type.
4. **Error on unknown prefix** — If no mount matches the path, return an error
   (no silent fallback).

#### Root Operations

- `list("/")` MUST return the list of top-level mount points.
- `explain("/")` MUST return a summary of all mounted providers and their capabilities.
- `search("/", query)` MUST fan out the search to all mounted providers and aggregate results.

#### Cross-Mount Search

- `search("/alpha", query)` MUST search only within the provider mounted at `/alpha`.
- `search("/", query)` MUST search across all providers and return combined results.
- Results from different providers MUST have paths prefixed with their mount point
  (e.g., `/alpha/found.txt`, not `/found.txt`).

#### Auto-Explain Generation

The compositor MUST auto-generate `explain` output:

- `explain("/")` — Markdown with mounted providers listing, standard operations, capabilities.
- `explain("/mount")` — Provider-specific explain, or fallback to stat-based markdown
  (path, size, children count, kind, available actions).
- `explain("/mount/path")` — File/directory explain via stat fallback.
- Nonexistent paths MUST return an error.

Verified by **L4 conformance tests** in `conformance/specs/l4/`.

#### Exec Guard and Action Policy

The compositor MUST enforce action security on `exec`:

1. **`blockedActions`** — Always rejected, regardless of policy. Returns error with "blocked".
2. **`allowedActions`** — Always permitted, bypasses severity check.
3. **`actionPolicy`** — Controls which severity levels are allowed:
   - `"safe"`: only `ambient` severity
   - `"standard"`: `ambient` + `boundary`
   - `"full"`: all severities
   - `undefined`: no enforcement (backward compatible)
4. **Default severity** — Unknown actions default to `"boundary"` (safe-by-default).
5. **Severity floor** — Remote providers cannot self-declare `ambient` (floor from `riskLevel`).
6. **Non-exec unaffected** — `read`, `write`, `list`, etc. are not affected by action policy.

Verified by **L5 conformance tests** in `conformance/specs/l5/`.

#### Change Propagation

The compositor MUST ensure consistency after mutations:

- After `write`, `stat` MUST reflect the new file.
- After `delete`, `stat` MUST return not-found.
- After `write` to one mount, `search("/")` MUST find the new content.
- After `delete`, `search("/")` MUST no longer find the deleted content.

Verified by **L6 conformance tests** in `conformance/specs/l6/`.

#### Conformance

These behaviors are verified by conformance tests in `conformance/specs/l3-l6/`.
Any AFS Core implementation (TypeScript, Swift, Kotlin, Rust, etc.) that passes
all levels is considered a fully compliant compositor.

---

## 5. Access Control

### Access Modes

| Mode | read | list | stat | search | explain | write | delete | exec | rename |
|------|------|------|------|--------|---------|-------|--------|------|--------|
| `readonly` | Yes | Yes | Yes | Yes | Yes | No | No | No | No |
| `create` | Yes | Yes | Yes | Yes | Yes | Create only | No | No | No |
| `append` | Yes | Yes | Yes | Yes | Yes | Create and append | No | No | No |
| `readwrite` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

### Visibility

| Mode | Behavior |
|------|----------|
| `full` | Content and metadata visible |
| `meta` | Content hidden, metadata only |

### Action Security

**Severity Levels:**

| Level | Meaning | Example |
|-------|---------|---------|
| `ambient` | No side effects, safe to call | Read status, get info |
| `boundary` | Has side effects but reversible | Send message, create file |
| `critical` | Destructive or irreversible | Delete data, deploy to production |

**Action Policy (enforced by AFS):**

| Policy | Allowed Severities |
|--------|--------------------|
| `safe` | ambient only |
| `standard` | ambient + boundary |
| `full` | all |

### Security Profile

Providers declare security metadata:

| Field | Type | Description |
|-------|------|-------------|
| `accessMode` | AccessMode | Default access mode |
| `actionPolicy` | ActionPolicy | Default action policy |
| `blockedActions` | string[] | Actions never allowed |
| `allowedActions` | string[] | Actions always allowed (overrides blocked) |
| `sensitiveFields` | string[] | Fields to redact |
| `sensitivity` | `"full"` \| `"redacted"` | Content sensitivity level |

---

## 6. Error Codes

All errors extend `AFSError` with a `code` field.

| Code | Class | Condition |
|------|-------|-----------|
| `AFS_NOT_FOUND` | AFSNotFoundError | Path does not exist |
| `AFS_ALREADY_EXISTS` | AFSAlreadyExistsError | Write with `mode: "create"` on existing path |
| `AFS_READONLY` | AFSReadonlyError | Write/delete/exec on readonly provider |
| `AFS_ACCESS_MODE` | AFSAccessModeError | Operation denied by access mode |
| `AFS_VALIDATION_ERROR` | AFSValidationError | Exec input fails schema validation |
| `AFS_SEVERITY_DENIED` | AFSSeverityError | Action severity exceeds policy |
| `AFS_MOUNT_FAILED` | AFSMountError | Provider health check failed on mount |
| `PATCH_TARGET_NOT_FOUND` | AFSPatchError | Write patch target missing |
| `PATCH_TARGET_AMBIGUOUS` | AFSPatchError | Write patch target ambiguous |

---

## 7. Events

### Event Model

Providers can emit events. Clients subscribe with filters.

**AFSEvent:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type (e.g., `"afs:write"`, `"frigate:detection"`) |
| `path` | string | Absolute path (mount-prefixed) |
| `source` | string | Provider name |
| `timestamp` | number | Unix timestamp (ms) |
| `data` | Record<string, unknown> | Event-specific payload |

**AFSEventFilter:**

| Field | Type | Matching |
|-------|------|----------|
| `type` | string | Exact match or wildcard (`"x:*"`) |
| `path` | string | Prefix match at path boundaries |
| `source` | string | Exact provider name match |

**Semantics:**
- Events are fire-and-forget (no delivery guarantee)
- Subscription is path-scoped — filter `path: "/data"` receives events from `/data` and all descendants
- Events are dispatched synchronously (subscriber callbacks run inline)

### Change Records

AFS automatically emits change records for structural changes:

| Kind | Trigger |
|------|---------|
| `write` | Successful write operation |
| `delete` | Successful delete operation |
| `rename` | Successful rename operation |
| `mount` | Provider mounted |
| `unmount` | Provider unmounted |
| `mountError` | Provider mount failed |

---

## 8. Provider Interface

### Required Contract

A provider (AFSModule) implements a subset of operations:

```
interface AFSModule {
  // Identity
  name: string
  description?: string
  uri?: string
  accessMode?: AccessMode        // default: "readonly"
  visibility?: Visibility        // default: "full"

  // Lifecycle (all optional)
  ready?(): Promise<void>
  close?(): Promise<void>
  onMount?(root: AFS, mountPath: string): void

  // Operations (all optional)
  read?(path, options): Promise<AFSReadResult>
  list?(path, options): Promise<AFSListResult>
  stat?(path, options): Promise<AFSStatResult>
  write?(path, content: AFSWriteEntryPayload, options): Promise<AFSWriteResult>
  delete?(path, options): Promise<AFSDeleteResult>
  search?(path, query, options): Promise<AFSSearchResult>
  exec?(path, args, options): Promise<AFSExecResult>
  explain?(path, options): Promise<AFSExplainResult>
  rename?(path, newPath, options): Promise<AFSRenameResult>
}
```

### Static Interface (Provider Class)

| Method | Description |
|--------|-------------|
| `schema()` | Zod schema for config validation |
| `manifest()` | Provider metadata (name, category, capabilities, security) |
| `load(params)` | Factory: create instance from config |
| `auth?(context)` | Custom authentication handler |

### Provider Manifest

Providers declare their capabilities for agent discovery:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Provider name |
| `description` | string | What the provider does |
| `category` | string | One of: storage, database, structured-data, compute, network, vcs, devops, messaging, ai, bridge, composite, iot, security, device, browser |
| `uriTemplate` | string | URI pattern for mounting |
| `capabilities` | ProviderCapabilityManifest | Network, filesystem, process access declarations |
| `security` | ProviderSecurityDeclaration | Resource access, risk level, data sensitivity |
| `tags` | string[] | Discovery tags |
| `capabilityTags` | string[] | Capability tags (e.g., `"read-write"`, `"real-time"`, `"auth:oauth"`) |

---

## 9. Capabilities & Discovery

### .meta/.capabilities

Reading `/.meta/.capabilities` returns an aggregated capabilities manifest:

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | 1 | Schema version |
| `provider` | string | Provider or aggregate name |
| `tools` | ToolDefinition[] | Available tools (name, path, inputSchema) |
| `actions` | ActionCatalog[] | Categorized action listing |
| `operations` | OperationsDeclaration | Supported operations per provider |
| `resources` | Record<string, ProviderResources> | Pricing, limits per provider |

### ToolDefinition

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Tool name for agent invocation |
| `description` | string | What the tool does |
| `path` | string | AFS exec path |
| `inputSchema` | JSONSchema7 | Input schema |

---

## 10. Transport

AFS defines two transport bindings: JSON-RPC over HTTP (primary) and RESTful HTTP (planned).

### 10.1 JSON-RPC over HTTP (Reference Transport)

The reference implementation uses a single-endpoint JSON-RPC protocol.
All operations go through one URL as HTTP POST with JSON body.

#### Endpoint

```
POST /rpc
Content-Type: application/json
Authorization: Bearer {token}    (optional)
```

#### Request Format

Two equivalent formats are supported:

**Named params** (recommended for readability):

```json
{
  "method": "read",
  "params": {
    "path": "/files/doc.txt",
    "options": { "startLine": 1, "endLine": 50 }
  }
}
```

**Positional args** (used by transparent proxy):

```json
{
  "method": "read",
  "args": ["/files/doc.txt", { "startLine": 1, "endLine": 50 }]
```

#### Response Format

**Success:**

```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": 1,
    "message": "Not found: /files/missing.txt",
    "details": null
  }
}
```

#### Error Codes

| Code | Name | HTTP Status | Description |
|------|------|-------------|-------------|
| 0 | OK | 200 | Operation successful |
| 1 | NOT_FOUND | 200 | Path does not exist |
| 2 | PERMISSION_DENIED | 200 | Access denied (readonly, wrong mode, or OS permission) |
| 3 | CONFLICT | 200 | Concurrent modification conflict |
| 4 | PARTIAL | 200 | Partial success (some items failed) |
| 5 | RUNTIME_ERROR | 200 | Provider-internal error |
| 6 | UNAUTHORIZED | 401 | Missing or invalid auth token |

Note: Error codes are in the JSON body, not in HTTP status. HTTP status is always 200
for dispatched operations. HTTP 400/401/405/413 are used for transport-level errors only.

#### Per-Operation Wire Format

**read**

```
Params:  { path: string, options?: { startLine?, endLine?, filter? } }
Result:  AFSReadResult { data?: AFSEntry }
```

Response `data` is the full `AFSEntry` including `content` (for JSON/text content)
or `content` omitted (for binary — use separate binary endpoint).

**list**

```
Params:  { path: string, options?: { filter?, maxDepth?, offset?, limit?, orderBy?, pattern? } }
Result:  AFSListResult { data: AFSEntry[], total?: number }
```

Entries in `data` array typically omit `content` (use `read` for full content).

**stat**

```
Params:  { path: string, options?: {} }
Result:  AFSStatResult { data?: Omit<AFSEntry, "content"> }
```

Returns entry metadata without content. Lighter than `read`.

**write**

```
Params:  { path: string, content: AFSWriteEntryPayload, options?: { mode? } }
Result:  AFSWriteResult { data: AFSEntry, message?: string }
```

`mode` values: `"replace"` (default), `"append"`, `"prepend"`, `"patch"`, `"create"`, `"update"`.

`content` is `AFSWriteEntryPayload`:

```json
{
  "content": "file content here",
  "meta": { "kind": "file", "description": "..." }
}
```

**delete**

```
Params:  { path: string, options?: { recursive? } }
Result:  AFSDeleteResult { data?: AFSEntry, message?: string }
```

**rename**

```
Params:  { oldPath: string, newPath: string, options?: { overwrite? } }
Result:  AFSRenameResult { data?: AFSEntry, message?: string }
```

**search**

```
Params:  { path: string, query: string, options?: { limit?, caseSensitive? } }
Result:  AFSSearchResult { data: AFSEntry[] }
```

**exec**

```
Params:  { path: string, args: Record<string, unknown>, options?: {} }
Result:  AFSExecResult { success: boolean, data?: unknown, error?: { message, details? }, usage?: { tokens? }, chunks?: AFSExecChunk[] }
```

For streaming exec, see §10.4.

**explain**

```
Params:  { path: string, options?: { format?: "markdown" | "text" } }
Result:  AFSExplainResult { data?: AFSEntry }
```

Returns a self-description of the path (purpose, available actions, schema).

#### Security

- **Auth:** Bearer token in `Authorization` header. Constant-time comparison.
- **Blocked methods:** `constructor`, `__proto__`, `toString`, etc. — rejected before dispatch.
- **Max body size:** 10MB default. Returns HTTP 413 if exceeded.
- **SSRF protection:** Client validates URLs against private IP ranges before connecting.

### 10.2 RESTful HTTP (Planned)

A future REST binding maps operations to HTTP methods and paths.

> **Important:** AFS operations have their own semantics independent of HTTP.
> This table is a _transport-level mapping_, not a semantic equivalence.
> In particular, `write` is NOT equivalent to HTTP PUT — `write` behavior
> depends on `mode` (see §4), and some modes (`append`, `prepend`) are
> non-idempotent. The HTTP method chosen here is a pragmatic convention
> for the REST transport binding only.

| Operation | Method | Path | Body | Notes |
|-----------|--------|------|------|-------|
| read | GET | `/{path}` | — | |
| list | GET | `/{path}?op=list` | — | |
| stat | GET | `/{path}?op=stat` | — | HEAD cannot return body |
| write (replace, patch, create, update) | PUT | `/{path}` | `{ content, meta?, mode? }` | Idempotent modes |
| write (append, prepend) | POST | `/{path}` | `{ content, meta?, mode? }` | Non-idempotent modes |
| delete | DELETE | `/{path}` | — | |
| search | GET | `/{path}?op=search&q={query}` | — | |
| exec | POST | `/{path}` | `{ args? }` | |
| explain | GET | `/{path}?op=explain` | — | |

### 10.3 Content Serialization

Content types in `AFSEntry.content`:

| Content Type | In-Process | Over Wire (JSON-RPC) | Over Wire (REST) |
|-------------|-----------|---------------------|-----------------|
| **JSON/structured** | Native object | Inline in `content` field | Inline in JSON response |
| **Text** | String | Inline in `content` field as string | Inline or raw text body |
| **Binary** | Raw bytes (`Data`/`ByteArray`) | `content` omitted; `meta.contentType` and `meta.size` set | Raw bytes as response body with `Content-Type` header |

**Binary content rules:**

1. Binary content MUST NOT be base64-encoded inside JSON responses
2. For JSON-RPC: `read` returns entry with `content: null`, `meta.contentType: "image/jpeg"`, `meta.size: 4096`. Client fetches binary via a separate REST-style `GET /{path}` endpoint
3. For REST: `GET /{path}` returns raw bytes with appropriate `Content-Type` header
4. `meta.contentType` indicates MIME type (e.g., `"image/jpeg"`, `"application/pdf"`)
5. `meta.size` indicates byte size (for progress indication)

### 10.4 Streaming Exec

Exec operations may produce incremental output (e.g., LLM text generation).

#### Callback Pattern (In-Process)

```typescript
interface AFSExecOptions {
  onChunk?: (chunk: AFSExecChunk) => void;
}

interface AFSExecChunk {
  text?: string;       // Incremental text output
  thoughts?: string;   // Incremental reasoning/thinking
  [key: string]: unknown;  // Provider-specific fields
}
```

The provider calls `onChunk()` synchronously as chunks arrive. The final
accumulated result is returned in `AFSExecResult`.

#### Over Wire (JSON-RPC)

For remote exec streaming, the response uses **NDJSON** (newline-delimited JSON):

```
POST /rpc
Content-Type: application/json

{"method":"exec","params":{"path":"/models/gpt","args":{"prompt":"hello"}}}
```

Response (streaming):

```
Content-Type: application/x-ndjson

{"type":"chunk","data":{"text":"Hello"}}
{"type":"chunk","data":{"text":" there"}}
{"type":"chunk","data":{"thoughts":"thinking about greeting..."}}
{"type":"result","data":{"success":true,"data":{"text":"Hello there"}}}
```

Each line is a complete JSON object. The final line has `"type":"result"` with
the full `AFSExecResult`. Intermediary lines have `"type":"chunk"` with an
`AFSExecChunk` payload.

If the client does not request streaming (no `Accept: application/x-ndjson` header),
the server buffers all chunks and returns a single JSON response.

### 10.5 WebSocket

WebSocket is used for:
- Real-time event subscriptions (provider → client push)
- AUP protocol (see `aup-protocol.md`)

WebSocket messages use JSON format. Event subscription/unsubscription
and AUP session management are defined in `aup-protocol.md`.

### 10.6 Service Handler

Providers can expose a raw HTTP service via the `ServiceHandler` interface:

```
interface ServiceHandler {
  fetch(request: Request): Promise<Response>
}
```

Uses the Web Standard `Request`/`Response` API — works in Node.js, Workers,
and any fetch-compatible runtime. This is an escape hatch for providers that
need custom HTTP handling beyond the standard operations.

---

## 11. Management Operations

AFS exposes management methods on the root instance for runtime introspection and control.

```typescript
subscribe(filter: AFSEventFilter, callback: AFSEventCallback): AFSUnsubscribe
listModules(): Promise<Array<{ name, description?, uri?, accessMode?, visibility?, actionPolicy?, ... }>>
getMounts(namespace?: string | null): MountInfo[]
getNamespaces(): (string | null)[]
unmount(path: string, namespace?: string | null): boolean
isMounted(path: string, namespace?: string | null): boolean
```

| Method | Description |
|--------|-------------|
| `subscribe` | Register an event listener with optional filter. Returns an unsubscribe function. |
| `listModules` | List all mounted providers with their metadata (name, description, access mode, etc.). |
| `getMounts` | Return mount info (`{ path, module, namespace }`) for a given namespace, or all if omitted. |
| `getNamespaces` | Return all active namespaces (including `null` for default). |
| `unmount` | Remove a provider at the given path and namespace. Returns `true` if found. |
| `isMounted` | Check whether a provider is mounted at the given path and namespace. |

---

## 12. Knowledge Discovery System

AFS provides a well-known path `/.knowledge/` that aggregates capability information from all mounted providers. Agents use this path to discover what data and actions are available across the entire namespace.

**Behavior:**

- `read("/.knowledge/")` returns an aggregated manifest of all providers, their mount paths, supported operations, and declared capabilities.
- Each provider contributes its `manifest()` and `treeSchema` (if declared) to the knowledge surface.
- The knowledge path is read-only and synthesized at query time — it has no backing provider.
- This complements `/.meta/.capabilities` (§9) by providing a higher-level, agent-oriented discovery surface.

---

## 13. Root-level Actions

AFS exposes two root-level actions for runtime mount management:

### `/.actions/mount`

Mount a provider at runtime.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Mount point |
| `provider` | AFSModule | Yes | Provider instance |
| `namespace` | string \| null | No | Target namespace |
| `replace` | boolean | No | Replace existing mount |

### `/.actions/unmount`

Unmount a provider at runtime.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Mount point to remove |
| `namespace` | string \| null | No | Target namespace |

Both actions emit `mount`/`unmount` change records (§7).

---

## 14. AFSContext

Execution context passed through to providers via `options.context` in all operations.

```typescript
interface AFSContext {
  afs?: AFSRoot;       // AFS root instance — injected by AFS.exec()
  userId?: string;     // Caller's user ID
  sessionId?: string;  // Caller's session ID
  [key: string]: unknown; // Extension point
}
```

- AFS injects the `afs` field automatically when dispatching to providers.
- `userId` and `sessionId` are propagated from the transport layer (HTTP headers, WebSocket session).
- Providers use the context for access control, audit logging, and cross-provider coordination.

---

## 15. Program Execution

AFS entries may contain executable programs, detected by the presence of a `program.yaml` manifest at the entry path.

**Detection:** When `exec()` targets a path, AFS checks for `program.yaml` at that path. If found, the entry is treated as an executable program rather than a simple action.

**Runtime:** Programs run in an isolated runtime with their own AFS context. The `program.yaml` manifest declares:

| Field | Type | Description |
|-------|------|-------------|
| `runtime` | string | Execution environment (e.g., `"node"`, `"python"`, `"deno"`) |
| `entry` | string | Entry point file relative to the program root |
| `env` | Record<string, string> | Environment variables |

Programs receive an `AFSContext` and can perform AFS operations through the injected `afs` instance.

---

## 16. Write Patches (AFSPatch)

When `write()` is called with `mode: "patch"`, the `content` field contains an array of patch operations:

```typescript
interface AFSPatch {
  op: "str_replace" | "insert_before" | "insert_after" | "delete";
  target: string;   // Unique text to find in the document
  content?: string; // Replacement or insertion text
}
```

| Operation | Behavior |
|-----------|----------|
| `str_replace` | Replace `target` with `content` |
| `insert_before` | Insert `content` immediately before `target` |
| `insert_after` | Insert `content` immediately after `target` |
| `delete` | Remove `target` from the document |

**Rules:**

- `target` must be unique in the document — throws `PATCH_TARGET_NOT_FOUND` if absent, `PATCH_TARGET_AMBIGUOUS` if duplicated.
- Multiple patches apply sequentially; each operates on the result of the previous patch.
- `content` is required for `str_replace`, `insert_before`, and `insert_after`; ignored for `delete`.

---

## 17. Edge Case Behaviors

| Scenario | Behavior |
|----------|----------|
| `list()` on unmounted path | Returns empty array `{ data: [] }` — not an error |
| `read()` on unmounted path | Throws `AFSNotFoundError` |
| `stat()` on unmounted path | Throws `AFSNotFoundError` |
| `list("/")` on root | Returns entries representing all top-level mounts |
| `stat("/")` on root | Returns root metadata (kind: `"directory"`, childrenCount: mount count) |
| `visibility: "meta"` with `search()` | Returns access denied — search is blocked entirely for meta-only providers |

---

## 18. Namespace Validation Rules

Mount path names are validated against these rules:

- **Forbidden characters:** `/`, `\0` (null byte), and control characters are rejected.
- **Empty/whitespace:** Empty strings and whitespace-only strings are rejected.
- **Canonical paths:** Paths are normalized — trailing slashes stripped, double slashes collapsed, `.` and `..` segments resolved. The canonical form is stored and used for all lookups.
- **Reserved prefixes:** Paths starting with `/.` (e.g., `/.meta`, `/.actions`, `/.knowledge`) are reserved for AFS internal use.

---

## 19. AUP Overlay Mount Rules

AUP providers may mount at `.aup/{name}` paths as overlays on existing mounts.

- The `default` namespace is protected — `.aup` overlay mounts in the default namespace follow standard conflict rules.
- Overlay mount paths must match the pattern: `/^\.aup\/[a-zA-Z0-9_-]+$/`
- Overlay mounts do not conflict with the parent mount — they layer on top, providing UI capabilities for the underlying data provider.

---

## 20. Isolation and Capability Enforcement

Providers can be sandboxed with capability restrictions to limit their access.

```typescript
type IsolationLevel = "none" | "audit" | "enforce" | "sandbox" | "docker";

interface IsolationConfig {
  defaultLevel?: IsolationLevel;
  overrides?: Record<string, {
    level?: IsolationLevel;
    grantedCapabilities?: Partial<ProviderCapabilityManifest>;
    deniedCapabilities?: Partial<ProviderCapabilityManifest>;
  }>;
}
```

| Level | Behavior |
|-------|----------|
| `none` | No restrictions |
| `audit` | Log all capability usage, no enforcement |
| `enforce` | Block undeclared capabilities |
| `sandbox` | Process-level isolation (separate context) |
| `docker` | Container-level isolation |

**ProviderCapabilityManifest** declares what a provider needs:

| Field | Type | Description |
|-------|------|-------------|
| `network` | `{ outbound?, inbound?, domains? }` | Network access |
| `filesystem` | `{ read?, write?, paths? }` | Filesystem access |
| `crossProvider` | `{ read?, write?, exec? }` | Access to other AFS providers |
| `process` | `{ spawn?, env? }` | Process spawning |
| `secrets` | `{ keys? }` | Secret vault access |

---

## 21. ProviderTreeSchema

Providers can declare their path structure for agent discovery:

```typescript
interface ProviderTreeSchema {
  operations: ("list"|"read"|"write"|"delete"|"search"|"exec"|"stat"|"explain")[];
  tree: Record<string, TreeNodeSchema>;
  auth?: { type: "none"|"token"|"aws"|"gcp"|"oauth"|"custom"; env?: string[] };
  bestFor?: string[];
  notFor?: string[];
}

interface TreeNodeSchema {
  kind: string;
  operations?: ("list"|"read"|"write"|"delete"|"search"|"exec")[];
  actions?: string[];
  destructive?: string[];
}
```

- `tree` maps path patterns to node schemas, describing the expected structure.
- `auth` declares authentication requirements.
- `bestFor` / `notFor` guide agent provider selection (e.g., `bestFor: ["time-series data"]`).
- `destructive` lists actions that require confirmation or elevated action policy.

---

## 22. Auth System

### AuthContext

Passed to providers during authentication:

```typescript
interface AuthContext {
  collect(schema: Record<string, unknown>): Promise<Record<string, string>>;
  createCallbackServer(): Promise<CallbackServer>;
  requestOpenURL(url: string): Promise<void>;
}

interface CallbackServer {
  callbackURL: string;
  waitForCallback(timeoutMs?: number): Promise<Record<string, string>>;
  close(): Promise<void>;
}
```

### SecretCapability

Scoped read-only access to vault secrets, injected at mount time:

```typescript
interface SecretCapability {
  get(key: string): Promise<string | undefined>;
  has(key: string): Promise<boolean>;
}
```

### Auth Flow

1. Provider manifest declares `sensitiveFields` (e.g., `["apiKey", "token"]`).
2. Credential store resolves known fields automatically.
3. `AuthContext.collect()` prompts for any remaining fields.
4. For OAuth flows, `createCallbackServer()` and `requestOpenURL()` handle the redirect dance.

---

## 23. AFSEventDeclaration Type

Providers declare their event types via this interface for discovery:

```typescript
interface AFSEventDeclaration {
  type: string;           // Event type identifier (e.g., "frigate:detection")
  description?: string;   // Human-readable description
  dataSchema?: Record<string, unknown>; // JSON Schema for event data payload
}
```

- Declared in `AFSEntryMetadata.events` (§2) for per-entry event discovery.
- Agents use these declarations to understand what events a provider can emit and what data to expect.
- The `dataSchema` follows JSON Schema 7 format for validation and documentation.

---

## Appendix A: Default Values

| Parameter | Default |
|-----------|---------|
| `list.limit` | 1000 |
| `list.offset` | 0 |
| `list.maxDepth` | 1 |
| `DEFAULT_MAX_DEPTH` | 1 (no upper bound enforcement) |
| `accessMode` | `"readonly"` |
| `visibility` | `"full"` |
| `actionPolicy` | `undefined` (no enforcement by default) |
| `write.mode` | `"replace"` |

## Appendix B: Categories

storage, database, structured-data, compute, network, vcs, devops,
messaging, ai, bridge, composite, iot, security, device, browser

## Appendix C: Capability Tags

**Data:** read-write, read-only, crud, search, query, sql, streaming
**Auth:** auth:token, auth:aws, auth:gcp, auth:oauth, auth:none
**Features:** real-time, batch, destructive, idempotent, rate-limited
**Access:** local, remote, cloud, on-premise
**Protocol:** http, websocket, stdio, grpc
