/**
 * MCP stdio framing: one JSON message per line.
 *
 * Not HTTP, so no Content-Length headers. The failure this guards against is the classic
 * one — a stray newline inside a message, or a stray write to stdout, silently corrupts the
 * stream and the host reports nothing more useful than "server disconnected".
 */

export function encodeLine(msg: unknown): string {
  const json = JSON.stringify(msg);
  if (json.includes("\n")) {
    // JSON.stringify escapes newlines, so this is unreachable — which is exactly why it is
    // worth asserting: if it ever fires, something is writing raw text into the stream.
    throw new Error("refusing to write a message containing a raw newline");
  }
  return json + "\n";
}

/** Buffers partial reads and yields whole messages. Tolerates \r\n and blank lines. */
export class LineDecoder {
  private buf = "";

  push(chunk: string): string[] {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    // The last element is either "" (clean break) or a partial line to carry forward.
    this.buf = lines.pop() ?? "";
    return lines.map((l) => l.replace(/\r$/, "")).filter((l) => l.trim().length > 0);
  }
}
