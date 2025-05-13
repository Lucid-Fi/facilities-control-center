# Offer Loan Page

This page provides an interface to interact with the `offer_loan_simple` function in the `hybrid_loan_book` module.

## Query Parameters

- `module`: The address of the deployed `hybrid_loan_book` module.
- `loan_book`: The address of the `LoanBookConfig` object.

## Functionality

Allows an originator to offer a new loan by specifying:

- Loan seed
- Borrower address
- Payment schedule (time due, principal, interest, fees for each interval)
- Other optional parameters are defaulted or set to None.
