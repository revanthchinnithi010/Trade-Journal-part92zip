import { BrokerId, BROKERS } from "@/types/broker";

interface BrokerLogoProps {
  brokerId: BrokerId;
  size?: number;
  className?: string;
}

export function BrokerLogo({ brokerId, size = 32, className }: BrokerLogoProps) {
  const broker = BROKERS.find((b) => b.id === brokerId);
  if (!broker) return null;

  const style = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  };

  if (broker.image) {
    return (
      <img
        src={broker.image}
        alt={broker.name}
        style={style}
        className={className}
        onError={(e) => {
          const target = e.currentTarget as HTMLImageElement;
          target.style.display = "none";
          const parent = target.parentElement;
          if (parent) {
            const fallback = document.createElement("div");
            fallback.style.cssText = `width:${size}px;height:${size}px;border-radius:6px;background:${broker.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.38)}px;color:#fff;flex-shrink:0;`;
            fallback.textContent = broker.logo;
            parent.appendChild(fallback);
          }
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...style,
        borderRadius: Math.round(size * 0.2),
        background: broker.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        color: "#fff",
        flexShrink: 0,
      }}
      className={className}
    >
      {broker.logo}
    </div>
  );
}
