"use client";
import { useCallback, useState } from "react";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";

/**
 * Switch between deployments of this engine.
 *
 * Each peer is a SEPARATE deployment with its own bundle, brand and catalog — this
 * navigates to them, it does not merge them. That distinction is the product: one engine
 * deployed several times, each publishing as itself, rather than one app serving several
 * tenants.
 *
 * The label for each row comes from the peer's own catalog rather than our config, so the
 * menu cannot claim something the URL does not actually serve. The bundle hash comes with
 * it, which is what makes the switch legible: three deployments, three hashes, one engine.
 */
interface Peer { name: string; url: string }
interface Probe { name?: string; hash?: string; reachable: boolean }

export function DeploymentSwitcher({
  current,
  currentHash,
  peers
}: {
  current: string;
  currentHash: string;
  peers: Peer[];
}) {
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [probing, setProbing] = useState(false);

  const isCurrent = (url: string) =>
    typeof window !== "undefined" && new URL(url).host === window.location.host;

  // Probe on open, not on mount: a sidebar should not fan out to three origins on every
  // page load to populate a menu nobody opened.
  const probe = useCallback(async () => {
    if (probing || Object.keys(probes).length) return;
    setProbing(true);
    const results = await Promise.all(
      peers.map(async (p): Promise<[string, Probe]> => {
        if (isCurrent(p.url)) return [p.url, { name: current, hash: currentHash, reachable: true }];
        try {
          const res = await fetch(`${p.url}/.well-known/ai-catalog.json`, {
            signal: AbortSignal.timeout(1500),
            cache: "no-store"
          });
          if (!res.ok) return [p.url, { reachable: false }];
          const c = await res.json();
          return [p.url, { name: c?.name, hash: c?.bundleHash, reachable: true }];
        } catch {
          return [p.url, { reachable: false }];
        }
      })
    );
    setProbes(Object.fromEntries(results));
    setProbing(false);
  }, [peers, probes, probing, current, currentHash]);

  const items: MenuItem[] = peers.length
    ? peers.map((p) => {
        const probed = probes[p.url];
        const here = isCurrent(p.url);
        return {
          // The peer's own name once we have it; the configured one until then.
          label: probed?.name ?? p.name,
          // "unreachable", not "not running": a peer that is up but serving an older
          // build without CORS is also unreadable, and saying it is down would be wrong.
          note: here ? "current" : probed ? (probed.reachable ? probed.hash : "unreachable") : "…",
          disabled: here || (probed && !probed.reachable),
          onSelect: here ? undefined : () => { window.location.href = p.url; }
        };
      })
    : [{ label: "No sibling deployments configured", disabled: true }];

  return (
    <Menu label="Switch deployment" tip="Switch deployment" align="left" width={240} variant="row" items={items} onOpen={probe}>
      <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {current}
      </span>
      <span style={{ color: "var(--hint)", display: "grid", placeItems: "center" }}>
        <Icon name="chevron" size={12} />
      </span>
    </Menu>
  );
}
