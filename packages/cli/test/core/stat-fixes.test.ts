/**
 * Tests for stat command bug fixes:
 * - BUG-1: stat crash on invalid path (result undefined)
 * - BUG-2: stat --json Date serialization crash (string vs Date)
 */

import { describe, expect, test } from "bun:test";
import { formatStatOutput } from "../../src/core/formatters/stat.js";

describe("stat formatter (BUG-2: Date serialization)", () => {
  describe("formatStatOutput handles Date objects", () => {
    const date = new Date("2024-01-15T10:30:00.000Z");
    const result = {
      data: {
        id: "test",
        path: "/test",
        updatedAt: date,
        createdAt: date,
        meta: { kind: "afs:node" },
      },
    };

    test("json view serializes Date objects correctly", () => {
      const output = formatStatOutput(result, "json");
      const parsed = JSON.parse(output);
      expect(parsed.modified).toBe("2024-01-15T10:30:00.000Z");
      expect(parsed.created).toBe("2024-01-15T10:30:00.000Z");
    });

    test("default view formats Date objects correctly", () => {
      const output = formatStatOutput(result, "default");
      expect(output).toContain("MODIFIED=2024-01-15T10:30:00.000Z");
    });

    test("llm view formats Date objects correctly", () => {
      const output = formatStatOutput(result, "llm");
      expect(output).toContain("UPDATED 2024-01-15T10:30:00.000Z");
    });

    test("human view formats Date objects correctly", () => {
      const output = formatStatOutput(result, "human");
      expect(output).toContain("Modified:");
    });
  });

  describe("formatStatOutput handles string dates (BUG-2 core case)", () => {
    const result = {
      data: {
        id: "test",
        path: "/http/endpoint",
        updatedAt: "2024-01-15T10:30:00Z" as unknown as Date,
        createdAt: "2024-01-15T10:30:00Z" as unknown as Date,
        meta: { kind: "afs:node" },
      },
    };

    test("json view does not crash on string dates", () => {
      const output = formatStatOutput(result, "json");
      const parsed = JSON.parse(output);
      expect(parsed.modified).toBe("2024-01-15T10:30:00Z");
      expect(parsed.created).toBe("2024-01-15T10:30:00Z");
    });

    test("default view does not crash on string dates", () => {
      const output = formatStatOutput(result, "default");
      expect(output).toContain("MODIFIED=2024-01-15T10:30:00Z");
    });

    test("llm view does not crash on string dates", () => {
      const output = formatStatOutput(result, "llm");
      expect(output).toContain("UPDATED 2024-01-15T10:30:00Z");
    });

    test("human view does not crash on string dates", () => {
      const output = formatStatOutput(result, "human");
      expect(output).toContain("Modified: 2024-01-15T10:30:00Z");
    });
  });

  describe("formatStatOutput handles undefined dates", () => {
    const result = {
      data: {
        id: "test",
        path: "/test",
        meta: { kind: "afs:node" },
      },
    };

    test("json view with no dates does not crash", () => {
      const output = formatStatOutput(result, "json");
      const parsed = JSON.parse(output);
      expect(parsed.modified).toBeUndefined();
      expect(parsed.created).toBeUndefined();
    });

    test("default view with no dates does not crash", () => {
      const output = formatStatOutput(result, "default");
      expect(output).not.toContain("MODIFIED");
    });
  });

  describe("formatStatOutput handles numeric dates", () => {
    const result = {
      data: {
        id: "test",
        path: "/test",
        updatedAt: 1705312200000 as unknown as Date,
        meta: {},
      },
    };

    test("json view converts numeric date to string", () => {
      const output = formatStatOutput(result, "json");
      const parsed = JSON.parse(output);
      expect(parsed.modified).toBe("1705312200000");
    });
  });
});

describe("stat command (BUG-1: undefined result)", () => {
  test("formatStatOutput handles result with undefined data", () => {
    const result = { data: undefined, message: "No data found for path: /nonexistent" };
    const output = formatStatOutput(result, "default");
    expect(output).toBe("No data found for path: /nonexistent");
  });

  test("formatStatOutput json view handles undefined data with message", () => {
    const result = { data: undefined, message: "No data found for path: /nonexistent" };
    const output = formatStatOutput(result, "json");
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe("No data found for path: /nonexistent");
  });

  test("formatStatOutput llm view handles undefined data with message", () => {
    const result = { data: undefined, message: "No data found for path: /nonexistent" };
    const output = formatStatOutput(result, "llm");
    expect(output).toBe("No data found for path: /nonexistent");
  });

  test("formatStatOutput human view handles undefined data with message", () => {
    const result = { data: undefined, message: "No data found for path: /nonexistent" };
    const output = formatStatOutput(result, "human");
    expect(output).toBe("No data found for path: /nonexistent");
  });

  test("formatStatOutput handles result with undefined data and no message", () => {
    const result = { data: undefined };
    const output = formatStatOutput(result, "default");
    expect(output).toBe("No data");
  });

  test("error message does not expose canonical path", () => {
    const result = { data: undefined, message: "No data found for path: /nonexistent" };
    const output = formatStatOutput(result, "default");
    expect(output).not.toContain("$afs");
  });
});
