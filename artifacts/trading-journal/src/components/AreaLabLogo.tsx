import { memo } from "react";
import areaLabLogoUrl from "@/assets/area-lab-logo.svg?url";

// The source SVG's viewBox is cropped tightly around the visible "area.lab"
// wordmark (253 254 524 102 of the original 1024×614 canvas — the rest of the
// canvas is transparent padding). No path, text, or gradient data was touched;
// only the viewport window changed, so the mark itself is still rendered
// directly from the original artwork, undistorted, at its true aspect ratio.
const LOGO_ASPECT_RATIO = 524 / 102;

interface AreaLabLogoProps {
  /** Rendered height in px. Defaults to 32 (within the 30–34px phone spec). */
  height?: number;
  className?: string;
}

/**
 * Official Area.lab wordmark, imported directly from the provided SVG asset
 * (never redrawn). Rendered as a native <img> so the browser decodes/paints
 * it as vector at native resolution on every DPI — no rasterization, no
 * blur, transparency and the purple→pink "area" gradient + white ".lab"
 * are preserved exactly as authored.
 *
 * Height-constrained + width:auto keeps the original aspect ratio so the
 * logo never stretches or distorts; width scales up automatically on
 * larger (tablet) viewports via the `height` prop passed by the caller.
 */
export const AreaLabLogo = memo(function AreaLabLogo({ height = 32, className }: AreaLabLogoProps) {
  return (
    <img
      src={areaLabLogoUrl}
      alt="Area.lab"
      className={className}
      draggable={false}
      style={{
        height,
        width: height * LOGO_ASPECT_RATIO,
        objectFit: "contain",
        display: "block",
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
});
