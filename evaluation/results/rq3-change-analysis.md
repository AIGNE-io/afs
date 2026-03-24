# RQ3: Maintainability — Change Scenario Analysis

> Generated: 2026-03-24T22:03:49.990Z

## Summary

| Metric | AFS-UI | Baseline | Improvement |
|--------|--------|----------|-------------|
| Total files changed | 5 | 29 | 83% fewer |
| Total lines changed | 23 | 860 | 97% fewer |
| Distinct layers affected | 4 | 5 | 1 fewer |
| Cross-layer changes | 0/6 | 5/6 | — |

## Detailed Scenarios

### CS1: Add new data source

**Description:** Switch TODO storage from JSON file to SQLite database

| | AFS-UI | Baseline |
|---|---|---|
| Files changed | 1 | 4 |
| Lines changed | 1 | 80 |
| Layers affected | config | data, api, skill, ui |
| Description | Change mount URI in workspace config | New database adapter, API endpoint modifications, skill prompt update, template adjustments for different field names |

**AFS-UI change:**
```
# Before
uri = "json://fixtures/todos.json"

# After
uri = "sqlite://fixtures/todos.db"
```

**Baseline change:**
```
// New: db-adapter.ts (data layer)
// Modified: api/todos.ts (API endpoints)
// Modified: skills/todo-list.prompt (skill definition)
// Modified: templates/todo-list.html (field mapping)
```

---

### CS2: Change UI layout

**Description:** Switch task list from vertical list to kanban board (grouped by status)

| | AFS-UI | Baseline |
|---|---|---|
| Files changed | 1 | 2 |
| Lines changed | 3 | 120 |
| Layers affected | ui-tree | skill, ui |
| Description | Change AUP node props: layout and groupBy | Rewrite HTML template with column-based layout, add CSS for kanban styling, update skill prompt to generate new layout |

**AFS-UI change:**
```
// Before
{ type: "list", props: { layout: "list", itemStyle: "row" } }

// After
{ type: "list", props: { layout: "kanban", groupBy: "status" } }
```

**Baseline change:**
```
// Modified: skills/todo-list.prompt (new layout instructions)
// Rewritten: templates/todo-kanban.html (entirely new HTML+CSS)
```

---

### CS3: Add search/filter feature

**Description:** Add text search and status filter to the task list

| | AFS-UI | Baseline |
|---|---|---|
| Files changed | 1 | 3 |
| Lines changed | 12 | 85 |
| Layers affected | ui-tree | skill, api, ui |
| Description | Add search input + filter select as AUP form nodes above the list, enable filterable/searchable props on list | New skill for search, API endpoint for filtered queries, JavaScript for client-side filtering, updated HTML template |

**AFS-UI change:**
```
// Add to children (before task-list):
{ id: "search", type: "form", props: { fields: [
  { name: "q", type: "search", placeholder: "Search..." }
] } },
{ id: "filter", type: "form", props: { fields: [
  { name: "status", type: "select", options: ["all", "pending", "done"] }
] } },
// Update list props:
{ ...list, props: { ...list.props, filterable: true, searchable: true } }
```

**Baseline change:**
```
// New: skills/search-todos.prompt
// Modified: api/todos.ts (add ?q= and ?status= params)
// Modified: templates/todo-list.html (add JS filtering logic)
```

---

### CS4: Cross-platform (Web → CLI)

**Description:** Render the same TODO application in a terminal/CLI environment instead of a web browser

| | AFS-UI | Baseline |
|---|---|---|
| Files changed | 0 | 8 |
| Lines changed | 0 | 400 |
| Layers affected | none | ui, skill, renderer |
| Description | Zero changes — AUP tree is platform-agnostic. A CLI renderer maps AUP nodes to terminal output (already exists as a separate module). | Complete rewrite: HTML templates → terminal UI templates, skill prompts must generate text/ANSI instead of HTML, new rendering engine, interaction model changes from click to keyboard |

**AFS-UI change:**
```
// AUP tree is unchanged. CLI renderer:
// "text" node → console.log with ANSI formatting
// "list" node → table with column alignment
// "form" node → interactive prompts (inquirer-style)
// "action" node → keyboard shortcut binding
```

**Baseline change:**
```
// Rewrite all templates to terminal format
// Rewrite skills to output text instead of HTML
// New: cli-renderer.ts (terminal rendering engine)
// New: cli-interaction.ts (keyboard navigation)
// Modified: all 7 task templates
```

---

### CS5: Data schema change

**Description:** Rename 'dueDate' field to 'deadline' in the data model

| | AFS-UI | Baseline |
|---|---|---|
| Files changed | 1 | 5 |
| Lines changed | 2 | 25 |
| Layers affected | provider | data, api, skill, ui |
| Description | Update field mapping in the provider configuration (or add alias in provider). UI reads through AFS paths — field name is abstracted. | Update database queries, API response serialization, skill prompts referencing the field, and all HTML templates displaying the field |

**AFS-UI change:**
```
// In provider config or mapping:
// Map "deadline" → "dueDate" in AFS schema
// OR update the AUP tree column reference:
{ key: "deadline", label: "Due" }  // was: key: "dueDate"
```

**Baseline change:**
```
// Modified: db-adapter.ts (query field name)
// Modified: api/todos.ts (response mapping)
// Modified: skills/todo-list.prompt (field reference)
// Modified: templates/todo-list.html (display field)
// Modified: templates/todo-detail.html (display field)
```

---

### CS6: Add dark mode

**Description:** Support dark color theme across all views

| | AFS-UI | Baseline |
|---|---|---|
| Files changed | 1 | 7 |
| Lines changed | 5 | 150 |
| Layers affected | renderer | ui |
| Description | Update renderer theme configuration. AUP tree has no styling — all visual appearance is in the renderer's theme layer. | Every HTML template needs CSS custom properties or duplicate stylesheets, toggle logic in each template, persistent preference storage |

**AFS-UI change:**
```
// In renderer theme config:
themes: {
  light: { bg: "#fff", text: "#000", ... },
  dark: { bg: "#1a1a1a", text: "#e5e5e5", ... }
}
// Set: meta: { style: "dark" }  // in AUP render call
```

**Baseline change:**
```
// Modified: all 7 task templates (add dark mode CSS)
// New: dark-mode.css (duplicate of all styles)
// New: theme-toggle.js (dark mode switch)
// Modified: each template to include theme toggle
```

---

