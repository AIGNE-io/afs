/**
 * AFS Custom Provider Example
 *
 * Shows how to build a minimal provider that exposes in-memory data
 * as an AFS-compatible filesystem. This is the pattern for integrating
 * any data source — APIs, databases, IoT devices, etc.
 *
 * Run:  bun examples/custom-provider/index.ts
 */

import { Actions, AFS, AFSBaseProvider, List, Read, type RouteContext } from "@aigne/afs";

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
 *   /                    → list all books
 *   /:id                 → read a specific book
 *   /.actions/search     → search by author or title
 */
class BookProvider extends AFSBaseProvider {
  name = "book-catalog";
  description = "In-memory book catalog";
  override readonly accessMode = "readwrite" as const;

  private books: Map<string, BookRecord>;

  constructor(books: BookRecord[]) {
    super();
    this.books = new Map(books.map((b, i) => [`book-${i + 1}`, b]));
  }

  @List("/")
  async listBooks() {
    const data = Array.from(this.books.entries()).map(([id, book]) => ({
      name: id,
      type: "file" as const,
      meta: { title: book.title, author: book.author, year: book.year },
    }));
    return { data };
  }

  @Read("/")
  async readRoot() {
    return { data: `Book catalog with ${this.books.size} books. Use list to browse.` };
  }

  @Read("/:id")
  async readBook(ctx: RouteContext<{ id: string }>) {
    const book = this.books.get(ctx.params.id);
    if (!book) throw new Error(`Book not found: ${ctx.params.id}`);
    return {
      data: `${book.title}\nby ${book.author} (${book.year})\n\n${book.description}`,
      meta: book,
    };
  }

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
  console.log(`  ${b.name}: ${b.meta?.title} (${b.meta?.year})`);
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

console.log("\nDone!");
