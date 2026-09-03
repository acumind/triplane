"use client";
import { useEffect, useState } from "react";

/**
 * The mechanism behind the two stubbed identity switches — reviewer mode and access
 * level. Both are a localStorage key that a query param seeds on first load, a setter
 * that flips it in place, and a hook every consumer subscribes to.
 *
 * The subscription is the part that matters. The App Router preserves client state
 * across a query-only push (see Next's "preserving UI state" guide: derive from the
 * search params, don't read them once), so a hook that read `location.search` on mount
 * alone would never see `?reviewer=1` clicked from the page it was already on — the
 * mode would appear only after a reload. Everything listens to one event instead, and
 * the whole shell flips together.
 *
 * Neither of these is a security boundary; they gate affordances. Real auth is a
 * post-hackathon concern, and a browser flag about itself is not it.
 */
const EVENT = "triplane:mode";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage disabled or partitioned: fall back to the default, don't take the page down.
    return null;
  }
}

/** Set a mode and tell every consumer. Safe to call from an event handler. */
export function writeMode(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // It won't persist past this session; flipping the live UI still works.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Subscribe to one stored mode. `param` names the query param that seeds it on first
 * load and `accepts` bounds what that param may set — a URL cannot invent a value.
 *
 * Returns null until the first effect runs, so the initial client render matches the
 * server's HTML and each caller derives its own default from "not set yet".
 */
export function useStoredMode(key: string, param: string, accepts: readonly string[]): string | null {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get(param);
    if (q !== null && accepts.includes(q)) writeMode(key, q);
    const sync = () => setValue(read(key));
    // Read before listening: a consumer that mounts after the seeding write still sees it.
    sync();
    window.addEventListener(EVENT, sync);
    // Another tab is a legitimate way to change this during a demo.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // `accepts` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, param]);

  return value;
}
