/**
 * AFS-Markdown Approach — Task implementations for evaluation.
 *
 * Each function produces Markdown text that the client parses and renders.
 * No incremental update — every change requires full re-generation.
 * Limited interactivity (no forms, actions, real-time).
 *
 * Token cost = Markdown text size. Less verbose than HTML but more than JSON.
 */

interface Todo {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}
interface Member {
  id: string;
  name: string;
  role: string;
}
interface DashboardData {
  stats: Record<string, number>;
  activity: Array<{ id: number; user: string; action: string; target: string; timestamp: string }>;
  byPriority: Array<{ priority: string; count: number; pct: number }>;
}
interface ChatMessage {
  id: number;
  sender: string;
  text: string;
  timestamp: string;
}

interface TaskResult {
  approach: "afs-markdown";
  output: string;
  outputBytes: number;
  outputTokens: number;
  generationMs: number;
  llmCalls: number;
}

function measure(md: string, t0: number): TaskResult {
  return {
    approach: "afs-markdown",
    output: md,
    outputBytes: new TextEncoder().encode(md).byteLength,
    outputTokens: Math.ceil(md.length / 4),
    generationMs: performance.now() - t0,
    llmCalls: 1,
  };
}

export function taskList(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  let md =
    "# Tasks\n\n| # | Task | Status | Priority | Due |\n|---|------|--------|----------|-----|\n";
  for (const t of todos) {
    const s = t.status === "done" ? "~~" : "";
    md += `| ${t.id} | ${s}${t.title}${s} | ${t.status} | ${t.priority} | ${t.dueDate ?? "-"} |\n`;
  }
  return measure(md, t0);
}

export function taskDetail(todo: Todo): TaskResult {
  const t0 = performance.now();
  let md = `# ${todo.title}\n\n**Status:** ${todo.status} | **Priority:** ${todo.priority}\n\n${todo.description}\n\n`;
  md += `**Due:** ${todo.dueDate ?? "-"} | **Created:** ${todo.createdAt} | **Updated:** ${todo.updatedAt}\n\n`;
  if (todo.tags?.length) md += `**Tags:** ${todo.tags.map((t) => `\`${t}\``).join(" ")}\n`;
  return measure(md, t0);
}

export function createTaskForm(): TaskResult {
  const t0 = performance.now();
  return measure(
    `# New Task\n\nPlease provide:\n\n- **Title:** _(required)_\n- **Description:** _optional_\n- **Priority:** low / medium / high\n- **Due Date:** YYYY-MM-DD\n\n> Note: Markdown cannot render interactive forms.\n`,
    t0,
  );
}

export function incrementalUpdate(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  // Must regenerate entire list
  let md =
    "# Tasks (Updated)\n\n| # | Task | Status | Priority | Due |\n|---|------|--------|----------|-----|\n";
  for (const t of todos)
    md += `| ${t.id} | ${t.title} | ${t.status} | ${t.priority} | ${t.dueDate ?? "-"} |\n`;
  md += "\n_+ 1 new task added, 1 status changed_\n";
  return measure(md, t0);
}

export function viewSwitching(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  // Must generate all 3 views separately
  let md = "## List View\n\n";
  for (const t of todos)
    md += `- [${t.status === "done" ? "x" : " "}] **${t.title}** (${t.priority})\n`;
  md += "\n## Table View\n\n| ID | Title | Status | Priority | Due |\n|---|---|---|---|---|\n";
  for (const t of todos)
    md += `| ${t.id} | ${t.title} | ${t.status} | ${t.priority} | ${t.dueDate ?? "-"} |\n`;
  md += "\n## Card View\n\n";
  for (const t of todos)
    md += `### ${t.title}\n${t.status} | ${t.priority} | Due: ${t.dueDate ?? "-"}\n\n`;
  return { ...measure(md, t0), llmCalls: 3 };
}

export function searchFilter(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  let md =
    "# Tasks (filtered: status=pending)\n\n> No client-side filtering in Markdown.\n\n| # | Task | Priority | Due |\n|---|------|----------|-----|\n";
  for (const t of todos.filter((t) => t.status === "pending"))
    md += `| ${t.id} | ${t.title} | ${t.priority} | ${t.dueDate ?? "-"} |\n`;
  return measure(md, t0);
}

export function multiStepWizard(members: Member[]): TaskResult {
  const t0 = performance.now();
  let md =
    "# Create Project\n\n## Step 1: Details\n- **Name:** _(enter name)_\n- **Description:** _optional_\n\n## Step 2: Members\n";
  for (const m of members) md += `- [ ] ${m.name} (${m.role})\n`;
  md +=
    "\n## Step 3: Confirm\nReview and confirm.\n\n> Note: Markdown cannot implement wizard navigation or validation.\n";
  return measure(md, t0);
}

export function dashboard(data: DashboardData): TaskResult {
  const t0 = performance.now();
  let md = "# Project Dashboard\n\n";
  md += "## Stats\n\n";
  md += `| Total | Completed | Pending | Overdue |\n|-------|-----------|---------|----------|\n`;
  md += `| ${data.stats.totalTasks} | ${data.stats.completed} | ${data.stats.pending} | ${data.stats.overdue} |\n\n`;
  md += "## Priority Distribution\n\n";
  for (const p of data.byPriority) md += `- **${p.priority}**: ${p.count} (${p.pct}%)\n`;
  md += "\n## Recent Activity\n\n";
  for (const a of data.activity.slice(0, 5))
    md += `- **${a.user}** ${a.action} _${a.target}_ (${a.timestamp})\n`;
  md += "\n## Tasks\n\n| # | Task | Status | Priority |\n|---|------|--------|----------|\n";
  md += "> Full task list omitted — Markdown has no collapsible panels.\n";
  return measure(md, t0);
}

export function dataTableCrud(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  let md = "# Task Manager\n\n";
  md +=
    "> Markdown cannot implement: sortable columns, inline editing, pagination, row selection, or bulk actions.\n\n";
  md += "| # | Task | Status | Priority | Due |\n|---|------|--------|----------|-----|\n";
  for (const t of todos)
    md += `| ${t.id} | ${t.title} | ${t.status} | ${t.priority} | ${t.dueDate ?? "-"} |\n`;
  md += "\nShowing all 10 items (no pagination in Markdown).\n";
  return measure(md, t0);
}

export function chatFeed(messages: ChatMessage[]): TaskResult {
  const t0 = performance.now();
  let md = "# #afs-dev\n\n";
  for (const m of messages) md += `**${m.sender}** _(${m.timestamp})_\n${m.text}\n\n`;
  md +=
    "---\n> Type your message here: ___\n\n> Note: Markdown cannot implement real-time message push, typing indicators, or inline send.\n";
  return measure(md, t0);
}

export function chatNewMessage(messages: ChatMessage[]): TaskResult {
  // Must regenerate entire chat history
  return chatFeed(messages);
}
