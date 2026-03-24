# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AFS (Agentic File System)** is a virtual file system abstraction layer that provides a unified, file-system-like interface for AI agents to access various types of storage backends. It enables agents to interact with different data sources through a consistent, path-based API.

## Development Commands

```bash
# Package management (pnpm workspaces)
pnpm install              # Install all dependencies
pnpm build                # Build all packages using Turbo
pnpm dev                  # Run dev mode for all packages
pnpm lint                 # Run Biome linter + type checking
pnpm format               # Auto-fix formatting issues with Biome
pnpm test                 # Run all tests
pnpm test:coverage        # Run tests with coverage
pnpm check-types          # Type check all packages
```

### Per-package commands
```bash
cd packages/core          # Navigate to a package
pnpm build               # Build single package
pnpm test                # Run package tests
pnpm check-types         # Type check package
```

## Tooling

- **Package manager**: pnpm with workspaces
- **Build system**: Turbo (turborepo)
- **Runtime**: bun (for development and tests)
- **Linting/Formatting**: Biome
- **Testing**: bun:test
- **Type checking**: TypeScript 5.9.2

### Type Checking

Always run `pnpm check-types` to verify TypeScript compilation before committing:

```bash
cd packages/cli && pnpm check-types       # Check single package (cd into it)
pnpm --filter @aigne/afs-cli check-types  # Check single package by name
pnpm --filter ./packages/cli check-types  # Check single package by path
pnpm check-types                          # Check all packages from root
```

This catches type errors that may not surface during runtime or tests.

## Package Structure

```
packages/
├── core/                      # Core AFS implementation (@aigne/afs)
├── explorer/                  # AFS explorer utilities
└── compute-abstraction/       # Cross-cloud compute instance abstraction

providers/                     # AFS provider implementations (categorized)
├── core/                      # Core data providers
│   ├── json/                  # JSON/YAML virtual FS (@aigne/afs-json)
│   ├── toml/                  # TOML virtual FS (@aigne/afs-toml)
│   ├── kv/                    # Key-value store (@aigne/afs-kv)
│   ├── memory/                # In-memory FS (@aigne/afs-memory)
│   ├── markdown/              # Markdown structure (@aigne/afs-markdown)
│   ├── registry/              # Provider registry (@aigne/afs-registry)
│   ├── vault/                 # Secret vault (@aigne/afs-vault)
│   ├── workspace/             # Workspace manager (@aigne/afs-workspace)
│   └── proc/                  # Process manager (@aigne/afs-proc)
├── basic/                     # Basic I/O providers
│   ├── fs/                    # Local filesystem (@aigne/afs-fs)
│   ├── http/                  # HTTP endpoints (@aigne/afs-http)
│   ├── sandbox/               # Sandboxed FS (@aigne/afs-sandbox)
│   ├── ash/                   # Agent shell (@aigne/afs-ash)
│   └── ...
├── platform/                  # Cloud platform providers
│   ├── s3/                    # AWS S3 (@aigne/afs-s3)
│   ├── gcs/                   # Google Cloud Storage (@aigne/afs-gcs)
│   ├── ec2/                   # AWS EC2 (@aigne/afs-ec2)
│   ├── gce/                   # Google Compute Engine (@aigne/afs-gce)
│   ├── dns/                   # Cloud DNS (@aigne/afs-dns)
│   ├── git/                   # Git repository (@aigne/afs-git)
│   ├── github/                # GitHub Issues/PRs (@aigne/afs-github)
│   ├── sqlite/                # SQLite database (@aigne/afs-sqlite)
│   └── ...
├── messaging/                 # Messaging providers (Slack, Discord, etc.)
├── iot/                       # IoT providers (Home Assistant, Tesla, etc.)
├── cost/                      # Cost tracking providers
├── ai/                        # AI service providers
└── runtime/                   # Runtime providers (MCP, UI, etc.)

scripts/                       # Build and utility scripts
typescript-config/             # Shared TypeScript configurations
```

## Core Concepts

### AFS (Agentic File System)

The core abstraction layer that provides a unified interface for mounting and accessing different storage backends. All providers implement the AFS interface to ensure consistent behavior.

### Providers

