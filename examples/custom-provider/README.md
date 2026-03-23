# AFS Custom Provider Example

Shows how to build your own AFS provider from scratch. This is the pattern for integrating **any** data source — APIs, databases, IoT devices, message queues, or anything else.

## What It Does

Implements a `BookProvider` that serves an in-memory book catalog through the standard AFS interface:

| Path | Operation | Description |
|------|-----------|-------------|
| `/` | `list` | List all books with metadata |
| `/` | `read` | Read the catalog summary |
| `/:id` | `read` | Read a specific book's details |
| `/.actions/search` | `exec` | Search books by title or author |

## Run

```bash
bun index.ts
```

## Expected Output

```
AFS Custom Provider Example

--- List /books ---
  book-1: The Pragmatic Programmer (1999)
  book-2: Designing Data-Intensive Applications (2017)
  book-3: Structure and Interpretation of Computer Programs (1996)

--- Read /books/book-2 ---
Designing Data-Intensive Applications
by Martin Kleppmann (2017)

The big ideas behind reliable, scalable systems.

--- Exec /.actions/search { query: 'pragmatic' } ---
  Found 1 result(s):
    book-1: The Pragmatic Programmer by David Thomas

--- Stat /books/book-1 ---
  meta: { title: "The Pragmatic Programmer", ... }

Done!
```

## Key Concepts

### Extending AFSBaseProvider

Every custom provider extends `AFSBaseProvider` and uses decorators to define route handlers:

```typescript
class BookProvider extends AFSBaseProvider {
  name = "book-catalog";
  description = "In-memory book catalog";
  override readonly accessMode = "readwrite" as const;

  @List("/")
  async listBooks() { ... }

  @Read("/:id")
  async readBook(ctx: RouteContext<{ id: string }>) { ... }

  @Actions.Exec("/", "search")
  async searchBooks(_ctx: RouteContext, args: { query: string }) { ... }
}
```

### Decorators

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@List(path)` | Handle `afs.list()` calls | `@List("/")` |
| `@Read(path)` | Handle `afs.read()` calls | `@Read("/:id")` |
| `@Actions.Exec(path, name)` | Handle `afs.exec()` calls | `@Actions.Exec("/", "search")` |

### Route Parameters

Dynamic path segments (`:id`) are available via `ctx.params`:

```typescript
@Read("/:id")
async readBook(ctx: RouteContext<{ id: string }>) {
  const book = this.books.get(ctx.params.id);
  // ...
}
```

### Action Arguments

`exec` handlers receive action arguments as the second parameter:

```typescript
@Actions.Exec("/", "search")
async searchBooks(_ctx: RouteContext, args: { query: string }) {
  const q = args.query.toLowerCase();
  // ...
}
```

The action is automatically available at `/.actions/search` — the decorator generates the full path.

### Access Mode

Providers default to `readonly`. If your provider has `exec` actions or supports `write`/`delete`, set `accessMode`:

```typescript
override readonly accessMode = "readwrite" as const;
```

## Adapt This Pattern

Replace the in-memory `Map` with any data source:

- **REST API** — `fetch()` in your handlers
- **Database** — query in handlers, return rows as entries
- **IoT device** — read sensor data, exec commands
- **Message queue** — list messages, exec to publish

The AFS interface stays the same for all consumers.

## Packages Used

- [`@aigne/afs`](../../packages/core) — Core AFS library (`AFSBaseProvider`, decorators, `RouteContext`)
