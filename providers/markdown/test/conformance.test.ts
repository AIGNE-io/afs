/**
 * AFSMarkdown Provider Conformance Tests
 *
 * Uses the unified provider testing framework to verify
 * that AFSMarkdown conforms to the AFS provider interface contract.
 */
import { describe } from "bun:test";
import { AFSMarkdown } from "@aigne/afs-markdown";
import { runProviderTests } from "@aigne/afs-testing";
import { setupPlayground } from "./playground.js";

const SAMPLE_MD = `---
title: Test Document
author: Test Author
---

# Introduction

This is the introduction section.

## Getting Started

Follow these steps to get started.

### Prerequisites

You need Node.js installed.

## API Reference

Here is the API documentation.

\`\`\`typescript
const x = 1;
console.log(x);
\`\`\`

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |

[Link Text](https://example.com)
[Another Link](https://test.com)
`;

describe("AFSMarkdown Conformance", () => {
  runProviderTests({
    name: "AFSMarkdown",
    providerClass: AFSMarkdown,
    playground: setupPlayground,

    createProvider() {
      return new AFSMarkdown({ content: SAMPLE_MD, name: "markdown" });
    },

    // Tree-based structure declaration
    // The markdown provider exposes:
    //   /frontmatter, /toc (leaf files)
    //   /sections, /codeblocks, /tables, /links (directories)
    structure: {
      root: {
        name: "",
        children: [
          {
            name: "frontmatter",
            content: { title: "Test Document", author: "Test Author" },
          },
          {
            name: "toc",
            // toc content is an array — verify it's present but don't match exact shape
          },
          {
            name: "sections",
            children: [
              {
                name: "0",
                // Section 0 = "Introduction", has title, body, children
                children: [
                  {
                    name: "title",
                    content: "Introduction",
                  },
                  {
                    name: "body",
                    content: "This is the introduction section.",
                  },
                  {
                    name: "children",
                    children: [
                      {
                        name: "0",
                        // Getting Started
                        children: [
                          {
                            name: "title",
                            content: "Getting Started",
                          },
                          {
                            name: "body",
                            content: "Follow these steps to get started.",
                          },
                          {
                            name: "children",
                            children: [
                              {
                                name: "0",
                                // Prerequisites
                                children: [
                                  {
                                    name: "title",
                                    content: "Prerequisites",
                                  },
                                  {
                                    name: "body",
                                    content: "You need Node.js installed.",
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        name: "1",
                        // API Reference — no sub-children
                        children: [
                          {
                            name: "title",
                            content: "API Reference",
                          },
                          {
                            name: "body",
                            content: "Here is the API documentation.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            name: "codeblocks",
            children: [
              {
                name: "0",
                content: "const x = 1;",
              },
            ],
          },
          {
            name: "tables",
            children: [
              {
                name: "0",
                content: "Column A",
              },
            ],
          },
          {
            name: "links",
            children: [
              {
                name: "0",
                content: "Link Text",
              },
              {
                name: "1",
                content: "Another Link",
              },
            ],
          },
        ],
      },
    },

    // Write test cases — markdown only supports writing section titles and bodies
    writeCases: [
      {
        name: "should update section body",
        path: "/sections/0/body",
        payload: {
          content: "Updated introduction content.",
        },
        expected: {
          contentContains: "Updated introduction content.",
        },
      },
      {
        name: "should update section title",
        path: "/sections/0/title",
        payload: {
          content: "New Title",
        },
        expected: {
          content: "New Title",
        },
      },
    ],
  });
});
