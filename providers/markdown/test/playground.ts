import { AFSMarkdown } from "@aigne/afs-markdown";
import type { PlaygroundSetup } from "@aigne/afs-testing";

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

export async function setupPlayground(_tempDir: string): Promise<PlaygroundSetup> {
  const provider = new AFSMarkdown({ content: SAMPLE_MD, name: "markdown" });

  return {
    name: "AFSMarkdown",
    mountPath: "/markdown",
    provider,
    uri: "markdown://inline",
    cleanup: async () => {},
  };
}
