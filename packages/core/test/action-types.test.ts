import { describe, expect, it } from "bun:test";
import type { ActionSummary, AFSActionResult, AFSEntry, AFSStatResult } from "../src/type.js";

describe("Action Types", () => {
  describe("ActionSummary", () => {
    it("should have required name field", () => {
      const action: ActionSummary = {
        name: "refresh",
      };

      expect(action.name).toBe("refresh");
    });

    it("should support optional description field", () => {
      const action: ActionSummary = {
        name: "export",
        description: "Export table data to JSON or CSV format",
      };

      expect(action.name).toBe("export");
      expect(action.description).toBe("Export table data to JSON or CSV format");
    });

    it("should allow description to be undefined", () => {
      const action: ActionSummary = {
        name: "validate",
      };

      expect(action.description).toBeUndefined();
    });
  });

  describe("AFSActionResult", () => {
    it("should have required success field", () => {
      const result: AFSActionResult = {
        success: true,
      };

      expect(result.success).toBe(true);
    });

    it("should support optional data field on success", () => {
      const result: AFSActionResult = {
        success: true,
        data: {
          count: 42,
          exported: true,
        },
      };

      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(42);
      expect(result.data?.exported).toBe(true);
    });

    it("should support error field on failure", () => {
      const result: AFSActionResult = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input data",
        },
      };

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
      expect(result.error?.message).toBe("Invalid input data");
    });

    it("should support error with optional details", () => {
      const result: AFSActionResult = {
        success: false,
        error: {
          code: "CONSTRAINT_VIOLATION",
          message: "Foreign key constraint failed",
          details: {
            table: "orders",
            column: "user_id",
            referencedTable: "users",
          },
        },
      };

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CONSTRAINT_VIOLATION");
      expect(result.error?.details?.table).toBe("orders");
      expect(result.error?.details?.column).toBe("user_id");
    });

    it("should allow both data and error to be undefined", () => {
      const result: AFSActionResult = {
        success: true,
      };

      expect(result.data).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe("AFSEntry with actions field", () => {
    it("should support optional actions field", () => {
      const entry: AFSEntry = {
        id: "users:1",
        path: "/users/1",
        actions: [
          { name: "delete" },
          { name: "duplicate", description: "Create a copy of this record" },
        ],
      };

      expect(entry.actions).toBeDefined();
      expect(entry.actions).toHaveLength(2);
      expect(entry.actions?.[0]?.name).toBe("delete");
      expect(entry.actions?.[1]?.name).toBe("duplicate");
      expect(entry.actions?.[1]?.description).toBe("Create a copy of this record");
    });

    it("should allow actions to be undefined", () => {
      const entry: AFSEntry = {
        id: "users:1",
        path: "/users/1",
        content: { name: "John" },
      };

      expect(entry.actions).toBeUndefined();
    });

    it("should coexist with existing AFSEntry fields", () => {
      const entry: AFSEntry = {
        id: "users:1",
        path: "/users/1",
        content: { name: "John", email: "john@example.com" },
        meta: {
          kind: "sqlite:row",
          description: "A user record",
        },
        actions: [
          { name: "refresh" },
          { name: "validate" },
          { name: "export", description: "Export to JSON" },
        ],
      };

      // Existing fields
      expect(entry.id).toBe("users:1");
      expect(entry.path).toBe("/users/1");
      expect(entry.content.name).toBe("John");
      expect(entry.meta?.kind).toBe("sqlite:row");

      // New actions field
      expect(entry.actions).toHaveLength(3);
      expect(entry.actions?.[2]?.name).toBe("export");
    });

    it("should support empty actions array", () => {
      const entry: AFSEntry = {
        id: "readonly:1",
        path: "/readonly/1",
        actions: [],
      };

      expect(entry.actions).toEqual([]);
      expect(entry.actions).toHaveLength(0);
    });
  });

  describe("AFSStatResult with actions field", () => {
    it("should support optional actions field", () => {
      const result: AFSStatResult = {
        data: {
          id: "users",
          path: "/users",
          meta: { childrenCount: 10 },
          actions: [{ name: "export", description: "Export table data" }, { name: "truncate" }],
        },
      };

      expect(result.data?.actions).toBeDefined();
      expect(result.data?.actions).toHaveLength(2);
      expect(result.data?.actions?.[0]?.name).toBe("export");
      expect(result.data?.actions?.[0]?.description).toBe("Export table data");
      expect(result.data?.actions?.[1]?.name).toBe("truncate");
      expect(result.data?.actions?.[1]?.description).toBeUndefined();
    });

    it("should allow actions to be undefined (backward compatible)", () => {
      const result: AFSStatResult = {
        data: {
          id: "1",
          path: "/users/1",
          meta: { size: 1024 },
        },
      };

      expect(result.data?.actions).toBeUndefined();
    });

    it("should support empty actions array", () => {
      const result: AFSStatResult = {
        data: {
          id: "readonly",
          path: "/readonly",
          actions: [],
        },
      };

      expect(result.data?.actions).toEqual([]);
      expect(result.data?.actions).toHaveLength(0);
    });

    it("should coexist with existing AFSStatResult fields", () => {
      const now = new Date();
      const result: AFSStatResult = {
        data: {
          id: "users",
          path: "/users",
          updatedAt: now,
          createdAt: now,
          meta: { kind: "sqlite:table", rowCount: 100, size: 4096, childrenCount: 100 },
          actions: [{ name: "export", description: "Export data" }, { name: "analyze" }],
        },
        message: "Stats retrieved successfully",
      };

      // Existing fields
      expect(result.data?.path).toBe("/users");
      expect(result.data?.meta?.size).toBe(4096);
      expect(result.data?.updatedAt).toBe(now);
      expect(result.data?.createdAt).toBe(now);
      expect(result.data?.meta?.childrenCount).toBe(100);
      expect(result.data?.meta?.kind).toBe("sqlite:table");
      expect(result.message).toBe("Stats retrieved successfully");

      // New actions field
      expect(result.data?.actions).toHaveLength(2);
      expect(result.data?.actions?.[0]?.name).toBe("export");
    });
  });

  describe("Type compatibility", () => {
    it("ActionSummary array should be assignable to actions field", () => {
      const actions: ActionSummary[] = [
        { name: "action1" },
        { name: "action2", description: "Description 2" },
      ];

      const entry: AFSEntry = {
        id: "test:1",
        path: "/test/1",
        actions: actions,
      };

      expect(entry.actions).toBe(actions);
    });

    it("should work with generic AFSEntry<T>", () => {
      interface UserContent {
        name: string;
        email: string;
      }

      const entry: AFSEntry<UserContent> = {
        id: "users:1",
        path: "/users/1",
        content: {
          name: "John",
          email: "john@example.com",
        },
        actions: [
          { name: "update", description: "Update user details" },
          { name: "delete", description: "Delete user" },
        ],
      };

      expect(entry.content?.name).toBe("John");
      expect(entry.actions?.[0]?.name).toBe("update");
    });
  });
});
