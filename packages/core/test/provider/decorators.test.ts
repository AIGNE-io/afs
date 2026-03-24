import { beforeEach, describe, expect, it } from "bun:test";
import {
  Actions,
  Delete,
  Exec,
  getRoutes,
  List,
  Meta,
  Read,
  Search,
  Write,
} from "../../src/provider/decorators.js";

describe("Route Decorators", () => {
  beforeEach(() => {
    // Clear registry between tests to avoid pollution
  });

  describe("@List decorator", () => {
    it("should register a list route", () => {
      class TestProvider {
        @List("/")
        listRoot() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.pattern).toBe("/");
      expect(routes[0]!.operation).toBe("list");
      expect(routes[0]!.methodName).toBe("listRoot");
    });

    it("should support pattern with parameters", () => {
      class TestProvider {
        @List("/:table")
        listTable() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.pattern).toBe("/:table");
    });

    it("should support optional description", () => {
      class TestProvider {
        @List("/", "List all tables")
        listRoot() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.description).toBe("List all tables");
    });
  });

  describe("@Read decorator", () => {
    it("should register a read route", () => {
      class TestProvider {
        @Read("/:table/:pk")
        getRow() {
          return { id: "1", path: "/" };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.operation).toBe("read");
      expect(routes[0]!.pattern).toBe("/:table/:pk");
    });
  });

  describe("@Write decorator", () => {
    it("should register a write route", () => {
      class TestProvider {
        @Write("/:table/:pk")
        updateRow() {
          return { data: { id: "1", path: "/" } };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.operation).toBe("write");
    });
  });

  describe("@Delete decorator", () => {
    it("should register a delete route", () => {
      class TestProvider {
        @Delete("/:table/:pk")
        deleteRow() {
          return { message: "Deleted" };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.operation).toBe("delete");
    });
  });

  describe("@Exec decorator", () => {
    it("should register an exec route", () => {
      class TestProvider {
        @Exec("/:table/:pk/.actions/:action")
        execAction() {
          return { data: {} };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.operation).toBe("exec");
    });
  });

  describe("@Search decorator", () => {
    it("should register a search route", () => {
      class TestProvider {
        @Search("/:table")
        searchTable() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes[0]!.operation).toBe("search");
    });
  });

  describe("@Meta decorator", () => {
    it("should register a read route with .meta suffix", () => {
      class TestProvider {
        @Meta("/:table/:pk")
        getRowMeta() {
          return { id: "1", path: "/" };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(1);
      expect(routes[0]!.operation).toBe("read");
      expect(routes[0]!.pattern).toBe("/:table/:pk/.meta");
    });
  });

  describe("@Actions decorator", () => {
    it("should register a list route with .actions suffix", () => {
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
    });
  });

  describe("Multiple decorators", () => {
    it("should collect all routes from a class", () => {
      class TestProvider {
        @List("/")
        listRoot() {
          return { data: [] };
        }

        @List("/:table")
        listTable() {
          return { data: [] };
        }

        @Read("/:table/:pk")
        getRow() {
          return { id: "1", path: "/" };
        }

        @Write("/:table/:pk")
        updateRow() {
          return { data: { id: "1", path: "/" } };
        }

        @Delete("/:table/:pk")
        deleteRow() {
          return { message: "Deleted" };
        }

        @Meta("/:table/:pk")
        getRowMeta() {
          return { id: "1", path: "/" };
        }

        @Actions("/:table/:pk")
        listRowActions() {
          return { data: [] };
        }
      }

      const routes = getRoutes(TestProvider);
      expect(routes).toHaveLength(7);
    });
  });

  describe("Inheritance", () => {
    it("should collect routes from parent class", () => {
      class BaseProvider {
        @List("/")
        listRoot() {
          return { data: [] };
        }
      }

      class ChildProvider extends BaseProvider {
        @List("/:table")
        listTable() {
          return { data: [] };
        }
      }

      const routes = getRoutes(ChildProvider);
      // Should have both parent and child routes
      expect(routes.length).toBeGreaterThanOrEqual(1);
      expect(routes.some((r) => r.pattern === "/")).toBe(true);
      expect(routes.some((r) => r.pattern === "/:table")).toBe(true);
    });
  });

  describe("Wildcard patterns", () => {
    it("should support wildcard patterns", () => {
      class FSProvider {
        @List("/**")
        listFiles() {
          return { data: [] };
        }

        @Read("/**")
        readFile() {
          return { id: "1", path: "/" };
        }
      }

      const routes = getRoutes(FSProvider);
      expect(routes).toHaveLength(2);
      expect(routes[0]!.pattern).toBe("/**");
      expect(routes[1]!.pattern).toBe("/**");
    });
  });
});
