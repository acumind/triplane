/**
 * One error type with a machine-readable code.
 *
 * These surface to a model, not to a stack trace: every code becomes a tool result whose
 * text begins with the code, so the host's agent can explain the failure and decide
 * whether a waiver is appropriate. They are deliberately NOT JSON-RPC errors — a JSON-RPC
 * error is a protocol fault, and "that site isn't ARD-enabled" is an answer.
 */
export type ArdErrorCode =
  | "ARD_BAD_INPUT"
  | "ARD_UNREACHABLE"
  | "ARD_NOT_FOUND"
  | "ARD_NOT_JSON"
  | "ARD_INVALID_CATALOG"
  | "ARD_PUBLISHER_UNVERIFIED"
  | "ARD_ENDPOINT_OFFSITE"
  | "ARD_NO_CAPABILITY"
  | "ARD_TRANSPORT_UNSUPPORTED"
  | "ARD_RPC_FAILED"
  | "ARD_TOOL_ERROR"
  | "ARD_TOOL_NOT_OFFERED"
  | "ARD_SIZE_LIMIT"
  | "ARD_TOO_MANY_REDIRECTS"
  | "ARD_BLOCKED_TARGET";

export class ArdError extends Error {
  readonly code: ArdErrorCode;
  readonly detail?: unknown;

  constructor(code: ArdErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "ArdError";
    this.code = code;
    this.detail = detail;
  }

  /** The form a model reads. Code first so it can be matched without parsing prose. */
  toText(): string {
    const d =
      this.detail === undefined
        ? ""
        : `\n${typeof this.detail === "string" ? this.detail : JSON.stringify(this.detail, null, 2)}`;
    return `${this.code}: ${this.message}${d}`;
  }
}

export const isArdError = (e: unknown): e is ArdError => e instanceof ArdError;
