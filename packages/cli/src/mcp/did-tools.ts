/**
 * DID MCP Tools Registration
 *
 * Registers DID identity/trust management tools on the MCP server.
 * These tools operate on local filesystem identities, not AFS paths.
 */

import { homedir } from "node:os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  performDIDInfo,
  performDIDInit,
  performDIDIssueSelfSign,
  performDIDVerify,
} from "../core/commands/did.js";
import {
  performIssuerAdd,
  performIssuerInspect,
  performIssuerList,
  performIssuerRemove,
} from "../core/commands/did-issuer.js";
import {
  formatIssuerAddOutput,
  formatIssuerInspectOutput,
  formatIssuerListOutput,
  formatIssuerRemoveOutput,
  formatProviderInfoOutput,
  formatProviderInitOutput,
  formatProviderIssueOutput,
  formatProviderVerifyOutput,
} from "../core/formatters/provider.js";
import { errorResult, textResult, withTimeout } from "./utils.js";

/**
 * Register DID tools on the MCP server.
 *
 * @param server - MCP server instance
 * @param cwd - Working directory (for package.json / .did/ resolution)
 */
export function registerDIDTools(server: McpServer, cwd: string): void {
  const home = homedir();

  // ── did_info ──
  server.tool(
    "did_info",
    "Show DID identity and credential information for the current provider/blocklet",
    {
      path: z.string().optional().describe("Provider directory path (defaults to server cwd)"),
    },
    async ({ path: dir }) => {
      try {
        const result = await withTimeout(() => performDIDInfo({ cwd: dir ?? cwd, home }));
        return textResult(formatProviderInfoOutput(result, "llm"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ── did_init ──
  server.tool(
    "did_init",
    "Generate DID identity for developer, provider, or blocklet",
    {
      entityType: z
        .enum(["developer", "provider", "blocklet"])
        .optional()
        .describe("Entity type. Auto-detects from package.json/blocklet.yaml if omitted."),
      force: z.boolean().optional().describe("Overwrite existing identity"),
      path: z.string().optional().describe("Provider directory path (defaults to server cwd)"),
    },
    async ({ entityType, force, path: dir }) => {
      try {
        const result = await withTimeout(() =>
          performDIDInit({ entityType, force, cwd: dir ?? cwd, home }),
        );
        return textResult(formatProviderInitOutput(result, "llm"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ── did_issue ──
  server.tool(
    "did_issue",
    "Issue a self-signed verifiable credential for provider/blocklet. Use CLI for counter-sign mode.",
    {
      skipCheck: z.boolean().optional().describe("Skip conformance test check"),
      path: z.string().optional().describe("Provider directory path (defaults to server cwd)"),
    },
    async ({ skipCheck, path: dir }) => {
      try {
        const result = await withTimeout(() =>
          performDIDIssueSelfSign({ skipCheck, cwd: dir ?? cwd, home }),
        );
        return textResult(formatProviderIssueOutput(result, "llm"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ── did_verify ──
  server.tool(
    "did_verify",
    "Verify existing credential and determine trust level",
    {
      path: z.string().optional().describe("Provider directory path (defaults to server cwd)"),
    },
    async ({ path: dir }) => {
      try {
        const result = await withTimeout(() => performDIDVerify({ cwd: dir ?? cwd, home }));
        return textResult(formatProviderVerifyOutput(result, "llm"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ── did_issuer_list ──
  server.tool("did_issuer_list", "List all trusted issuers in the trust store", {}, async () => {
    try {
      const result = await withTimeout(() => performIssuerList({ home }));
      return textResult(formatIssuerListOutput(result, "llm"));
    } catch (error) {
      return errorResult(error);
    }
  });

  // ── did_issuer_add ──
  server.tool(
    "did_issuer_add",
    "Add a trusted issuer to the trust store",
    {
      name: z.string().describe("Issuer identifier (used as filename prefix)"),
      fromKey: z.string().optional().describe("Path to key file containing did and pk"),
      fromVc: z
        .string()
        .optional()
        .describe("Path to VC file (extracts counter-sign proof signer)"),
      proofIndex: z
        .number()
        .optional()
        .describe("Select specific proof by index (for fromVc with multiple proofs)"),
      did: z.string().optional().describe("DID address (base58 z... format)"),
      pk: z.string().optional().describe("Public key (hex format)"),
    },
    async ({ name, fromKey, fromVc, proofIndex, did, pk }) => {
      try {
        const result = await withTimeout(() =>
          performIssuerAdd({ name, home, fromKey, fromVc, proofIndex, did, pk }),
        );
        return textResult(formatIssuerAddOutput(result, "llm"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ── did_issuer_remove ──
  server.tool(
    "did_issuer_remove",
    "Remove a trusted issuer from the trust store",
    {
      name: z.string().describe("Issuer identifier to remove"),
    },
    async ({ name }) => {
      try {
        const result = await withTimeout(() => performIssuerRemove({ name, home }));
        return textResult(formatIssuerRemoveOutput(result, "llm"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ── did_issuer_inspect ──
  server.tool(
    "did_issuer_inspect",
    "Show detailed information about a trusted issuer",
    {
      name: z.string().describe("Issuer identifier to inspect"),
    },
    async ({ name }) => {
      try {
        const result = await withTimeout(() => performIssuerInspect({ name, home }));
        return textResult(formatIssuerInspectOutput(result, "llm"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
