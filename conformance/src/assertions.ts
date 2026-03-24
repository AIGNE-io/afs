/**
 * AFS Conformance Test Suite — Assertion engine
 *
 * Deep comparison with flexible matching:
 * - Exact match for primitives
 * - Partial match for objects (spec fields must match, extra fields ok)
 * - Special matchers: $exists, $type:T, $gt:N, $gte:N, $lt:N, $lte:N, $contains:S, $matches:R, $length:N
 */

/**
 * Compare an actual value against an expected spec value.
 * Returns an array of error messages (empty = pass).
 */
export function assertDeepMatch(actual: unknown, expected: unknown, path = "$"): string[] {
  // Handle special matcher strings
  if (typeof expected === "string" && expected.startsWith("$")) {
    return assertMatcher(actual, expected, path);
  }

  // null check
  if (expected === null) {
    if (actual !== null && actual !== undefined) {
      return [`${path}: expected null, got ${JSON.stringify(actual)}`];
    }
    return [];
  }

  if (expected === undefined) {
    return [];
  }

  // Primitives: exact match
  if (typeof expected !== "object") {
    if (actual !== expected) {
      return [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
    }
    return [];
  }

  // Array comparison
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return [`${path}: expected array, got ${typeof actual}`];
    }
    const errors: string[] = [];
    for (let i = 0; i < expected.length; i++) {
      if (i >= actual.length) {
        errors.push(
          `${path}[${i}]: missing element (array has ${actual.length} items, expected at least ${expected.length})`,
        );
      } else {
        errors.push(...assertDeepMatch(actual[i], expected[i], `${path}[${i}]`));
      }
    }
    return errors;
  }

  // Object: partial match (expected keys must exist in actual, extra keys in actual are ok)
  if (typeof expected === "object" && expected !== null) {
    // Check if this is a matcher object (has a single matcher key)
    const expectedObj = expected as Record<string, unknown>;
    const matcherKey = getSingleMatcherKey(expectedObj);
    if (matcherKey) {
      return assertObjectMatcher(actual, matcherKey, expectedObj[matcherKey], path);
    }

    if (actual === null || actual === undefined || typeof actual !== "object") {
      return [`${path}: expected object, got ${actual === null ? "null" : typeof actual}`];
    }

    const actualObj = actual as Record<string, unknown>;
    const errors: string[] = [];

    for (const key of Object.keys(expectedObj)) {
      if (!(key in actualObj)) {
        // Special case: if expected value is { absent: true }, missing key is ok
        if (
          typeof expectedObj[key] === "object" &&
          expectedObj[key] !== null &&
          (expectedObj[key] as Record<string, unknown>).absent === true
        ) {
          continue;
        }
        errors.push(`${path}.${key}: missing field`);
      } else {
        errors.push(...assertDeepMatch(actualObj[key], expectedObj[key], `${path}.${key}`));
      }
    }
    return errors;
  }

  return [];
}

/**
 * Matcher keys recognized as assertion operators when they're the sole key in an object.
 */
const MATCHER_KEYS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "matches",
  "contains",
  "type",
  "absent",
  "present",
  "length",
  "any_of",
]);

/**
 * If an object has exactly one key and it's a matcher key, return it.
 */
function getSingleMatcherKey(obj: Record<string, unknown>): string | null {
  const keys = Object.keys(obj);
  if (keys.length === 1 && MATCHER_KEYS.has(keys[0])) {
    return keys[0];
  }
  return null;
}

/**
 * Evaluate an object-style matcher: { gt: 5 }, { type: "string" }, etc.
 */
