/**
 * Collects WebSocket messages with parse-error tracking.
 * Replaces bare `try { messages.push(JSON.parse(...)) } catch {}` in tests.
 */
export function createMessageCollector(ws: {
  on(event: string, cb: (data: unknown) => void): void;
}) {
  const messages: unknown[] = [];
  const parseErrors: Array<{ raw: string; error: Error }> = [];

  ws.on("message", (data: unknown) => {
    const raw = String(data);
    try {
      messages.push(JSON.parse(raw));
    } catch (e) {
      parseErrors.push({ raw, error: e as Error });
    }
  });

  return {
    messages,
    assertNoBadMessages() {
      if (parseErrors.length > 0) {
        throw new Error(
          `${parseErrors.length} WS message(s) failed JSON.parse:\n` +
            parseErrors.map((p) => `  ${p.raw.slice(0, 200)}`).join("\n"),
        );
      }
    },
    reset() {
      messages.length = 0;
      parseErrors.length = 0;
    },
  };
}
