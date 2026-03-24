# AFS-UI Evaluation

Reproducible experiments comparing three UI generation paradigms for agent-driven applications. This evaluation accompanies the paper on AFS-UI (Agent UI Protocol).

## Quick Start

```bash
# From the repository root:
pnpm install

# Run all experiments
bun evaluation/scripts/run-all.ts

# Or run individually
bun evaluation/scripts/run-rq1.ts            # RQ1: Performance & Cost
bun evaluation/scripts/run-rq2.ts            # RQ2: Interoperability
bun evaluation/scripts/run-rq3.ts            # RQ3: Maintainability

# Model independence with real API calls (requires API keys)
ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... \
  bun evaluation/scripts/model-independence.ts --live
```

## Three Paradigms Under Comparison

| Paradigm | Mechanism | Output Format | Incremental Update |
|----------|-----------|---------------|-------------------|
| **AFS-UI** | Agent constructs AUP tree (structured JSON); client renderer maps nodes to native UI | JSON (AUP nodes) | Yes — `aup_patch` sends only changed nodes |
| **AFS-Markdown** | Agent generates Markdown text; client parses and renders | Markdown | No — full content re-generation |
| **Skills+API (Baseline)** | Agent generates complete HTML+CSS+JS per request via LLM skills | HTML+CSS+JS | No — full page re-generation |

### Why These Three?

- **AFS-UI** represents our proposed approach: a structured, protocol-driven UI layer where agents produce declarative trees instead of markup.
- **AFS-Markdown** represents a middle ground used by many LLM-based tools (e.g., ChatGPT artifacts, Copilot chat): structured enough to parse, but limited in interactivity.
- **Skills+API** represents the prevailing request-response generative UI paradigm where each interaction requires the LLM to produce complete presentation code.

---

## RQ1: Performance & Cost

**Question:** How efficient is AFS-UI in terms of token consumption compared to alternative paradigms?

**Method:** For each of 11 UI tasks, we measure the output size (bytes and estimated tokens) produced by each paradigm. Output size directly correlates with LLM completion token cost in production systems.

**Token estimation:** 1 token ≈ 4 characters (standard approximation for English text and JSON).

### Task Set

| ID | Task | Category | Description |
|----|------|----------|-------------|
| T1 | Task List | Display | Render 10 TODO items with status, priority, due date |
| T2 | Task Detail | Display | Show single task with all fields, tags, timestamps |
| T3 | Create Form | Input | Form with title, description, priority select, date picker |
| T4 | Incremental Update | Update | Add 1 task + change 1 status on existing list |
| T5 | View Switching | Layout | Toggle same data between list / grid / table views |
| T6 | Search & Filter | Interaction | Text search + status filter on task list |
| T7 | Multi-step Wizard | Workflow | 3-step project creation: details → members → confirm |
| T8 | Dashboard | Composite | Stats cards + activity feed + priority chart + task list |
| T9 | Data Table CRUD | Interaction | Sortable, paginated, editable table with bulk actions |
| T10 | Chat Feed | Real-time | Message list with sender info and timestamps |
| T10b | Chat New Message | Update | Append single new message to existing chat (incremental) |

### Token Measurement Methodology

Each task's cost includes **both input and output tokens**:

- **Input tokens** = system prompt (paradigm-specific instructions) + user prompt (task description + serialized data)
- **Output tokens** = the generated UI representation (AUP JSON / Markdown / HTML+CSS+JS)

System prompt sizes (one-time cost, amortized across tasks):

| Paradigm | System Prompt | Notes |
|----------|-------------:|-------|
| AFS-UI | 460 tokens | AUP node types, props, data binding, patch protocol |
| Markdown | 210 tokens | Formatting guidelines + limitations |
| Baseline | 305 tokens | HTML/CSS requirements, design tokens, interactivity rules |

AFS-UI has the **largest system prompt** because the AUP schema must be taught to the model. This is a real cost that is amortized across multiple interactions.

