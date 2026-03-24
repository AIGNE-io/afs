import type { PlaygroundSetup } from "@aigne/afs-testing";
import { AFSUIProvider, createMockInputSource } from "@aigne/afs-ui";

export async function setupPlayground(_tempDir: string): Promise<PlaygroundSetup> {
  const inputSource = createMockInputSource([
    "test input",
    "test input",
    "test input",
    "test input",
    "test input",
  ]);

  const provider = new AFSUIProvider({
    backend: "tty",
    ttyOptions: {
      stdout: { write: () => true },
      inputSource,
    },
  });

  return {
    name: "AFSUI",
    mountPath: "/ui",
    provider,
    uri: "ui://tty",
    cleanup: async () => {},
  };
}
