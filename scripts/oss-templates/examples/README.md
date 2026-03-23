# AFS Examples

Minimal examples to get started with AFS. Each example is self-contained and runs with a single command.

## [Basic Usage](./basic)

Mount local files and JSON, then read, list, search, write, and stat — the core AFS operations in one script.

```bash
cd examples/basic
bun index.ts
```

**What you'll learn:** Mounting providers, uniform path-based access, JSON-as-filesystem navigation.

## [Custom Provider](./custom-provider)

Build your own AFS provider from scratch — the pattern for integrating any data source (APIs, databases, IoT, etc.).

```bash
cd examples/custom-provider
bun index.ts
```

**What you'll learn:** `AFSBaseProvider`, route decorators (`@List`, `@Read`, `@Actions.Exec`), route parameters, action arguments.

## [Hello AUP](./hello-aup)

Render a live web page from code using AUP (Agent UI Protocol) — no HTML templates, no client framework, just data over WebSocket.

```bash
cd examples/hello-aup
bun index.ts
# Open http://127.0.0.1:3210 in your browser
```

**What you'll learn:** AUP node trees, session management, live patching, visual themes.

## More

See the [main README](../README.md) for full provider list, CLI usage, and MCP integration.
