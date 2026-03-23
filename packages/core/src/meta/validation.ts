/**
 * Validation utilities for AFS Meta System.
 *
 * Provides:
 * - Node constraint validation (required/optional nodes, glob patterns)
 * - Validation result types
 */

import { minimatch } from "minimatch";
import type { NodesConstraints, ValidationError, ValidationResult } from "./type.js";

/**
 * Validate a list of node names against NodesConstraints.
 *
 * @param basePath - Base path for error reporting (e.g., "/project")
 * @param nodeNames - List of node names in the directory
 * @param constraints - NodesConstraints to validate against
 * @returns ValidationResult with valid flag and any errors
 */
export function validateNodes(
  basePath: string,
  nodeNames: string[],
  constraints: NodesConstraints | undefined,
): ValidationResult {
  const errors: ValidationError[] = [];

  // No constraints means everything is valid
  if (!constraints) {
    return { valid: true, errors: [] };
  }

  const matchedNodes = new Set<string>();

  // Check required nodes
  if (constraints.required) {
    for (const constraint of constraints.required) {
      const pattern = constraint.path;
      let found = false;

      // Check if any node matches the pattern (could be glob)
      for (const nodeName of nodeNames) {
        if (matchesPattern(nodeName, pattern)) {
          found = true;
          matchedNodes.add(nodeName);
          break;
        }
      }

      if (!found) {
        errors.push({
          path: `${basePath}/${pattern}`,
          message: `Required node "${pattern}" not found in ${basePath}`,
          code: "REQUIRED_NODE_MISSING",
        });
      }
    }
  }

  // Track optional nodes that match
  if (constraints.optional) {
    for (const constraint of constraints.optional) {
      const pattern = constraint.path;
      for (const nodeName of nodeNames) {
        if (matchesPattern(nodeName, pattern)) {
          matchedNodes.add(nodeName);
        }
      }
    }
  }

  // Check for unexpected nodes if allowOther is false
  if (constraints.allowOther === false) {
    for (const nodeName of nodeNames) {
      if (!matchedNodes.has(nodeName)) {
        errors.push({
          path: `${basePath}/${nodeName}`,
          message: `Unexpected node "${nodeName}" in ${basePath} (allowOther is false)`,
          code: "UNEXPECTED_NODE",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a node name matches a pattern (supports glob).
 */
function matchesPattern(nodeName: string, pattern: string): boolean {
  // Exact match
  if (nodeName === pattern) {
    return true;
  }

  // Glob match
  if (pattern.includes("*")) {
    return minimatch(nodeName, pattern, { dot: true });
  }

  return false;
}

/**
 * Combine multiple ValidationResults into one.
 */
export function combineValidationResults(...results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap((r) => r.errors);
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
