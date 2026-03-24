import { expect, test } from "bun:test";
import { AFS, type AFSModule } from "@aigne/afs";

test("AFS should mount module correctly", async () => {
  const afs = new AFS();
  await afs.mount({
    name: "test-module",
    stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
  });

  expect([...afs["modules"].entries()]).toMatchInlineSnapshot(`
    [
      [
        "/modules/test-module",
        {
          "name": "test-module",
          "stat": [Function: AsyncFunction],
        },
      ],
    ]
  `);
});

test("AFS should list modules correctly", async () => {
  const module: AFSModule = {
    name: "test-module",
    description: "Test Module",
    stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
    list: async () => ({ data: [] }),
  };

  const afs = new AFS();
  await afs.mount(module);

  expect(
    (await afs.listModules()).map((i) => ({ ...i, module: undefined })),
  ).toMatchInlineSnapshot(`
    [
      {
        "description": "Test Module",
        "module": undefined,
        "name": "test-module",
        "namespace": null,
        "path": "/modules/test-module",
      },
    ]
  `);
});
