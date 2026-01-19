/// Bulk transfer module for fungible assets.
/// Deployed as an immutable code object - cannot be upgraded.
module bulk_transfers::bulk_transfers {
    use std::vector;
    use aptos_framework::fungible_asset::Metadata;
    use aptos_framework::object::Object;
    use aptos_framework::primary_fungible_store;

    /// Vector lengths do not match.
    const E_LENGTH_MISMATCH: u64 = 1;

    /// Transfer a single fungible asset to multiple recipients with the same amount.
    ///
    /// @param sender - The account sending the tokens.
    /// @param fa - The fungible asset metadata object.
    /// @param recipients - Vector of recipient addresses.
    /// @param amount - Amount to send to each recipient.
    public entry fun simple_bulk_transfer(
        sender: &signer,
        fa: Object<Metadata>,
        recipients: vector<address>,
        amount: u64,
    ) {
        vector::for_each(recipients, |recipient| {
            primary_fungible_store::transfer(sender, fa, recipient, amount);
        });
    }

    /// Transfer fungible assets to multiple recipients with custom amounts per transfer.
    ///
    /// @param sender - The account sending the tokens.
    /// @param fas - Vector of fungible asset metadata objects.
    /// @param recipients - Vector of recipient addresses.
    /// @param amounts - Vector of amounts corresponding to each transfer.
    public entry fun custom_bulk_transfer(
        sender: &signer,
        fas: vector<Object<Metadata>>,
        recipients: vector<address>,
        amounts: vector<u64>,
    ) {
        let len = vector::length(&fas);
        assert!(len == vector::length(&recipients), E_LENGTH_MISMATCH);
        assert!(len == vector::length(&amounts), E_LENGTH_MISMATCH);

        let i = 0;
        while (i < len) {
            let fa = *vector::borrow(&fas, i);
            let recipient = *vector::borrow(&recipients, i);
            let amount = *vector::borrow(&amounts, i);
            primary_fungible_store::transfer(sender, fa, recipient, amount);
            i = i + 1;
        };
    }
}