### Results: Full Cost (Input + Output)

| Task | AFS-UI | Markdown | Baseline | AFS-UI Savings |
|------|-------:|--------:|---------:|--------------:|
| | input / output / total | input / output / total | input / output / total | (total tokens) |
| T1 Task List | 1532 / 89 / 1621 | 1282 / 189 / 1471 | 1377 / 758 / 2135 | 24.1% |
| T2 Task Detail | 598 / 232 / 830 | 348 / 83 / 431 | 443 / 460 / 903 | 8.1% |
| T3 Create Form | 515 / 129 / 644 | 265 / 50 / 315 | 360 / 569 / 929 | 30.7% |
| T4 Incremental Update | 1546 / 57 / 1603 | 1296 / 198 / 1494 | 1391 / 758 / 2149 | 25.4% |
| T5 View Switching | 1537 / 89 / 1626 | 1287 / 467 / 1754 | 1382 / 2634 / 4016 | **59.5%** |
| T6 Search & Filter | 1537 / 147 / 1684 | 1287 / 120 / 1407 | 1382 / 888 / 2270 | 25.8% |
| T7 Multi-step Wizard | 616 / 161 / 777 | 366 / 90 / 456 | 461 / 1024 / 1485 | 47.7% |
| T8 Dashboard | 2005 / 307 / 2312 | 1755 / 187 / 1942 | 1850 / 889 / 2739 | 15.6% |
| T9 Data Table | 1566 / 261 / 1827 | 1316 / 227 / 1543 | 1411 / 1446 / 2857 | 36.1% |
| T10 Chat Feed | 941 / 117 / 1058 | 691 / 314 / 1005 | 786 / 1399 / 2185 | 51.6% |
| T10b Chat New Msg | 539 / 48 / 587 | 734 / 314 / 1048 | 829 / 1399 / 2228 | **73.7%** |
| **TOTAL** | **12932 / 1637 / 14569** | **10627 / 2239 / 12866** | **11672 / 12224 / 23896** | **39.0%** |

### Estimated Cost (Claude Sonnet: $3/M input, $15/M output)

| Paradigm | Input Cost | Output Cost | Total Cost | Savings vs Baseline |
|----------|----------:|------------:|-----------:|-------------------:|
| AFS-UI | $0.039 | $0.025 | **$0.063** | **71.0%** |
| Markdown | $0.032 | $0.034 | $0.065 | 70.0% |
| Baseline | $0.035 | $0.183 | $0.218 | — |

### Key Findings

1. **Total token savings: 39.0%** — When including input tokens, AFS-UI's advantage over the baseline is moderate (39%) rather than dramatic. The system prompt overhead (AUP schema) narrows the gap.

2. **Cost savings: 71.0%** — Since output tokens are 5× more expensive than input tokens, AFS-UI's output efficiency translates to significant cost savings despite having the largest input.

3. **AFS-UI vs Markdown: -13.2% tokens** — AFS-UI actually uses *more* total tokens than Markdown (because of the larger system prompt), but costs about the same ($0.063 vs $0.065) because its output is more compact.

4. **Incremental updates remain the strongest advantage** — T10b (chat new message) saves 73.7% of total tokens because AFS-UI sends only patch context (not full history) as input AND a tiny patch as output.

5. **View switching (T5) saves 59.5%** — Still significant: AFS-UI outputs 89 tokens (3 property patches) vs baseline's 2,634 tokens (3 full HTML pages).

6. **Markdown wins on simple display tasks** (T2, T3) where its minimal system prompt and brief output beat both alternatives. However, Markdown **cannot express interactive features** (forms, real-time updates, client-side filtering).

### Reproducing

```bash
bun evaluation/scripts/run-rq1.ts
# Output: results/rq1-tokens.csv, results/rq1-summary.json
```

