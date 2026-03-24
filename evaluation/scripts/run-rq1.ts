#!/usr/bin/env bun
/**
 * RQ1: Performance & Cost — Full token consumption comparison
 *
 * Measures BOTH input and output tokens for each paradigm:
 * - Input = system prompt + user prompt (task instruction + serialized data)
 * - Output = generated UI representation (AUP JSON / Markdown / HTML)
 *
 * Cost estimation uses Claude Sonnet pricing ($3/M input, $15/M output).
 *
 * Outputs:
 * - results/rq1-tokens.csv (per-task breakdown)
 * - results/rq1-summary.json (aggregated metrics)
 */

// biome-ignore lint/style/noRestrictedImports: evaluation script
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: evaluation script
import { join } from "node:path";
import * as afsMd from "../approaches/afs-markdown/tasks.js";
import * as afsUi from "../approaches/afs-ui/tasks.js";
import * as baselineSkills from "../approaches/baseline-skills/tasks.js";

const ROOT = join(import.meta.dirname!, "..");
const RESULTS = join(ROOT, "results");
mkdirSync(RESULTS, { recursive: true });

// ── Load data ──
const rawData = JSON.parse(readFileSync(join(ROOT, "fixtures/todos.json"), "utf-8"));
const userPrompts = JSON.parse(readFileSync(join(ROOT, "prompts/user-prompts.json"), "utf-8"));

// ── Load system prompts ──
const systemPrompts = {
  "afs-ui": readFileSync(join(ROOT, "prompts/afs-ui-system.md"), "utf-8"),
  "afs-markdown": readFileSync(join(ROOT, "prompts/markdown-system.md"), "utf-8"),
  "baseline-skills": readFileSync(join(ROOT, "prompts/baseline-system.md"), "utf-8"),
};

// ── Token counting ──
// Using cl100k_base approximation: ~4 chars per token for English/JSON
// For production accuracy, use tiktoken or the Anthropic token counter API
function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Build full input prompt for each task ──
function buildUserPrompt(taskId: string, approach: string): string {
  const taskDef = userPrompts[taskId];
  let prompt = taskDef.instruction;

  if (taskDef.data) {
    // Serialize relevant data into the prompt (same for all approaches)
    if (
      taskId === "T1" ||
      taskId === "T4" ||
      taskId === "T5" ||
      taskId === "T6" ||
      taskId === "T9"
    ) {
      prompt += `\n\nData:\n${JSON.stringify(rawData.todos, null, 2)}`;
    } else if (taskId === "T2") {
      prompt += `\n\nData:\n${JSON.stringify(rawData.todos[0], null, 2)}`;
    } else if (taskId === "T7") {
      prompt += `\n\nMembers:\n${JSON.stringify(rawData.members, null, 2)}`;
    } else if (taskId === "T8") {
      prompt += `\n\nDashboard data:\n${JSON.stringify(rawData.dashboard, null, 2)}`;
      prompt += `\n\nTasks:\n${JSON.stringify(rawData.todos, null, 2)}`;
    } else if (taskId === "T10") {
      prompt += `\n\nMessages:\n${JSON.stringify(rawData.chat.messages, null, 2)}`;
    } else if (taskId === "T10b") {
      // For incremental update:
      // AFS-UI: only needs the new message (patch context)
      // Others: need full message history for regeneration
      if (approach === "afs-ui") {
        prompt += `\n\nExisting chat is rendered. New message:\n${JSON.stringify({ sender: "eve", text: "Evaluation results look great!", timestamp: "2026-03-24T10:00:00Z" })}`;
      } else {
        prompt += `\n\nFull message history (must regenerate):\n${JSON.stringify(rawData.chat.messages, null, 2)}`;
        prompt += `\n\nNew message to append:\n${JSON.stringify({ sender: "eve", text: "Evaluation results look great!", timestamp: "2026-03-24T10:00:00Z" })}`;
      }
    }
  }

  return prompt;
}

// ── Cost calculation (Claude Sonnet pricing) ──
const INPUT_COST_PER_M = 3.0; // $/M tokens
const OUTPUT_COST_PER_M = 15.0; // $/M tokens

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
}

// ── Task runner ──
interface Row {
  taskId: string;
  taskName: string;
  approach: string;
  systemTokens: number;
  userPromptTokens: number;
  inputTokens: number; // system + user
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  generationMs: number;
  llmCalls: number;
}

const rows: Row[] = [];

