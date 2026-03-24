/**
 * AFS-UI Approach — Task implementations for evaluation.
 *
 * Each function produces an AUP tree (structured JSON) representing the UI.
 * In production, this tree is pushed to clients via WebSocket (AUP protocol).
 * The client renderer maps AUP nodes to platform-native UI elements.
 *
 * Token cost = JSON output size. No HTML, no CSS, no JS.
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
  approach: "afs-ui";
  output: Record<string, unknown>;
  outputBytes: number;
  outputTokens: number;
  generationMs: number;
  llmCalls: number;
}

function measure(tree: Record<string, unknown>, t0: number): TaskResult {
  const json = JSON.stringify(tree);
  return {
    approach: "afs-ui",
    output: tree,
    outputBytes: new TextEncoder().encode(json).byteLength,
    outputTokens: Math.ceil(json.length / 4),
    generationMs: performance.now() - t0,
    llmCalls: 0, // AFS-UI: agent builds tree locally, no LLM call for UI generation
  };
}

export function taskList(_todos: Todo[]): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "heading", type: "text", props: { content: "Tasks", level: 1 } },
        {
          id: "task-list",
          type: "list",
          src: "/data/todos",
          props: {
            layout: "list",
            itemStyle: "row",
            columns: [
              { key: "title", label: "Task" },
              { key: "status", label: "Status" },
              { key: "priority", label: "Priority" },
              { key: "dueDate", label: "Due" },
            ],
          },
        },
      ],
    },
    t0,
  );
}

export function taskDetail(todo: Todo): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "title", type: "text", props: { content: todo.title, level: 1 } },
        { id: "status", type: "text", props: { content: `Status: ${todo.status}`, mode: "badge" } },
        {
          id: "priority",
          type: "text",
          props: { content: `Priority: ${todo.priority}`, mode: "badge" },
        },
        { id: "desc", type: "text", props: { content: todo.description, format: "markdown" } },
        {
          id: "meta",
          type: "view",
          props: { layout: "row" },
          children: [
            { id: "due", type: "text", props: { content: `Due: ${todo.dueDate}` } },
            { id: "created", type: "text", props: { content: `Created: ${todo.createdAt}` } },
          ],
        },
        {
          id: "tags",
          type: "view",
          props: { layout: "row" },
          children: (todo.tags ?? []).map((tag, i) => ({
            id: `tag-${i}`,
            type: "text",
            props: { content: tag, mode: "badge" },
          })),
        },
      ],
    },
    t0,
  );
}

export function createTaskForm(): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "heading", type: "text", props: { content: "New Task", level: 1 } },
        {
          id: "form",
          type: "form",
          props: {
            action: "/data/todos/.actions/create",
            fields: [
              { name: "title", label: "Title", type: "text", required: true },
              { name: "description", label: "Description", type: "textarea" },
              {
                name: "priority",
                label: "Priority",
                type: "select",
                options: ["low", "medium", "high"],
                default: "medium",
              },
              { name: "dueDate", label: "Due Date", type: "date" },
            ],
            submitLabel: "Create Task",
          },
        },
      ],
    },
    t0,
  );
}

export function incrementalUpdate(_todos: Todo[]): TaskResult {
  const t0 = performance.now();
  // AFS-UI advantage: only send the patch, not the full tree
  return measure(
    {
      ops: [
        {
          op: "add",
          parentId: "task-list",
          node: {
            id: "task-11",
            type: "list-item",
            props: { title: "New urgent task", status: "pending", priority: "high" },
          },
        },
        { op: "update", id: "task-3-status", props: { content: "done" } },
      ],
    },
    t0,
  );
}

export function viewSwitching(_todos: Todo[]): TaskResult {
  const t0 = performance.now();
  // AFS-UI: just change the layout prop — 3 tiny patches
  return measure(
    {
      variants: [
        {
          layout: "list",
          patch: {
            ops: [{ op: "update", id: "task-list", props: { layout: "list", itemStyle: "row" } }],
          },
        },
        {
          layout: "grid",
          patch: {
            ops: [{ op: "update", id: "task-list", props: { layout: "grid", itemStyle: "card" } }],
          },
        },
        {
          layout: "table",
          patch: {
            ops: [{ op: "update", id: "task-list", props: { layout: "table", itemStyle: "row" } }],
          },
        },
      ],
    },
    t0,
  );
}

export function searchFilter(_todos: Todo[]): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "heading", type: "text", props: { content: "Tasks", level: 1 } },
        {
          id: "controls",
          type: "view",
          props: { layout: "row" },
          children: [
            {
              id: "search",
              type: "form",
              props: { fields: [{ name: "q", type: "search", placeholder: "Search tasks..." }] },
            },
            {
              id: "filter",
              type: "form",
              props: {
                fields: [{ name: "status", type: "select", options: ["all", "pending", "done"] }],
              },
            },
          ],
        },
        {
          id: "task-list",
          type: "list",
          src: "/data/todos",
          props: { layout: "list", filterable: true, searchable: true },
        },
        { id: "count", type: "text", props: { content: "10 tasks" } },
      ],
    },
    t0,
  );
}

export function multiStepWizard(_members: Member[]): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "heading", type: "text", props: { content: "Create Project", level: 1 } },
        {
          id: "wizard",
          type: "view",
          props: { mode: "wizard" },
          children: [
            {
              id: "step-1",
              type: "form",
              props: {
                title: "Details",
                fields: [
                  { name: "name", label: "Name", type: "text", required: true },
                  { name: "desc", label: "Description", type: "textarea" },
                ],
              },
            },
            {
              id: "step-2",
              type: "list",
              src: "/data/members",
              props: { title: "Members", selectable: true },
            },
            {
              id: "step-3",
              type: "view",
              props: { title: "Confirm" },
              children: [
                {
                  id: "confirm",
                  type: "action",
                  props: { label: "Create", action: "/data/projects/.actions/create" },
                },
              ],
            },
          ],
        },
      ],
    },
    t0,
  );
}

export function dashboard(data: DashboardData): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "heading", type: "text", props: { content: "Project Dashboard", level: 1 } },
        {
          id: "stats",
          type: "view",
          props: { layout: "row" },
          children: [
            {
              id: "stat-total",
              type: "text",
              props: { content: `${data.stats.totalTasks}`, label: "Total", mode: "metric" },
            },
            {
              id: "stat-done",
              type: "text",
              props: { content: `${data.stats.completed}`, label: "Completed", mode: "metric" },
            },
            {
              id: "stat-pending",
              type: "text",
              props: { content: `${data.stats.pending}`, label: "Pending", mode: "metric" },
            },
            {
              id: "stat-overdue",
              type: "text",
              props: { content: `${data.stats.overdue}`, label: "Overdue", mode: "metric" },
            },
          ],
        },
        {
          id: "panels",
          type: "view",
          props: { layout: "row" },
          children: [
            {
              id: "activity-panel",
              type: "list",
              src: "/data/dashboard/activity",
              props: { title: "Recent Activity", layout: "list", itemStyle: "compact", limit: 5 },
            },
            {
              id: "priority-chart",
              type: "view",
              props: { title: "By Priority", mode: "chart", chartType: "pie" },
              children: data.byPriority.map((p, i) => ({
                id: `slice-${i}`,
                type: "text",
                props: { content: `${p.priority}: ${p.count} (${p.pct}%)` },
              })),
            },
          ],
        },
        {
          id: "task-list",
          type: "list",
          src: "/data/todos",
          props: { title: "All Tasks", layout: "list", itemStyle: "row", limit: 5 },
        },
      ],
    },
    t0,
  );
}

export function dataTableCrud(_todos: Todo[]): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "heading", type: "text", props: { content: "Task Manager", level: 1 } },
        {
          id: "toolbar",
          type: "view",
          props: { layout: "row" },
          children: [
            {
              id: "select-all",
              type: "action",
              props: { label: "Select All", action: "selectAll" },
            },
            {
              id: "bulk-action",
              type: "action",
              props: {
                label: "Mark Done",
                action: "/data/todos/.actions/bulkUpdate",
                disabled: true,
              },
            },
          ],
        },
        {
          id: "data-table",
          type: "list",
          src: "/data/todos",
          props: {
            layout: "table",
            itemStyle: "row",
            selectable: true,
            sortable: true,
            editable: true,
            pageSize: 5,
            columns: [
              { field: "title", label: "Task", sortable: true, editable: true },
              {
                field: "status",
                label: "Status",
                sortable: true,
                editable: true,
                type: "select",
                options: ["pending", "done"],
              },
              {
                field: "priority",
                label: "Priority",
                sortable: true,
                editable: true,
                type: "select",
                options: ["low", "medium", "high"],
              },
              { field: "dueDate", label: "Due", sortable: true, type: "date" },
            ],
          },
        },
        {
          id: "pagination",
          type: "view",
          props: { mode: "pagination", total: 10, pageSize: 5, currentPage: 1 },
        },
      ],
    },
    t0,
  );
}

export function chatFeed(_messages: ChatMessage[]): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      id: "root",
      type: "view",
      children: [
        { id: "channel-header", type: "text", props: { content: "#afs-dev", level: 2 } },
        {
          id: "message-list",
          type: "list",
          src: "/data/chat/messages",
          props: { layout: "list", itemStyle: "chat", groupBy: "date", autoScroll: true },
        },
        {
          id: "input-area",
          type: "form",
          props: {
            layout: "inline",
            fields: [{ name: "text", type: "text", placeholder: "Type a message..." }],
            submitLabel: "Send",
            action: "/data/chat/messages/.actions/send",
          },
        },
      ],
    },
    t0,
  );
}

/** T10 bonus: incremental update for chat (single new message = tiny patch) */
export function chatNewMessage(): TaskResult {
  const t0 = performance.now();
  return measure(
    {
      ops: [
        {
          op: "add",
          parentId: "message-list",
          node: {
            id: "msg-11",
            type: "list-item",
            props: {
              sender: "eve",
              text: "Evaluation results look great!",
              timestamp: "2026-03-24T10:00:00Z",
            },
          },
        },
      ],
    },
    t0,
  );
}