Raw data: [`results/rq1-tokens.csv`](results/rq1-tokens.csv) | Summary: [`results/rq1-summary.json`](results/rq1-summary.json)

---

## RQ2: Interoperability

**Question:** To what extent does AFS-UI improve interoperability compared to alternative paradigms?

**Method:** Three substitution experiments measuring whether components can be swapped without code changes.

### Experiment 1: Data Source Substitution

The same UI code is used with 3 different data backends (JSON file, TOML file, local filesystem). Only the mount configuration changes; **zero UI code changes**.

| Data Source | AFS Provider | Items Found | UI Code Changes |
|-------------|-------------|-------------|-----------------|
| JSON file | `@aigne/afs-json` | 10 | **0 lines** |
| TOML file | `@aigne/afs-toml` | 10 | **0 lines** |
| Filesystem | `@aigne/afs-fs` | 10 | **0 lines** |

**What changes:** One line in the mount configuration:
```
uri = "json://fixtures/todos.json"  →  uri = "toml://fixtures/todos.toml"
```

### Experiment 2: Renderer Substitution

The same AUP tree is rendered to 3 different output targets. **Zero changes** to the AUP tree or agent logic.

| Renderer | Output Type | Output Size | AUP Tree Changes |
|----------|-------------|-------------|-----------------|
| Web (HTML) | HTML elements | 62 bytes | **0** |
| CLI (Text) | Terminal text | 28 bytes | **0** |
| API (JSON) | JSON passthrough | 206 bytes | **0** |

### Experiment 3: Model Independence

The same prompt is given to 3 different Claude models (Haiku, Sonnet, Opus) to generate an AUP tree. All produce valid, renderable output.

| Model | Valid AUP? | Output Tokens | Structural Notes |
|-------|-----------|---------------|-----------------|
| Claude Haiku | PASS | 98 | Props inline (non-standard but renderable) |
| Claude Sonnet | PASS | 91 | Props in `props` object (standard) |
| Claude Opus | PASS | 91 | Props in `props` object (standard) |

**Token variance: 7.7%** — The structured AUP schema constrains output, making model substitution seamless.

**Two verification modes:**
- **Simulated** (default): Uses pre-collected outputs. No API key needed.
- **Live** (`--live` flag): Makes real API calls for rigorous verification. Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`.

```bash
# Simulated (instant, no API key)
bun evaluation/scripts/model-independence.ts

