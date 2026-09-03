"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A popover menu anchored to a control. Closes on Escape, on outside click, and after a
 * choice — the three ways people expect to dismiss one.
 */
export interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  download?: boolean;
  disabled?: boolean;
  note?: string;
}

export function Menu({
  items,
  children,
  tip,
  label,
  align = "right",
  width = 200,
  variant = "icon",
  onOpen
}: {
  items: MenuItem[];
  children: React.ReactNode;
  tip: string;
  label: string;
  align?: "left" | "right";
  width?: number;
  /** "icon" is a 30px square control; "row" fills its container like a list row. */
  variant?: "icon" | "row";
  /** Fired when the menu opens — for items whose contents are worth fetching lazily. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} style={{ position: "relative", display: variant === "row" ? "block" : "inline-flex" }}>
      <button
        className={variant === "row" ? "row-btn" : "icon-btn"}
        style={variant === "row" ? undefined : { width: 30, height: 30 }}
        data-tip={open ? undefined : tip}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((v) => !v);
        }}
      >
        {children}
      </button>
      {open && (
        <div role="menu" className="menu" style={{ width, [align]: 0 } as React.CSSProperties}>
          {items.map((it) =>
            it.href && !it.disabled ? (
              <a
                key={it.label}
                role="menuitem"
                className="menu-item"
                href={it.href}
                download={it.download}
                onClick={() => setOpen(false)}
              >
                {it.label}
                {it.note && <span className="menu-note">{it.note}</span>}
              </a>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className="menu-item"
                disabled={it.disabled}
                onClick={() => {
                  it.onSelect?.();
                  setOpen(false);
                }}
              >
                {it.label}
                {it.note && <span className="menu-note">{it.note}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
