import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  performIssuerAdd,
  performIssuerInspect,
  performIssuerList,
  performIssuerRemove,
  performIssuerReset,
} from "../../src/core/commands/did-issuer.js";
import { CLIError } from "../../src/errors.js";

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
  tempHome = join(tmpdir(), `afs-issuer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempHome, { recursive: true });
});

afterEach(async () => {
  await rm(tempHome, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════
// performIssuerList
// ══════════════════════════════════════════════════════════════

describe("performIssuerList", () => {
  // ── Happy Path ──

  test("empty directory returns { issuers: [], total: 0 }", async () => {
    const result = await performIssuerList({ home: tempHome });
    expect(result.issuers).toEqual([]);
    expect(result.total).toBe(0);
  });

  test("returns all issuers with source/addedAt/fileName fields", async () => {
    await writeIssuerFile("dev", {
      did: "z1DevDid",
      pk: "0x04dev",
      name: "Developer",
      source: "manual",
      addedAt: "2025-01-01T00:00:00.000Z",
    });
    await writeIssuerFile("official", {
      did: "z2OfficialDid",
      pk: "0x04off",
      name: "Official",
      source: "shipped",
    });

    const result = await performIssuerList({ home: tempHome });
    expect(result.total).toBe(2);
    expect(result.issuers).toHaveLength(2);

    const dev = result.issuers.find((i) => i.name === "dev");
    expect(dev).toBeTruthy();
    expect(dev!.did).toBe("z1DevDid");
    expect(dev!.source).toBe("manual");
    expect(dev!.addedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(dev!.fileName).toBe("dev.did.json");

    const official = result.issuers.find((i) => i.name === "official");
    expect(official).toBeTruthy();
    expect(official!.source).toBe("shipped");
  });

  // ── Edge Cases ──

  test("corrupted .did.json file → skip, no crash", async () => {
    const dir = issuersDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "corrupted.did.json"), "not valid json{{{");
    await writeIssuerFile("good", { did: "z1Good", pk: "0x04", name: "Good" });

    const result = await performIssuerList({ home: tempHome });
    expect(result.total).toBe(1);
    expect(result.issuers[0]!.name).toBe("good");
  });

  test("old format file without source → source is undefined", async () => {
    await writeIssuerFile("legacy", { did: "z1Legacy", pk: "0x04leg", name: "Legacy" });

    const result = await performIssuerList({ home: tempHome });
    expect(result.total).toBe(1);
    expect(result.issuers[0]!.source).toBeUndefined();
  });

  test("empty trusted-issuers directory → returns empty array", async () => {
    await mkdir(issuersDir(), { recursive: true });
    const result = await performIssuerList({ home: tempHome });
    expect(result.issuers).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// performIssuerAdd
// ══════════════════════════════════════════════════════════════

describe("performIssuerAdd", () => {
  // ── Happy Path ──

  test("--from-key: extracts did+pk, writes .did.json with source=manual", async () => {
    const keyPath = join(tempHome, "key.json");
    await writeKeyFile(keyPath, {
      did: "z1TestDid",
      pk: "0x04abc",
      sk: "0xsecret",
      type: "default",
    });

    const result = await performIssuerAdd({
      name: "dev",
      home: tempHome,
      fromKey: keyPath,
    });

    expect(result.status).toBe("added");
    expect(result.did).toBe("z1TestDid");
    expect(result.pk).toBe("0x04abc");
    expect(result.source).toBe("from-key");

    // Verify file written
    const filePath = join(issuersDir(), "dev.did.json");
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content.did).toBe("z1TestDid");
    expect(content.pk).toBe("0x04abc");
    expect(content.source).toBe("from-key");
    expect(content.addedAt).toBeTruthy();
  });

  test("--did/--pk: manual values write .did.json with source=manual", async () => {
    const result = await performIssuerAdd({
      name: "manual-issuer",
      home: tempHome,
      did: "z1ManualDid",
      pk: "0x04manual",
    });

    expect(result.status).toBe("added");
    expect(result.source).toBe("manual");
  });

  test("auto-fills addedAt as ISO timestamp", async () => {
    const before = new Date().toISOString();
    const result = await performIssuerAdd({
      name: "time-test",
      home: tempHome,
      did: "z1TimeDid",
      pk: "0x04time",
    });
    const after = new Date().toISOString();

    expect(result.addedAt).toBeTruthy();
    expect(result.addedAt! >= before).toBe(true);
    expect(result.addedAt! <= after).toBe(true);
  });

  test("overwrite existing → status=updated", async () => {
    await writeIssuerFile("existing", { did: "z1Old", pk: "0x04old", name: "existing" });

    const result = await performIssuerAdd({
      name: "existing",
      home: tempHome,
      did: "z1New",
      pk: "0x04new",
    });

    expect(result.status).toBe("updated");
    expect(result.did).toBe("z1New");
  });

  test("new issuer → status=added", async () => {
    const result = await performIssuerAdd({
      name: "brand-new",
      home: tempHome,
      did: "z1New",
      pk: "0x04new",
    });
    expect(result.status).toBe("added");
  });

  test("trusted-issuers directory auto-created", async () => {
    const result = await performIssuerAdd({
      name: "auto-dir",
      home: tempHome,
      did: "z1AutoDir",
      pk: "0x04auto",
    });
    expect(result.status).toBe("added");
  });

  // ── Bad Path ──

  test("no source flag → throws RUNTIME_ERROR", async () => {
    await expect(performIssuerAdd({ name: "no-source", home: tempHome })).rejects.toThrow(
      "No input source",
    );
  });

  test("--did without --pk → throws", async () => {
    await expect(performIssuerAdd({ name: "half", home: tempHome, did: "z1Test" })).rejects.toThrow(
      "Both --did and --pk required",
    );
  });

  test("--pk without --did → throws", async () => {
    await expect(
      performIssuerAdd({ name: "half", home: tempHome, pk: "0x04test" }),
    ).rejects.toThrow("Both --did and --pk required");
  });

  test("conflicting flags (--from-key + --did) → throws", async () => {
    await expect(
      performIssuerAdd({
        name: "conflict",
        home: tempHome,
        fromKey: "/some/key",
        did: "z1Test",
      }),
    ).rejects.toThrow("Conflicting source flags");
  });

  test("--from-key file not found → NOT_FOUND", async () => {
    try {
      await performIssuerAdd({
        name: "missing",
        home: tempHome,
        fromKey: "/nonexistent/key.json",
      });
      expect(true).toBe(false); // Should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).exitCode).toBe(1); // NOT_FOUND
    }
  });

  test("--from-key invalid JSON → RUNTIME_ERROR", async () => {
    const keyPath = join(tempHome, "bad-key.json");
    await writeFile(keyPath, "not json{{{");

    try {
      await performIssuerAdd({ name: "bad-json", home: tempHome, fromKey: keyPath });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as Error).message).toContain("not valid JSON");
    }
  });

  test("--from-key missing did field → throws", async () => {
    const keyPath = join(tempHome, "no-did.json");
    await writeKeyFile(keyPath, { pk: "0x04abc", sk: "0xsecret" });

    await expect(
      performIssuerAdd({ name: "no-did", home: tempHome, fromKey: keyPath }),
    ).rejects.toThrow("Key file missing 'did' field");
  });

  test("--from-key missing pk field → throws", async () => {
    const keyPath = join(tempHome, "no-pk.json");
    await writeKeyFile(keyPath, { did: "z1Test", sk: "0xsecret" });

    await expect(
      performIssuerAdd({ name: "no-pk", home: tempHome, fromKey: keyPath }),
    ).rejects.toThrow("Key file missing 'pk' field");
  });

  test("--did invalid format (non z-prefix) → throws", async () => {
    await expect(
      performIssuerAdd({
        name: "bad-did",
        home: tempHome,
        did: "abc123",
        pk: "0x04test",
      }),
    ).rejects.toThrow("Invalid DID format");
  });

  test("--did empty string → throws", async () => {
    await expect(
      performIssuerAdd({
        name: "empty-did",
        home: tempHome,
        did: "",
        pk: "0x04test",
      }),
    ).rejects.toThrow();
  });

  test("name empty string → throws", async () => {
    await expect(
      performIssuerAdd({
        name: "",
        home: tempHome,
        did: "z1Test",
        pk: "0x04test",
      }),
    ).rejects.toThrow("Issuer name required");
  });

  // ── Security ──

  test("--from-key: written .did.json does NOT contain sk", async () => {
    const keyPath = join(tempHome, "secure-key.json");
    await writeKeyFile(keyPath, {
      did: "z1Secure",
      pk: "0x04sec",
      sk: "0xSECRET_MUST_NOT_LEAK",
      type: "default",
    });

    await performIssuerAdd({ name: "secure", home: tempHome, fromKey: keyPath });

    const filePath = join(issuersDir(), "secure.did.json");
    const content = await readFile(filePath, "utf-8");
    expect(content).not.toContain("0xSECRET_MUST_NOT_LEAK");
    expect(content).not.toContain('"sk"');
  });

  test("--from-key: returned result does NOT contain sk", async () => {
    const keyPath = join(tempHome, "result-key.json");
    await writeKeyFile(keyPath, {
      did: "z1Result",
      pk: "0x04res",
      sk: "0xSECRET",
      type: "default",
    });

    const result = await performIssuerAdd({
      name: "result-test",
      home: tempHome,
      fromKey: keyPath,
    });
    expect(JSON.stringify(result)).not.toContain("0xSECRET");
  });

  test("name with path traversal (../) → rejected", async () => {
    await expect(
      performIssuerAdd({
        name: "../evil",
        home: tempHome,
        did: "z1Evil",
        pk: "0x04evil",
      }),
    ).rejects.toThrow("path traversal");
  });

  test("name with / → rejected", async () => {
    await expect(
      performIssuerAdd({
        name: "foo/bar",
        home: tempHome,
        did: "z1Evil",
        pk: "0x04evil",
      }),
    ).rejects.toThrow("must not contain");
  });

  test("name with backslash → rejected", async () => {
    await expect(
      performIssuerAdd({
        name: "foo\\bar",
        home: tempHome,
        did: "z1Evil",
        pk: "0x04evil",
      }),
    ).rejects.toThrow("must not contain");
  });

  // ── Data Damage ──

  test("read-after-write: file content matches", async () => {
    await performIssuerAdd({
      name: "raw-check",
      home: tempHome,
      did: "z1RawCheck",
      pk: "0x04raw",
    });

    const filePath = join(issuersDir(), "raw-check.did.json");
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content.did).toBe("z1RawCheck");
    expect(content.pk).toBe("0x04raw");
    expect(content.source).toBe("manual");
  });

  test("two different issuers do not interfere", async () => {
    await performIssuerAdd({ name: "a", home: tempHome, did: "z1A", pk: "0x04a" });
    await performIssuerAdd({ name: "b", home: tempHome, did: "z1B", pk: "0x04b" });

    const listResult = await performIssuerList({ home: tempHome });
    expect(listResult.total).toBe(2);
    expect(listResult.issuers.find((i) => i.name === "a")!.did).toBe("z1A");
    expect(listResult.issuers.find((i) => i.name === "b")!.did).toBe("z1B");
  });

  // ── Edge Cases ──

  test("issuer name with hyphen (aigne-official) → correct filename", async () => {
    await performIssuerAdd({
      name: "aigne-official",
      home: tempHome,
      did: "z1Hyphen",
      pk: "0x04hyp",
    });

    const result = await performIssuerList({ home: tempHome });
    expect(result.issuers[0]!.fileName).toBe("aigne-official.did.json");
  });

  // ── Data Leak ──

  test("--from-key error message does not contain sk", async () => {
    const keyPath = join(tempHome, "partial-key.json");
    // Key file with sk but missing did
    await writeKeyFile(keyPath, { pk: "0x04", sk: "0xSECRET_VALUE" });

    try {
      await performIssuerAdd({ name: "leak-test", home: tempHome, fromKey: keyPath });
    } catch (err) {
      expect((err as Error).message).not.toContain("0xSECRET_VALUE");
    }
  });
});

// ══════════════════════════════════════════════════════════════
// performIssuerRemove
// ══════════════════════════════════════════════════════════════

describe("performIssuerRemove", () => {
  test("removes existing issuer → status=removed", async () => {
    await writeIssuerFile("to-remove", { did: "z1Remove", pk: "0x04", name: "to-remove" });

    const result = await performIssuerRemove({ name: "to-remove", home: tempHome });
    expect(result.status).toBe("removed");
  });

  test("non-existent issuer → status=not-found (no error)", async () => {
    const result = await performIssuerRemove({ name: "ghost", home: tempHome });
    expect(result.status).toBe("not-found");
  });

  test("only deletes target file, others intact", async () => {
    await writeIssuerFile("keep", { did: "z1Keep", pk: "0x04keep", name: "keep" });
    await writeIssuerFile("delete-me", { did: "z1Del", pk: "0x04del", name: "delete-me" });

    await performIssuerRemove({ name: "delete-me", home: tempHome });

    const result = await performIssuerList({ home: tempHome });
    expect(result.total).toBe(1);
    expect(result.issuers[0]!.name).toBe("keep");
  });
});

// ══════════════════════════════════════════════════════════════
// performIssuerInspect
// ══════════════════════════════════════════════════════════════

describe("performIssuerInspect", () => {
  test("returns full info for existing issuer", async () => {
    await writeIssuerFile("inspect-me", {
      did: "z1Inspect",
      pk: "0x04insp",
      name: "Inspect Me",
      source: "manual",
      addedAt: "2025-06-15T12:00:00.000Z",
    });

    const result = await performIssuerInspect({ name: "inspect-me", home: tempHome });
    expect(result.name).toBe("inspect-me");
    expect(result.did).toBe("z1Inspect");
    expect(result.pk).toBe("0x04insp");
    expect(result.label).toBe("Inspect Me");
    expect(result.source).toBe("manual");
    expect(result.addedAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.filePath).toContain("inspect-me.did.json");
  });

  test("non-existent issuer → throws NOT_FOUND", async () => {
    try {
      await performIssuerInspect({ name: "ghost", home: tempHome });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).exitCode).toBe(1); // NOT_FOUND
    }
  });

  test("issuer file missing optional fields → returns undefined (no crash)", async () => {
    await writeIssuerFile("minimal", { did: "z1Min", pk: "0x04min", name: "Min" });

    const result = await performIssuerInspect({ name: "minimal", home: tempHome });
    expect(result.source).toBeUndefined();
    expect(result.addedAt).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// performIssuerAdd: --from-file (local)
// ══════════════════════════════════════════════════════════════

describe("performIssuerAdd --from-file (local)", () => {
  test("reads did+pk from local .did.json", async () => {
    const filePath = join(tempHome, "issuer.did.json");
    await writeKeyFile(filePath, { did: "z1FileDid", pk: "0x04file" });

    const result = await performIssuerAdd({
      name: "from-file-test",
      home: tempHome,
      fromFile: filePath,
    });

    expect(result.status).toBe("added");
    expect(result.did).toBe("z1FileDid");
    expect(result.pk).toBe("0x04file");
    expect(result.source).toBe("from-file");
  });

  test("local file not found → NOT_FOUND", async () => {
    try {
      await performIssuerAdd({
        name: "ff-missing",
        home: tempHome,
        fromFile: "/nonexistent.json",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).exitCode).toBe(1); // NOT_FOUND
    }
  });

  test("local file not valid JSON → RUNTIME_ERROR", async () => {
    const filePath = join(tempHome, "bad.json");
    await writeFile(filePath, "not json{{{");

    await expect(
      performIssuerAdd({ name: "ff-badjson", home: tempHome, fromFile: filePath }),
    ).rejects.toThrow("not valid JSON");
  });

  test("local file missing did → throws", async () => {
    const filePath = join(tempHome, "no-did.json");
    await writeKeyFile(filePath, { pk: "0x04" });

    await expect(
      performIssuerAdd({ name: "ff-nodid", home: tempHome, fromFile: filePath }),
    ).rejects.toThrow("missing 'did' field");
  });

  test("local file missing pk → throws", async () => {
    const filePath = join(tempHome, "no-pk.json");
    await writeKeyFile(filePath, { did: "z1Test" });

    await expect(
      performIssuerAdd({ name: "ff-nopk", home: tempHome, fromFile: filePath }),
    ).rejects.toThrow("missing 'pk' field");
  });

  test("local file with extra fields → ignored, only did+pk extracted", async () => {
    const filePath = join(tempHome, "extra.json");
    await writeKeyFile(filePath, {
      did: "z1Extra",
      pk: "0x04extra",
      sk: "0xSECRET",
      name: "Extra",
      extra: "ignored",
    });

    const result = await performIssuerAdd({
      name: "ff-extra",
      home: tempHome,
      fromFile: filePath,
    });

    expect(result.did).toBe("z1Extra");
    expect(result.pk).toBe("0x04extra");
    // sk should not leak
    const stored = JSON.parse(await readFile(join(issuersDir(), "ff-extra.did.json"), "utf-8"));
    expect(stored.sk).toBeUndefined();
  });

  // ── Mutual exclusion ──

  test("--from-file + --from-key → Conflicting source flags", async () => {
    await expect(
      performIssuerAdd({
        name: "conflict",
        home: tempHome,
        fromFile: "/some/file",
        fromKey: "/some/key",
      }),
    ).rejects.toThrow("Conflicting source flags");
  });

  test("--from-file + --did → Conflicting source flags", async () => {
    await expect(
      performIssuerAdd({
        name: "conflict2",
        home: tempHome,
        fromFile: "/some/file",
        did: "z1Test",
      }),
    ).rejects.toThrow("Conflicting source flags");
  });
});

// ══════════════════════════════════════════════════════════════
// performIssuerAdd: --from-file (URL)
// ══════════════════════════════════════════════════════════════

describe("performIssuerAdd --from-file (URL)", () => {
  test("HTTP non-localhost → rejected", async () => {
    await expect(
      performIssuerAdd({
        name: "http-test",
        home: tempHome,
        fromFile: "http://example.com/issuer.json",
      }),
    ).rejects.toThrow("Only HTTPS URLs supported");
  });

  // Note: actual HTTPS/localhost URL tests would require a mock HTTP server.
  // The logic is tested through the extractFromUrl function structure.
});

// ══════════════════════════════════════════════════════════════
// performIssuerAdd: --from-vc
// ══════════════════════════════════════════════════════════════

describe("performIssuerAdd --from-vc", () => {
  async function writeVcFile(fileName: string, vc: Record<string, unknown>): Promise<string> {
    const filePath = join(tempHome, fileName);
    await writeFile(filePath, JSON.stringify(vc));
    return filePath;
  }

  const selfDid = "z1SelfDid";

  test("single counter-sign proof → auto-extracts signer did+pk", async () => {
    const vcPath = await writeVcFile("vc-single.json", {
      credentialSubject: { id: selfDid },
      proof: [
        { signer: selfDid, pk: "0x04self" },
        { signer: "z2CounterSigner", pk: "0x04counter" },
      ],
    });

    const result = await performIssuerAdd({
      name: "vc-single",
      home: tempHome,
      fromVc: vcPath,
    });

    expect(result.did).toBe("z2CounterSigner");
    expect(result.pk).toBe("0x04counter");
    expect(result.source).toBe("from-vc");
  });

  test("--proof-index selects specific proof", async () => {
    const vcPath = await writeVcFile("vc-index.json", {
      credentialSubject: { id: selfDid },
      proof: [
        { signer: selfDid, pk: "0x04self" },
        { signer: "z2First", pk: "0x04first" },
        { signer: "z3Second", pk: "0x04second" },
      ],
    });

    const result = await performIssuerAdd({
      name: "vc-index",
      home: tempHome,
      fromVc: vcPath,
      proofIndex: 2,
    });

    expect(result.did).toBe("z3Second");
    expect(result.pk).toBe("0x04second");
  });

  test("VC file not found → NOT_FOUND", async () => {
    try {
      await performIssuerAdd({
        name: "vc-missing",
        home: tempHome,
        fromVc: "/nonexistent-vc.json",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).exitCode).toBe(1);
    }
  });

  test("VC with no proof → throws", async () => {
    const vcPath = await writeVcFile("vc-no-proof.json", {
      credentialSubject: { id: selfDid },
    });

    await expect(
      performIssuerAdd({ name: "vc-np", home: tempHome, fromVc: vcPath }),
    ).rejects.toThrow("No proof array in VC");
  });

  test("VC with only self-sign proof → throws", async () => {
    const vcPath = await writeVcFile("vc-self-only.json", {
      credentialSubject: { id: selfDid },
      proof: [{ signer: selfDid, pk: "0x04self" }],
    });

    await expect(
      performIssuerAdd({ name: "vc-so", home: tempHome, fromVc: vcPath }),
    ).rejects.toThrow("No counter-sign proof found in VC");
  });

  test("multiple counter-signers without --proof-index → throws with list", async () => {
    const vcPath = await writeVcFile("vc-multi.json", {
      credentialSubject: { id: selfDid },
      proof: [
        { signer: selfDid, pk: "0x04self" },
        { signer: "z2A", pk: "0x04a" },
        { signer: "z3B", pk: "0x04b" },
      ],
    });

    try {
      await performIssuerAdd({ name: "vc-multi", home: tempHome, fromVc: vcPath });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain("Multiple counter-sign proofs");
      expect((err as Error).message).toContain("--proof-index");
    }
  });

  test("--proof-index out of range → throws", async () => {
    const vcPath = await writeVcFile("vc-oor.json", {
      credentialSubject: { id: selfDid },
      proof: [
        { signer: selfDid, pk: "0x04self" },
        { signer: "z2A", pk: "0x04a" },
      ],
    });

    await expect(
      performIssuerAdd({ name: "vc-oor", home: tempHome, fromVc: vcPath, proofIndex: 5 }),
    ).rejects.toThrow("out of range");
  });

  test("1 self-sign + 1 counter-sign → auto-selects counter-sign", async () => {
    const vcPath = await writeVcFile("vc-auto.json", {
      credentialSubject: { id: selfDid },
      proof: [
        { signer: selfDid, pk: "0x04self" },
        { signer: "z2Auto", pk: "0x04auto" },
      ],
    });

    const result = await performIssuerAdd({
      name: "vc-auto",
      home: tempHome,
      fromVc: vcPath,
    });

    expect(result.did).toBe("z2Auto");
  });

  test("proof missing signer field → throws", async () => {
    const vcPath = await writeVcFile("vc-no-signer.json", {
      credentialSubject: { id: selfDid },
      proof: [{ pk: "0x04noSigner" }],
    });

    await expect(
      performIssuerAdd({ name: "vc-ns", home: tempHome, fromVc: vcPath }),
    ).rejects.toThrow("No counter-sign proof found");
  });

  // ── Mutual exclusion ──

  test("--from-vc + --from-file → Conflicting source flags", async () => {
    await expect(
      performIssuerAdd({
        name: "conflict-vc",
        home: tempHome,
        fromVc: "/some/vc.json",
        fromFile: "/some/file.json",
      }),
    ).rejects.toThrow("Conflicting source flags");
  });

  test("--from-vc + --did → Conflicting source flags", async () => {
    await expect(
      performIssuerAdd({
        name: "conflict-vc2",
        home: tempHome,
        fromVc: "/some/vc.json",
        did: "z1Test",
      }),
    ).rejects.toThrow("Conflicting source flags");
  });
});

// ══════════════════════════════════════════════════════════════
// Phase 2: bootstrap + reset
// ══════════════════════════════════════════════════════════════

describe("bootstrapTrustedIssuers", () => {
  test("seed list empty → no-op, returns { created: [], existing: [] }", async () => {
    const { bootstrapTrustedIssuers } = await import("@aigne/afs-trust");
    const result = await bootstrapTrustedIssuers(tempHome);
    expect(result.created).toEqual([]);
    expect(result.existing).toEqual([]);
  });

  test("second run → still no-op when seeds are empty", async () => {
    const { bootstrapTrustedIssuers } = await import("@aigne/afs-trust");
    await bootstrapTrustedIssuers(tempHome);
    const result = await bootstrapTrustedIssuers(tempHome);
    expect(result.created).toEqual([]);
    expect(result.existing).toEqual([]);
  });

  test("bootstrap directory already exists but empty → no error", async () => {
    await mkdir(issuersDir(), { recursive: true });
    const { bootstrapTrustedIssuers } = await import("@aigne/afs-trust");
    const result = await bootstrapTrustedIssuers(tempHome);
    expect(result.created).toEqual([]);
    expect(result.existing).toEqual([]);
  });
});

describe("performIssuerReset", () => {
  // ── Happy Path ──

  test("removes all source:'manual' issuers", async () => {
    await writeIssuerFile("my-manual", {
      did: "z1Manual",
      pk: "0x04m",
      name: "Manual Issuer",
      source: "manual",
    });
    await writeIssuerFile("my-manual2", {
      did: "z2Manual",
      pk: "0x04m2",
      name: "Another Manual",
      source: "manual",
    });

    const result = await performIssuerReset({ home: tempHome });
    expect(result.removed).toContain("my-manual");
    expect(result.removed).toContain("my-manual2");
    expect(result.removed).toHaveLength(2);
  });

  test("returns { removed: [...], restored: [...] }", async () => {
    await writeIssuerFile("to-remove", {
      did: "z1Remove",
      pk: "0x04r",
      name: "Remove Me",
      source: "manual",
    });

    const result = await performIssuerReset({ home: tempHome });
    expect(result).toHaveProperty("removed");
    expect(result).toHaveProperty("restored");
    expect(Array.isArray(result.removed)).toBe(true);
    expect(Array.isArray(result.restored)).toBe(true);
  });

  // ── Edge Cases ──

  test("source unknown (undefined) → don't delete", async () => {
    await writeIssuerFile("old-format", {
      did: "z1Old",
      pk: "0x04old",
      name: "Old Format",
      // no source field
    });

    const result = await performIssuerReset({ home: tempHome });
    expect(result.removed).toHaveLength(0);

    // File should still exist
    const content = await readFile(join(issuersDir(), "old-format.did.json"), "utf-8");
    expect(JSON.parse(content).did).toBe("z1Old");
  });

  test("seeds empty → only delete manual, no shipped to restore", async () => {
    await writeIssuerFile("manual-only", {
      did: "z1ManualOnly",
      pk: "0x04mo",
      name: "Manual Only",
      source: "manual",
    });

    const result = await performIssuerReset({ home: tempHome });
    expect(result.removed).toContain("manual-only");
    expect(result.restored).toHaveLength(0);
  });

  test("empty directory → no error", async () => {
    const result = await performIssuerReset({ home: tempHome });
    expect(result.removed).toHaveLength(0);
    expect(result.restored).toHaveLength(0);
  });

  // ── Data Damage ──

  test("does not delete non-.did.json files", async () => {
    const dir = issuersDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "README.md"), "# Trust Store");
    await writeIssuerFile("manual-del", {
      did: "z1Del",
      pk: "0x04d",
      name: "Delete Me",
      source: "manual",
    });

    await performIssuerReset({ home: tempHome });

    // README should still exist
    const readme = await readFile(join(dir, "README.md"), "utf-8");
    expect(readme).toBe("# Trust Store");
  });

  test("does not affect files outside issuers directory", async () => {
    const outsideFile = join(tempHome, ".afs", "other-config.json");
    await mkdir(join(tempHome, ".afs"), { recursive: true });
    await writeFile(outsideFile, '{"key": "value"}');

    await writeIssuerFile("manual-x", {
      did: "z1X",
      pk: "0x04x",
      name: "X",
      source: "manual",
    });

    await performIssuerReset({ home: tempHome });

    const content = await readFile(outsideFile, "utf-8");
    expect(JSON.parse(content).key).toBe("value");
  });
});
