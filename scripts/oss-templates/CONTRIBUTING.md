# Contributing to AFS

Thank you for considering contributing to AFS! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/afs.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b my-feature`
5. Make your changes
6. Run tests: `pnpm test`
7. Submit a pull request

## Development Setup

**Requirements:**
- Node.js 20+
- pnpm 9+
- Bun (for running tests)

```bash
pnpm install        # Install all dependencies
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm lint           # Lint and type check
pnpm format         # Auto-fix formatting
pnpm check-types    # TypeScript type check
```

## Project Structure

```
packages/           # Core packages
  core/             # @aigne/afs — core abstraction
  cli/              # @aigne/afs-cli — command line tool
  testing/          # @aigne/afs-testing — test utilities

providers/          # AFS provider implementations
  fs/               # Local filesystem
  git/              # Git repositories
  json/             # JSON/YAML as virtual directories
  sqlite/           # SQLite databases
  ui/               # Agent UI Protocol (AUP)
  ...               # See README for full list
```

## Guidelines

### Code Style

- Code is formatted with [Biome](https://biomejs.dev/). Run `pnpm format` before committing.
- TypeScript strict mode is enabled. Run `pnpm check-types` to verify.
- Use `joinURL` from `ufo` for path concatenation — never string templates.

### Testing

- All code changes must include tests.
- Use `bun:test` for test files (`*.test.ts`).
- New providers must include conformance tests using `runProviderTests()` from `@aigne/afs-testing`.

### Provider Conformance

Every provider must pass the standard conformance test suite:

```typescript
// providers/my-provider/test/conformance.test.ts
import { runProviderTests } from "@aigne/afs-testing";
import { MyProvider } from "../src/index.js";

runProviderTests({
  name: "MyProvider",
  createProvider: () => new MyProvider({ /* config */ }),
  structure: {
    root: {
      name: "",
      children: [
        { name: "example", content: "hello" },
      ],
    },
  },
});
```

### Commit Messages

- Use clear, descriptive commit messages.
- Start with a verb: "Add", "Fix", "Update", "Remove", "Refactor".
- Reference issues when applicable: "Fix #123".

### Pull Requests

- Keep PRs focused — one feature or fix per PR.
- Include a description of what changed and why.
- Ensure all tests pass and types check before submitting.
- Update documentation if your change affects public APIs.

## Adding a New Provider

1. Create the provider directory: `providers/my-provider/`
2. Implement the provider extending `AFSBaseProvider`
3. Add conformance tests in `test/conformance.test.ts`
4. Add a `README.md` with usage instructions
5. Add the package to the workspace

See existing providers (e.g., `providers/json/`) as reference implementations.

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests.
- Include reproduction steps for bugs.
- For security issues, see [SECURITY.md](./SECURITY.md).

## License

By contributing to AFS, you agree that your contributions will be licensed under the project's [Business Source License 1.1](./LICENSE). Contributions will also be covered by the automatic license change to Apache 2.0 on the Change Date.

## Code of Conduct

Be respectful, constructive, and professional. We are building infrastructure for the AI age — let's do it together with mutual respect.
