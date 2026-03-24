import type { AFSModule, ProviderManifest, ProviderTreeSchema } from "@aigne/afs";
import { joinURL } from "ufo";

/**
 * Expected action declaration for a test node.
 * Used to verify that actions are correctly exposed on nodes.
 */
export interface TestActionDeclaration {
  /** Action name */
  name: string;
  /** Optional description to verify */
  description?: string;
}

/**
 * A node in the test tree structure.
 * - If `children` is defined and non-empty, it's a directory
 * - If `content` is defined, it's a file
 * - Root node has name "" (empty string)
 */
export interface TestTreeNode {
  /** Node name (not full path). Root node uses empty string. */
  name: string;

  /** For files: expected content (optional, for read verification) */
  content?: string | Record<string, unknown>;

  /** For directories: child nodes. Presence with length > 0 indicates directory. */
  children?: TestTreeNode[];

  /** Expected meta for this node */
  meta?: Record<string, unknown>;

  /**
   * Expected actions for this node.
   * If specified, the framework will verify these actions exist via list(.actions).
   */
  actions?: TestActionDeclaration[];
}

/**
 * Describes the test data structure using a tree.
 */
export interface TestDataStructure {
  /**
   * Root of the tree structure representing "/".
   * All paths are derived from traversing this tree.
   * The framework validates that provider data matches this tree.
   */
  root: TestTreeNode;
}

// ============ Tree Helper Types ============

/**
 * A flattened node with its computed path.
 * Used internally for iterating over the tree.
 */
export interface FlattenedNode {
  /** Full path from root (e.g., "/docs/readme.md") */
  path: string;

  /** The tree node */
  node: TestTreeNode;

  /** Depth from root (root = 0) */
  depth: number;
}

// ============ Tree Helper Functions ============

/**
 * Check if a tree node represents a directory (has children).
 */
export function isDirectory(node: TestTreeNode): boolean {
  return node.children !== undefined;
}

/**
 * Check if a tree node represents a file (has content or is a leaf without children).
 */
export function isFile(node: TestTreeNode): boolean {
  return node.content !== undefined || !isDirectory(node);
}

/**
 * Compute the full path for a node given its parent path.
 */
export function computePath(parentPath: string, nodeName: string): string {
  if (parentPath === "/" && nodeName === "") return "/";
  return joinURL(parentPath, nodeName);
}

/**
 * Flatten a tree into an array of nodes with their paths.
 * Traverses in BFS order.
 */
export function flattenTree(root: TestTreeNode): FlattenedNode[] {
  const result: FlattenedNode[] = [];
  const queue: Array<{ node: TestTreeNode; path: string; depth: number }> = [
    { node: root, path: "/", depth: 0 },
  ];

  while (queue.length > 0) {
    const { node, path, depth } = queue.shift()!;
    result.push({ path, node, depth });

    if (node.children) {
      for (const child of node.children) {
        const childPath = computePath(path, child.name);
        queue.push({ node: child, path: childPath, depth: depth + 1 });
      }
    }
  }

  return result;
}

/**
 * Find a node in the tree by path.
 */
export function findNode(root: TestTreeNode, targetPath: string): TestTreeNode | undefined {
  if (targetPath === "/") return root;

  const segments = targetPath.split("/").filter(Boolean);
  let current: TestTreeNode | undefined = root;

  for (const segment of segments) {
    if (!current?.children) return undefined;
    current = current.children.find((c) => c.name === segment);
    if (!current) return undefined;
  }

  return current;
}

/**
 * Find the first file node in the tree (excluding root).
 */
export function findFirstFile(root: TestTreeNode): FlattenedNode | undefined {
  const flattened = flattenTree(root);
  return flattened.find((n) => n.path !== "/" && isFile(n.node) && !isDirectory(n.node));
}

/**
 * Find the first directory node in the tree (excluding root).
 */
export function findFirstDirectory(root: TestTreeNode): FlattenedNode | undefined {
  const flattened = flattenTree(root);
  return flattened.find((n) => n.path !== "/" && isDirectory(n.node));
}

/**
 * Find a nested directory (depth >= 2) in the tree.
 */
export function findNestedDirectory(root: TestTreeNode): FlattenedNode | undefined {
  const flattened = flattenTree(root);
  return flattened.find((n) => isDirectory(n.node) && n.depth >= 2);
}

/**
 * Get all file nodes from the tree.
 */
export function getAllFiles(root: TestTreeNode): FlattenedNode[] {
  return flattenTree(root).filter((n) => isFile(n.node) && !isDirectory(n.node));
}

/**
 * Get all directory nodes from the tree.
 */
export function getAllDirectories(root: TestTreeNode): FlattenedNode[] {
  return flattenTree(root).filter((n) => isDirectory(n.node));
}

/**
 * Configuration options for test behavior.
 */
export interface TestConfig {
  /** Custom timeout for slow providers (ms) */
  timeout?: number;
}

