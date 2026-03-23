/**
 * Phase 3: CLI Formatter changes for inputSchema
 *
 * Tests that formatters include inputSchema in LLM/JSON output for actions.
 */
import { describe, expect, test } from "bun:test";
import type { AFSListResult, AFSReadResult, AFSStatResult } from "@aigne/afs";
import { formatLsOutput } from "../../src/core/formatters/ls.js";
import { formatReadOutput } from "../../src/core/formatters/read.js";
import { formatStatOutput } from "../../src/core/formatters/stat.js";

// ============ Test Data ============

const sampleInputSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const, description: "The user name" },
    age: { type: "number" as const },
  },
  required: ["name"],
};

const actionsListWithSchema: AFSListResult = {
  data: [
    {
      id: "insert",
      path: "/users/.actions/insert",
      summary: "insert",
      meta: {
        kind: "afs:executable",
        name: "insert",
        description: "Insert a new row",
        inputSchema: sampleInputSchema,
      },
    },
    {
      id: "count",
      path: "/users/.actions/count",
      summary: "count",
      meta: {
        kind: "afs:executable",
        name: "count",
        description: "Count rows",
      },
    },
  ],
};

const actionsListEmpty: AFSListResult = {
  data: [],
};

const statResultWithActions: AFSStatResult = {
  data: {
    id: "users",
    path: "/users",
    meta: { kind: "sqlite:table", childrenCount: 5 },
    actions: [
      {
        name: "insert",
        description: "Insert a new row",
        inputSchema: sampleInputSchema,
      },
      {
        name: "count",
        description: "Count rows",
      },
    ],
  },
};

