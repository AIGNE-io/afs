/**
 * Tests for MCP DID Issuer Tools
 *
 * Strategy:
 * - Tool registration: verified via MCP client.listTools() (incremental assertions)
 * - Tool logic: tested by calling perform* functions with temp filesystem fixtures
 *   (MCP tools are thin wrappers around perform*, no need to test through MCP protocol)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  performIssuerAdd,
  performIssuerInspect,
  performIssuerList,
  performIssuerRemove,
} from "../../src/core/commands/did-issuer.js";
import {
  formatIssuerAddOutput,
  formatIssuerInspectOutput,
  formatIssuerListOutput,
  formatIssuerRemoveOutput,
} from "../../src/core/formatters/provider.js";
import { createAFSMcpServer } from "../../src/mcp/server.js";

// ── Helpers ──

let tempHome: string;

function issuersDir(): string {
  return join(tempHome, ".afs", "trusted-issuers");
}

async function writeIssuerFile(name: string, data: Record<string, unknown>): Promise<void> {
  const dir = issuersDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.did.json`), JSON.stringify(data));
}

async function writeKeyFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  await writeFile(filePath, JSON.stringify(data));
}

// ── Setup / Teardown ──

beforeEach(async () => {
  tempHome = join(
    tmpdir(),
    `afs-issuer-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(tempHome, { recursive: true });
});

afterEach(async () => {
  await rm(tempHome, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════
// MCP Registration Tests
// ══════════════════════════════════════════════════════════════

describe("MCP Issuer Tools Registration", () => {
  test("listTools includes 4 issuer tools (incremental assertion)", async () => {
    const afs = new AFS();
    const { server } = createAFSMcpServer({ afs });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);

    expect(names).toContain("did_issuer_list");
    expect(names).toContain("did_issuer_add");
    expect(names).toContain("did_issuer_remove");
    expect(names).toContain("did_issuer_inspect");

    await client.close();
    await server.close();
  });

  test("did_issuer_reset is NOT in tool list (destructive operation)", async () => {
    const afs = new AFS();
    const { server } = createAFSMcpServer({ afs });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);

    expect(names).not.toContain("did_issuer_reset");

    await client.close();
    await server.close();
  });
});

// ══════════════════════════════════════════════════════════════
// MCP Issuer perform* Integration Tests (LLM view output)
// ══════════════════════════════════════════════════════════════

describe("MCP Issuer perform* Integration", () => {
  // ── did_issuer_list ──

  test("did_issuer_list: empty trust store → LLM format", async () => {
    const result = await performIssuerList({ home: tempHome });
    const output = formatIssuerListOutput(result, "llm");
    expect(output).toContain("ISSUER_LIST");
    expect(output).toContain("TOTAL 0");
  });

  test("did_issuer_list: with issuers → LLM format", async () => {
    await writeIssuerFile("dev", {
      did: "z1DevDid",
      pk: "0x04dev",
      name: "Developer",
      source: "manual",
    });

    const result = await performIssuerList({ home: tempHome });
    const output = formatIssuerListOutput(result, "llm");
    expect(output).toContain("ISSUER_LIST");
    expect(output).toContain("TOTAL 1");
    expect(output).toContain("dev");
  });

  // ── did_issuer_add ──

  test("did_issuer_add: fromKey → LLM format", async () => {
    const keyPath = join(tempHome, "test-key.json");
    await writeKeyFile(keyPath, {
      did: "z1TestKey",
      pk: "0x04testkey",
      sk: "0xsecret",
      type: "default",
    });

    const result = await performIssuerAdd({
      name: "test-issuer",
      home: tempHome,
      fromKey: keyPath,
    });
    const output = formatIssuerAddOutput(result, "llm");
    expect(output).toContain("ISSUER_ADD");
    expect(output).toContain("test-issuer");
    expect(output).toContain("STATUS added");
    expect(output).toContain("z1TestKey");
    expect(output).not.toContain("0xsecret"); // No sk leak
  });

  test("did_issuer_add: did + pk → LLM format", async () => {
    const result = await performIssuerAdd({
      name: "manual-issuer",
      home: tempHome,
      did: "z1ManualDid",
      pk: "0x04manual",
    });
    const output = formatIssuerAddOutput(result, "llm");
    expect(output).toContain("ISSUER_ADD");
    expect(output).toContain("manual-issuer");
    expect(output).toContain("STATUS added");
  });

  test("did_issuer_add: fromVc → LLM format", async () => {
    const vcPath = join(tempHome, "test-vc.json");
    await writeFile(
      vcPath,
      JSON.stringify({
        credentialSubject: { id: "z1Subject" },
        proof: [
          { signer: "z1Subject", pk: "0x04self" },
          { signer: "z2CounterSigner", pk: "0x04counter" },
        ],
      }),
    );

    const result = await performIssuerAdd({ name: "vc-issuer", home: tempHome, fromVc: vcPath });
    const output = formatIssuerAddOutput(result, "llm");
    expect(output).toContain("ISSUER_ADD");
    expect(output).toContain("vc-issuer");
    expect(output).toContain("z2CounterSigner");
  });

  test("did_issuer_add: overwrite existing → STATUS updated", async () => {
    await writeIssuerFile("existing", { did: "z1Old", pk: "0x04old", name: "existing" });

    const result = await performIssuerAdd({
      name: "existing",
      home: tempHome,
      did: "z1New",
      pk: "0x04new",
    });
    const output = formatIssuerAddOutput(result, "llm");
    expect(output).toContain("STATUS updated");
  });

  // ── did_issuer_add bad path ──

  test("did_issuer_add: no input source → error", async () => {
    await expect(performIssuerAdd({ name: "no-source", home: tempHome })).rejects.toThrow(
      "No input source",
    );
  });

  test("did_issuer_add: conflicting sources → error", async () => {
    await expect(
      performIssuerAdd({
        name: "conflict",
        home: tempHome,
        fromKey: "/some/key.json",
        did: "z1Test",
      }),
    ).rejects.toThrow("Conflicting source flags");
  });

  test("did_issuer_add: fromKey file not found → error", async () => {
    await expect(
      performIssuerAdd({ name: "bad-key", home: tempHome, fromKey: "/nonexistent/key.json" }),
    ).rejects.toThrow("not found");
  });

  test("did_issuer_add: missing name → error", async () => {
    await expect(
      performIssuerAdd({ name: "", home: tempHome, did: "z1Test", pk: "0x04test" }),
    ).rejects.toThrow("Issuer name required");
  });

  // ── did_issuer_remove ──

  test("did_issuer_remove: existing → STATUS removed", async () => {
    await writeIssuerFile("to-remove", {
      did: "z1Remove",
      pk: "0x04rm",
      name: "to-remove",
      source: "manual",
    });

    const result = await performIssuerRemove({ name: "to-remove", home: tempHome });
    const output = formatIssuerRemoveOutput(result, "llm");
    expect(output).toContain("ISSUER_REMOVE");
    expect(output).toContain("STATUS removed");
  });

  test("did_issuer_remove: non-existent → STATUS not-found", async () => {
    const result = await performIssuerRemove({ name: "ghost", home: tempHome });
    const output = formatIssuerRemoveOutput(result, "llm");
    expect(output).toContain("STATUS not-found");
  });

  // ── did_issuer_inspect ──

  test("did_issuer_inspect: existing → LLM format with full details", async () => {
    await writeIssuerFile("full-issuer", {
      did: "z1FullDid",
      pk: "0x04full",
      name: "Full Issuer",
      source: "shipped",
      addedAt: "2025-01-01T00:00:00.000Z",
    });

    const result = await performIssuerInspect({ name: "full-issuer", home: tempHome });
    const output = formatIssuerInspectOutput(result, "llm");
    expect(output).toContain("ISSUER_INSPECT");
    expect(output).toContain("full-issuer");
    expect(output).toContain("z1FullDid");
    expect(output).toContain("0x04full");
    expect(output).toContain("shipped");
  });

  test("did_issuer_inspect: non-existent → error", async () => {
    await expect(performIssuerInspect({ name: "ghost", home: tempHome })).rejects.toThrow(
      "Issuer not found",
    );
  });

  // ── Security ──

  test("did_issuer_add: fromKey does not leak sk in LLM output", async () => {
    const keyPath = join(tempHome, "secret-key.json");
    await writeKeyFile(keyPath, {
      did: "z1Key",
      pk: "0x04pk",
      sk: "0xSuperSecret123",
      type: "default",
    });

    const result = await performIssuerAdd({
      name: "secret-test",
      home: tempHome,
      fromKey: keyPath,
    });
    const output = formatIssuerAddOutput(result, "llm");
    expect(output).not.toContain("0xSuperSecret123");
    expect(output).not.toContain("sk");
  });

  test("did_issuer_inspect: does not contain sk", async () => {
    const keyPath = join(tempHome, "key2.json");
    await writeKeyFile(keyPath, {
      did: "z1Key2",
      pk: "0x04pk2",
      sk: "0xSecret456",
      type: "default",
    });
    await performIssuerAdd({ name: "inspect-sec", home: tempHome, fromKey: keyPath });

    const result = await performIssuerInspect({ name: "inspect-sec", home: tempHome });
    const output = formatIssuerInspectOutput(result, "llm");
    expect(output).not.toContain("0xSecret456");
  });

  // ── All MCP tools use LLM view ──

  test("all tools output in LLM view format", async () => {
    // List
    const listResult = await performIssuerList({ home: tempHome });
    const listOutput = formatIssuerListOutput(listResult, "llm");
    expect(listOutput).toContain("ISSUER_LIST");

    // Add
    const addResult = await performIssuerAdd({
      name: "llm-test",
      home: tempHome,
      did: "z1Llm",
      pk: "0x04llm",
    });
    const addOutput = formatIssuerAddOutput(addResult, "llm");
    expect(addOutput).toContain("ISSUER_ADD");

    // Inspect
    const inspectResult = await performIssuerInspect({ name: "llm-test", home: tempHome });
    const inspectOutput = formatIssuerInspectOutput(inspectResult, "llm");
    expect(inspectOutput).toContain("ISSUER_INSPECT");

    // Remove
    const removeResult = await performIssuerRemove({ name: "llm-test", home: tempHome });
    const removeOutput = formatIssuerRemoveOutput(removeResult, "llm");
    expect(removeOutput).toContain("ISSUER_REMOVE");
  });
});