Providers are modules that can be mounted into AFS at specific paths. Each provider implements:

- **List operations**: List files/directories with metadata
- **Read operations**: Read file contents
- **Write operations** (optional): Modify or create files
- **Search operations** (optional): Search within mounted data

Available providers:
- `AFSFS` - Access local filesystem directories
- `AFSGit` - Access Git repository branches and files
- `AFSJSON` - Navigate JSON/YAML files as virtual filesystems
- `AFSSQLite` - SQLite-based storage backend

### Mount Paths

Providers are mounted at paths following the pattern `/modules/{provider-name}/{path}`. The mount system allows:
- Multiple providers at different paths
- Nested virtual directory structures
- Path-based access control

## Key Patterns

### Mounting a Provider

```typescript
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

const afs = new AFS();
afs.mount(
  new AFSFS({
    localPath: "/path/to/local/directory",
    description: "Project source code",
  }),
);
```

### Reading Files

```typescript
const content = await afs.read("/modules/fs/README.md");
console.log(content);
```

### Listing Directories

```typescript
const { list } = await afs.list("/modules/fs", { recursive: true });
for (const item of list) {
  console.log(`${item.path} - ${item.type} - ${item.size} bytes`);
}
```

### Searching Content

```typescript
const results = await afs.search("/modules/fs", {
  pattern: "TODO",
  type: "content",
});
```

## Commit Messages

所有 commit message **必须**遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### 常用 type

| Type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `test` | 测试新增或修改 |
| `refactor` | 重构（不改行为） |
| `chore` | 构建、CI、依赖等杂项 |
| `perf` | 性能优化 |
| `ci` | CI 配置变更 |

### scope

scope 使用包名或模块名，例如 `core`、`did-space`、`arc-computer`、`cli`。

### 示例

```
feat(did-space): add REST API handler for DID Space CRUD
fix(arc-computer): handle invalid JSON body in PUT requests
test(did-space): add conformance tests for DIDSpaceResolver
docs(planning): update Phase 1 REST API design
refactor(core): extract error mapping to shared utility
chore(deps): bump typescript to 5.9.2
```

### Breaking Changes

如果有破坏性变更，在 footer 添加 `BREAKING CHANGE:` 或在 type 后加 `!`：

```
feat(core)!: rename AFSModule to AFSProvider

BREAKING CHANGE: AFSModule type has been renamed to AFSProvider.
```

## Release Process

This project uses a dual-release workflow with Release Please:

### Beta Releases (Default)
- All commits to main trigger beta releases
- Versions follow `1.2.3-beta.1` format
- Always bump patch version

### Stable Releases
- Include `[release]` in commit message to trigger stable release
- Versions follow `1.2.3` format
- Always bump minor version

### Versioning Strategy
- **Unified versioning**: All packages share the same version number
- When releasing, all packages in `packages/` and `providers/` are updated simultaneously

**See [RELEASING.md](./RELEASING.md) for detailed release instructions.**

## Adding New Packages

When adding a new package to `packages/` or `providers/`:

