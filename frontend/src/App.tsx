import React, { useState, useMemo, useEffect } from 'react';
import { DamlLedger, useParty, useStreamQueries, useLedger } from '@c7/react';
import { DiscoveryComponent, useDappSdk } from '@daml-finance/dapp-sdk';
import { WalletBalance } from './WalletBalance';
import {
  Merchant,
  PointBalance,
  RedemptionRequest
} from '@daml.js/canton-loyalty-points-0.1.0/lib/Loyalty';
import { ContractId } from '@c7/tdm-types';
import { issuePoints, redeemPoints, settleRedemption } from './loyaltyService';
import './App.css';

// =================================================================================================
// Login and App Wrapper
// =================================================================================================

const App: React.FC = () => {
  const { party, token, loading, setCredentials } = useDappSdk();

  const handleLogout = () => {
    setCredentials(null, null);
  };

  if (loading) {
    return <div className="app-container">Loading DApp SDK...</div>;
  }

  if (!party || !token) {
    return (
      <div className="login-container">
        <h1>Canton Loyalty Coalition</h1>
        <p>Connect your wallet to access the loyalty portal.</p>
        <DiscoveryComponent onConnect={setCredentials} />
      </div>
    );
  }

  return (
    <DamlLedger token={token} party={party}>
      <MainScreen onLogout={handleLogout} />
    </DamlLedger>
  );
};

// =================================================================================================
// Main Application Screen (post-login)
// =================================================================================================

const MainScreen: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const party = useParty();
  const ledger = useLedger();

  // Query for the Merchant contract to determine if the current user is a merchant.
  const { contracts: merchantContracts, loading: merchantLoading } = useStreamQueries(Merchant, () => [{ operator: party }] as any, [party]);
  const isMerchant = merchantContracts.length > 0;
  const merchantContract = isMerchant ? merchantContracts[0] : null;

  if (merchantLoading) {
    return <div className="app-container">Authenticating...</div>;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Canton Loyalty Coalition</h1>
        <div className="user-info">
          <span>Welcome, <strong>{party}</strong></span>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>
      <main className="app-main">
        {isMerchant && merchantContract
          ? <MerchantPortal merchantContract={merchantContract} />
          : <CustomerPortal />
        }
      </main>
    </div>
  );
};

// =================================================================================================
// Customer Portal View
// =================================================================================================

