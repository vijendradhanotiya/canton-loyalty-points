import React, { useMemo } from 'react';
import { useStreamQueries } from "@c7/react";
import { Point } from '../../daml.js/canton-loyalty-points-0.1.0/lib/LoyaltyPoint';
import './WalletBalance.css';

interface WalletBalanceProps {
  customer: string;
}

/**
 * A component that displays a customer's loyalty points balance,
 * aggregated by merchant. It queries the ledger for all `Point`
 * contracts visible to the customer.
 */
export const WalletBalance: React.FC<WalletBalanceProps> = ({ customer }) => {
  const { contracts, loading } = useStreamQueries(Point);

  const { totalPoints, pointsByMerchant } = useMemo(() => {
    const balanceMap = new Map<string, number>();
    let total = 0;

    // Filter contracts for the current customer and aggregate points
    contracts
      .filter(c => c.payload.customer === customer)
      .forEach(c => {
        const { merchant, amount } = c.payload;
        const numericAmount = parseFloat(amount);
        const currentBalance = balanceMap.get(merchant) || 0;
        balanceMap.set(merchant, currentBalance + numericAmount);
        total += numericAmount;
      });

    // Sort merchants alphabetically for a consistent display order
    const sortedBalances = Array.from(balanceMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    return {
      totalPoints: total,
      pointsByMerchant: sortedBalances,
    };
  }, [contracts, customer]);

  const getMerchantDisplayName = (partyId: string): string => {
    // In a real app, this would look up a display name from a registry or API.
    // For this example, we'll parse it from the party ID.
    return partyId.split('::')[0];
  };

  if (loading) {
    return (
      <div className="wallet-card loading">
        <h3>My Loyalty Wallet</h3>
        <p>Loading balances...</p>
      </div>
    );
  }

  return (
    <div className="wallet-card">
      <div className="wallet-header">
        <h3>My Loyalty Wallet</h3>
        <div className="total-balance">
          {totalPoints.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          <span className="points-label">PTS</span>
        </div>
      </div>

      <div className="balance-breakdown">
        <h4>Balance by Brand</h4>
        {pointsByMerchant.length === 0 ? (
          <p className="no-points-message">You have no points yet. Make a purchase to start earning!</p>
        ) : (
          <ul className="merchant-list">
            {pointsByMerchant.map(([merchant, balance]) => (
              <li key={merchant} className="merchant-item">
                <span className="merchant-name">{getMerchantDisplayName(merchant)}</span>
                <span className="merchant-balance">
                  {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} PTS
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};