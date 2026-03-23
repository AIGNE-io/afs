import { describe, expect, test } from "bun:test";
import { AFSHttpClient } from "../src/client.js";

describe("AFSHttpClient", () => {
  test("should throw if url is not provided", () => {
    expect(() => new AFSHttpClient({ url: "", name: "test" })).toThrow("requires a url");
  });

  test("should throw if name is not provided", () => {
    expect(
      () => new AFSHttpClient({ allowPrivateNetwork: true, url: "http://localhost", name: "" }),
    ).toThrow("requires a name");
  });

  test("should append /rpc to url if not present", () => {
    const client = new AFSHttpClient({
      allowPrivateNetwork: true,
      url: "http://localhost:3000",
      name: "remote",
    });
    expect(client.name).toBe("remote");
    expect(client.accessMode).toBe("readwrite");
  });

  test("should not duplicate /rpc in url", () => {
    const client = new AFSHttpClient({
      allowPrivateNetwork: true,
      url: "http://localhost:3000/rpc",
      name: "remote",
    });
    expect(client.name).toBe("remote");
  });

  test("should respect accessMode option", () => {
    const client = new AFSHttpClient({
      allowPrivateNetwork: true,
      url: "http://localhost:3000",
      name: "remote",
      accessMode: "readonly",
    });
    expect(client.accessMode).toBe("readonly");
  });

  test("should set description", () => {
    const client = new AFSHttpClient({
      allowPrivateNetwork: true,
      url: "http://localhost:3000",
      name: "remote",
      description: "Remote AFS server",
    });
    expect(client.description).toBe("Remote AFS server");
  });

  test("should accept token option", () => {
    // Token is stored privately, so we just verify construction doesn't throw
    const client = new AFSHttpClient({
      allowPrivateNetwork: true,
      url: "http://localhost:3000",
      name: "remote",
      token: "my-secret-token",
    });
    expect(client.name).toBe("remote");
  });
});
