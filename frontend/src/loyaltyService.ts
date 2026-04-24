/**
 * @module loyaltyService
 * @description This module provides functions to interact with the Canton loyalty ledger
 * via the JSON API. It encapsulates the logic for querying wallet balances and
 * initiating point redemptions.
 */

// =================================================================================================
// Type Definitions
// =================================================================================================

/**
 * Represents the payload of a Wallet:CustomerWallet contract on the ledger.
 */
export interface CustomerWallet {
  customer: string; // Party
  coalitionOperator: string; // Party
  pointsByMerchant: { key: string; value: string }[]; // Daml.Map Party Decimal
}

/**
 * Represents the arguments required to create a Redemption:RedemptionRequest contract.
 */
export interface RedemptionRequestArgs {
  customer: string; // Party
  redeemingMerchant: string; // Party
  coalitionOperator: string; // Party
  points: string; // Decimal
  redemptionDetails: string; // Text
}

/**
 * Represents a customer's points balance, structured as a map from
 * merchant Party ID to the points balance as a string.
 */
export type Balance = Map<string, string>;

// =================================================================================================
// Constants
// =================================================================================================

// Daml template IDs used in API calls.
// In a larger application, these might be sourced from a configuration file or
// generated from the Daml code.
const CUSTOMER_WALLET_TID = "Wallet:CustomerWallet";
const REDEMPTION_REQUEST_TID = "Redemption:RedemptionRequest";


// =================================================================================================
// Service Functions
// =================================================================================================

/**
 * Fetches the active CustomerWallet contract for a given party and calculates their balance.
 * Assumes a customer has at most one wallet contract.
 *
 * @param ledgerUrl The base URL of the Canton JSON API.
 * @param token The JWT token for authenticating with the JSON API.
 * @param partyId The party ID of the customer whose balance is being queried.
 * @returns A Promise that resolves to a `Balance` map (merchant party -> points string).
 *          Returns an empty map if no wallet is found.
 * @throws An error if the network request fails or the API returns an error.
 */
export const getWalletBalance = async (ledgerUrl: string, token: string, partyId: string): Promise<Balance> => {
  const response = await fetch(`${ledgerUrl}/v1/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      templateIds: [CUSTOMER_WALLET_TID],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to query wallet: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const { result: contracts } = await response.json() as { result: { payload: CustomerWallet }[] };

  // The query returns all wallets visible to the party. We filter for the one they own.
  const walletContract = contracts.find(c => c.payload.customer === partyId);

  if (!walletContract) {
    return new Map();
  }

  // Convert the Daml Map (array of key-value pairs) to a standard JavaScript Map.
  const balance = new Map<string, string>();
  walletContract.payload.pointsByMerchant.forEach(entry => {
    balance.set(entry.key, entry.value);
  });

  return balance;
};

/**
 * Creates a Redemption:RedemptionRequest contract on the ledger to initiate a points redemption.
 *
 * @param ledgerUrl The base URL of the Canton JSON API.
 * @param token The JWT token for authenticating with the JSON API.
 * @param args The arguments required to create the redemption request.
 * @returns A Promise that resolves to the result of the create command from the JSON API.
 * @throws An error if the network request fails or the API returns an error.
 */
export const redeemPoints = async (ledgerUrl: string, token: string, args: RedemptionRequestArgs) => {
  const payload = {
    templateId: REDEMPTION_REQUEST_TID,
    payload: {
      customer: args.customer,
      redeemingMerchant: args.redeemingMerchant,
      coalitionOperator: args.coalitionOperator,
      points: args.points,
      redemptionDetails: args.redemptionDetails,
    },
  };

  const response = await fetch(`${ledgerUrl}/v1/create`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to redeem points: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
};