// ============ Execute test types ============

/**
 * Validator function for execute test output.
 * Use expect() assertions inside to validate the output.
 * @example
 * ```typescript
 * (output, expect) => {
 *   expect(output.content).toBeDefined();
 *   expect(output.content[0].text).toContain("hello");
 * }
 * ```
 */
export type ExecuteOutputValidator = (
  output: Record<string, unknown>,
  expect: typeof import("bun:test").expect,
) => void;

/**
 * Expected output specification for execute tests.
 * Can be:
 * - An exact object to match (deep equality)
 * - A validator function that uses expect() assertions
 * - An object with `contains` for partial matching
 */
export type ExecuteExpectedOutput =
  | Record<string, unknown>
  | ExecuteOutputValidator
  | { contains: Record<string, unknown> };

/**
 * A single execute test case.
 */
export interface ExecuteTestCase {
  /** Test case name/description */
  name: string;

  /** Path to execute (e.g., "/tools/echo") */
  path: string;

  /** Input arguments for execution */
  args: Record<string, unknown>;

  /**
   * Expected output validation.
   * - Object: exact deep equality match
   * - Function: custom validator
   * - { contains: ... }: partial match (output should contain these keys/values)
   */
  expected?: ExecuteExpectedOutput;

  /**
   * If true, the execution is expected to throw an error.
   * Can also be a string/regex to match the error message.
   */
  shouldThrow?: boolean | string | RegExp;
}

// ============ Write test types ============

/**
 * Validator function for write test result.
 * Uses a more flexible type to accommodate AFSWriteResult structure.
 */
export type WriteOutputValidator = (
  result: { data?: { path: string; content?: unknown; meta?: Record<string, unknown> | null } },
  expect: typeof import("bun:test").expect,
) => void;

/**
 * Expected output specification for write tests.
 */
export type WriteExpectedOutput =
  | { content: unknown }
  | { contentContains: string }
  | { meta: Record<string, unknown> }
  | WriteOutputValidator;

/**
 * A single write test case.
 * Tests write operations including content and meta writes.
 */
export interface WriteTestCase {
  /** Test case name/description */
  name: string;

  /**
   * Path to write to.
   * - Can be an existing path from structure (tests overwrite)
   * - Can be a new path (tests creation)
   * - Use payload.meta for meta-only writes (.meta paths are read-only)
   */
  path: string;

  /**
   * Payload to write.
   * At least one of content or meta should be provided.
   */
  payload: {
    content?: string | Record<string, unknown>;
    meta?: Record<string, unknown>;
    patches?: {
      op: "str_replace" | "insert_before" | "insert_after" | "delete";
      target: string;
      content?: string;
    }[];
  };

  /**
   * Write options (mode, etc.) passed to provider.write().
   */
  options?: { mode?: "replace" | "append" | "prepend" | "patch" | "create" | "update" };

  /**
   * Expected output validation.
   * - { content: ... }: verify written content matches
   * - { contentContains: ... }: verify content contains string
   * - { meta: ... }: verify meta matches
   * - Function: custom validator with expect()
   */
  expected?: WriteExpectedOutput;

  /**
   * If true, the write is expected to throw an error.
   * Can also be a string/regex to match the error message.
   */
  shouldThrow?: boolean | string | RegExp;
}

// ============ Delete test types ============

/**
 * A single delete test case.
 * Tests delete operations on paths from the structure.
 */
export interface DeleteTestCase {
  /** Test case name/description */
  name: string;

  /**
   * Path to delete.
   * Should typically be a path that exists in the structure.
   */
  path: string;

  /**
   * If true, the delete is expected to throw an error.
   * Can also be a string/regex to match the error message.
   */
  shouldThrow?: boolean | string | RegExp;

  /**
   * If true, verify the path no longer exists after deletion.
   * Uses list() or read() to confirm deletion.
   * @default true
   */
  verifyDeleted?: boolean;
}

// ============ Action test types ============

/**
 * Validator function for action test output.
 * Use expect() assertions inside to validate the output.
 * @example
 * ```typescript
 * (result, expect) => {
 *   expect(result.success).toBe(true);
 *   expect(result.data?.newId).toBeDefined();
 * }
 * ```
 */
export type ActionOutputValidator = (
  result: {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  },
  expect: typeof import("bun:test").expect,
) => void;

/**
 * Expected output specification for action tests.
 * Can be:
 * - An exact object to match (deep equality on data field)
 * - A validator function that uses expect() assertions
 * - An object with `contains` for partial matching
 * - An object with `success` to just check success/failure
 */
export type ActionExpectedOutput =
  | { success: boolean }
  | { data: Record<string, unknown> }
  | { contains: Record<string, unknown> }
  | ActionOutputValidator;

/**
 * A single action test case.
 * Tests input/output behavior of actions on nodes.
 */
