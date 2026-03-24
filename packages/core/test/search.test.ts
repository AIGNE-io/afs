import { expect, spyOn, test } from "bun:test";
import { AFS, type AFSModule } from "@aigne/afs";

test("AFS should search entries correctly", async () => {
  const module: AFSModule = {
    name: "test-module",
    stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
    search: async () => ({ data: [] }),
  };

  const afs = new AFS();
  await afs.mount(module);

  const searchSpy = spyOn(module, "search").mockResolvedValue({
    data: [
      { id: "foo", path: "/foo" },
      { id: "bar", path: "/bar" },
    ],
  });

  expect(await afs.search("/bar", "foo")).toMatchInlineSnapshot(`
    {
      "data": [],
      "message": "",
    }
  `);

  expect(await afs.search("/", "foo")).toMatchInlineSnapshot(`
    {
      "data": [
        {
          "id": "foo",
          "path": "/modules/test-module/foo",
        },
        {
          "id": "bar",
          "path": "/modules/test-module/bar",
        },
      ],
      "message": "",
    }
  `);

  expect(searchSpy.mock.lastCall).toMatchInlineSnapshot(`
    [
      "/",
      "foo",
      {},
    ]
  `);

  searchSpy.mockClear();
  expect(await afs.search("/foo/test-module/bar", "foo")).toMatchInlineSnapshot(`
    {
      "data": [],
      "message": "",
    }
  `);

  expect(searchSpy.mock.lastCall).toMatchInlineSnapshot(`undefined`);
});
