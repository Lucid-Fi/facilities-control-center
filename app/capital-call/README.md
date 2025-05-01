# Capital Call & Recycle Page

This page allows fund managers to execute capital calls and recycle requests. The page provides a step-by-step interface for:

1. Approving capital call requests
2. Approving recycle requests
3. Attesting the borrowing base
4. Executing the principal waterfall

## Features

- Real-time display of facility state including:
  - Outstanding principal
  - Principal collection account balance
  - Interest collection account balance
  - Current borrowing base
  - Facility test status
- Decimal-adjusted token amounts (6 decimals for USDT)
- Transaction simulation and manual approval
- Admin-only access control
- Progress tracking with stepper UI

## URL Parameters

The page accepts the following URL parameters:

- `capital_call`: The requested capital call amount (in human-readable format)
- `recycle`: The requested recycle amount (in human-readable format)
- `borrowing_base`: The borrowing base value to attest (in human-readable format)

## Implementation Notes

- All token amounts are handled with proper decimal adjustment
- Transactions are simulated before execution
- The UI is disabled for non-admin users
- The page uses the Aptos wallet adapter for transaction signing
- All transactions are bundled using the Aptos script builder
