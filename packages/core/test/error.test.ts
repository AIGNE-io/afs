import { describe, expect, test } from "bun:test";
import {
  AFSError,
  AFSMountError,
  AFSNotFoundError,
  AFSReadonlyError,
  AFSValidationError,
} from "../src/error.js";

describe("AFSError", () => {
  test("can be instantiated with message and code", () => {
    const error = new AFSError("test message", "TEST_CODE");
    expect(error.message).toBe("test message");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("AFSError");
  });

  test("extends Error", () => {
    const error = new AFSError("test", "CODE");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("AFSReadonlyError", () => {
  test("can be instantiated with message", () => {
    const error = new AFSReadonlyError("cannot write");
    expect(error.message).toBe("cannot write");
    expect(error.code).toBe("AFS_READONLY");
    expect(error.name).toBe("AFSReadonlyError");
  });

  test("extends AFSError", () => {
    const error = new AFSReadonlyError("readonly");
    expect(error).toBeInstanceOf(AFSError);
  });
});

describe("AFSNotFoundError", () => {
  test("can be instantiated with path", () => {
    const error = new AFSNotFoundError("/some/path");
    expect(error.message).toBe("Path not found: /some/path");
    expect(error.code).toBe("AFS_NOT_FOUND");
    expect(error.name).toBe("AFSNotFoundError");
    expect(error.path).toBe("/some/path");
  });

  test("can be instantiated with custom message", () => {
    const error = new AFSNotFoundError("/path", "Custom not found message");
    expect(error.message).toBe("Custom not found message");
    expect(error.path).toBe("/path");
  });

  test("extends AFSError", () => {
    const error = new AFSNotFoundError("/path");
    expect(error).toBeInstanceOf(AFSError);
  });
});

describe("AFSValidationError", () => {
  test("can be instantiated with message", () => {
    const error = new AFSValidationError("invalid input");
    expect(error.message).toBe("invalid input");
    expect(error.code).toBe("AFS_VALIDATION_ERROR");
    expect(error.name).toBe("AFSValidationError");
  });

  test("extends AFSError", () => {
    const error = new AFSValidationError("invalid");
    expect(error).toBeInstanceOf(AFSError);
  });

  test("empty message still creates valid error", () => {
    const error = new AFSValidationError("");
    expect(error).toBeInstanceOf(AFSValidationError);
    expect(error.message).toBe("");
    expect(error.code).toBe("AFS_VALIDATION_ERROR");
  });

  test("unicode characters in message", () => {
    const message = "验证失败: args.name 期望 string，收到 number";
    const error = new AFSValidationError(message);
    expect(error.message).toBe(message);
  });

  test("very long message strings", () => {
    const longMessage = "x".repeat(10000);
    const error = new AFSValidationError(longMessage);
    expect(error.message).toBe(longMessage);
    expect(error.message.length).toBe(10000);
  });
});

describe("AFSMountError", () => {
  test("can be instantiated with providerName, step, and message", () => {
    const error = new AFSMountError("TestProvider", "stat", "Connection timeout");
    expect(error.providerName).toBe("TestProvider");
    expect(error.step).toBe("stat");
    expect(error.message).toContain("TestProvider");
    expect(error.message).toContain("stat");
    expect(error.message).toContain("Connection timeout");
  });

  test('name property is "AFSMountError"', () => {
    const error = new AFSMountError("MyProvider", "read", "Failed");
    expect(error.name).toBe("AFSMountError");
  });

  test('code property is "AFS_MOUNT_FAILED"', () => {
    const error = new AFSMountError("MyProvider", "read", "Failed");
    expect(error.code).toBe("AFS_MOUNT_FAILED");
  });

  test("providerName property is correctly set", () => {
    const error = new AFSMountError("AFSFS", "stat", "Timeout");
    expect(error.providerName).toBe("AFSFS");
  });

  test('step property can be "stat"', () => {
    const error = new AFSMountError("Provider", "stat", "error");
    expect(error.step).toBe("stat");
  });

  test('step property can be "read"', () => {
    const error = new AFSMountError("Provider", "read", "error");
    expect(error.step).toBe("read");
  });

  test('step property can be "list"', () => {
    const error = new AFSMountError("Provider", "list", "error");
    expect(error.step).toBe("list");
  });

  test("extends AFSError", () => {
    const error = new AFSMountError("Provider", "stat", "error");
    expect(error).toBeInstanceOf(AFSError);
  });

  test("empty providerName still creates valid error", () => {
    const error = new AFSMountError("", "stat", "error");
    expect(error).toBeInstanceOf(AFSMountError);
    expect(error.providerName).toBe("");
  });

  test("unicode characters in message", () => {
    const message = "挂载失败：连接超时";
    const error = new AFSMountError("Provider", "stat", message);
    expect(error.message).toContain(message);
  });
});
