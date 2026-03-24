/**
 * Baseline: Skills + API — Task implementations for evaluation.
 *
 * Each function produces complete HTML (the output an LLM would generate).
 * Every interaction = full HTML re-generation. No incremental updates.
 *
 * Token cost = full HTML + CSS + JS per page. Most verbose approach.
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
  approach: "baseline-skills";
  output: string;
  outputBytes: number;
  outputTokens: number;
  generationMs: number;
  llmCalls: number;
}

function measure(html: string, t0: number, llmCalls = 1): TaskResult {
  return {
    approach: "baseline-skills",
    output: html,
    outputBytes: new TextEncoder().encode(html).byteLength,
    outputTokens: Math.ceil(html.length / 4),
    generationMs: performance.now() - t0,
    llmCalls,
  };
}

const CSS_COMMON = `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px;background:#f5f5f5}h1{color:#1a1a1a;margin-bottom:16px}.card{background:white;border-radius:12px;padding:24px;max-width:640px;box-shadow:0 1px 3px rgba(0,0,0,.1)}.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:500}.badge-done{background:#d1fae5;color:#065f46}.badge-pending{background:#fef3c7;color:#92400e}.badge-high{background:#fee2e2;color:#991b1b}.badge-medium{background:#fef3c7;color:#92400e}.badge-low{background:#dbeafe;color:#1e40af}table{width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}th{background:#f8f9fa;padding:12px 16px;text-align:left;font-weight:600;border-bottom:2px solid #e5e7eb}td{padding:12px 16px;border-bottom:1px solid #f3f4f6}tr:hover{background:#f9fafb}`;

function wrap(title: string, body: string, extra = ""): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title><style>${CSS_COMMON}${extra}</style></head><body>${body}</body></html>`;
}

export function taskList(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  let rows = "";
  for (const t of todos)
    rows += `<tr><td>${t.id}</td><td>${t.title}</td><td><span class="badge badge-${t.status}">${t.status}</span></td><td><span class="badge badge-${t.priority}">${t.priority}</span></td><td>${t.dueDate ?? "-"}</td></tr>`;
  return measure(
    wrap(
      "Tasks",
      `<h1>Tasks</h1><table><thead><tr><th>#</th><th>Task</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table>`,
    ),
    t0,
  );
}

export function taskDetail(todo: Todo): TaskResult {
  const t0 = performance.now();
  const tags = todo.tags
    .map(
      (t) =>
        `<span style="background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:12px">${t}</span>`,
    )
    .join(" ");
  return measure(
    wrap(
      todo.title,
      `<div class="card"><h1>${todo.title}</h1><div><span class="badge badge-${todo.status}">${todo.status}</span> <span class="badge badge-${todo.priority}">${todo.priority}</span></div><p style="color:#374151;line-height:1.6;margin:16px 0">${todo.description}</p><p style="color:#6b7280;font-size:14px">Due: ${todo.dueDate ?? "-"} | Created: ${todo.createdAt} | Updated: ${todo.updatedAt}</p><div style="display:flex;gap:6px;margin-top:12px">${tags}</div></div>`,
    ),
    t0,
  );
}

export function createTaskForm(): TaskResult {
  const t0 = performance.now();
  const formCSS = `.field{margin-bottom:16px}label{display:block;margin-bottom:4px;font-weight:500;color:#374151}.required::after{content:" *";color:#ef4444}input[type="text"],input[type="date"],textarea,select{width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box}textarea{height:80px;resize:vertical}button{background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;margin-top:8px}button:hover{background:#2563eb}`;
  return measure(
    wrap(
      "New Task",
      `<div class="card"><h1>New Task</h1><form method="POST" action="/api/todos"><div class="field"><label class="required">Title</label><input type="text" name="title" required placeholder="Enter task title"></div><div class="field"><label>Description</label><textarea name="description" placeholder="Optional description"></textarea></div><div class="field"><label>Priority</label><select name="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div><div class="field"><label>Due Date</label><input type="date" name="dueDate"></div><button type="submit">Create Task</button></form></div>`,
      formCSS,
    ),
    t0,
  );
}

export function incrementalUpdate(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  // Must regenerate ENTIRE page
  return { ...taskList(todos), generationMs: performance.now() - t0 };
}

export function viewSwitching(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  // Must generate 3 separate full HTML pages
  const listHtml = taskList(todos).output;
  let gridHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:24px">`;
  for (const t of todos)
    gridHtml += `<div style="background:white;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)"><h3 style="margin:0 0 8px">${t.title}</h3><span class="badge badge-${t.status}">${t.status}</span> <span class="badge badge-${t.priority}">${t.priority}</span><p style="color:#6b7280;font-size:14px;margin:8px 0 0">Due: ${t.dueDate ?? "-"}</p></div>`;
  gridHtml += `</div>`;
  const fullGrid = wrap("Tasks - Grid", gridHtml);
  const combined = `${listHtml}\n${fullGrid}\n${taskList(todos).output}`;
  return measure(combined, t0, 3);
}

export function searchFilter(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  const base = taskList(todos).output;
  // Must add inline JS for client-side filtering
  const withJs = base.replace(
    "</body>",
    `<script>document.getElementById('search')?.addEventListener('input',function(e){var q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(q)?'':'none'})});document.getElementById('statusFilter')?.addEventListener('change',function(e){var s=e.target.value;document.querySelectorAll('tbody tr').forEach(function(r){if(s==='all'){r.style.display='';return}r.style.display=r.querySelector('.badge').textContent===s?'':'none'})})</script></body>`,
  );
  return measure(withJs, t0);
}

export function multiStepWizard(members: Member[]): TaskResult {
  const t0 = performance.now();
  const wizardCSS = `.wizard{background:white;border-radius:12px;padding:24px;max-width:560px;box-shadow:0 1px 3px rgba(0,0,0,.1)}.steps{display:flex;gap:8px;margin-bottom:24px}.step{flex:1;text-align:center;padding:8px;border-radius:6px;background:#f3f4f6;color:#6b7280;font-size:13px}.step.active{background:#3b82f6;color:white}.step.done{background:#d1fae5;color:#065f46}.panel{display:none}.panel.active{display:block}.field{margin-bottom:16px}label{display:block;margin-bottom:4px;font-weight:500}input,textarea{width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box}textarea{height:80px}.member-list{list-style:none;padding:0}.member-list li{padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f3f4f6}.member-list input[type="checkbox"]{width:auto}.nav{display:flex;justify-content:space-between;margin-top:24px}button{padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer;border:1px solid #d1d5db;background:white}button.primary{background:#3b82f6;color:white;border:none}`;
  const memberItems = members
    .map(
      (m) =>
        `<li><input type="checkbox" value="${m.id}"> ${m.name} <small>(${m.role})</small></li>`,
    )
    .join("");
  const body = `<div class="wizard"><h1>Create Project</h1><div class="steps"><div class="step active" id="si1">1. Details</div><div class="step" id="si2">2. Members</div><div class="step" id="si3">3. Confirm</div></div><div class="panel active" id="p1"><div class="field"><label>Project Name *</label><input type="text" id="pn" required></div><div class="field"><label>Description</label><textarea id="pd"></textarea></div><div class="nav"><span></span><button class="primary" onclick="go(2)">Next</button></div></div><div class="panel" id="p2"><ul class="member-list">${memberItems}</ul><div class="nav"><button onclick="go(1)">Back</button><button class="primary" onclick="go(3)">Next</button></div></div><div class="panel" id="p3"><p><strong>Project:</strong> <span id="sn"></span></p><p><strong>Members:</strong> <span id="sm"></span></p><div class="nav"><button onclick="go(2)">Back</button><button class="primary" onclick="alert('Created!')">Create</button></div></div></div><script>function go(n){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));document.querySelectorAll('.step').forEach(s=>s.classList.remove('active','done'));document.getElementById('p'+n).classList.add('active');document.getElementById('si'+n).classList.add('active');for(let i=1;i<n;i++)document.getElementById('si'+i).classList.add('done');if(n===3){document.getElementById('sn').textContent=document.getElementById('pn').value;document.getElementById('sm').textContent=document.querySelectorAll('.member-list input:checked').length+' selected'}}</script>`;
  return measure(wrap("Create Project", body, wizardCSS), t0);
}

export function dashboard(data: DashboardData): TaskResult {
  const t0 = performance.now();
  const dashCSS = `.dashboard{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}.stat-card{background:white;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}.stat-card h3{margin:0;font-size:28px;color:#1a1a1a}.stat-card p{margin:4px 0 0;color:#6b7280;font-size:13px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}.panel{background:white;border-radius:8px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}.panel h2{margin:0 0 12px;font-size:16px}.activity-item{padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}.activity-user{font-weight:600}.activity-time{color:#9ca3af;font-size:12px}`;
  let statsHtml = "";
  for (const [label, value] of [
    ["Total", data.stats.totalTasks],
    ["Completed", data.stats.completed],
    ["Pending", data.stats.pending],
    ["Overdue", data.stats.overdue],
  ]) {
    statsHtml += `<div class="stat-card"><h3>${value}</h3><p>${label}</p></div>`;
  }
  let activityHtml = "";
  for (const a of data.activity.slice(0, 5)) {
    activityHtml += `<div class="activity-item"><span class="activity-user">${a.user}</span> ${a.action} <em>${a.target}</em> <span class="activity-time">${a.timestamp}</span></div>`;
  }
  let chartHtml = "";
  for (const p of data.byPriority) {
    chartHtml += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><div style="width:${p.pct * 2}px;height:20px;background:#3b82f6;border-radius:4px"></div><span>${p.priority}: ${p.count} (${p.pct}%)</span></div>`;
  }
  const body = `<h1>Project Dashboard</h1><div class="dashboard">${statsHtml}</div><div class="panels"><div class="panel"><h2>Recent Activity</h2>${activityHtml}</div><div class="panel"><h2>By Priority</h2>${chartHtml}</div></div>`;
  return measure(wrap("Dashboard", body, dashCSS), t0);
}

export function dataTableCrud(todos: Todo[]): TaskResult {
  const t0 = performance.now();
  const tableCSS = `.toolbar{display:flex;gap:8px;margin-bottom:16px;align-items:center}.toolbar button{padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;font-size:13px}.toolbar button.primary{background:#3b82f6;color:white;border:none}.toolbar button:disabled{opacity:.5;cursor:not-allowed}th.sortable{cursor:pointer;user-select:none}th.sortable:hover{background:#f3f4f6}th.sortable::after{content:" ↕";color:#9ca3af}.edit-btn{padding:2px 8px;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer;font-size:12px}.pagination{display:flex;justify-content:center;gap:4px;margin-top:16px}.pagination button{padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;background:white;cursor:pointer}.pagination button.active{background:#3b82f6;color:white;border-color:#3b82f6}input[type="checkbox"]{width:16px;height:16px}`;
  let rows = "";
  for (const t of todos) {
    rows += `<tr><td><input type="checkbox" data-id="${t.id}"></td><td>${t.title}</td><td><span class="badge badge-${t.status}">${t.status}</span></td><td><span class="badge badge-${t.priority}">${t.priority}</span></td><td>${t.dueDate ?? "-"}</td><td><button class="edit-btn" onclick="editRow(${t.id})">Edit</button></td></tr>`;
  }
  const body = `<h1>Task Manager</h1><div class="toolbar"><label><input type="checkbox" id="selectAll" onchange="toggleAll()"> Select All</label><button class="primary" id="bulkBtn" disabled onclick="bulkUpdate()">Mark Done</button></div><table><thead><tr><th></th><th class="sortable" onclick="sort('title')">Task</th><th class="sortable" onclick="sort('status')">Status</th><th class="sortable" onclick="sort('priority')">Priority</th><th class="sortable" onclick="sort('dueDate')">Due</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table><div class="pagination"><button>←</button><button class="active">1</button><button>2</button><button>→</button></div><script>function toggleAll(){var c=document.getElementById('selectAll').checked;document.querySelectorAll('tbody input[type=checkbox]').forEach(function(x){x.checked=c});document.getElementById('bulkBtn').disabled=!c}function sort(col){alert('Sort by '+col)}function editRow(id){alert('Edit row '+id)}function bulkUpdate(){alert('Bulk update')}</script>`;
  return measure(wrap("Task Manager", body, tableCSS), t0);
}

export function chatFeed(messages: ChatMessage[]): TaskResult {
  const t0 = performance.now();
  const chatCSS = `.chat-container{max-width:640px;margin:0 auto;display:flex;flex-direction:column;height:80vh}.channel-header{background:white;padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:16px}.messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#f9fafb}.msg{display:flex;gap:8px;align-items:flex-start}.avatar{width:32px;height:32px;border-radius:50%;background:#3b82f6;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex-shrink:0}.msg-body{flex:1}.msg-header{display:flex;gap:8px;align-items:baseline}.msg-sender{font-weight:600;font-size:14px}.msg-time{color:#9ca3af;font-size:12px}.msg-text{margin:2px 0 0;font-size:14px;line-height:1.5}.date-sep{text-align:center;color:#9ca3af;font-size:12px;margin:8px 0;padding:4px 0;border-bottom:1px solid #e5e7eb}.input-area{display:flex;gap:8px;padding:12px 16px;background:white;border-top:1px solid #e5e7eb}input[type="text"]{flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px}button.send{background:#3b82f6;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px}`;
  let msgHtml = "";
  for (const m of messages) {
    const initial = m.sender[0].toUpperCase();
    msgHtml += `<div class="msg"><div class="avatar">${initial}</div><div class="msg-body"><div class="msg-header"><span class="msg-sender">${m.sender}</span><span class="msg-time">${m.timestamp}</span></div><p class="msg-text">${m.text}</p></div></div>`;
  }
  const body = `<div class="chat-container"><div class="channel-header">#afs-dev</div><div class="messages">${msgHtml}</div><div class="input-area"><input type="text" placeholder="Type a message..."><button class="send" onclick="send()">Send</button></div></div><script>function send(){var i=document.querySelector('input[type=text]');if(i.value.trim()){alert('Send: '+i.value);i.value=''}}</script>`;
  return measure(wrap("Chat — #afs-dev", body, chatCSS), t0);
}

export function chatNewMessage(messages: ChatMessage[]): TaskResult {
  // Baseline: must regenerate ENTIRE chat page for one new message
  return chatFeed(messages);
}
