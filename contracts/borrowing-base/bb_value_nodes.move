module lucid::bb_value_nodes {
    use std::signer;

    use aptos_framework::object::{Object};
    use aptos_framework::fungible_asset::{Metadata};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use aptos_framework::event;

    use lucid::utils;
    use lucid::whitelist::{Self, BasicWhitelist};

    #[test_only]
    use std::vector;
    #[test_only]
    use std::option;

    const E_ATTESTED_VALUE_STALE: u64 = 1;
    const E_INVALID_UPDATE_KEY: u64 = 2;
    const E_NOT_ALLOWED_TO_UPDATE: u64 = 3;
    const E_INVALID_NODE_TYPE: u64 = 4;

    struct AttestedValueNode has store, copy, drop {
        update_key: vector<u8>,
        allowed_attestors: Object<BasicWhitelist>,
        value: u64,
        updated_at: u64,
        ttl: u64
    }

    struct FungibleAssetBalanceNode has store, copy, drop {
        metadata: Object<Metadata>,
        owner: address
    }

    enum ValueNode has store, copy, drop {
        AttestedValue(AttestedValueNode),
        FungibleAssetBalance(FungibleAssetBalanceNode)
    }

    #[event]
    struct AttestedValueUpdated has store, copy, drop {
        update_key: vector<u8>,
        previous_value: u64,
        new_value: u64,
        updated_at: u64,
        updated_by: address
    }

    public fun update_key_matches(
        node: &ValueNode, update_key: &vector<u8>
    ): bool {
        match(node) {
            ValueNode::AttestedValue(node) => utils::vectors_equal(
                update_key, &node.update_key
            ),
            _ => false
        }
    }

    public fun update_attested_value_node(
        signer: &signer,
        node: &mut AttestedValueNode,
        update_key: &vector<u8>,
        value: u64
    ) {
        assert!(
            utils::vectors_equal(update_key, &node.update_key), E_INVALID_UPDATE_KEY
        );
        assert!(
            whitelist::is_whitelisted(
                node.allowed_attestors, signer::address_of(signer)
            ),
            E_NOT_ALLOWED_TO_UPDATE
        );

        let previous_value = node.value;
        node.value = value;
        node.updated_at = timestamp::now_microseconds();

        event::emit(
            AttestedValueUpdated {
                update_key: *update_key,
                previous_value,
                new_value: value,
                updated_at: node.updated_at,
                updated_by: signer::address_of(signer)
            }
        );
    }

    public fun extract_attested_value_node_mut(node: &mut ValueNode): &mut AttestedValueNode {
        match(node) {
            ValueNode::AttestedValue(node) => node,
            _ => abort(E_INVALID_NODE_TYPE)
        }
    }

    #[lint::skip(needless_mutable_reference)]
    public fun extract_fungible_asset_balance_node_mut(
        node: &mut ValueNode
    ): &mut FungibleAssetBalanceNode {
        match(node) {
            ValueNode::FungibleAssetBalance(node) => node,
            _ => abort(E_INVALID_NODE_TYPE)
        }
    }

    public fun extract_attested_value_node(node: &ValueNode): &AttestedValueNode {
        match(node) {
            ValueNode::AttestedValue(node) => node,
            _ => abort(E_INVALID_NODE_TYPE)
        }
    }

    public fun extract_fungible_asset_balance_node(node: &ValueNode):
        &FungibleAssetBalanceNode {
        match(node) {
            ValueNode::FungibleAssetBalance(node) => node,
            _ => abort(E_INVALID_NODE_TYPE)
        }
    }

    public fun create_attested_value_node(
        update_key: vector<u8>, allowed_attestors: Object<BasicWhitelist>, ttl: u64
    ): ValueNode {
        ValueNode::AttestedValue(
            AttestedValueNode {
                update_key,
                allowed_attestors,
                value: 0,
                updated_at: 0,
                ttl
            }
        )
    }

    public fun create_fungible_asset_balance_node(
        metadata: Object<Metadata>, owner: address
    ): ValueNode {
        ValueNode::FungibleAssetBalance(FungibleAssetBalanceNode { metadata, owner })
    }

    public fun evaluate(
        node: &ValueNode, _children_values: &vector<u64>, _flag: u256
    ): u64 {
        match(node) {
            ValueNode::AttestedValue(node) => evaluate_attested_value_node(node),
            ValueNode::FungibleAssetBalance(node) => evaluate_fungible_asset_balance_node(node)
        }
    }

    fun evaluate_attested_value_node(node: &AttestedValueNode): u64 {
        let current_time = timestamp::now_microseconds();
        assert!(
            current_time < node.updated_at + node.ttl,
            E_ATTESTED_VALUE_STALE
        );

        node.value
    }

    fun evaluate_fungible_asset_balance_node(
        node: &FungibleAssetBalanceNode
    ): u64 {
        primary_fungible_store::balance(node.owner, node.metadata)
    }

    #[test_only]
    fun setup_tests(aptos_framework: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
    }

    #[test_only]
    public fun create_attested_value_node_with_value(
        signer: &signer, value: u64, key: vector<u8>
    ): ValueNode {
        let whitelist = utils::whitelist_with_signer(signer, key);
        let node = create_attested_value_node(key, whitelist, 1000000);
        let attested_value_node = extract_attested_value_node_mut(&mut node);
        update_attested_value_node(signer, attested_value_node, &key, value);

        node
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    public fun test_evaluate_attested_value_node(
        aptos_framework: signer, signer: signer
    ) {
        setup_tests(&aptos_framework);

        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";

        let node = create_attested_value_node(update_key, whitelist, 1000000);
        let attested_value_node = extract_attested_value_node_mut(&mut node);
        update_attested_value_node(&signer, attested_value_node, &update_key, 100);

        let value = evaluate(&node, &vector::empty(), 0);
        assert!(value == 100, value);
    }

    #[test(signer = @lucid)]
    public fun test_evaluate_fungible_asset_balance_node(signer: signer) {
        let (constructor_ref, fa_metadata, mint_ref) =
            utils::create_test_token(&signer, option::none());
        primary_fungible_store::mint(&mint_ref, signer::address_of(&signer), 100);

        let node =
            create_fungible_asset_balance_node(fa_metadata, signer::address_of(&signer));
        let value = evaluate(&node, &vector::empty(), 0);
        assert!(value == 100, value);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    #[expected_failure(abort_code = E_ATTESTED_VALUE_STALE)]
    public fun test_attested_value_node_fatals_if_stale(
        aptos_framework: signer, signer: signer
    ) {
        setup_tests(&aptos_framework);

        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";

        let node = create_attested_value_node(update_key, whitelist, 1000000);
        let attested_value_node = extract_attested_value_node_mut(&mut node);
        update_attested_value_node(&signer, attested_value_node, &update_key, 100);

        timestamp::update_global_time_for_test(1000001);

        evaluate(&node, &vector::empty(), 0);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    #[expected_failure(abort_code = E_INVALID_UPDATE_KEY)]
    public fun test_attested_value_node_fatals_if_invalid_update_key(
        aptos_framework: signer, signer: signer
    ) {
        setup_tests(&aptos_framework);

        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";
        let other_update_key = b"other";
        let node = create_attested_value_node(update_key, whitelist, 1000000);
        let attested_value_node = extract_attested_value_node_mut(&mut node);
        update_attested_value_node(
            &signer,
            attested_value_node,
            &other_update_key,
            100
        );
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    #[expected_failure(abort_code = E_NOT_ALLOWED_TO_UPDATE)]
    public fun test_attested_value_node_gates_updates(
        aptos_framework: signer, signer: signer
    ) {
        setup_tests(&aptos_framework);

        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";

        let node = create_attested_value_node(update_key, whitelist, 1000000);
        let attested_value_node = extract_attested_value_node_mut(&mut node);
        update_attested_value_node(
            &aptos_framework,
            attested_value_node,
            &update_key,
            100
        );
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    public fun test_update_key_matches_returns_true_if_keys_match(
        aptos_framework: signer, signer: signer
    ) {
        setup_tests(&aptos_framework);

        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";

        let node = create_attested_value_node(update_key, whitelist, 1000000);
        assert!(update_key_matches(&node, &update_key), 1);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    public fun test_update_key_matches_returns_false_if_keys_dont_match(
        aptos_framework: signer, signer: signer
    ) {
        setup_tests(&aptos_framework);

        let whitelist = utils::whitelist_with_signer(&signer, b"t");
        let update_key = b"1234";
        let other_update_key = b"1235";

        let node = create_attested_value_node(update_key, whitelist, 1000000);
        assert!(!update_key_matches(&node, &other_update_key), 1);
    }
}
