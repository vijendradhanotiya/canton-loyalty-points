#!/usr/bin/env bash

set -euo pipefail

# ==============================================================================
# ENROLL MERCHANT SCRIPT
#
# Description:
#   This script enrolls a new merchant into the loyalty coalition program.
#   It performs two main actions against a Canton ledger's JSON API:
#   1. Allocates a new party for the merchant.
#   2. Creates a `CoalitionClearing.Merchant` contract, signed by the
#      coalition operator, to formally add the merchant to the program.
#
# Usage:
#   ./enroll-merchant.sh <MERCHANT_NAME> <MERCHANT_PARTY_HINT>
#
#   Example:
#   ./enroll-merchant.sh "Global Coffee" "globalcoffee"
#
# Prerequisites:
#   - `curl` and `jq` must be installed and available in the PATH.
#   - The following environment variables must be set:
#     - OPERATOR_PARTY_ID: The party ID of the coalition operator.
#     - OPERATOR_JWT: A valid JWT for the operator party (`actAs` claim).
#     - JSON_API_URL: (Optional) The URL of the Canton JSON API.
#                     Defaults to http://localhost:7575.
#
# ==============================================================================

# --- Configuration and Argument Parsing ---------------------------------------

MERCHANT_NAME="${1:?Please provide the merchant's display name as the first argument.}"
MERCHANT_HINT="${2:?Please provide a party ID hint for the merchant as the second argument.}"

JSON_API_URL="${JSON_API_URL:-http://localhost:7575}"
OPERATOR_PARTY_ID="${OPERATOR_PARTY_ID:?Error: OPERATOR_PARTY_ID environment variable is not set.}"
OPERATOR_JWT="${OPERATOR_JWT:?Error: OPERATOR_JWT environment variable is not set.}"

# --- Dependency Check ---------------------------------------------------------

if ! command -v curl &> /dev/null; then
    echo "Error: curl is not installed. Please install it to continue." >&2
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install it to parse JSON responses." >&2
    exit 1
fi

# --- Helper Functions ---------------------------------------------------------

# Log a message to stderr
log() {
    echo >&2 "$@"
}

# Make a POST request to the JSON API
# Usage: post_command <endpoint> <payload>
post_command() {
    local endpoint="$1"
    local payload="$2"
    local response

    response=$(curl -s -X POST \
        -H "Authorization: Bearer ${OPERATOR_JWT}" \
        -H "Content-Type: application/json" \
        -d "${payload}" \
        "${JSON_API_URL}${endpoint}")

    if echo "${response}" | jq -e '.errors' > /dev/null; then
        log "Error from JSON API:"
        log "$(echo "${response}" | jq '.errors')"
        exit 1
    elif echo "${response}" | jq -e '.status' > /dev/null && [ "$(echo "${response}" | jq -r '.status')" -ne 200 ]; then
        log "Error from JSON API (HTTP Status $(echo "${response}" | jq -r '.status')):"
        log "${response}"
        exit 1
    fi

    echo "${response}"
}

# --- Main Script Logic --------------------------------------------------------

log "🎬 Starting merchant enrollment process for '${MERCHANT_NAME}'..."

# 1. Allocate a party for the new merchant
log "   1. Allocating party for merchant '${MERCHANT_NAME}' with hint '${MERCHANT_HINT}'..."

ALLOCATE_PAYLOAD=$(jq -n \
    --arg name "$MERCHANT_NAME" \
    --arg hint "$MERCHANT_HINT" \
    '{ "displayName": $name, "partyIdHint": $hint }')

ALLOCATE_RESPONSE=$(post_command "/v2/parties/allocate" "${ALLOCATE_PAYLOAD}")
MERCHANT_PARTY_ID=$(echo "${ALLOCATE_RESPONSE}" | jq -r '.partyDetails.identifier')

if [ -z "$MERCHANT_PARTY_ID" ]; then
    log "❌ Failed to allocate party. Response:"
    log "$ALLOCATE_RESPONSE"
    exit 1
fi

log "   ✅ Party allocated successfully. New Merchant Party ID: ${MERCHANT_PARTY_ID}"

# 2. Create the CoalitionClearing.Merchant contract to formalize enrollment.
#    We use the /v1/create endpoint for its simplicity in creating a single contract.
log "   2. Creating CoalitionClearing:Merchant contract..."

CREATE_PAYLOAD=$(jq -n \
    --arg operator "$OPERATOR_PARTY_ID" \
    --arg merchant "$MERCHANT_PARTY_ID" \
    --arg name "$MERCHANT_NAME" \
    '{
        "templateId": "CoalitionClearing:Merchant",
        "payload": {
            "operator": $operator,
            "merchant": $merchant,
            "name": $name
        }
    }')

CREATE_RESPONSE=$(post_command "/v1/create" "${CREATE_PAYLOAD}")
CONTRACT_ID=$(echo "${CREATE_RESPONSE}" | jq -r '.result.contractId')

if [ -z "$CONTRACT_ID" ]; then
    log "❌ Failed to create Merchant contract. Response:"
    log "$CREATE_RESPONSE"
    exit 1
fi

log "   ✅ Merchant contract created successfully. Contract ID: ${CONTRACT_ID}"
log ""
log "🎉 Enrollment complete!"
log "======================================================================"
echo "Merchant Name:       ${MERCHANT_NAME}"
echo "Merchant Party ID:   ${MERCHANT_PARTY_ID}"
echo "Enrollment Contract: ${CONTRACT_ID}"
log "======================================================================"
log ""
log "Next steps:"
log "  - Provide the Merchant Party ID to the merchant operator."
log "  - The merchant will need a JWT with this party ID in the 'actAs' claim to issue points."