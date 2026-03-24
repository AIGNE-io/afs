/**
 * AFS Custom Provider Example
 *
 * Shows how to build a provider that exposes in-memory data as an
 * AFS-compatible filesystem, complete with conformance test support.
 *
 * Run:     bun examples/custom-provider/index.ts
 * Test:    bun test examples/custom-provider/
 */

import {
  Actions,
  AFS,
  AFSBaseProvider,
  AFSNotFoundError,
  Explain,
  List,
  Meta,
  Read,
  type RouteContext,
  Stat,
} from "@aigne/afs";

// ── Define a custom provider ──────────────────────────────────────────

interface BookRecord {
  title: string;
  author: string;
  year: number;
  description: string;
}

/**
 * A minimal AFS provider that serves an in-memory book catalog.
 *
 * Path structure:
 *   /                    → list all books (directory)
 *   /:id                 → read a specific book (leaf)
 *   /.actions/search     → search by author or title
 *   /.meta               → provider metadata
 */
export class BookProvider extends AFSBaseProvider {
  name = "book-catalog";
  description = "In-memory book catalog";
  override readonly accessMode = "readwrite" as const;

  private books: Map<string, BookRecord>;

  constructor(books: BookRecord[]) {
    super();
    this.books = new Map(books.map((b, i) => [`book-${i + 1}`, b]));
  }

  // ── List ──

  @List("/")
  async listBooks() {
    const data = Array.from(this.books.entries()).map(([id, book]) =>
      this.buildEntry(`/${id}`, {
        content: `${book.title} by ${book.author}`,
        meta: { title: book.title, author: book.author, year: book.year },
      }),
    );
    return { data };
  }

  @List("/:id")
  async listBook(ctx: RouteContext<{ id: string }>) {
    const book = this.books.get(ctx.params.id);
    if (!book) throw new AFSNotFoundError(ctx.path);
    // Leaf nodes have no children
    return { data: [] };
  }

  // ── Read ──

  @Read("/")
  async readRoot() {
    return this.buildEntry("/", {
      content: `Book catalog with ${this.books.size} books. Use list to browse.`,
      meta: { childrenCount: this.books.size },
    });
  }

  @Read("/:id")
  async readBook(ctx: RouteContext<{ id: string }>) {
    const book = this.books.get(ctx.params.id);
    if (!book) throw new AFSNotFoundError(ctx.path);
    return this.buildEntry(ctx.path, {
      content: `${book.title}\nby ${book.author} (${book.year})\n\n${book.description}`,
      meta: { title: book.title, author: book.author, year: book.year },
    });
  }

  // ── Meta ──

  @Meta("/")
  async metaRoot() {
    return this.buildEntry("/.meta", {
      meta: { catalog: "books", totalBooks: this.books.size, childrenCount: this.books.size },
    });
  }

  @Meta("/:id")
  async metaBook(ctx: RouteContext<{ id: string }>) {
    const book = this.books.get(ctx.params.id);
    if (!book) throw new AFSNotFoundError(ctx.path);
    // ctx.path is already "/:id/.meta" (the @Meta decorator appends /.meta)
    return this.buildEntry(ctx.path, {
      meta: { title: book.title, author: book.author, year: book.year },
    });
  }

  // ── Stat ──

  @Stat("/")
  async statRoot() {
    return {
      data: {
        path: "/",
        meta: { childrenCount: this.books.size },
        size: 0,
      },
    };
  }

  @Stat("/:id")
  async statBook(ctx: RouteContext<{ id: string }>) {
    const book = this.books.get(ctx.params.id);
    if (!book) throw new AFSNotFoundError(ctx.path);
    const content = `${book.title}\nby ${book.author} (${book.year})\n\n${book.description}`;
    return {
      data: {
        path: ctx.path,
        meta: { title: book.title, author: book.author, year: book.year },
        size: content.length,
      },
    };
  }

  // ── Capabilities ──

  @Read("/.meta/.capabilities")
  async readCapabilities() {
    return {
      id: "/.meta/.capabilities",
      path: "/.meta/.capabilities",
      content: {
        operations: this.getOperationsDeclaration(),
      },
      meta: { kind: "afs:capabilities" },
    };
  }

  // ── Explain ──

  @Explain("/")
  async explainRoot() {
    const titles = Array.from(this.books.values())
      .map((b) => `- ${b.title} (${b.year})`)
      .join("\n");
    return {
      format: "markdown" as const,
      content: `# Book Catalog\n\n${this.books.size} books available:\n\n${titles}`,
    };
  }

  @Explain("/:id")
  async explainBook(ctx: RouteContext<{ id: string }>) {
    const book = this.books.get(ctx.params.id);
    if (!book) throw new AFSNotFoundError(ctx.path);
    return {
      format: "markdown" as const,
      content: `# ${book.title}\n\nBy ${book.author} (${book.year})\n\n${book.description}`,
    };
  }

  // ── Actions ──

  @Actions.Exec("/", "search")
  async searchBooks(_ctx: RouteContext, args: { query: string }) {
    const q = (args.query || "").toLowerCase();
    const matches = Array.from(this.books.entries())
      .filter(([, b]) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
      .map(([id, b]) => ({ id, title: b.title, author: b.author }));
    return { data: { results: matches, total: matches.length } };
  }
}

// ── Use the provider ──────────────────────────────────────────────────

console.log("AFS Custom Provider Example\n");

const afs = new AFS();

// Create and mount the provider
const books = new BookProvider([
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
  {
    title: "Structure and Interpretation of Computer Programs",
    author: "Harold Abelson",
    year: 1996,
    description: "The wizard book.",
  },
]);

await afs.mount(books, "/books");

// List all books
console.log("--- List /books ---");
const { data: allBooks } = await afs.list("/books");
for (const b of allBooks) {
  console.log(`  ${b.path}: ${b.meta?.title} (${b.meta?.year})`);
}

// Read a specific book
console.log("\n--- Read /books/book-2 ---");
const book = await afs.read("/books/book-2");
console.log(book.data);

// Execute a search action
console.log("\n--- Exec /.actions/search { query: 'pragmatic' } ---");
const results = await afs.exec("/books/.actions/search", { query: "pragmatic" });
console.log(`  Found ${results.data.total} result(s):`);
for (const r of results.data.results) {
  console.log(`    ${r.id}: ${r.title} by ${r.author}`);
}

// Stat (metadata)
console.log("\n--- Stat /books/book-1 ---");
const stat = await afs.stat("/books/book-1");
console.log(`  meta:`, stat.data?.meta || stat.data);

// Explain
console.log("\n--- Explain /books ---");
const explanation = await afs.explain("/books");
console.log(explanation.data?.content);

console.log("\nDone!");