const tasks = [
  { id: "T1", name: "task-list", run: (a: any) => a.taskList(rawData.todos) },
  { id: "T2", name: "task-detail", run: (a: any) => a.taskDetail(rawData.todos[0]) },
  { id: "T3", name: "create-form", run: (a: any) => a.createTaskForm() },
  { id: "T4", name: "incremental-update", run: (a: any) => a.incrementalUpdate(rawData.todos) },
  { id: "T5", name: "view-switching", run: (a: any) => a.viewSwitching(rawData.todos) },
  { id: "T6", name: "search-filter", run: (a: any) => a.searchFilter(rawData.todos) },
  { id: "T7", name: "multi-step-wizard", run: (a: any) => a.multiStepWizard(rawData.members) },
  { id: "T8", name: "dashboard", run: (a: any) => a.dashboard(rawData.dashboard) },
  { id: "T9", name: "data-table-crud", run: (a: any) => a.dataTableCrud(rawData.todos) },
  { id: "T10", name: "chat-feed", run: (a: any) => a.chatFeed(rawData.chat.messages) },
  { id: "T10b", name: "chat-new-msg", run: (a: any) => a.chatNewMessage(rawData.chat.messages) },
];

const approaches = [
  { name: "afs-ui", module: afsUi },
  { name: "afs-markdown", module: afsMd },
  { name: "baseline-skills", module: baselineSkills },
];

console.log("RQ1: Performance & Cost Evaluation (Input + Output Tokens)");
console.log("===========================================================\n");

// Show system prompt sizes
console.log("System prompt sizes (one-time cost, amortized across tasks):");
for (const [name, prompt] of Object.entries(systemPrompts)) {
  console.log(`  ${name.padEnd(20)} ${countTokens(prompt)} tokens (${prompt.length} chars)`);
}
console.log();

console.log(
  "Task              | Approach         | Input | Output | Total | Cost ($)  | Savings vs BL",
);
console.log(
  "------------------|------------------|-------|--------|-------|-----------|-------------",
);

for (const task of tasks) {
  const taskResults: Record<string, Row> = {};

  for (const approach of approaches) {
    const systemTokens = countTokens(systemPrompts[approach.name as keyof typeof systemPrompts]);
    const userPrompt = buildUserPrompt(task.id, approach.name);
    const userPromptTokens = countTokens(userPrompt);
    const inputTokens = systemTokens + userPromptTokens;

    const result = task.run(approach.module);
    const outputTokens = result.outputTokens;
    const totalTokens = inputTokens + outputTokens;
    const cost = estimateCost(inputTokens, outputTokens);

    const row: Row = {
      taskId: task.id,
      taskName: task.name,
      approach: approach.name,
      systemTokens,
      userPromptTokens,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd: cost,
      generationMs: result.generationMs,
      llmCalls: result.llmCalls ?? 1,
    };
    rows.push(row);
    taskResults[approach.name] = row;
  }

  const ui = taskResults["afs-ui"]!;
  const bl = taskResults["baseline-skills"]!;
  const totalSavings = ((1 - ui.totalTokens / bl.totalTokens) * 100).toFixed(1);

  for (const approach of approaches) {
    const r = taskResults[approach.name]!;
    const label = `${task.id} ${task.name}`;
    const savings = approach.name === "afs-ui" ? `${totalSavings}%` : "";
    console.log(
      `${label.padEnd(18)}| ${approach.name.padEnd(17)}| ${String(r.inputTokens).padStart(5)} | ${String(r.outputTokens).padStart(6)} | ${String(r.totalTokens).padStart(5)} | $${r.estimatedCostUsd.toFixed(5).padStart(8)} | ${savings}`,
    );
  }
}

// ── Aggregates ──
const byApproach = (name: string) => rows.filter((r) => r.approach === name);
const sum = (rs: Row[], key: keyof Row) => rs.reduce((s, r) => s + (r[key] as number), 0);

console.log(
  "------------------|------------------|-------|--------|-------|-----------|-------------",
);

for (const approach of approaches) {
  const rs = byApproach(approach.name);
  const input = sum(rs, "inputTokens");
  const output = sum(rs, "outputTokens");
  const total = sum(rs, "totalTokens");
  const cost = sum(rs, "estimatedCostUsd");
  const blTotal = sum(byApproach("baseline-skills"), "totalTokens");
  const savings =
    approach.name !== "baseline-skills" ? `${((1 - total / blTotal) * 100).toFixed(1)}%` : "—";
  console.log(
    `${"TOTAL".padEnd(18)}| ${approach.name.padEnd(17)}| ${String(input).padStart(5)} | ${String(output).padStart(6)} | ${String(total).padStart(5)} | $${cost.toFixed(5).padStart(8)} | ${savings}`,
  );
}