const readResultWithActions: AFSReadResult = {
  data: {
    id: "users:1",
    path: "/users/1",
    content: { name: "Alice", age: 30 },
    meta: { kind: "sqlite:row" },
    actions: [
      {
        name: "update",
        description: "Update this row",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
      {
        name: "delete",
        description: "Delete this row",
      },
    ],
  },
};

// ============ Tests ============

describe("Phase 3: formatActionsLlm with inputSchema", () => {
  test("action with inputSchema includes SCHEMA inline JSON", () => {
    const output = formatLsOutput(actionsListWithSchema, "llm", {
      path: "/users/.actions",
    });
    expect(output).toContain("ACTION insert");
    expect(output).toContain(`SCHEMA ${JSON.stringify(sampleInputSchema)}`);
  });

  test("action without inputSchema does not include SCHEMA", () => {
    const output = formatLsOutput(actionsListWithSchema, "llm", {
      path: "/users/.actions",
    });
    const countLine = output.split("\n").find((l) => l.startsWith("ACTION count"));
    expect(countLine).toBeDefined();
    expect(countLine).not.toContain("SCHEMA");
  });

  test("empty actions list outputs ACTIONS_COUNT 0", () => {
    const output = formatLsOutput(actionsListEmpty, "llm", {
      path: "/users/.actions",
    });
    expect(output).toContain("ACTIONS_COUNT 0");
  });

  test("inputSchema JSON is valid JSON.parse-able", () => {
    const output = formatLsOutput(actionsListWithSchema, "llm", {
      path: "/users/.actions",
    });
    const insertLine = output.split("\n").find((l) => l.startsWith("ACTION insert"));
    expect(insertLine).toBeDefined();
    const schemaMatch = insertLine!.match(/SCHEMA (.+)$/);
    expect(schemaMatch).toBeTruthy();
    const parsed = JSON.parse(schemaMatch![1]!);
    expect(parsed).toEqual(sampleInputSchema);
  });
});

describe("Phase 3: formatActionsJson with inputSchema", () => {
  test("JSON format includes inputSchema field", () => {
    const output = formatLsOutput(actionsListWithSchema, "json", {
      path: "/users/.actions",
    });
    const parsed = JSON.parse(output);
    expect(parsed.data[0].inputSchema).toEqual(sampleInputSchema);
  });

  test("JSON format omits inputSchema when undefined", () => {
    const output = formatLsOutput(actionsListWithSchema, "json", {
      path: "/users/.actions",
    });
    const parsed = JSON.parse(output);
    expect(parsed.data[1].inputSchema).toBeUndefined();
  });
});

describe("Phase 3: formatStatOutput LLM mode with inputSchema", () => {
  test("ACTION line includes SCHEMA for actions with inputSchema", () => {
    const output = formatStatOutput(statResultWithActions, "llm");
    const insertLine = output.split("\n").find((l) => l.startsWith("ACTION insert"));
    expect(insertLine).toBeDefined();
    expect(insertLine).toContain(`SCHEMA ${JSON.stringify(sampleInputSchema)}`);
  });

  test("ACTION line without inputSchema has no SCHEMA", () => {
    const output = formatStatOutput(statResultWithActions, "llm");
    const countLine = output.split("\n").find((l) => l.startsWith("ACTION count"));
    expect(countLine).toBeDefined();
    expect(countLine).not.toContain("SCHEMA");
  });
});

describe("Phase 3: formatReadOutput LLM mode with inputSchema", () => {
  test("per-action lines include SCHEMA for actions with inputSchema", () => {
    const output = formatReadOutput(readResultWithActions, "llm");
    expect(output).toContain("ACTION update");
    const updateLine = output.split("\n").find((l) => l.startsWith("ACTION update"));
    expect(updateLine).toBeDefined();
    expect(updateLine).toContain("SCHEMA");
  });

  test("per-action lines without inputSchema have no SCHEMA", () => {
    const output = formatReadOutput(readResultWithActions, "llm");
    const deleteLine = output.split("\n").find((l) => l.startsWith("ACTION delete"));
    expect(deleteLine).toBeDefined();
    expect(deleteLine).not.toContain("SCHEMA");
  });

  test("ACTIONS_COUNT header is present", () => {
    const output = formatReadOutput(readResultWithActions, "llm");
    expect(output).toContain("ACTIONS_COUNT 2");
  });
});

describe("Phase 3: Edge cases", () => {
  test("inputSchema undefined does not output SCHEMA undefined", () => {
    const output = formatLsOutput(actionsListWithSchema, "llm", {
      path: "/users/.actions",
    });
    expect(output).not.toContain("SCHEMA undefined");
  });

  test("inputSchema empty object outputs SCHEMA {}", () => {
    const result: AFSListResult = {
      data: [
        {
          id: "noop",
          path: "/users/.actions/noop",
          summary: "noop",
          meta: {
            kind: "afs:executable",
            name: "noop",
            description: "No-op action",
            inputSchema: {},
          },
        },
      ],
    };
    const output = formatLsOutput(result, "llm", { path: "/users/.actions" });
    expect(output).toContain("SCHEMA {}");
  });

  test("inputSchema with special characters is properly JSON-escaped", () => {
    const schemaWithSpecial = {
      type: "object",
      properties: {
        query: { type: "string", description: 'Search with "quotes" and\nnewlines' },
      },
    };
    const result: AFSListResult = {
      data: [
        {
          id: "search",
          path: "/users/.actions/search",
          summary: "search",
          meta: {
            kind: "afs:executable",
            name: "search",
            inputSchema: schemaWithSpecial,
          },
        },
      ],
    };
    const output = formatLsOutput(result, "llm", { path: "/users/.actions" });
    const searchLine = output.split("\n").find((l) => l.startsWith("ACTION search"));
    const schemaMatch = searchLine!.match(/SCHEMA (.+)$/);
    expect(schemaMatch).toBeTruthy();
    const parsed = JSON.parse(schemaMatch![1]!);
    expect(parsed).toEqual(schemaWithSpecial);
  });

  test("action with no description but with inputSchema formats correctly", () => {
    const result: AFSListResult = {
      data: [
        {
          id: "run",
          path: "/users/.actions/run",
          summary: "run",
          meta: {
            kind: "afs:executable",
            name: "run",
            inputSchema: { type: "object" },
          },
        },
      ],
    };
    const output = formatLsOutput(result, "llm", { path: "/users/.actions" });
    const runLine = output.split("\n").find((l) => l.startsWith("ACTION run"));
    expect(runLine).toBeDefined();
    expect(runLine).toContain('SCHEMA {"type":"object"}');
    expect(runLine).not.toContain("DESCRIPTION");
  });

  test("action with no description and no inputSchema formats correctly", () => {
    const result: AFSListResult = {
      data: [
        {
          id: "ping",
          path: "/users/.actions/ping",
          summary: "ping",
          meta: {
            kind: "afs:executable",
            name: "ping",
          },
        },
      ],
    };
    const output = formatLsOutput(result, "llm", { path: "/users/.actions" });
    expect(output).toContain("ACTION ping");
    const pingLine = output.split("\n").find((l) => l.startsWith("ACTION ping"));
    expect(pingLine).toBe("ACTION ping");
  });

  test("non-LLM format outputs are not affected by schema changes", () => {
    const humanOutput = formatLsOutput(actionsListWithSchema, "human", {
      path: "/users/.actions",
    });
    expect(humanOutput).not.toContain("SCHEMA");
    expect(humanOutput).not.toContain("inputSchema");

    const defaultOutput = formatLsOutput(actionsListWithSchema, "default", {
      path: "/users/.actions",
    });
    expect(defaultOutput).not.toContain("SCHEMA");
  });

  test("read CONTENT output is not affected", () => {
    const output = formatReadOutput(readResultWithActions, "llm");
    expect(output).toContain("CONTENT");
    // Content should be the row data, not schema
    expect(output).toContain('"Alice"');
  });
});
