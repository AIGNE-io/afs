/**
 * explain Command - Core Implementation
 *
 * Explains AFS paths or concepts.
 * Matches old version output format with topic/explanation/examples structure.
 */

import type { AFS } from "@aigne/afs";
import type { CommandModule } from "yargs";
import { configMountListCommand } from "../../config/mount-commands.js";
import { formatExplainOutput, formatPathExplainOutput } from "../formatters/index.js";
import { cliPathToCanonical } from "../path-utils.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

/**
 * Result for concept explanations (mount, paths, uri, overview)
 */
export interface ExplainResult {
  topic: string;
  explanation: string;
  examples?: string[];
}

/**
 * Result for path explanations
 */
export interface PathExplainResult {
  path: string;
  type: string;
  description?: string;
  inputs?: string[];
  outputs?: string[];
  errors?: string[];
  sideEffects?: string[];
  meta?: Record<string, string>;
  /** When set, the formatter renders this markdown directly instead of structured fields */
  markdown?: string;
}

/**
 * Explain command arguments
 */
export interface ExplainArgs {
  topic?: string;
}

/**
 * Create explain command factory
 */
export function createExplainCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, ExplainArgs> {
  return {
    command: "explain [topic]",
    describe: "Explain AFS concepts or paths",
    builder: {
      topic: {
        type: "string",
        description: "Topic (mount, path, uri) or AFS path (e.g., /src)",
      },
    },
    handler: async (argv) => {
      const target = argv.topic;

      // No target - explain overview
      if (!target) {
        options.onResult({
          command: "explain",
          result: explainOverview(),
          format: formatExplainOutput,
        });
        return;
      }

      // Priority: try as path first, then as concept
      const isPath = target.startsWith("/") || target.startsWith("@") || target.startsWith("$");

      if (isPath) {
        const afs = await resolveAFS(options);
        const canonicalPath = cliPathToCanonical(target);
        const result = await getPathExplanation(afs, target, canonicalPath);
        options.onResult({ command: "explain", result, format: formatPathExplainOutput });
      } else {
        // Not obviously a path — try as path first, fall back to concept
        let afs: AFS | undefined;
        try {
          afs = await resolveAFS(options);
        } catch {
          // AFS may not be configured — fall through to concept explanation
        }

        if (afs) {
          try {
            const canonicalPath = cliPathToCanonical(`/${target}`);
            const explainResult = await afs.explain(canonicalPath);
            if (explainResult.format === "markdown" && explainResult.content) {
              options.onResult({
                command: "explain",
                result: { path: `/${target}`, type: "explained", markdown: explainResult.content },
                format: formatPathExplainOutput,
              });
              return;
            }
          } catch {
            // Not a valid path, fall through to concept
          }
        }

        const cwd = options.cwd ?? process.cwd();
        const result = await getConceptExplanation(target.toLowerCase(), cwd, afs);
        options.onResult({
          command: "explain",
          result,
          format: formatExplainOutput,
        });
      }
    },
  };
}

/**
 * Get explanation for a path
 */
