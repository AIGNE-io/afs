import { describe, expect, it } from "bun:test";
import { Actions, getRoutes } from "../../src/provider/decorators.js";

describe("@Actions.Exec decorator", () => {
  describe("specific action name", () => {
    it("should register exec route with .actions/<action-name> suffix", () => {
      class TestProvider {
        @Actions.Exec("/issues/:number", "close")
        closeIssue() {
          return { data: { success: true } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.operation).toBe("exec");
      expect(routes[0]!.pattern).toBe("/issues/:number/.actions/close");
      expect(routes[0]!.methodName).toBe("closeIssue");
    });

    it("should support directory-level actions", () => {
      class TestProvider {
        @Actions.Exec("/issues", "create")
        createIssue() {
          return { data: { id: 1 } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/issues/.actions/create");
    });

    it("should support root-level actions", () => {
      class TestProvider {
        @Actions.Exec("/", "refresh")
        refreshAll() {
          return { data: { refreshed: true } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/.actions/refresh");
    });

    it("should support nested path actions", () => {
      class TestProvider {
        @Actions.Exec("/tables/:table/rows/:pk", "validate")
        validateRow() {
          return { data: { valid: true } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/tables/:table/rows/:pk/.actions/validate");
    });
  });

  describe("catch-all pattern (no action name)", () => {
    it("should register exec route with .actions/:action pattern", () => {
      class TestProvider {
        @Actions.Exec("/issues/:number")
        handleIssueAction() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.operation).toBe("exec");
      expect(routes[0]!.pattern).toBe("/issues/:number/.actions/:action");
      expect(routes[0]!.methodName).toBe("handleIssueAction");
    });

    it("should support directory-level catch-all", () => {
      class TestProvider {
        @Actions.Exec("/tables/:table")
        handleTableAction() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/tables/:table/.actions/:action");
    });

    it("should support root-level catch-all", () => {
      class TestProvider {
        @Actions.Exec("/")
        handleRootAction() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/.actions/:action");
    });
  });

  describe("multiple actions", () => {
    it("should collect multiple specific actions", () => {
      class TestProvider {
        @Actions.Exec("/issues/:number", "close")
        closeIssue() {
          return { data: { success: true } };
        }

        @Actions.Exec("/issues/:number", "reopen")
        reopenIssue() {
          return { data: { success: true } };
        }

        @Actions.Exec("/issues/:number", "assign")
        assignIssue() {
          return { data: { success: true } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(3);
      expect(routes.map((r) => r.pattern)).toContain("/issues/:number/.actions/close");
      expect(routes.map((r) => r.pattern)).toContain("/issues/:number/.actions/reopen");
      expect(routes.map((r) => r.pattern)).toContain("/issues/:number/.actions/assign");
    });

    it("should support mix of specific and catch-all actions", () => {
      class TestProvider {
        @Actions.Exec("/issues/:number", "close")
        closeIssue() {
          return { data: { success: true } };
        }

        @Actions.Exec("/issues/:number")
        handleOtherActions() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(2);
      expect(routes.some((r) => r.pattern === "/issues/:number/.actions/close")).toBe(true);
      expect(routes.some((r) => r.pattern === "/issues/:number/.actions/:action")).toBe(true);
    });
  });

  describe("inheritance", () => {
    it("should collect actions from parent class", () => {
      class BaseProvider {
        @Actions.Exec("/:table/:pk", "delete")
        deleteRow() {
          return { data: { deleted: true } };
        }
      }

      class ChildProvider extends BaseProvider {
        @Actions.Exec("/:table/:pk", "duplicate")
        duplicateRow() {
          return { data: { id: "new-id" } };
        }
      }

      const routes = getRoutes(ChildProvider);
      expect(routes.length).toBeGreaterThanOrEqual(2);
      expect(routes.some((r) => r.pattern === "/:table/:pk/.actions/delete")).toBe(true);
      expect(routes.some((r) => r.pattern === "/:table/:pk/.actions/duplicate")).toBe(true);
    });
  });

  describe("combined with other decorators", () => {
    it("should work alongside other route decorators", async () => {
      // Import other decorators
      const { List, Read, Write, Delete } = await import("../../src/provider/decorators.js");

      class TestProvider {
        @List("/:table")
        listTable() {
          return { data: [] };
        }

        @Read("/:table/:pk")
        readRow() {
          return { id: "1", path: "/" };
        }

        @Write("/:table/:pk")
        writeRow() {
          return { data: { id: "1", path: "/" } };
        }

        @Delete("/:table/:pk")
        deleteRow() {
          return { message: "Deleted" };
        }

        @Actions.Exec("/:table/:pk", "validate")
        validateRow() {
          return { data: { valid: true } };
        }

        @Actions.Exec("/:table", "export")
        exportTable() {
          return { data: { csv: "..." } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes.length).toBe(6);

      // Verify action routes are registered correctly
      const actionRoutes = routes.filter((r) => r.pattern.includes("/.actions/"));
      expect(actionRoutes).toHaveLength(2);
      expect(actionRoutes.every((r) => r.operation === "exec")).toBe(true);
    });
  });
});

describe("Actions namespace", () => {
  describe("Actions.Exec", () => {
    it("should register exec route with .actions/<action-name> suffix (specific action)", () => {
      class TestProvider {
        @Actions.Exec("/issues/:number", "close")
        closeIssue() {
          return { data: { success: true } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.operation).toBe("exec");
      expect(routes[0]!.pattern).toBe("/issues/:number/.actions/close");
      expect(routes[0]!.methodName).toBe("closeIssue");
    });

    it("should register exec route with .actions/:action pattern (catch-all)", () => {
      class TestProvider {
        @Actions.Exec("/issues/:number")
        handleIssueAction() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.operation).toBe("exec");
      expect(routes[0]!.pattern).toBe("/issues/:number/.actions/:action");
    });

    it("should support root-level actions", () => {
      class TestProvider {
        @Actions.Exec("/", "refresh")
        refreshAll() {
          return { data: { refreshed: true } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/.actions/refresh");
    });

    it("should support root-level catch-all", () => {
      class TestProvider {
        @Actions.Exec("/")
        handleRootAction() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/.actions/:action");
    });
  });

  describe("Actions", () => {
    it("should register list route with .actions suffix", () => {
      class TestProvider {
        @Actions("/:table/:pk")
        listRowActions() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.operation).toBe("list");
      expect(routes[0]!.pattern).toBe("/:table/:pk/.actions");
      expect(routes[0]!.methodName).toBe("listRowActions");
    });

    it("should support table-level actions listing", () => {
      class TestProvider {
        @Actions("/:table")
        listTableActions() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/:table/.actions");
    });

    it("should support root-level actions listing", () => {
      class TestProvider {
        @Actions("/")
        listRootActions() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/.actions");
    });
  });

  describe("combined usage", () => {
    it("should support both Actions and Actions.Exec together", () => {
      class TestProvider {
        @Actions("/:table/:pk")
        listActions() {
          return { data: [] };
        }

        @Actions.Exec("/:table/:pk", "delete")
        deleteAction() {
          return { data: { deleted: true } };
        }

        @Actions.Exec("/:table/:pk")
        handleOtherActions() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(3);

      const listRoute = routes.find((r) => r.operation === "list");
      expect(listRoute?.pattern).toBe("/:table/:pk/.actions");

      const execRoutes = routes.filter((r) => r.operation === "exec");
      expect(execRoutes).toHaveLength(2);
      expect(execRoutes.some((r) => r.pattern === "/:table/:pk/.actions/delete")).toBe(true);
      expect(execRoutes.some((r) => r.pattern === "/:table/:pk/.actions/:action")).toBe(true);
    });
  });
});
