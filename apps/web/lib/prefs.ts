"use client";
/**
 * Per-viewer state that has no server behind it: subscriptions, saved threads, reported
 * issues. localStorage is the honest home for these — they belong to this browser, they
 * survive a reload, and nothing pretends they reached a backend.
 *
 * Every accessor tolerates storage being unavailable (private windows, blocked site data).
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the feature degrades to "this session only" */
  }
}

const SUBS = "triplane.subscriptions";
export const subscriptions = (): string[] => read<string[]>(SUBS, []);
export const isSubscribed = (id: string): boolean => subscriptions().includes(id);
export function toggleSubscription(id: string): boolean {
  const next = isSubscribed(id) ? subscriptions().filter((x) => x !== id) : [...subscriptions(), id];
  write(SUBS, next);
  return next.includes(id);
}

export interface SavedThread {
  id: string;
  title: string;
  at: string;
  entries: unknown[];
}
const THREADS = "triplane.threads";
export const threads = (): SavedThread[] => read<SavedThread[]>(THREADS, []);
export function saveThread(t: SavedThread): void {
  const rest = threads().filter((x) => x.id !== t.id);
  write(THREADS, [t, ...rest].slice(0, 20)); // a review queue, not an archive
}
export const deleteThread = (id: string): void => write(THREADS, threads().filter((t) => t.id !== id));

const FLAGS = "triplane.flags";
export interface Flag { at: string; concept: string; owner?: string; note: string; answer: string }
export const flags = (): Flag[] => read<Flag[]>(FLAGS, []);
export const addFlag = (f: Flag): void => write(FLAGS, [f, ...flags()].slice(0, 50));
