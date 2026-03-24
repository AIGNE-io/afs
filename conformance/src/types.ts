/**
 * AFS Conformance Test Suite — YAML spec types
 *
 * Each YAML spec file contains one or more test cases (separated by `---`).
 * The runner reads these specs, sends HTTP requests to the target server,
 * and validates responses against expected results.
 */

/**
 * A single conformance test case as defined in a YAML spec file.
 *
 * L1 specs use `operation`, `params`, and `expect` directly.
 * L2 specs use `steps` for multi-step sequences.
 */
export interface TestSpec {
  /** Human-readable test name */
  name: string;

  /** AFS operation to invoke — L1 single-operation specs */
  operation?: string;

  /** Parameters to send with the RPC request — L1 single-operation specs */
  params?: Record<string, unknown>;

  /** Expected response shape — L1 single-operation specs */
  expect?: ExpectBlock;

  /** Optional tags for filtering */
  tags?: string[];

  /** Optional: skip this test */
  skip?: boolean;

  /** Optional: description of what this test verifies */
  description?: string;

  /** L2: ordered sequence of operations with optional assertions per step */
  steps?: TestStep[];
}

/**
 * A single step within an L2 multi-step spec.
 */
export interface TestStep {
  /** Optional step label for error reporting */
  name?: string;

  /** AFS operation to invoke */
  operation: string;

  /** Parameters to send with the RPC request (supports ${var} interpolation from store) */
  params: Record<string, unknown>;

  /** Optional expected response shape — omit for setup-only steps */
  expect?: ExpectBlock;

  /** Extract values from response for use in later steps: { "varName": "$.data.data.path" } */
  store?: Record<string, string>;
}

/**
 * Expected response shape for a test case.
 */
export interface ExpectBlock {
  /** Whether the operation should succeed */
  success: boolean;

  /** Expected data payload (partial match — spec fields must match, extra fields ok) */
  data?: unknown;

  /** Expected error (for failure cases) */
  error?: {
    code?: number;
    message?: string | MatcherValue;
  };

  /** Expected message field on the response data */
  message?: string | MatcherValue;
}

/**
 * Matcher values for flexible assertions.
 * Plain values are compared exactly.
 * Special string patterns trigger matcher logic.
 */
export type MatcherValue = string | number | boolean | null | MatcherObject | MatcherValue[];

/**
 * Object that may contain matcher directives or nested values.
 */
export interface MatcherObject {
  [key: string]: MatcherValue | undefined;
}

/**
 * Result of running a single test case.
 */
export interface TestResult {
  /** Test name from spec */
  name: string;

  /** Source spec file */
  file: string;

  /** Whether the test passed */
  passed: boolean;

  /** Duration in milliseconds */
  durationMs: number;

  /** Failure details (if any) */
  errors: string[];

  /** Whether the test was skipped */
  skipped: boolean;
}

/**
 * Aggregated results for a test run.
 */
export interface TestRunSummary {
  /** Total number of specs */
  total: number;

  /** Number of passed tests */
  passed: number;

  /** Number of failed tests */
  failed: number;

  /** Number of skipped tests */
  skipped: number;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Individual test results */
  results: TestResult[];
}
