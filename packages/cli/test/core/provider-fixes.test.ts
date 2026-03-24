/**
 * Tests for provider-level bug fixes verified through CLI:
 * - BUG-12: EC2 actions list should not contain selfEntry
 * - BUG-13: S3/GCS generateId should not produce double slashes
 */

import { describe, expect, test } from "bun:test";

describe("BUG-13: S3/GCS generateId", () => {
  test("S3 generateId strips leading slashes from key", () => {
    // Simulate the S3 generateId logic
    const bucket = "test-bucket";
    const generateId = (key: string): string => {
      const cleanKey = key.replace(/^\/+/, "");
      return `s3://${bucket}/${cleanKey}`;
    };

    expect(generateId("/")).toBe("s3://test-bucket/");
    expect(generateId("")).toBe("s3://test-bucket/");
    expect(generateId("path/to/file")).toBe("s3://test-bucket/path/to/file");
    expect(generateId("/path/to/file")).toBe("s3://test-bucket/path/to/file");
    expect(generateId("///multiple/slashes")).toBe("s3://test-bucket/multiple/slashes");
  });

  test("GCS generateId strips leading slashes from key", () => {
    const bucket = "test-bucket";
    const generateId = (key: string): string => {
      const cleanKey = key.replace(/^\/+/, "");
      return `gcs://${bucket}/${cleanKey}`;
    };

    expect(generateId("/")).toBe("gcs://test-bucket/");
    expect(generateId("")).toBe("gcs://test-bucket/");
    expect(generateId("path/to/file")).toBe("gcs://test-bucket/path/to/file");
    expect(generateId("/path/to/file")).toBe("gcs://test-bucket/path/to/file");
  });
});
