/**
 * Inline SVG broker logo components — bundled directly into the JS chunk.
 * Zero network requests, instant rendering, no layout shifts.
 */

export function DeltaLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#1A1008"/>
      <rect width="40" height="40" rx="10" fill="url(#delta-bg)" opacity="0.6"/>
      <polygon
        points="20,7 34,31 6,31"
        fill="none"
        stroke="url(#delta-stroke)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <polygon
        points="20,13 28.5,27.5 11.5,27.5"
        fill="url(#delta-fill)"
        opacity="0.85"
      />
      <defs>
        <linearGradient id="delta-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F97316" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#EA580C" stopOpacity="0.10"/>
        </linearGradient>
        <linearGradient id="delta-stroke" x1="20" y1="7" x2="20" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDBA74"/>
          <stop offset="100%" stopColor="#F97316"/>
        </linearGradient>
        <linearGradient id="delta-fill" x1="20" y1="13" x2="20" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FED7AA" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#F97316" stopOpacity="0.6"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CTraderLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#120808"/>
      <rect width="40" height="40" rx="10" fill="url(#ct-bg)" opacity="0.5"/>
      <circle cx="20" cy="20" r="11" stroke="url(#ct-ring)" strokeWidth="2.2" fill="none"/>
      <path
        d="M27.5 14.5 A11 11 0 1 0 27.5 25.5"
        stroke="url(#ct-arc)"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      <text
        x="20"
        y="24"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="-0.5"
        fill="url(#ct-text)"
      >cT</text>
      <defs>
        <linearGradient id="ct-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EF4444" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#DC2626" stopOpacity="0.05"/>
        </linearGradient>
        <linearGradient id="ct-ring" x1="9" y1="9" x2="31" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCA5A5" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#EF4444" stopOpacity="0.15"/>
        </linearGradient>
        <linearGradient id="ct-arc" x1="27" y1="14" x2="27" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCA5A5"/>
          <stop offset="100%" stopColor="#EF4444"/>
        </linearGradient>
        <linearGradient id="ct-text" x1="14" y1="16" x2="26" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FECACA"/>
          <stop offset="100%" stopColor="#F87171"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function MT5Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#071A0F"/>
      <rect width="40" height="40" rx="10" fill="url(#mt5-bg)" opacity="0.5"/>
      <rect x="7" y="17" width="26" height="2" rx="1" fill="url(#mt5-line)" opacity="0.25"/>
      <text
        x="20"
        y="17"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.5"
        fill="url(#mt5-top)"
      >MT5</text>
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fontSize="7"
        fontWeight="600"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.3"
        fill="url(#mt5-bot)"
        opacity="0.7"
      >FOREX</text>
      <rect x="9" y="30" width="22" height="1.5" rx="0.75" fill="url(#mt5-bar)"/>
      <defs>
        <linearGradient id="mt5-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#16A34A" stopOpacity="0.05"/>
        </linearGradient>
        <linearGradient id="mt5-line" x1="7" y1="18" x2="33" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0"/>
          <stop offset="50%" stopColor="#22C55E"/>
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="mt5-top" x1="10" y1="10" x2="30" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#86EFAC"/>
          <stop offset="100%" stopColor="#22C55E"/>
        </linearGradient>
        <linearGradient id="mt5-bot" x1="10" y1="20" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#BBF7D0"/>
          <stop offset="100%" stopColor="#4ADE80"/>
        </linearGradient>
        <linearGradient id="mt5-bar" x1="9" y1="30" x2="31" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0"/>
          <stop offset="50%" stopColor="#22C55E" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Map from broker ID to logo component for O(1) lookup */
export const BROKER_LOGO_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  delta:   DeltaLogo,
  ctrader: CTraderLogo,
  mt5:     MT5Logo,
};

/** Renders the correct broker logo by ID, with guaranteed fixed size */
export function BrokerLogo({ brokerId, size = 40 }: { brokerId: string; size?: number }) {
  const Logo = BROKER_LOGO_MAP[brokerId];
  if (!Logo) return null;
  return (
    <div
      style={{
        width:    size,
        height:   size,
        flexShrink: 0,
        display:  "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Logo size={size} />
    </div>
  );
}
