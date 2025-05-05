# Waterfall Management Page

This page allows fund managers to run waterfall operations in a simple, streamlined interface. The page combines several operations into a sequential flow, allowing the user to:

1. Approve capital call requests (if present)
2. Approve recycle requests (if present)
3. Attest the borrowing base
4. Run the principal waterfall
5. Run the interest waterfall for a specific month

## Features

- Query parameter parsing to pre-fill form values (`capital_call`, `recycle`, `borrowing_base`)
- Month selector for specifying interest waterfall time period
- Proper decimal formatting for all token amounts (6 decimals)
- Transaction batching capability
- Option to automatically fill capital calls

## Usage

Access the page with query parameters to pre-populate values:

```
/waterfall?facility=0x123...&module=0x456...&capital_call=1000&recycle=500&borrowing_base=10000&month=2025-05
```

Parameters:
- `facility`: The address of the facility (required)
- `module`: The module address (optional, defaults to "0x1")
- `capital_call`: Initial capital call amount (optional)
- `recycle`: Initial recycle amount (optional)
- `borrowing_base`: Initial borrowing base value (optional)
- `month`: Initial month selection in YYYY-MM format (optional, e.g., 2025-05)

## Technical Implementation

- Timestamps for interest waterfall are created as microsecond Unix timestamps (UTC+0)
- Month selection uses first day of the selected month for start and first day of the following month for end
- All token values are properly adjusted for decimals (default 6)