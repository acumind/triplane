/**
 * The handoff calls for "Lucide or similar, 1.5px stroke, 16px". These are drawn
 * inline rather than pulled from a package: fourteen glyphs do not justify a
 * dependency, and inlining keeps them on the same stroke and grid.
 */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export type IconName =
  | "search" | "plus" | "bell" | "share" | "download" | "history" | "more"
  | "threads" | "info" | "close" | "copy" | "flag" | "trace" | "send" | "chevron" | "lock";

const PATHS: Record<IconName, React.ReactNode> = {
  search: <><circle cx="7.5" cy="7.5" r="4.75" {...P} /><path d="M11 11l3.2 3.2" {...P} /></>,
  plus: <path d="M8 3.5v9M3.5 8h9" {...P} />,
  bell: <><path d="M4.5 6.5a3.5 3.5 0 017 0c0 3 1.2 4 1.2 4H3.3s1.2-1 1.2-4z" {...P} /><path d="M6.7 13a1.5 1.5 0 002.6 0" {...P} /></>,
  share: <><path d="M9.5 3.5H13V7" {...P} /><path d="M13 3.5L7.5 9" {...P} /><path d="M12 9.8V12a1.2 1.2 0 01-1.2 1.2H4.2A1.2 1.2 0 013 12V5.2A1.2 1.2 0 014.2 4h2.2" {...P} /></>,
  download: <><path d="M8 3v7" {...P} /><path d="M5 7.5L8 10.5l3-3" {...P} /><path d="M3.2 12.5h9.6" {...P} /></>,
  history: <><path d="M3.4 8a4.6 4.6 0 104.6-4.6c-1.7 0-3 .9-3.8 2.1" {...P} /><path d="M3 3.4V6h2.6" {...P} /><path d="M8 5.8V8l1.7 1" {...P} /></>,
  more: <><circle cx="3.5" cy="8" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" /><circle cx="12.5" cy="8" r=".9" fill="currentColor" /></>,
  threads: <path d="M2.8 4.5h10.4M2.8 8h10.4M2.8 11.5h7" {...P} />,
  info: <><circle cx="8" cy="8" r="5.5" {...P} /><path d="M8 7.3v3.4" {...P} /><circle cx="8" cy="5.3" r=".8" fill="currentColor" /></>,
  close: <path d="M4 4l8 8M12 4l-8 8" {...P} />,
  copy: <><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" {...P} /><path d="M10.5 5.5v-1a1.5 1.5 0 00-1.5-1.5H4.5A1.5 1.5 0 003 4.5V9a1.5 1.5 0 001.5 1.5h1" {...P} /></>,
  flag: <><path d="M4 13.5V3" {...P} /><path d="M4 3.6h7.2l-1.4 2.5 1.4 2.5H4" {...P} /></>,
  trace: <path d="M2.5 8h2.2l1.6-4 2.4 8 1.6-4h3.2" {...P} />,
  send: <><path d="M8 12.5v-9" {...P} /><path d="M4.5 7L8 3.5 11.5 7" {...P} /></>,
  chevron: <path d="M4.5 6.5L8 10l3.5-3.5" {...P} />,
  lock: <><rect x="3.5" y="7" width="9" height="6" rx="1.5" {...P} /><path d="M5.8 7V5.4a2.2 2.2 0 014.4 0V7" {...P} /></>
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      {PATHS[name]}
    </svg>
  );
}
