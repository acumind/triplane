"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { humanizeType } from "../lib/display";
import { conceptIdFromPath } from "../lib/page";

/**
 * The knowledge index, always present. A knowledge base whose only way in is a graph
 * is a demo; a reader needs a stable place to see everything that exists and where
 * they currently are.
 */
export function Rail({ groups }: { groups: [string, { id: string; title: string }[]][] }) {
  const pathname = usePathname();
  const current = conceptIdFromPath(pathname);
  return (
    <aside className="rail">
      {groups.map(([type, nodes]) => (
        <div className="rail-group" key={type}>
          <p>{humanizeType(type)}</p>
          {nodes.map((n) => (
            <Link key={n.id} href={`/c/${n.id}`} data-active={n.id === current}>
              {n.title}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
