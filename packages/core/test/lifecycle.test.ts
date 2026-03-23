import { describe, expect, test } from "bun:test";
import { AFS, List, Read } from "@aigne/afs";
import { AFSBaseProvider } from "@aigne/afs/provider";

// A provider with all lifecycle methods
class FullLifecycleProvider extends AFSBaseProvider {
  name = "full-lifecycle";
  description = "Provider with all lifecycle methods";

  readyCalled = false;
  closeCalled = false;
  eventSinkReceived: unknown = undefined;
  secretCapReceived: unknown = undefined;

  async ready(): Promise<void> {
    this.readyCalled = true;
  }

  async close(): Promise<void> {
    this.closeCalled = true;
  }

  setEventSink(sink: any): void {
    this.eventSinkReceived = sink;
  }

  setSecretCapability(cap: any): void {
    this.secretCapReceived = cap;
  }

  @List("/")
  async listRoot() {
    return { data: [] };
  }

  @Read("/")
  async readRoot() {
    return { content: "hello" };
  }
}

// A provider with NO lifecycle methods
class MinimalProvider extends AFSBaseProvider {
  name = "minimal";
  description = "No lifecycle methods";

  @List("/")
  async listRoot() {
    return { data: [] };
  }

  @Read("/")
  async readRoot() {
    return { content: "minimal" };
  }
}

// A provider with only some lifecycle methods
class PartialProvider extends AFSBaseProvider {
  name = "partial";
  description = "Only setEventSink";

  eventSinkReceived: unknown = undefined;

  setEventSink(sink: any): void {
    this.eventSinkReceived = sink;
  }

  @List("/")
  async listRoot() {
    return { data: [] };
  }

  @Read("/")
  async readRoot() {
    return { content: "partial" };
  }
}

describe("Lifecycle interface", () => {
  test("provider with setEventSink receives sink on mount", async () => {
    const afs = new AFS();
    const provider = new FullLifecycleProvider();

    await afs.mount(provider, "/test");
    expect(provider.eventSinkReceived).not.toBeNull();
    expect(typeof provider.eventSinkReceived).toBe("function");
  });

  test("provider with setEventSink receives null on unmount", async () => {
    const afs = new AFS();
    const provider = new FullLifecycleProvider();

    await afs.mount(provider, "/test");
    expect(provider.eventSinkReceived).not.toBeNull();

    afs.unmount("/test");
    expect(provider.eventSinkReceived).toBeNull();
  });

  test("provider with NONE of lifecycle methods still works (backward compat)", async () => {
    const afs = new AFS();
    const provider = new MinimalProvider();

    await afs.mount(provider, "/test");
    // Should be able to list and read without lifecycle methods
    const listResult = await afs.list("/test");
    expect(listResult).toBeDefined();
  });

  test("provider with only some lifecycle methods: no error on missing ones", async () => {
    const afs = new AFS();
    const provider = new PartialProvider();

    // Should not throw even though close(), ready(), setSecretCapability() are missing
    await afs.mount(provider, "/test");
    expect(provider.eventSinkReceived).not.toBeNull();

    afs.unmount("/test");
    expect(provider.eventSinkReceived).toBeNull();
  });
});
