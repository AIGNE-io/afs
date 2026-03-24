import { describe, expect, test } from "bun:test";
import { resolveEffectivePolicy } from "../src/policy.js";
import type { SecurityProfile } from "../src/type.js";

const profiles: Record<string, SecurityProfile> = {
  admin: {
    actionPolicy: "full",
    sensitivity: "full",
  },
  user: {
    actionPolicy: "standard",
    sensitiveFields: ["latitude", "longitude", "vin"],
    sensitivity: "redacted",
  },
  guest: {
    actionPolicy: "safe",
    accessMode: "readonly",
    blockedActions: ["unlock", "remote-start"],
    sensitiveFields: ["latitude", "longitude", "vin"],
    sensitivity: "redacted",
  },
};

describe("resolveEffectivePolicy", () => {
  test("string config returns base profile unchanged", () => {
    const result = resolveEffectivePolicy(profiles, "admin");
    expect(result).toEqual(profiles.admin as SecurityProfile);
  });

  test("config with profile only (no overrides) returns base", () => {
    const result = resolveEffectivePolicy(profiles, { profile: "user" });
    expect(result).toEqual(profiles.user as SecurityProfile);
  });

  test("throws on unknown profile name", () => {
    expect(() => resolveEffectivePolicy(profiles, "unknown")).toThrow(
      "Unknown security profile: unknown",
    );
    expect(() => resolveEffectivePolicy(profiles, { profile: "nope" })).toThrow(
      "Unknown security profile: nope",
    );
  });

  test("scalar overrides replace base values", () => {
    const result = resolveEffectivePolicy(profiles, {
      profile: "user",
      overrides: { actionPolicy: "safe", sensitivity: "full" },
    });
    expect(result.actionPolicy).toBe("safe");
    expect(result.sensitivity).toBe("full");
    // Unchanged fields preserved
    expect(result.sensitiveFields).toEqual(["latitude", "longitude", "vin"]);
  });

  test("blockedActions: union (user adds, cannot remove provider defaults)", () => {
    const result = resolveEffectivePolicy(profiles, {
      profile: "guest",
      overrides: { blockedActions: ["navigate", "unlock"] }, // unlock is duplicate
    });
    // Union of base ["unlock", "remote-start"] + override ["navigate", "unlock"]
    expect(result.blockedActions).toContain("unlock");
    expect(result.blockedActions).toContain("remote-start");
    expect(result.blockedActions).toContain("navigate");
    expect(result.blockedActions?.length).toBe(3); // deduplicated
  });

  test("sensitiveFields: union (user adds, cannot remove provider defaults)", () => {
    const result = resolveEffectivePolicy(profiles, {
      profile: "user",
      overrides: { sensitiveFields: ["odometer", "latitude"] }, // latitude is duplicate
    });
    expect(result.sensitiveFields).toContain("latitude");
    expect(result.sensitiveFields).toContain("longitude");
    expect(result.sensitiveFields).toContain("vin");
    expect(result.sensitiveFields).toContain("odometer");
    expect(result.sensitiveFields?.length).toBe(4);
  });

  test("allowedActions: replace (user override replaces base entirely)", () => {
    const base: Record<string, SecurityProfile> = {
      custom: {
        actionPolicy: "standard",
        allowedActions: ["honk", "flash"],
      },
    };
    const result = resolveEffectivePolicy(base, {
      profile: "custom",
      overrides: { allowedActions: ["charge-start"] },
    });
    expect(result.allowedActions).toEqual(["charge-start"]);
  });

  test("accessMode override replaces base", () => {
    const result = resolveEffectivePolicy(profiles, {
      profile: "guest",
      overrides: { accessMode: "readwrite" },
    });
    expect(result.accessMode).toBe("readwrite");
    // Other fields preserved
    expect(result.actionPolicy).toBe("safe");
    expect(result.blockedActions).toEqual(["unlock", "remote-start"]);
  });

  test("empty overrides object returns base unchanged", () => {
    const result = resolveEffectivePolicy(profiles, {
      profile: "admin",
      overrides: {},
    });
    expect(result).toEqual(profiles.admin as SecurityProfile);
  });

  test("blockedActions override on profile with no base blockedActions", () => {
    const result = resolveEffectivePolicy(profiles, {
      profile: "admin",
      overrides: { blockedActions: ["unlock"] },
    });
    expect(result.blockedActions).toEqual(["unlock"]);
  });

  test("sensitiveFields override on profile with no base sensitiveFields", () => {
    const result = resolveEffectivePolicy(profiles, {
      profile: "admin",
      overrides: { sensitiveFields: ["vin"] },
    });
    expect(result.sensitiveFields).toEqual(["vin"]);
  });
});