const CustomerPortal: React.FC = () => {
  const party = useParty();
  const ledger = useLedger();

  const { contracts: pointBalances, loading: balancesLoading } = useStreamQueries(PointBalance, () => [{ customer: party }], [party]);
  const { contracts: allMerchants, loading: merchantsLoading } = useStreamQueries(Merchant);

  const [selectedMerchant, setSelectedMerchant] = useState<string>('');
  const [earnAmount, setEarnAmount] = useState<string>('');
  const [redeemAmount, setRedeemAmount] = useState<string>('');
  const [selectedBalanceForRedemption, setSelectedBalanceForRedemption] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (allMerchants.length > 0) {
      setSelectedMerchant(allMerchants[0].payload.operator);
    }
  }, [allMerchants]);

  const handleEarn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMerchant || !earnAmount || parseFloat(earnAmount) <= 0) {
      setError("Please select a merchant and enter a valid amount to earn.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const merchantContract = allMerchants.find(m => m.payload.operator === selectedMerchant);
      if (!merchantContract) throw new Error("Selected merchant not found.");
      await issuePoints(ledger, merchantContract.contractId, party, earnAmount);
      setEarnAmount('');
    } catch (err: any) {
      setError(err.message || 'Failed to issue points.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBalanceForRedemption || !redeemAmount || parseFloat(redeemAmount) <= 0) {
      setError("Please select a balance and enter a valid amount to redeem.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const balanceCid = selectedBalanceForRedemption as ContractId<PointBalance>;
      await redeemPoints(ledger, balanceCid, redeemAmount);
      setRedeemAmount('');
      setSelectedBalanceForRedemption('');
    } catch (err: any) {
      setError(err.message || 'Failed to redeem points.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="portal-view">
      <h2>Customer Wallet</h2>
      <WalletBalance pointBalances={pointBalances} isLoading={balancesLoading} />

      {error && <p className="error-message">{error}</p>}

      <div className="action-cards">
        <div className="card">
          <h3>Earn Points</h3>
          <p>Simulate a purchase to earn loyalty points.</p>
          <form onSubmit={handleEarn}>
            <div className="form-group">
              <label htmlFor="merchant-select">Merchant</label>
              <select id="merchant-select" value={selectedMerchant} onChange={e => setSelectedMerchant(e.target.value)} disabled={merchantsLoading}>
                {merchantsLoading && <option>Loading merchants...</option>}
                {allMerchants.map(m => (
                  <option key={m.contractId} value={m.payload.operator}>{m.payload.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="earn-amount">Amount</label>
              <input
                id="earn-amount"
                type="number"
                step="1"
                min="1"
                placeholder="e.g., 50"
                value={earnAmount}
                onChange={e => setEarnAmount(e.target.value)}
              />
            </div>
            <button type="submit" disabled={isSubmitting || merchantsLoading}>
              {isSubmitting ? 'Earning...' : 'Earn Points'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Redeem Points</h3>
          <p>Use your points for discounts or rewards.</p>
          <form onSubmit={handleRedeem}>
            <div className="form-group">
              <label htmlFor="balance-select">Your Points Balance</label>
              <select id="balance-select" value={selectedBalanceForRedemption} onChange={e => setSelectedBalanceForRedemption(e.target.value)} disabled={balancesLoading}>
                <option value="">-- Select a balance --</option>
                {pointBalances.map(b => (
                  <option key={b.contractId} value={b.contractId}>
                    {b.payload.merchantName} - {b.payload.quantity} points
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="redeem-amount">Amount to Redeem</label>
              <input
                id="redeem-amount"
                type="number"
                step="1"
                min="1"
                placeholder="e.g., 10"
                value={redeemAmount}
                onChange={e => setRedeemAmount(e.target.value)}
              />
            </div>
            <button type="submit" disabled={isSubmitting || balancesLoading}>
              {isSubmitting ? 'Redeeming...' : 'Redeem Points'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};


// =================================================================================================
// Merchant Portal View
// =================================================================================================

interface MerchantPortalProps {
  merchantContract: {
    contractId: ContractId<Merchant>;
    payload: Merchant;
  };
}

const MerchantPortal: React.FC<MerchantPortalProps> = ({ merchantContract }) => {
  const party = useParty();
  const ledger = useLedger();

  const { contracts: redemptionRequests, loading: requestsLoading } = useStreamQueries(RedemptionRequest, () => [{ merchant: party }], [party]);
  const { contracts: issuedPoints, loading: pointsLoading } = useStreamQueries(PointBalance, () => [{ issuer: party }], [party]);

  const [error, setError] = useState<string | null>(null);
  const [submittingCid, setSubmittingCid] = useState<string | null>(null);

  const totalPointsIssued = useMemo(() =>
    issuedPoints.reduce((sum, p) => sum + parseFloat(p.payload.quantity), 0),
    [issuedPoints]);

  const handleSettle = async (reqCid: ContractId<RedemptionRequest>) => {
    setError(null);
    setSubmittingCid(reqCid);
    try {
      await settleRedemption(ledger, reqCid);
    } catch (err: any) {
      setError(err.message || "Failed to settle redemption.");
    } finally {
      setSubmittingCid(null);
    }
  };

  return (
    <div className="portal-view">
      <h2>Merchant Dashboard: {merchantContract.payload.name}</h2>

      {error && <p className="error-message">{error}</p>}

      <div className="merchant-stats">
        <div className="stat-card">
          <h4>Total Points Issued</h4>
          <p>{pointsLoading ? '...' : totalPointsIssued.toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h4>Pending Redemptions</h4>
          <p>{requestsLoading ? '...' : redemptionRequests.length}</p>
        </div>
      </div>

      <div className="card">
        <h3>Pending Redemption Requests</h3>
        {requestsLoading ? <p>Loading requests...</p> : (
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {redemptionRequests.length === 0 && (
                <tr><td colSpan={4}>No pending redemption requests.</td></tr>
              )}
              {redemptionRequests.map(req => (
                <tr key={req.contractId}>
                  <td title={req.contractId}>...{req.contractId.slice(-8)}</td>
                  <td title={req.payload.customer}>{req.payload.customer.slice(0, 10)}...</td>
                  <td>{req.payload.quantity}</td>
                  <td>
                    <button
                      onClick={() => handleSettle(req.contractId)}
                      disabled={!!submittingCid}
                    >
                      {submittingCid === req.contractId ? 'Settling...' : 'Settle'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default App;