export interface ActionTestCase {
  /** Test case name/description */
  name: string;

  /**
   * Path to the action (e.g., "/users/.actions/insert" or "/.actions/create-table").
   * This is the full action path including the .actions segment.
   */
  path: string;

  /** Input arguments for the action */
  args: Record<string, unknown>;

  /**
   * Expected output validation.
   * - { success: true/false }: just check success status
   * - { data: ... }: exact match on result.data
   * - { contains: ... }: partial match on result.data
   * - Function: custom validator
   */
  expected?: ActionExpectedOutput;

  /**
   * If true, the action execution is expected to throw an error.
   * Can also be a string/regex to match the error message.
   */
  shouldThrow?: boolean | string | RegExp;
}

/**
 * Result of setting up a provider for the playground environment.
 * Providers export `setupPlayground()` from `test/playground.ts` returning this.
 */
export interface PlaygroundSetup {
  /** Display name */
  name: string;
  /** Mount path in AFS, e.g. "/tesla" */
  mountPath: string;
  /** The provider instance */
  provider: AFSModule;
  /** Provider URI for config.toml generation. Omit for mock-only providers. */
  uri?: string;
  /** Additional options for config.toml [mounts.options] section */
  options?: Record<string, unknown>;
  /** Cleanup function to release resources */
  cleanup: () => Promise<void>;
}

/**
 * Fixture interface for provider conformance tests.
 * Providers implement this to define their test environment.
 */
export interface ProviderTestFixture<T extends AFSModule = AFSModule> {
  /** Human-readable name for test output */
  name: string;

  /** Create a fresh provider instance */
  createProvider: () => Promise<T> | T;

  /** Describe the test data structure that will be available */
  structure: TestDataStructure;

  /**
   * Execute test cases.
   * Tests input/output behavior of executable nodes (e.g., tools, prompts).
   */
  executeCases?: ExecuteTestCase[];

  /**
   * Action test cases.
   * Tests action execution on nodes (e.g., create-table, insert, delete).
   * Actions are executed via exec() on .actions paths.
   * These tests run LAST because they may modify the data structure.
   */
  actionCases?: ActionTestCase[];

  /**
   * Write test cases.
   * Tests write operations including content and meta writes.
   * These tests run LAST because they may modify the data structure.
   */
  writeCases?: WriteTestCase[];

  /**
   * Delete test cases.
   * Tests delete operations on paths from the structure.
   * These tests run LAST because they modify the data structure.
   */
  deleteCases?: DeleteTestCase[];

  /**
   * When true, run CapabilitiesResourceValidation suite to verify
   * the provider declares resources (caps, pricing, limits) in its capabilities manifest.
   */
  expectResources?: boolean;

  /**
   * When true, run ExecUsageMetadataValidation suite to verify
   * exec results contain usage metadata (tokens, cost, durationMs).
   * Requires executeCases or actionCases to be provided.
   */
  expectUsage?: boolean;

  /**
   * When true (or a string), run WriteModesValidation suite to verify
   * all write modes (replace, append, prepend, create, update, patch)
   * work correctly. Only enable for providers that support arbitrary path writes.
   * When a string, it is used as a path prefix for test files (e.g., "/main" for git provider).
   */
  expectWriteModes?: boolean | string;

  /**
   * When provided, run EventDeclarationValidation suite to verify
   * the provider declares event types in its .meta response.
   * Each entry specifies an expected event type and optional description.
   */
  events?: Array<{ type: string; description?: string }>;

  /**
   * When provided, run PerceptionPathValidation suite to verify
   * the provider supports .perception/ as an implicit path.
   * - readme: expected content substring in .perception/README.md
   * - entries: expected entry names in .perception/ directory
   */
  perception?: { readme?: string; entries?: string[] };

  /**
   * When provided, run AupRecipeValidation suite to verify
   * the provider supports .aup/ as an implicit path for rendering recipes.
   * - path: base path where .aup/ lives (defaults to "/")
   * - variants: expected recipe variant names (e.g., ["default", "compact"])
   */
  aup?: { path?: string; variants: string[] };

  /**
   * Provider class — needed for static method access (manifest, securityProfiles).
   * Required for SecurityManifestValidation suite.
   * Uses a minimal type to avoid constructor signature mismatches.
   */
  providerClass?: {
    manifest?(): ProviderManifest | ProviderManifest[];
    treeSchema?(): ProviderTreeSchema;
  };

  /**
   * Playground setup function for this provider.
   * Required for all providers — verified by PlaygroundExistence suite.
   */
  playground?: (tempDir: string) => Promise<PlaygroundSetup>;

  /** Optional lifecycle hooks */
  beforeAll?: () => Promise<void> | void;
  afterAll?: () => Promise<void> | void;
  beforeEach?: () => Promise<void> | void;
  afterEach?: () => Promise<void> | void;

  /** Optional test configuration */
  config?: TestConfig;
}