# Live verification (requires API keys)
ANTHROPIC_API_KEY=sk-... bun evaluation/scripts/model-independence.ts --live
```

### Reproducing

```bash
bun evaluation/scripts/run-rq2.ts
# Output: results/rq2-substitution.csv, results/rq2-summary.json, results/rq2-model-independence.json
```

---

## RQ3: Maintainability

**Question:** How does the maintainability of AFS-UI compare to the Skills+API baseline?

**Method:** Six change scenarios applied to the TODO application. For each scenario, we analyze the number of files changed, lines of code modified, and architectural layers affected.

### Change Scenarios

| CS | Change | Category |
|----|--------|----------|
| CS1 | Add new data source (JSON → SQLite) | Data |
| CS2 | Change UI layout (list → kanban board) | UI |
| CS3 | Add search/filter feature | Feature |
| CS4 | Cross-platform (Web → CLI) | Platform |
| CS5 | Data schema change (rename field) | Schema |
| CS6 | Add dark mode theme | Style |

### Results

| CS | Change | AFS-UI | Baseline | Line Savings |
|----|--------|--------|----------|-------------|
| CS1 | Add data source | 1 file, 1 line | 4 files, 80 lines | 99% |
| CS2 | Change layout | 1 file, 3 lines | 2 files, 120 lines | 98% |
| CS3 | Add search/filter | 1 file, 12 lines | 3 files, 85 lines | 86% |
| CS4 | Cross-platform | **0 files, 0 lines** | 8 files, 400 lines | **100%** |
| CS5 | Schema change | 1 file, 2 lines | 5 files, 25 lines | 92% |
| CS6 | Add dark mode | 1 file, 5 lines | 7 files, 150 lines | 97% |
| **TOTAL** | | **5 files, 23 lines** | **29 files, 860 lines** | **97%** |

### Layer Isolation

| Metric | AFS-UI | Baseline |
|--------|--------|----------|
| Distinct layers affected | 4 | 5 |
| Cross-layer changes | **0 / 6** | **5 / 6** |

AFS-UI achieves **zero cross-layer changes** across all 6 scenarios. Each change is contained within a single architectural layer (config, UI tree, provider, or renderer). The baseline requires coordinated changes across data, API, skill, and UI layers in 5 out of 6 scenarios.

**CS4 (Cross-platform)** is the strongest demonstration: AFS-UI requires **literally zero code changes** to switch from web to CLI rendering because the AUP tree is platform-agnostic. The baseline requires rewriting all 7+ templates, skill prompts, and adding a new rendering engine (estimated 400 lines).

### Reproducing

```bash
bun evaluation/scripts/run-rq3.ts
# Output: results/rq3-change-analysis.md, results/rq3-summary.json
```

Detailed analysis with code examples: [`results/rq3-change-analysis.md`](results/rq3-change-analysis.md)

---

## Directory Structure

```
evaluation/
├── README.md                          # This file
├── package.json
├── tasks/
│   └── tasks.json                     # Machine-readable task definitions
├── fixtures/
│   ├── todos.json                     # Canonical TODO dataset (10 items + dashboard + chat)
│   └── todos.toml                     # Same data in TOML format
├── approaches/
│   ├── afs-ui/tasks.ts                # AFS-UI: AUP tree generation
│   ├── afs-markdown/tasks.ts          # Markdown: text generation
│   └── baseline-skills/tasks.ts       # Skills+API: HTML generation
├── scripts/
│   ├── setup-fixtures.ts              # Generate SQLite + FS fixtures from JSON
│   ├── run-rq1.ts                     # RQ1: Token consumption comparison
│   ├── run-rq2.ts                     # RQ2: Interoperability experiments
│   ├── run-rq3.ts                     # RQ3: Change scenario analysis
│   ├── model-independence.ts          # RQ2 Exp.3: Multi-model AUP generation
│   └── run-all.ts                     # Run everything
└── results/                           # Pre-computed baseline results
    ├── rq1-tokens.csv                 # Per-task token counts
    ├── rq1-summary.json               # RQ1 aggregate metrics
    ├── rq2-substitution.csv           # Data source / renderer results
    ├── rq2-summary.json               # RQ2 aggregate metrics
    ├── rq2-model-independence.csv     # Per-model validation results
    ├── rq2-model-independence.json    # Model independence details + prompts
    ├── rq3-change-analysis.md         # Detailed change scenario analysis
    └── rq3-summary.json              # RQ3 aggregate metrics
```

## Data

The evaluation uses a TODO project management scenario with:
- **10 TODO tasks** with title, description, status, priority, tags, due date
- **5 team members** with name and role
- **1 project** with member list
- **Dashboard data**: stats summary, activity feed, priority distribution
- **10 chat messages** between team members

All data is in [`fixtures/todos.json`](fixtures/todos.json). The same data is available in TOML format ([`fixtures/todos.toml`](fixtures/todos.toml)). SQLite and filesystem layouts are generated by `scripts/setup-fixtures.ts`.

## Extending

To add a new task:
1. Add task definition to `tasks/tasks.json`
2. Implement the task in all three files under `approaches/*/tasks.ts`
3. Add the task to the `tasks` array in `scripts/run-rq1.ts`
4. Run `bun evaluation/scripts/run-rq1.ts` to verify

To add a new LLM model for RQ2 Experiment 3:
1. Add the model to `anthropicModels` or `openaiModels` in `scripts/model-independence.ts`
2. Run with `--live` flag and the appropriate API key
