import { beforeEach, describe, expect, test } from "bun:test";
import { AFS, type AFSModule } from "@aigne/afs";

/**
 * Helper: create a module that returns data with potentially sensitive fields.
 */
function createModuleWithData(
  name: string,
  data: Record<string, unknown>,
  opts?: {
    sensitiveFields?: string[];
    sensitivity?: "full" | "redacted";
  },
): AFSModule {
  return {
    name,
    accessMode: "readonly",
    sensitiveFields: opts?.sensitiveFields,
    sensitivity: opts?.sensitivity,
    stat: async (path: string) => ({
      data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
    }),
    read: async (path: string) => ({
      data: {
        id: path.split("/").pop() || name,
        path,
        content: data,
        meta: { kind: "data", ...data },
      },
    }),
  };
}

describe("Sensitive Field Masking", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  test("masks declared sensitive fields in content", async () => {
    const mod = createModuleWithData(
      "tesla",
      { latitude: 37.7749, longitude: -122.4194, vin: "5YJ3E1EA1NF123456", model: "Model 3" },
      { sensitiveFields: ["latitude", "longitude", "vin"], sensitivity: "redacted" },
    );
    await afs.mount(mod, "/tesla");

    const result = await afs.read("/tesla");
    expect(result.data!.content).toEqual({
      latitude: "[REDACTED]",
      longitude: "[REDACTED]",
      vin: "[REDACTED]",
      model: "Model 3",
    });
  });

  test("masks sensitive fields in meta", async () => {
    const mod = createModuleWithData(
      "tesla",
      { latitude: 37.7749, model: "Model 3" },
      { sensitiveFields: ["latitude"], sensitivity: "redacted" },
    );
    await afs.mount(mod, "/tesla");

    const result = await afs.read("/tesla");
    expect(result.data!.meta?.latitude).toBe("[REDACTED]");
    expect(result.data!.meta?.model).toBe("Model 3");
  });

  test("masks nested sensitive fields recursively", async () => {
    const mod = createModuleWithData(
      "device",
      {
        info: { mac: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.100", name: "switch-1" },
        status: "online",
      },
      { sensitiveFields: ["mac", "ip"], sensitivity: "redacted" },
    );
    await afs.mount(mod, "/device");

    const result = await afs.read("/device");
    const content = result.data!.content as Record<string, unknown>;
    const info = content.info as Record<string, unknown>;
    expect(info.mac).toBe("[REDACTED]");
    expect(info.ip).toBe("[REDACTED]");
    expect(info.name).toBe("switch-1");
    expect(content.status).toBe("online");
  });

  test("masks fields in arrays", async () => {
    const mod = createModuleWithData(
      "fleet",
      {
        vehicles: [
          { vin: "VIN1", model: "Model S" },
          { vin: "VIN2", model: "Model 3" },
        ],
      },
      { sensitiveFields: ["vin"], sensitivity: "redacted" },
    );
    await afs.mount(mod, "/fleet");

    const result = await afs.read("/fleet");
    const content = result.data!.content as Record<string, unknown>;
    const vehicles = content.vehicles as Array<Record<string, unknown>>;
    expect(vehicles[0]!.vin).toBe("[REDACTED]");
    expect(vehicles[0]!.model).toBe("Model S");
    expect(vehicles[1]!.vin).toBe("[REDACTED]");
    expect(vehicles[1]!.model).toBe("Model 3");
  });

  test("does NOT mask when sensitivity is 'full'", async () => {
    const mod = createModuleWithData(
      "tesla",
      { latitude: 37.7749, model: "Model 3" },
      { sensitiveFields: ["latitude"], sensitivity: "full" },
    );
    await afs.mount(mod, "/tesla");

    const result = await afs.read("/tesla");
    expect((result.data!.content as Record<string, unknown>).latitude).toBe(37.7749);
  });

  test("does NOT mask when sensitiveFields is empty", async () => {
    const mod = createModuleWithData(
      "tesla",
      { latitude: 37.7749, model: "Model 3" },
      { sensitiveFields: [], sensitivity: "redacted" },
    );
    await afs.mount(mod, "/tesla");

    const result = await afs.read("/tesla");
    expect((result.data!.content as Record<string, unknown>).latitude).toBe(37.7749);
  });

  test("does NOT mask when sensitiveFields is undefined", async () => {
    const mod = createModuleWithData("tesla", { latitude: 37.7749, model: "Model 3" });
    await afs.mount(mod, "/tesla");

    const result = await afs.read("/tesla");
    expect((result.data!.content as Record<string, unknown>).latitude).toBe(37.7749);
  });

  test("defaults to redacted when sensitivity is undefined but sensitiveFields set", async () => {
    const mod = createModuleWithData(
      "tesla",
      { latitude: 37.7749, model: "Model 3" },
      { sensitiveFields: ["latitude"] },
    );
    await afs.mount(mod, "/tesla");

    const result = await afs.read("/tesla");
    expect((result.data!.content as Record<string, unknown>).latitude).toBe("[REDACTED]");
  });

  test("does not mask null or undefined field values", async () => {
    const mod = createModuleWithData(
      "device",
      { serial_number: null, name: "NAS" },
      { sensitiveFields: ["serial_number"], sensitivity: "redacted" },
    );
    await afs.mount(mod, "/device");

    const result = await afs.read("/device");
    const content = result.data!.content as Record<string, unknown>;
    expect(content.serial_number).toBeNull();
  });

  test("masks sensitive fields in list() results (not just read)", async () => {
    const mod: AFSModule = {
      name: "tesla",
      accessMode: "readonly",
      sensitiveFields: ["latitude", "longitude", "native_latitude", "native_longitude"],
      sensitivity: "redacted",
      stat: async () => ({
        data: { id: "vehicles", path: "/", meta: { childrenCount: 1 } },
      }),
      read: async () => ({
        data: { id: "vehicles", path: "/", meta: { childrenCount: 1 } },
      }),
      list: async () => ({
        data: [
          {
            id: "mycar",
            path: "/mycar",
            content: {
              drive_state: {
                latitude: 37.77,
                longitude: -122.42,
                native_latitude: 37.7749,
                native_longitude: -122.4194,
                speed: 0,
              },
              vin: "5YJ3E1EA1NF123456",
            },
            meta: { kind: "vehicle" },
          },
        ],
      }),
    };
    await afs.mount(mod, "/tesla");

    const result = await afs.list("/tesla");
    const entry = result.data[0]!;
    const content = entry.content as Record<string, unknown>;
    const driveState = content.drive_state as Record<string, unknown>;

    // Nested sensitive fields should be masked
    expect(driveState.latitude).toBe("[REDACTED]");
    expect(driveState.longitude).toBe("[REDACTED]");
    expect(driveState.native_latitude).toBe("[REDACTED]");
    expect(driveState.native_longitude).toBe("[REDACTED]");
    // Non-sensitive fields preserved
    expect(driveState.speed).toBe(0);
    // vin is NOT in sensitiveFields for this test, so it's preserved
    expect(content.vin).toBe("5YJ3E1EA1NF123456");
  });

  test("list() masking works with nested objects at multiple levels", async () => {
    const mod: AFSModule = {
      name: "device",
      accessMode: "readonly",
      sensitiveFields: ["mac", "ip"],
      sensitivity: "redacted",
      stat: async () => ({
        data: { id: "devices", path: "/", meta: { childrenCount: 2 } },
      }),
      read: async () => ({
        data: { id: "devices", path: "/", meta: { childrenCount: 2 } },
      }),
      list: async () => ({
        data: [
          {
            id: "switch-1",
            path: "/switch-1",
            content: { info: { mac: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.1" }, name: "switch" },
            meta: { kind: "switch" },
          },
        ],
      }),
    };
    await afs.mount(mod, "/devices");

    const result = await afs.list("/devices");
    const content = result.data[0]!.content as Record<string, unknown>;
    const info = content.info as Record<string, unknown>;
    expect(info.mac).toBe("[REDACTED]");
    expect(info.ip).toBe("[REDACTED]");
    expect(content.name).toBe("switch");
  });
});
