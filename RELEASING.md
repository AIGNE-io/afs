# Release Process

This project uses [Release Please Action](https://github.com/marketplace/actions/release-please-action) to manage the release process. Release Please simplifies the release workflow by analyzing commit messages, maintaining the CHANGELOG, and proposing version change pull requests.

## Commit Convention

For Release Please to correctly identify change types and automatically generate the changelog, all commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:

```
<type>(<scope>): <subject>
```

Common `type` categories include:

* `feat`: New features or functionality
* `fix`: Bug fixes
* `docs`: Documentation changes only
* `style`: Changes that don't affect code meaning (whitespace, formatting, missing semicolons, etc.)
* `refactor`: Code changes that neither fix bugs nor add features
* `perf`: Code changes that improve performance
* `test`: Adding or correcting tests
* `build`: Changes that affect the build system or external dependencies (e.g., webpack, npm)
* `ci`: Changes to CI configuration files and scripts
* `chore`: Other changes that don't modify src or test files
* `revert`: Revert a previous commit

For changes that affect multiple packages, you can specify in the scope, for example: `feat(core,types): add new type definitions`

## Release Process

This project supports dual release workflows:

### Beta Release (Default)

By default, all commits to the main branch will trigger a **beta release** process:

1. Developers commit features or fixes to the main branch
2. When merged to the main branch, Release Please Action automatically creates or updates a "beta release PR"
3. This PR includes version updates (e.g., `1.2.3-beta.1`), CHANGELOG updates
4. When the PR is merged, GitHub Release will be created with the beta tag
5. CI will automatically publish the beta packages

### Stable Release

To create a **stable release**, include `[release]` in your commit message:

```
feat: add new feature [release]
```

This will trigger the stable release workflow:

1. Release Please Action creates or updates a "release PR" (instead of beta)
2. This PR includes stable version updates (e.g., `1.2.3`), CHANGELOG updates
3. When the PR is merged, GitHub Release will be created
4. CI will automatically publish the stable packages

## Configuration Files

This project's Release Please configuration uses the following files:

* `release-please-config.json`: Defines beta release configuration with prerelease settings
* `release-please-config-release.json`: Defines stable release configuration
* `.release-please-manifest.json`: Tracks the current version of each package

### Important: Package Directory Structure

The current versioning strategy covers packages in the following directories:
- `packages/`
- `providers/`

Both configuration files (`release-please-config.json` and `release-please-config-release.json`) use the glob pattern `{packages,providers}/*/package.json` to track all package versions.

**⚠️ When adding new package directories:**

If you create a new top-level directory that contains packages (e.g., `plugins/`, `extensions/`), you MUST update both configuration files:

1. Edit `release-please-config.json`
2. Edit `release-please-config-release.json`
3. Update the `extra-files` path from `{packages,providers}/*/package.json` to include the new directory:
   ```json
   "path": "{packages,providers,new-directory}/*/package.json"
   ```

This ensures that all package versions are synchronized during releases.

## Triggering Releases

All releases are triggered by commits to the main branch. There is no manual workflow trigger.

### Triggering a Beta Release

Simply commit your changes following the Conventional Commits specification:

```bash
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in authentication"
```

When merged to main, these commits will automatically trigger the beta release process.

### Triggering a Stable Release

Include `[release]` anywhere in your commit message:

```bash
git commit -m "feat: add new feature [release]"
git commit -m "fix: critical bug fix [release]"
```

When merged to main, these commits will trigger the stable release process instead of beta.

**Note:** You can also add `[release]` to the PR title or merge commit message when merging a PR to main.

## Beta vs. Stable Release Configuration

This project uses two separate configuration files to manage beta and stable releases:

**Beta Release** (`release-please-config.json`):
- Enabled by default for all commits
- Uses `prerelease: true` with `prerelease-type: "beta"`
- Generates version numbers like `1.2.3-beta.1`, `1.2.3-beta.2`, etc.
- Triggered automatically unless `[release]` is in the commit message
- **Versioning strategy**: Always bumps **patch** version (e.g., `1.2.3-beta.1` → `1.2.4-beta.1`)

**Stable Release** (`release-please-config-release.json`):
- Triggered only when commit message contains `[release]`
- Uses `versioning: "always-bump-minor"` strategy
- Generates standard semantic versions like `1.2.3`
- Creates production-ready releases
- **Versioning strategy**: Always bumps **minor** version (e.g., `1.2.3` → `1.3.0`)

## Monorepo Version Management

This project uses a **unified versioning** strategy for all packages:

- All packages in the `packages/` and `providers/` directories share the same version number
- When a release is triggered, all packages are bumped to the same version simultaneously
- This is achieved through the `extra-files` configuration in both release config files, which updates all `{packages,providers}/*/package.json` files
- The unified version is tracked in `.release-please-manifest.json`

**Example**: When releasing version `1.3.0`, all packages (`@afs/core`, `@afs/history`, `@afs/fs`, etc.) will be updated to `1.3.0`, regardless of whether they had individual changes.

## Open-Source Release

The open-source version of AFS is published to a separate public repository: **[AIGNE-io/afs](https://github.com/AIGNE-io/afs)**.

### Principles

- **Monorepo** — a single public repo containing all open-source packages, providers, and examples. The goal is showcase and trust (readers can clone, build, and run), not community contribution.
- **BSL-1.1 license** — free use for any purpose except as a competing managed service. Converts to Apache 2.0 four years after each release (Change Date: 2030-03-07). Copyright holder: ArcBlock, Inc.
- **No per-file copyright headers** — the root LICENSE file is sufficient.
- **Commit author**: `ArcBlock Engineering <engineering@arcblock.io>` — not personal accounts.

### What Gets Published

| Category | Included |
|----------|----------|
| **Packages** | core, aup, testing, provider-utils, cli, explorer |
| **Providers** | fs, git, json, toml, sqlite, http, mcp, ui |
| **Examples** | basic, custom-provider, hello-aup |
| **Templates** | README.md, LICENSE, CONTRIBUTING.md, SECURITY.md |

**What is stripped / excluded:**
- Window Manager (WM) code from the UI provider
- Closed-source providers (ash, telegram, slack, cloudflare, s3, ec2, github, etc.)
- Closed-source packages (compute-abstraction, mapping, world-mapping)
- Closed-source CLI dependencies

### Sync Script

The script `scripts/sync-oss.ts` automates the entire process — copying files, stripping WM code, patching dependencies, and updating licenses.

### Release Steps

```bash
# 1. Sync monorepo → clean OSS directory
rm -rf /tmp/afs-oss && bun scripts/sync-oss.ts /tmp/afs-oss

# 2. Install, build, verify tests
cd /tmp/afs-oss
pnpm install
pnpm build
cd packages/cli && bun test --update-snapshots && cd ../..   # CLI snapshots differ
pnpm test --force                                            # --force bypasses turbo cache

# 3. Initialize git and push
cd /tmp/afs-oss
git init
git remote add origin git@github.com:AIGNE-io/afs.git
git config user.name "ArcBlock Engineering"
git config user.email "engineering@arcblock.io"
git add -A
git commit -m "Release vX.Y.Z — description of changes"
git branch -M main
git push origin main --force
```

> **Note:** `--force` push overwrites the previous release (single-commit model). If incremental commit history is desired in the future, clone the existing repo first and sync into it instead of re-initializing.
