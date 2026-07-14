import AccountCard from "@/components/portfolio/AccountCard";
import { useDeltaAccount } from "@/store/deltaAccountStore";
import { useCtraderAccount } from "@/store/ctraderAccountStore";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Dedicated Balances page — reached only from Dashboard's "Account Value"
 * card. Shows the per-broker account cards (Delta Exchange + cTrader) that
 * used to live at the top of the Portfolio page. Portfolio itself no longer
 * shows any balance information; it only covers Positions / Orders / Stop
 * Orders.
 *
 * Manages its own full-height, pure-black scroll region (rather than
 * StandardPageWrapper's themed page background) so the black continues
 * seamlessly below the forced-black secondary header in Layout.tsx — no
 * light/dark seam at the header boundary in either theme.
 */
export default function Balances() {
  const deltaAccount   = useDeltaAccount();
  const ctraderAccount = useCtraderAccount();
  const isMobile        = useIsMobile();

  return (
    <div
      className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden"
      style={{ background: "#000000", scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <div
        className="mx-auto w-full max-w-[1400px] px-4 md:px-6 pt-4"
        style={{ paddingBottom: isMobile ? 80 : 40 }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AccountCard account={deltaAccount} index={0} />
          <AccountCard account={ctraderAccount} index={1} />
        </div>
      </div>
    </div>
  );
}
