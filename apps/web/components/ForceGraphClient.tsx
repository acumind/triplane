"use client";
import { useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

/**
 * next/dynamic does not forward refs, and the force engine — link distance, charge,
 * collision, zoomToFit — is only reachable on the instance. Hand the instance out
 * through a callback so nothing has to cross the dynamic boundary as a ref.
 * `onReady` must be stable (useCallback) or this refires on every render.
 */
export default function ForceGraphClient({ onReady, ...props }: any) {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (ref.current) onReady?.(ref.current);
  }, [onReady]);
  return <ForceGraph2D ref={ref} {...props} />;
}
