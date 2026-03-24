import { expect } from "bun:test";
import type {
  AFSEntry,
  AFSListResult,
  AFSReadResult,
  AFSSearchResult,
  AFSStatResult,
} from "@aigne/afs";

/**
 * Validate that a result conforms to AFSListResult structure.
 */
export function validateListResult(result: unknown): asserts result is AFSListResult {
  expect(result).toBeDefined();
  expect(result).toHaveProperty("data");
  expect(Array.isArray((result as AFSListResult).data)).toBe(true);

  for (const entry of (result as AFSListResult).data) {
    validateEntry(entry);
  }

  // total is optional
  if ((result as AFSListResult).total !== undefined) {
    expect(typeof (result as AFSListResult).total).toBe("number");
  }
}

/**
 * Validate that an object conforms to AFSEntry structure.
 */
export function validateEntry(entry: unknown): asserts entry is AFSEntry {
  expect(entry).toBeDefined();
  expect(entry).toHaveProperty("id");
  expect(entry).toHaveProperty("path");
  expect(typeof (entry as AFSEntry).id).toBe("string");
  expect(typeof (entry as AFSEntry).path).toBe("string");

  // Optional fields type check
  const e = entry as AFSEntry;

  if (e.content !== undefined) {
    const isValidContent =
      typeof e.content === "string" || Buffer.isBuffer(e.content) || typeof e.content === "object";
    expect(isValidContent).toBe(true);
  }

  if (e.meta !== undefined && e.meta !== null) {
    expect(typeof e.meta).toBe("object");
  }

  if (e.createdAt !== undefined) {
    expect(e.createdAt instanceof Date).toBe(true);
  }

  if (e.updatedAt !== undefined) {
    expect(e.updatedAt instanceof Date).toBe(true);
  }
}

/**
 * Validate that a result conforms to AFSReadResult structure.
 */
export function validateReadResult(result: unknown): asserts result is AFSReadResult {
  expect(result).toBeDefined();

  const r = result as AFSReadResult;
  if (r.data !== undefined) {
    validateEntry(r.data);
  }

  if (r.message !== undefined) {
    expect(typeof r.message).toBe("string");
  }
}

/**
 * Validate that a result conforms to AFSSearchResult structure.
 */
export function validateSearchResult(result: unknown): asserts result is AFSSearchResult {
  expect(result).toBeDefined();
  expect(result).toHaveProperty("data");
  expect(Array.isArray((result as AFSSearchResult).data)).toBe(true);

  for (const entry of (result as AFSSearchResult).data) {
    validateEntry(entry);
  }
}

/**
 * Validate that a result conforms to AFSStatResult structure.
 */
export function validateStatResult(result: unknown): asserts result is AFSStatResult {
  expect(result).toBeDefined();

  const r = result as AFSStatResult;
  if (r.data !== undefined) {
    expect(r.data).toHaveProperty("path");
    expect(typeof r.data.path).toBe("string");

    if (r.data.meta?.size !== undefined) {
      expect(typeof r.data.meta.size).toBe("number");
    }
    if (r.data.meta?.childrenCount !== undefined) {
      expect(typeof r.data.meta.childrenCount).toBe("number");
    }
  }
}