async function getPathExplanation(
  afs: AFS,
  path: string,
  canonicalPath: string,
): Promise<PathExplainResult> {
  try {
    // Always try afs.explain() first — transparent passthrough to provider explain
    try {
      const explainResult = await afs.explain(canonicalPath);
      if (explainResult.format === "markdown" && explainResult.content) {
        return {
          path,
          type: "explained",
          markdown: explainResult.content,
        };
      }
    } catch {
      // explain not available, fall through to stat-based logic
    }

    // Fallback: stat-based explanation
    let entry:
      | { path: string; meta?: Record<string, unknown> | null; content?: unknown }
      | undefined;

    try {
      const statResult = await afs.stat(canonicalPath);
      entry = statResult.data;
    } catch {
      // stat() optional — fall through to read()
    }

    if (!entry) {
      try {
        const readResult = await afs.read(canonicalPath);
        entry = readResult.data;
      } catch {
        // read() also failed — entry stays undefined, returns "unknown" type below
      }
    }

    if (!entry) {
      return {
        path,
        type: "unknown",
      };
    }

    const metadata = entry.meta || {};
    // Determine type from childrenCount: if defined, it has children (directory-like); otherwise file-like
    const entryType =
      metadata.kind === "afs:executable"
        ? "exec"
        : typeof metadata.childrenCount === "number"
          ? "directory"
          : "file";

    const result: PathExplainResult = {
      path: entry.path,
      type: entryType,
      description: metadata.description as string | undefined,
      meta: {},
    };

    // Add metadata
    if (metadata.provider) {
      result.meta!.provider = String(metadata.provider);
    }
    if (metadata.permissions) {
      const perms = metadata.permissions;
      result.meta!.permissions = Array.isArray(perms) ? perms.join(", ") : String(perms);
    }

    // For exec type, try to get schema info
    if (entryType === "exec") {
      if (metadata.inputs) {
        result.inputs = Array.isArray(metadata.inputs)
          ? (metadata.inputs as string[])
          : [String(metadata.inputs)];
      }
      if (metadata.outputs) {
        result.outputs = Array.isArray(metadata.outputs)
          ? (metadata.outputs as string[])
          : [String(metadata.outputs)];
      }
      if (metadata.errors) {
        result.errors = Array.isArray(metadata.errors)
          ? (metadata.errors as string[])
          : [String(metadata.errors)];
      }
      if (metadata.sideEffects) {
        result.sideEffects = Array.isArray(metadata.sideEffects)
          ? (metadata.sideEffects as string[])
          : [String(metadata.sideEffects)];
      }
    }

    // Clean up empty metadata
    if (Object.keys(result.meta!).length === 0) {
      delete result.meta;
    }

    return result;
  } catch (err) {
    return {
      path,
      type: "error",
      description: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get explanation for a concept
 */
async function getConceptExplanation(
  topic: string,
  cwd: string,
  afs?: AFS,
): Promise<ExplainResult> {
  switch (topic) {
    case "mount":
    case "mounts":
      return explainMounts(cwd, afs);
    case "path":
    case "paths":
      return explainPaths();
    case "uri":
    case "provider":
    case "providers":
      return explainUri();
    default:
      return {
        topic: "Unknown Topic",
        explanation: `Unknown topic: ${topic}\n\nAvailable topics: overview, mount, path, uri`,
      };
  }
}

function explainOverview(): ExplainResult {
  return {
    topic: "AFS Overview",
    explanation: `AFS (Abstract File System) is a virtual filesystem that unifies different data sources into a single namespace.

Core Concepts:
- mount: Mount a data source to a virtual path
- path: Virtual path, e.g., /src, /data
- uri: Data source address, e.g., fs://, git://, sqlite://

Data Flow:
  User Path -> AFS -> /{mount} -> Provider -> Actual Data`,
    examples: ["afs mount add /src fs:///path/to/source", "afs ls /src", "afs read /src/file.txt"],
  };
}

async function explainMounts(cwd: string, afs?: AFS): Promise<ExplainResult> {
  const result = await configMountListCommand(cwd);

  if (result.mounts.length === 0) {
    // Try runtime mounts if no config mounts
    if (afs) {
      try {
        const listResult = await afs.list("$afs:/");
        if (listResult.data?.length) {
          const runtimeMounts = listResult.data
            .map((entry) => `  ${entry.path} (runtime mount)`)
            .join("\n");

          return {
            topic: "Mounts",
            explanation: `Runtime mounts (mounted via API):\n\n${runtimeMounts}`,
            examples: listResult.data.slice(0, 3).map((entry) => `afs ls ${entry.path}`),
          };
        }
      } catch (err) {
        // Mount enumeration failed — debug log and show "no mounts" fallback
        console.debug("[explain] mount enumeration failed:", err);
      }
    }

    return {
      topic: "Mounts",
      explanation: `No mounts configured.

Use mount add to add a mount:
  afs mount add <path> <uri>

path: Virtual path for accessing data in AFS
uri: Data source URI specifying the data origin`,
      examples: [
        "afs mount add /src fs:///Users/me/project",
        "afs mount add /data sqlite:///data.db",
      ],
    };
  }

  const mountList = result.mounts
    .map((m) => `  ${m.path}${m.description ? ` - ${m.description}` : ""}`)
    .join("\n");

  return {
    topic: "Mounts",
    explanation: `Current mount configuration:

${mountList}

After mounting, data is accessed via the mount path:
  path="/src" -> /src`,
    examples: result.mounts.map((m) => `afs ls ${m.path}`),
  };
}

function explainPaths(): ExplainResult {
  return {
    topic: "Paths",
    explanation: `AFS Path Structure:

/                     Root directory
/{mount}              Mounted data source
/{mount}/{path}       Files/nodes within a mount

Path Mapping:
  config: path="/src"  ->  access: /src
  config: path="/data" ->  access: /data

Mounts are accessed directly at their configured path.`,
  };
}

function explainUri(): ExplainResult {
  return {
    topic: "URI",
    explanation: `AFS URI Schemes and Objects:

fs://       Local Filesystem Provider
  Format: fs:///absolute/path or fs://./relative/path
  Operations: list, read, write, delete

git://      Git Repository Provider
  Format: git:///local/repo or git://github.com/user/repo?branch=main
  Operations: list, read, exec (diff, create-branch, commit, merge)

sqlite://   SQLite Database Provider
  Format: sqlite:///path/to/db.sqlite
  Operations: list, read, exec (SQL queries)

json://     JSON Data Provider
  Format: json:///path/to/data.json
  Operations: list, read, write

toml://     TOML Data Provider
  Format: toml:///path/to/config.toml
  Operations: list, read, write

sandbox://  Sandboxed Script Execution Provider
  Format: sandbox:///path/to/scripts
  Operations: list, read, exec

github://   GitHub Issues/PRs Provider
  Format: github://owner/repo
  Operations: list, read, exec (create-issue, close-issue, etc.)

http://     HTTP Proxy Provider
  Format: http://host:port/path
  Operations: list, read

mcp://      MCP Server Provider
  Format: mcp:///path/to/server
  Operations: list, read, exec

s3://       AWS S3 Storage Provider
  Format: s3://bucket-name
  Operations: list, read, write, delete

gcs://      Google Cloud Storage Provider
  Format: gcs://bucket-name
  Operations: list, read, write, delete

ec2://      AWS EC2 Instances Provider
  Format: ec2://region
  Operations: list, read, exec (run-instances)

gce://      Google Compute Engine Provider
  Format: gce://project/zone
  Operations: list, read, exec

dns://      Cloud DNS Provider
  Format: dns://provider (route53, clouddns)
  Operations: list, read`,
    examples: [
      "afs mount add /src fs:///Users/me/project",
      "afs mount add /repo git://github.com/user/repo",
      "afs mount add /db sqlite:///data.sqlite",
      "afs mount add /s3 s3://my-bucket",
    ],
  };
}
