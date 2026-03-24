/**
 * .did Dot Protocol convention tests.
 *
 * Verifies:
 * - read("/{path}/.did") returns identity summary { did, name }
 * - read("/{path}/.did/vc") returns full VC JSON
 * - No credential → .did returns { did: undefined, name }
 * - No credential → .did/vc throws AFSNotFoundError
 * - stat() works for .did paths (via read fallback)
 * - Unknown .did sub-paths → AFSNotFoundError
 */

import { describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import { AFSNotFoundError } from "../src/error.js";
import type { AFSModule } from "../src/type.js";

function createMockModule(name: string, credential?: Record<string, unknown>): AFSModule {
  return {
    name,
    description: `${name} test module`,
    accessMode: "readonly",
    credential,
    async stat(subpath: string) {
      if (subpath === "/") {
        return { data: { id: "/", path: "/", meta: { childrenCount: 0 } } };
      }
      throw new AFSNotFoundError(subpath);
    },
    async read(subpath: string) {
      if (subpath === "/") {
        return {
          data: {
            id: name,
            path: "/",
            content: `${name} root`,
            meta: { kind: "afs:directory", childrenCount: 0 },
          },
        };
      }
      throw new AFSNotFoundError(subpath);
    },
    async list() {
      return { data: [] };
    },
  } as unknown as AFSModule;
}

const mockCredential = {
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  type: ["VerifiableCredential", "AFSProviderCredential"],
  issuer: { id: "z1issuer" },
  credentialSubject: {
    id: "z1abc",
    provider: { name: "test-sqlite" },
  },
  proof: { signer: "z1issuer", pk: "base58pk", id: "uuid-1" },
};

describe(".did convention routing", () => {
  test("read /.did returns identity summary with package name from VC", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-sqlite", mockCredential), "/modules/sqlite");

    const result = await afs.read("/modules/sqlite/.did");
    expect(result.data).toBeDefined();
    const content = JSON.parse(result.data!.content as string);
    expect(content.did).toBe("z1abc");
    // BUG-3 fix: name should come from VC credentialSubject.provider.name, not module.name
    expect(content.name).toBe("test-sqlite");
    expect(result.data!.meta?.kind).toBe("afs:did");
  });

  test("read /.did/vc returns full VC", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-sqlite", mockCredential), "/modules/sqlite");

    const result = await afs.read("/modules/sqlite/.did/vc");
    expect(result.data).toBeDefined();
    const vc = JSON.parse(result.data!.content as string);
    expect(vc.type).toEqual(["VerifiableCredential", "AFSProviderCredential"]);
    expect(vc.credentialSubject.id).toBe("z1abc");
    expect(result.data!.meta?.kind).toBe("afs:credential");
  });

  test("no credential → .did returns { did: undefined, name }", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-fs"), "/modules/fs");

    const result = await afs.read("/modules/fs/.did");
    const content = JSON.parse(result.data!.content as string);
    expect(content.did).toBeUndefined();
    expect(content.name).toBe("test-fs");
  });

  test("no credential → .did/vc throws AFSNotFoundError", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-fs"), "/modules/fs");

    await expect(afs.read("/modules/fs/.did/vc")).rejects.toThrow(AFSNotFoundError);
  });

  test("stat /.did returns identity metadata", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-sqlite", mockCredential), "/modules/sqlite");

    const result = await afs.stat("/modules/sqlite/.did");
    expect(result.data).toBeDefined();
    expect(result.data!.meta?.kind).toBe("afs:did");
    // stat strips content
    expect((result.data as any).content).toBeUndefined();
  });

  test("stat /.did/vc returns credential metadata", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-sqlite", mockCredential), "/modules/sqlite");

    const result = await afs.stat("/modules/sqlite/.did/vc");
    expect(result.data).toBeDefined();
    expect(result.data!.meta?.kind).toBe("afs:credential");
  });

  test("/.did/pk → AFSNotFoundError (not exposed)", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-sqlite", mockCredential), "/modules/sqlite");

    await expect(afs.read("/modules/sqlite/.did/pk")).rejects.toThrow(AFSNotFoundError);
  });

  test("/.did/unknown → AFSNotFoundError", async () => {
    const afs = new AFS();
    await afs.mount(createMockModule("test-sqlite", mockCredential), "/modules/sqlite");

    await expect(afs.read("/modules/sqlite/.did/anything")).rejects.toThrow(AFSNotFoundError);
  });

  test("BUG-3: .did returns package name from VC, not mount-derived module.name", async () => {
    // Simulate: module.name = "config-json" (mount-derived), but VC has provider.name = "@aigne/afs-json"
    const credWithPackageName = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential", "AFSProviderCredential"],
      issuer: { id: "z1issuer" },
      credentialSubject: {
        id: "z1json",
        provider: { name: "@aigne/afs-json" },
      },
      proof: { signer: "z1issuer", pk: "base58pk", id: "uuid-2" },
    };
    const afs = new AFS();
    await afs.mount(createMockModule("config-json", credWithPackageName), "/config/json");

    const result = await afs.read("/config/json/.did");
    const content = JSON.parse(result.data!.content as string);
    expect(content.did).toBe("z1json");
    // Should be the package name from VC, NOT "config-json"
    expect(content.name).toBe("@aigne/afs-json");
  });

  test("BUG-3: .did falls back to module.name when VC has no provider/blocklet name", async () => {
    const credNoProviderName = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential"],
      issuer: { id: "z1issuer" },
      credentialSubject: { id: "z1bare" },
      proof: { signer: "z1issuer", pk: "base58pk", id: "uuid-3" },
    };
    const afs = new AFS();
    await afs.mount(createMockModule("fallback-name", credNoProviderName), "/modules/bare");

    const result = await afs.read("/modules/bare/.did");
    const content = JSON.parse(result.data!.content as string);
    expect(content.name).toBe("fallback-name");
  });

  test("BUG-3: .did reads blocklet name from VC credentialSubject.blocklet.name", async () => {
    const blockletCred = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential", "AFSBlockletCredential"],
      issuer: { id: "z1issuer" },
      credentialSubject: {
        id: "z1blocklet",
        blocklet: { name: "my-cool-agent" },
      },
      proof: { signer: "z1issuer", pk: "base58pk", id: "uuid-4" },
    };
    const afs = new AFS();
    await afs.mount(createMockModule("mount-name", blockletCred), "/agents/cool");

    const result = await afs.read("/agents/cool/.did");
    const content = JSON.parse(result.data!.content as string);
    expect(content.name).toBe("my-cool-agent");
  });
});