function assertObjectMatcher(actual: unknown, op: string, value: unknown, path: string): string[] {
  switch (op) {
    case "eq":
      if (actual !== value) {
        return [`${path}: expected == ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`];
      }
      return [];

    case "neq":
      if (actual === value) {
        return [`${path}: expected != ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`];
      }
      return [];

    case "gt":
      if (typeof actual !== "number" || typeof value !== "number" || actual <= value) {
        return [`${path}: expected > ${value}, got ${JSON.stringify(actual)}`];
      }
      return [];

    case "gte":
      if (typeof actual !== "number" || typeof value !== "number" || actual < value) {
        return [`${path}: expected >= ${value}, got ${JSON.stringify(actual)}`];
      }
      return [];

    case "lt":
      if (typeof actual !== "number" || typeof value !== "number" || actual >= value) {
        return [`${path}: expected < ${value}, got ${JSON.stringify(actual)}`];
      }
      return [];

    case "lte":
      if (typeof actual !== "number" || typeof value !== "number" || actual > value) {
        return [`${path}: expected <= ${value}, got ${JSON.stringify(actual)}`];
      }
      return [];

    case "matches":
      if (typeof actual !== "string" || typeof value !== "string") {
        return [`${path}: matches requires string, got ${typeof actual}`];
      }
      if (!new RegExp(value).test(actual)) {
        return [`${path}: "${actual}" does not match /${value}/`];
      }
      return [];

    case "contains":
      if (typeof actual !== "string" || typeof value !== "string") {
        return [`${path}: contains requires string, got ${typeof actual}`];
      }
      if (!actual.includes(value)) {
        return [`${path}: "${actual}" does not contain "${value}"`];
      }
      return [];

    case "type":
      // eslint-disable-next-line valid-typeof
      if (value === "array") {
        if (!Array.isArray(actual)) {
          return [`${path}: expected type array, got ${typeof actual}`];
        }
      } else if (typeof actual !== value) {
        return [`${path}: expected type ${value}, got ${typeof actual}`];
      }
      return [];

    case "absent":
      // This is handled at the parent level in assertDeepMatch
      // If we get here, the key exists, which is wrong if absent: true
      if (value === true) {
        return [`${path}: expected absent, but field exists with value ${JSON.stringify(actual)}`];
      }
      return [];

    case "present":
      if (value === true && (actual === undefined || actual === null)) {
        return [`${path}: expected present, but field is ${actual}`];
      }
      return [];

    case "length":
      if (typeof value !== "number") {
        return [`${path}: length matcher value must be a number`];
      }
      if (Array.isArray(actual)) {
        if (actual.length !== value) {
          return [`${path}: expected length ${value}, got ${actual.length}`];
        }
      } else if (typeof actual === "string") {
        if (actual.length !== value) {
          return [`${path}: expected length ${value}, got ${actual.length}`];
        }
      } else {
        return [`${path}: length requires array or string, got ${typeof actual}`];
      }
      return [];

    case "any_of":
      if (!Array.isArray(value)) {
        return [`${path}: any_of matcher value must be an array`];
      }
      if (!value.includes(actual)) {
        return [`${path}: expected one of ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`];
      }
      return [];

    default:
      return [`${path}: unknown matcher operator "${op}"`];
  }
}

/**
 * Evaluate a string-style matcher: $exists, $type:string, $gt:5, $contains:foo, $matches:regex
 */
function assertMatcher(actual: unknown, matcher: string, path: string): string[] {
  if (matcher === "$exists") {
    if (actual === undefined) {
      return [`${path}: expected field to exist, but it's undefined`];
    }
    return [];
  }

  const colonIndex = matcher.indexOf(":");
  if (colonIndex === -1) {
    return [`${path}: unknown matcher "${matcher}"`];
  }

  const op = matcher.substring(0, colonIndex);
  const arg = matcher.substring(colonIndex + 1);

  switch (op) {
    case "$type":
      if (arg === "array") {
        if (!Array.isArray(actual)) {
          return [`${path}: expected type array, got ${typeof actual}`];
        }
      } else if (typeof actual !== arg) {
        return [`${path}: expected type ${arg}, got ${typeof actual}`];
      }
      return [];

    case "$gt": {
      const num = Number(arg);
      if (typeof actual !== "number" || actual <= num) {
        return [`${path}: expected > ${num}, got ${JSON.stringify(actual)}`];
      }
      return [];
    }

    case "$gte": {
      const num = Number(arg);
      if (typeof actual !== "number" || actual < num) {
        return [`${path}: expected >= ${num}, got ${JSON.stringify(actual)}`];
      }
      return [];
    }

    case "$lt": {
      const num = Number(arg);
      if (typeof actual !== "number" || actual >= num) {
        return [`${path}: expected < ${num}, got ${JSON.stringify(actual)}`];
      }
      return [];
    }

    case "$lte": {
      const num = Number(arg);
      if (typeof actual !== "number" || actual > num) {
        return [`${path}: expected <= ${num}, got ${JSON.stringify(actual)}`];
      }
      return [];
    }

    case "$contains":
      if (typeof actual !== "string") {
        return [`${path}: expected string for $contains, got ${typeof actual}`];
      }
      if (!actual.includes(arg)) {
        return [`${path}: "${actual}" does not contain "${arg}"`];
      }
      return [];

    case "$matches":
      if (typeof actual !== "string") {
        return [`${path}: expected string for $matches, got ${typeof actual}`];
      }
      if (!new RegExp(arg).test(actual)) {
        return [`${path}: "${actual}" does not match /${arg}/`];
      }
      return [];

    default:
      return [`${path}: unknown matcher "${op}"`];
  }
}
