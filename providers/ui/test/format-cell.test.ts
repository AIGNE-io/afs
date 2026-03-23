import { describe, expect, test } from "bun:test";
import { FORMAT_CELL_JS } from "../src/web-page/renderers/format-cell.js";

// Extract _formatCell from the JS string into a callable function
const fn = new Function(`${FORMAT_CELL_JS}; return _formatCell;`)() as (
  val: unknown,
  fmt: string,
) => string;

describe("_formatCell", () => {
  test("truncate:8 — truncates long string", () => {
    expect(fn("abcdefghijklm", "truncate:8")).toBe("abcdefgh...");
  });

  test("truncate:8 — short string unchanged", () => {
    expect(fn("short", "truncate:8")).toBe("short");
  });

  test("truncate default — uses 12", () => {
    expect(fn("1234567890abcdef", "truncate")).toBe("1234567890ab...");
  });

  test("timeago — just now", () => {
    const now = new Date().toISOString();
    expect(fn(now, "timeago")).toBe("just now");
  });

  test("timeago — minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(fn(fiveMinAgo, "timeago")).toBe("5 minutes ago");
  });

  test("timeago — 1 minute ago (singular)", () => {
    const oneMinAgo = new Date(Date.now() - 1 * 60_000).toISOString();
    expect(fn(oneMinAgo, "timeago")).toBe("1 minute ago");
  });

  test("datetime — ISO format", () => {
    expect(fn("2024-01-15T10:30:00Z", "datetime")).toBe("2024-01-15 10:30:00");
  });

  test("datetime — invalid date passthrough", () => {
    expect(fn("not-a-date", "datetime")).toBe("not-a-date");
  });

  test("number — commas", () => {
    expect(fn(1234567, "number")).toContain("1,234,567");
  });

  test("number:2 — fixed decimals", () => {
    expect(fn(1234.5, "number:2")).toContain("1,234.50");
  });

  test("number — NaN passthrough", () => {
    expect(fn("not-a-number", "number")).toBe("not-a-number");
  });

  test("bignum — billions (no decimal)", () => {
    expect(fn(1230000000, "bignum")).toBe("1.23B");
  });

  test("bignum — millions (no decimal)", () => {
    expect(fn(1230000, "bignum")).toBe("1.23M");
  });

  test("bignum — thousands (no decimal)", () => {
    expect(fn(1230, "bignum")).toBe("1.23K");
  });

  test("bignum:6 — divides then formats", () => {
    // 1,230,000,000 / 10^6 = 1230 → "1.23K"
    expect(fn(1230000000, "bignum:6")).toBe("1.23K");
  });

  test("bignum — no decimal arg defaults to 0", () => {
    expect(fn(1500000000, "bignum")).toBe("1.50B");
  });

  test("boolean — default labels", () => {
    expect(fn(true, "boolean")).toBe("Yes");
    expect(fn(false, "boolean")).toBe("No");
  });

  test("boolean — custom labels", () => {
    expect(fn(true, "boolean:Active:Closed")).toBe("Active");
    expect(fn(false, "boolean:Active:Closed")).toBe("Closed");
  });

  test("boolean — string 'true'", () => {
    expect(fn("true", "boolean")).toBe("Yes");
  });

  test("bytes — human readable", () => {
    expect(fn(512, "bytes")).toBe("512 B");
    expect(fn(1048576, "bytes")).toBe("1.0 MB");
    expect(fn(1073741824, "bytes")).toBe("1.0 GB");
  });

  test("json — stringify", () => {
    expect(fn({ a: 1 }, "json")).toBe('{"a":1}');
  });

  test("unknown format — passthrough", () => {
    expect(fn("val", "unknownfmt")).toBe("val");
  });

  test("null value — empty string", () => {
    expect(fn(null, "number")).toBe("");
  });

  test("no format — returns string value", () => {
    expect(fn("hello", "")).toBe("hello");
  });

  // ── BigInt precision tests ──

  test("bignum:18 — large token supply via BigInt (billions)", () => {
    // 1.23e9 tokens * 10^18 = "1230000000000000000000000000"
    expect(fn("1230000000000000000000000000", "bignum:18")).toBe("1.23B");
  });

  test("bignum:18 — large token supply via BigInt (millions)", () => {
    // 1.23e6 tokens * 10^18 = "1230000000000000000000000"
    expect(fn("1230000000000000000000000", "bignum:18")).toBe("1.23M");
  });

  test("bignum:18 — large token supply via BigInt (thousands)", () => {
    // 1.23e3 tokens * 10^18 = "1230000000000000000000"
    expect(fn("1230000000000000000000", "bignum:18")).toBe("1.23K");
  });

  test("bignum:18 — small token amount via BigInt", () => {
    // 1 token = "1000000000000000000"
    expect(fn("1000000000000000000", "bignum:18")).toBe("1.00");
  });

  test("bignum:18 — fractional token via BigInt", () => {
    // 0.5 tokens = "500000000000000000"
    expect(fn("500000000000000000", "bignum:18")).toBe("0.50");
  });

  // ── default filter ──

  test("default — null returns default value", () => {
    expect(fn(null, "default:N/A")).toBe("N/A");
  });

  test("default — empty string returns default value", () => {
    expect(fn("", "default:N/A")).toBe("N/A");
  });

  test("default — present value returned as-is", () => {
    expect(fn("hello", "default:N/A")).toBe("hello");
  });

  test("default — 0 is not null/empty, returns '0'", () => {
    expect(fn(0, "default:N/A")).toBe("0");
  });

  test("default — no arg provided, returns empty string", () => {
    expect(fn(null, "default")).toBe("");
  });

  // ── uppercase / lowercase filters ──

  test("uppercase — converts to upper case", () => {
    expect(fn("hello", "uppercase")).toBe("HELLO");
  });

  test("lowercase — converts to lower case", () => {
    expect(fn("HELLO", "lowercase")).toBe("hello");
  });

  test("uppercase — null returns empty string", () => {
    expect(fn(null, "uppercase")).toBe("");
  });

  test("uppercase — number converted to string", () => {
    expect(fn(123, "uppercase")).toBe("123");
  });

  // ── count filter ──

  test("count — array length", () => {
    expect(fn([1, 2, 3], "count")).toBe("3");
  });

  test("count — string length", () => {
    expect(fn("hello", "count")).toBe("5");
  });

  test("count — null returns '0'", () => {
    expect(fn(null, "count")).toBe("0");
  });

  test("count — empty object returns '0'", () => {
    expect(fn({}, "count")).toBe("0");
  });

  test("count — object returns key count", () => {
    expect(fn({ a: 1, b: 2 }, "count")).toBe("2");
  });

  // ── date filter (Intl.DateTimeFormat) ──

  test("date — default is medium format", () => {
    const result = fn("2026-03-14T10:30:00Z", "date");
    // Medium format varies by locale, but should contain "Mar" and "2026"
    expect(result).toContain("2026");
  });

  test("date:short — short date format", () => {
    const result = fn("2026-03-14T10:30:00Z", "date:short");
    // Short format like "3/14/26" — just check it's not the raw ISO string
    expect(result).not.toBe("2026-03-14T10:30:00Z");
    expect(result.length).toBeLessThan(15);
  });

  test("date:long — long date format", () => {
    const result = fn("2026-03-14T10:30:00Z", "date:long");
    // Long format like "March 14, 2026"
    expect(result).toContain("March");
    expect(result).toContain("2026");
  });

  test("date:time — time only", () => {
    const result = fn("2026-03-14T10:30:00Z", "date:time");
    // Time format — should not contain year
    expect(result).not.toContain("2026");
  });

  test("date — invalid string returns original", () => {
    expect(fn("not-a-date", "date")).toBe("not-a-date");
  });

  test("date — null returns empty string", () => {
    expect(fn(null, "date")).toBe("");
  });
});
