/**
 * BookProvider Conformance Test
 *
 * Demonstrates how to use runProviderTests() to verify your custom
 * provider conforms to the AFS provider interface contract.
 *
 * Run:  bun test examples/custom-provider/conformance.test.ts
 */

import { describe } from "bun:test";
import { runProviderTests } from "@aigne/afs-testing";
import { BookProvider } from "./index.ts";

const sampleBooks = [
  {
    title: "The Pragmatic Programmer",
    author: "David Thomas",
    year: 1999,
    description: "From journeyman to master.",
  },
  {
    title: "Designing Data-Intensive Applications",
    author: "Martin Kleppmann",
    year: 2017,
    description: "The big ideas behind reliable, scalable systems.",
  },
];

describe("BookProvider Conformance", () => {
  runProviderTests({
    name: "BookProvider",

    createProvider() {
      return new BookProvider(sampleBooks);
    },

    structure: {
      root: {
        name: "",
        meta: { childrenCount: 2 },
        children: [
          {
            name: "book-1",
            content:
              "The Pragmatic Programmer\nby David Thomas (1999)\n\nFrom journeyman to master.",
          },
          {
            name: "book-2",
            content:
              "Designing Data-Intensive Applications\nby Martin Kleppmann (2017)\n\nThe big ideas behind reliable, scalable systems.",
          },
        ],
      },
    },

    async playground(_tempDir: string) {
      const provider = new BookProvider(sampleBooks);
      return {
        name: "BookProvider",
        mountPath: "/books",
        provider,
        cleanup: async () => {},
      };
    },
  });
});