const uiTotal = sum(byApproach("afs-ui"), "totalTokens");
const mdTotal = sum(byApproach("afs-markdown"), "totalTokens");
const blTotal = sum(byApproach("baseline-skills"), "totalTokens");
const uiCost = sum(byApproach("afs-ui"), "estimatedCostUsd");
const mdCost = sum(byApproach("afs-markdown"), "estimatedCostUsd");
const blCost = sum(byApproach("baseline-skills"), "estimatedCostUsd");

console.log("\nSummary (input + output combined):");
console.log(`  AFS-UI total:    ${uiTotal} tokens, $${uiCost.toFixed(5)}`);
console.log(`  Markdown total:  ${mdTotal} tokens, $${mdCost.toFixed(5)}`);
console.log(`  Baseline total:  ${blTotal} tokens, $${blCost.toFixed(5)}`);
console.log(
  `\n  AFS-UI vs Baseline:  ${((1 - uiTotal / blTotal) * 100).toFixed(1)}% token savings, ${((1 - uiCost / blCost) * 100).toFixed(1)}% cost savings`,
);
console.log(`  AFS-UI vs Markdown:  ${((1 - uiTotal / mdTotal) * 100).toFixed(1)}% token savings`);

console.log("\nNote: Input tokens include system prompt (amortized) + user prompt (task + data).");
console.log("Output tokens = generated UI representation only.");
console.log(
  `Pricing: Claude Sonnet ($${INPUT_COST_PER_M}/M input, $${OUTPUT_COST_PER_M}/M output).`,
);

// ── Write CSV ──
let csv =
  "task_id,task_name,approach,system_tokens,user_prompt_tokens,input_tokens,output_tokens,total_tokens,estimated_cost_usd,generation_ms,llm_calls\n";
for (const r of rows) {
  csv += `${r.taskId},${r.taskName},${r.approach},${r.systemTokens},${r.userPromptTokens},${r.inputTokens},${r.outputTokens},${r.totalTokens},${r.estimatedCostUsd.toFixed(6)},${r.generationMs.toFixed(2)},${r.llmCalls}\n`;
}
writeFileSync(join(RESULTS, "rq1-tokens.csv"), csv);

// ── Write summary JSON ──
const summary = {
  generatedAt: new Date().toISOString(),
  taskCount: tasks.length,
  tokenEstimation: "~4 chars/token (cl100k_base approximation)",
  pricing: {
    model: "Claude Sonnet",
    inputPerMillion: INPUT_COST_PER_M,
    outputPerMillion: OUTPUT_COST_PER_M,
  },
  systemPromptTokens: Object.fromEntries(
    Object.entries(systemPrompts).map(([k, v]) => [k, { tokens: countTokens(v), chars: v.length }]),
  ),
  approaches: Object.fromEntries(
    approaches.map((a) => {
      const rs = byApproach(a.name);
      return [
        a.name,
        {
          totalInputTokens: sum(rs, "inputTokens"),
          totalOutputTokens: sum(rs, "outputTokens"),
          totalTokens: sum(rs, "totalTokens"),
          totalCostUsd: Number.parseFloat(sum(rs, "estimatedCostUsd").toFixed(6)),
          totalLlmCalls: sum(rs, "llmCalls"),
        },
      ];
    }),
  ),
  savings: {
    "afs-ui-vs-baseline": {
      tokenSavings: `${((1 - uiTotal / blTotal) * 100).toFixed(1)}%`,
      costSavings: `${((1 - uiCost / blCost) * 100).toFixed(1)}%`,
    },
    "afs-ui-vs-markdown": {
      tokenSavings: `${((1 - uiTotal / mdTotal) * 100).toFixed(1)}%`,
      costSavings: `${((1 - uiCost / mdCost) * 100).toFixed(1)}%`,
    },
    "markdown-vs-baseline": {
      tokenSavings: `${((1 - mdTotal / blTotal) * 100).toFixed(1)}%`,
      costSavings: `${((1 - mdCost / blCost) * 100).toFixed(1)}%`,
    },
  },
};
writeFileSync(join(RESULTS, "rq1-summary.json"), JSON.stringify(summary, null, 2));

console.log(`\nResults: ${RESULTS}/rq1-tokens.csv, rq1-summary.json`);
