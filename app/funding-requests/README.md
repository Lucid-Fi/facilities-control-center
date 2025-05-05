# Funding Requests Page

This page allows originators to make funding requests for a facility.

## Features

- Initiate capital call requests with custom amounts
- Initiate recycle requests with custom amounts
- Transaction flow uses step-by-step approach with simulation
- Full integration with facility overview to show current state

## Usage

Navigate to this page with query parameters:

```
/funding-requests?facility=<facility_address>&module=<module_address>&capital_call=<amount>&recycle=<amount>
```

### Query Parameters

- `facility`: The address of the facility (required)
- `module`: The module address (optional, defaults to 0x1)
- `capital_call`: Pre-populate the capital call amount (optional)
- `recycle`: Pre-populate the recycle amount (optional)

## Flow

1. If `requested_capital_call_amount > 0`, the user can initiate a capital call request with the ability to modify the amount
2. If `requested_recycle_amount > 0`, the user can initiate a recycle request with the ability to modify the amount

The transaction stepper component handles simulating and executing these transactions.

## Implementation

- Leverages the same token handling code as the capital call page
- Correctly handles token decimals (USDT uses 6 decimals)
- Follows the existing app design patterns