1. Ensure package.json has the correct name (`@aigne/afs-*`)
2. Add appropriate TypeScript configuration extending from `typescript-config`
3. Include build scripts compatible with Turbo
4. Add tests using bun:test
5. **For providers**: Add `test/conformance.test.ts` using `runProviderTests()` from `@aigne/afs-testing` (see [Provider Conformance Testing](#provider-conformance-testing))

**Important**: If creating a new top-level directory for packages (beyond `packages/` and `providers/`):
1. Update `pnpm-workspace.yaml` to include the new directory
2. Update `release-please-config.json` to include the new path in `extra-files`
3. Update `release-please-config-release.json` to include the new path in `extra-files`

## Provider Conformance Testing

**Every provider MUST have a conformance test file at `providers/{name}/test/conformance.test.ts`** using `runProviderTests()` from `@aigne/afs-testing`. This is a non-negotiable requirement — no provider is considered complete without passing conformance tests.

### What `runProviderTests` covers

The framework automatically runs 21 test suites: StructureValidation, ReadOperations, SearchOperations, MetaOperations, ExplainOperations, AccessModeValidation, ErrorTypesValidation, EntryFieldsValidation, ListOptionsValidation, PathNormalizationValidation, DeepListValidation, NoHandlerValidation, RouteParamsValidation, MetadataRichnessValidation, ExplainExistenceValidation, CapabilitiesOperationsValidation, plus optional ExecuteOperations, ActionOperations, WriteCaseOperations, DeleteCaseOperations.

### Required fixture fields

```typescript
import { runProviderTests } from "@aigne/afs-testing";

runProviderTests({
  name: "MyProvider",
  createProvider: () => new MyProvider({ ... }),

  // Tree-based structure declaration — describes provider's data shape
  structure: {
    root: {
      name: "",
      meta: { /* root metadata */ },
      children: [
        { name: "file", content: "content" },
        { name: "dir", children: [{ name: "child", content: "..." }] },
      ],
      actions: [  // if provider has actions
        { name: "action-name", description: "..." },
      ],
    },
  },

  // Optional: custom test cases for provider-specific operations
  writeCases: [{ name: "...", path: "...", payload: { content: "..." }, expected: { ... } }],
  actionCases: [{ name: "...", path: "/.actions/x", args: { ... }, expected: { success: true } }],
  deleteCases: [{ name: "...", path: "...", verifyDeleted: true }],
  executeCases: [{ name: "...", path: "...", args: { ... }, expected: { ... } }],
});
```

### When planning a new provider

- Phase 0 of any provider plan MUST include conformance test setup
- Each subsequent phase must keep all previous conformance tests passing (non-regression)
- Reference `providers/json/test/conformance.test.ts` as the simplest example

## Working with Git Provider

The Git provider (`@aigne/afs-git`) requires special considerations:

- Uses git commands for efficient file access
- Supports readonly and readwrite modes
- Readwrite mode uses git worktrees for isolation
- Can auto-commit changes if configured

## Coding Conventions

### AFS-Only I/O — 绝不绕过 AFS 直接访问底层资源

**这是本项目的第一原则。** 所有 I/O 操作必须通过 AFS API（`read`/`write`/`list`/`stat`/`exec`），
绝不直接访问底层平台资源。

```
❌ 错误                                    ✅ 正确
─────────────────────────────────────────  ─────────────────────────────────────────
fs.readFile(path)                          afs.read(path)
fs.writeFile(path, data)                   afs.write(path, { content: data })
KV.get(key) / KV.put(key, val)             通过 KV provider 的 afs.read() / afs.write()
fetch("https://api.cloudflare.com/...")    通过对应 provider 的 afs.exec()
import { getPlatform } from "plat"         使用 AFSReader 接口（getPlatform 已废弃）
env.MY_DO.get(id).fetch(...)               afs.exec() 内部封装 DO 调度
```

**为什么不可妥协：**

1. **运行时无关** — 同一段代码在 Workers、Node daemon、Bun、浏览器上都能跑
2. **Provider 可替换** — KV→Redis、Pages→Vercel，只换 provider，应用代码零改动
3. **可测试** — 测试时 mount memory provider 替代真实后端，不需要云服务账号
4. **可审计** — 所有 I/O 经过 AFS，统一的日志和权限控制

**实现者检查规则：** 每当你想 `import` 一个平台特定的 API 或直接调用底层资源时，
停下来问——**这个操作应该由哪个 AFS provider 暴露？** 如果没有对应的 provider，就需要创建一个。

**唯一例外：** provider 内部实现。provider 的职责就是封装底层资源（KV provider 内部调 `KV.get()`，
FS provider 内部调 `fs.readFile()`）。但 provider 之外的所有代码只通过 AFS 接口交互。

### Pre-Code Checklist（每次写代码前必须过的检查）

**在写任何代码之前，先过这个 checklist。违反任何一条 = 停下来重新想。**

#### 1. AFS-Only I/O 检查

- 我要做的 I/O 是否通过 AFS API？
- 如果不是：**停。** 这个操作应该由哪个 provider 暴露？
- 如果没有对应的 provider：需要创建一个，不是绕过 AFS

**常见违规模式：**
```
❌ 自己 fetch 一个 API → 应该通过 http provider 或对应的 service provider
❌ 自己读写文件 → 应该通过 fs provider
❌ 自己管理 WebSocket 连接 → 应该通过 session protocol
❌ 自己实现缓存 → 应该通过 memory/kv provider
❌ 自己解析配置文件 → 应该通过 json/toml provider
```

#### 2. 抽象复用检查

- 我要实现的功能，AFS 里是否已有类似的？
- 现有 provider/package 能否扩展来支持？
- 有没有共享的 base class/utility 可以复用？

**常见违规模式：**
```
❌ 新建一个 helper 做 path 拼接 → 用 joinURL from ufo
❌ 新建一个 error 类型 → 用现有的 AFSNotFoundError / AFSPermissionError 等
❌ 新写一个 WS 通信层 → 用 Session Protocol
❌ 新写一个 provider 注册机制 → 用 /registry/ 虚拟路径
❌ 新写一个配置加载器 → 用 AFSJSON/AFSToml
❌ 复制粘贴现有代码改几行 → 提取公共部分
```

#### 3. 如果不确定

**停下来问用户。** 不要自己决定绕过。

具体来说：
- "我觉得直接调 fetch 比通过 AFS 简单" → **问用户**，答案几乎肯定是 "不行"
- "现有抽象不太适合，我想新建一个" → **问用户**，可能只需要小改现有抽象
- "这个特殊情况是否可以不走 AFS" → **问用户**，除了 provider 内部，答案是 "不行"

### Path Concatenation

**Always use `joinURL` from the `ufo` package for path concatenation.** Never use string template literals or string concatenation (e.g., `` `${path}/.meta` `` or `path + "/.meta"`).

```typescript
import { joinURL } from "ufo";
const metaPath = joinURL(path, ".meta");
const childPath = joinURL(parentPath, childName);
```

This ensures proper handling of edge cases (root paths, trailing slashes, empty segments).

## Working with JSON Provider

The JSON provider (`@aigne/afs-json`) maps JSON/YAML structure to filesystem:

- Objects and arrays become directories
- Primitive values become files
- Supports both JSON and YAML formats
- Write operations persist changes to original file

## Self-Verification（不可跳过的验证流程）

**实现任何功能后，声称 "完成" 之前，必须完成以下三层验证。缺任何一层不算完成。**

### Layer 1: Static（构建 + 类型 + 测试）

```bash
pnpm build                                    # 全量构建
pnpm check-types                              # 全量类型检查
pnpm --filter @aigne/afs-{package} test       # 受影响包的测试
pnpm test                                     # 全量测试（pass count 不能减少）
```

### Layer 2: Dynamic（启动 + 实际请求 + 验证响应）

**利用 AFS 的 WS 协议自测。** 不要只看测试通过就觉得 ok — 实际启动 service 并发请求：

```bash
# 启动 AFS service（或用 test harness）
# 通过 WS 或 CLI 实际调用你改的功能
# 检查返回值是否正确
# 至少测一个 happy path 和一个 edge case
```

对于 provider 功能：mount provider → list → read → write → 验证 roundtrip。
对于 AUP/UI 功能：通过 AFS API 读 AUP tree → 检查节点结构 → 触发事件 → 验证状态变化。
对于 protocol 功能：启动两端 → attach → 发请求 → 验证响应 → 断开 → 验证 graceful degradation。

### Layer 3: Adversarial（故意破坏）

至少尝试一个：
- 发空/null/超大输入
- 断开连接看是否 hang
- 并发请求看是否 race condition
- path traversal (../) 看是否被拦

### 输出要求

在回复中贴出 Layer 2 和 Layer 3 的实际测试过程和结果。不要只说 "测试通过" — 贴出你跑了什么、看到了什么。

## Documentation

- [README.md](./README.md) - 项目概述
- [intent/INTENT.md](./intent/INTENT.md) - 技术规格
- [RELEASING.md](./RELEASING.md) - 发布流程（含 OSS release 流程）
- [LICENSE.md](./LICENSE.md) - Proprietary (内部仓库)
- OSS 公开仓库: [AIGNE-io/afs](https://github.com/AIGNE-io/afs) — 见 RELEASING.md "Open-Source Release" 章节
