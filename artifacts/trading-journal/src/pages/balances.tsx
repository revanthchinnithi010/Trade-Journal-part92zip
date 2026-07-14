import AccountCard from "@/components/portfolio/AccountCard";
import { useDeltaAccount } from "@/store/deltaAccountStore";
import { useCtraderAccount } from "@/store/ctraderAccountStore";

/**
 * Dedicated Balances page — reached only from Dashboard's "Account Value"
 * card. Shows the per-broker account cards (Delta Exchange + cTrader) that
 * used to live at the top of the Portfolio page. Portfolio itself no longer
 * shows any balance information; it only covers Positions / Orders / Stop
 * Orders.
 */
export default function Balances() {
  const deltaAccount   = useDeltaAccount();
  const ctraderAccount = useCtraderAccount();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 md:px-6 pt-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AccountCard account={deltaAccount} index={0} />
        <AccountCard account={ctraderAccount} index={1} />
      </div>
    </div>
  );
}
