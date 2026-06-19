import { useCallback } from "react";
import { useLocation } from "wouter";
import { useChartStore } from "@/store/chartStore";
import { SharedMarketSelector } from "@/components/SharedMarketSelector";

export default function Markets() {
  const [, navigate] = useLocation();
  const chartSymbol  = useChartStore(s => s.symbol);

  const handleSymbolTap = useCallback((symbol: string) => {
    localStorage.setItem("tv_symbol", symbol);
    useChartStore.getState().setSymbol(symbol);
    navigate("/charts");
  }, [navigate]);

  return (
    <SharedMarketSelector
      mode="page"
      activeSymbol={chartSymbol}
      onSelect={handleSymbolTap}
    />
  );
}
