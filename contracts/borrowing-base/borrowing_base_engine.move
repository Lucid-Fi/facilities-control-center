module lucid::borrowing_base_engine {
    use std::option;
    use std::vector;
    use std::signer;

    use aptos_std::object::{Self, Object, ConstructorRef};

    use lucid::bb_value_nodes::{Self, ValueNode};
    use lucid::bb_complex_nodes::{Self, ComplexNode};

    const E_MAX_CHILDREN_COUNT_EXCEEDED: u64 = 1;
    const E_INVALID_PARENT_NODE: u64 = 2;
    const E_INVALID_OWNER: u64 = 3;
    const E_TREE_NOT_EMPTY: u64 = 4;
    const EBORROWING_BASE_TREE_MISSING: u64 = 5;

    enum BorrowingBaseNodeV1 has store, copy, drop {
        Value(ValueNode),
        Complex {
            node: ComplexNode,
            children_indices: vector<u64>
        }
    }

    enum VersionedBorrowingBaseNode has store, copy, drop {
        V1(BorrowingBaseNodeV1)
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct BorrowingBaseTree has key {
        nodes: vector<VersionedBorrowingBaseNode>
    }

    struct TreeMutateRef has store, drop {
        inner: address
    }

    #[view]
    public fun evaluate(tree: Object<BorrowingBaseTree>): u64 acquires BorrowingBaseTree {
        let tree = borrow_global<BorrowingBaseTree>(object::object_address(&tree));
        evaluate_node(tree, 0, 0)
    }

    #[view]
    public fun tree_exists(account: address): bool {
        exists<BorrowingBaseTree>(account)
    }

    #[view]
    public fun borrowing_base_tree(facility_address: address): Object<BorrowingBaseTree> {
        assert!(
            tree_exists(facility_address),
            EBORROWING_BASE_TREE_MISSING
        );

        object::address_to_object<BorrowingBaseTree>(facility_address)
    }

    public fun evaluate_with_flag(
        tree: Object<BorrowingBaseTree>, flag: u256
    ): u64 acquires BorrowingBaseTree {
        let tree = borrow_global<BorrowingBaseTree>(object::object_address(&tree));
        evaluate_node(tree, 0, flag)
    }

    public fun tree_from_mutate_ref(mutate_ref: &TreeMutateRef): Object<BorrowingBaseTree> {
        object::address_to_object<BorrowingBaseTree>(mutate_ref.inner)
    }

    public entry fun attest_value(
        signer: &signer,
        tree: Object<BorrowingBaseTree>,
        update_key: vector<u8>,
        value: u64
    ) acquires BorrowingBaseTree {
        let i = 0;
        let tree = borrow_global_mut<BorrowingBaseTree>(object::object_address(&tree));

        while (i < tree.nodes.length()) {
            let node = vector::borrow_mut(&mut tree.nodes, i);
            match(node) {
                VersionedBorrowingBaseNode::V1(BorrowingBaseNodeV1::Value(value_node)) => {
                    if (bb_value_nodes::update_key_matches(value_node, &update_key)) {
                        let attested_value_node = bb_value_nodes::extract_attested_value_node_mut(
                            value_node
                        );
                        bb_value_nodes::update_attested_value_node(
                            signer, attested_value_node, &update_key, value
                        );
                    };
                    break;
                }
                _ => {
                    i = i + 1;
                }
            };
        };
    }

    public fun generate_mutate_ref(constructor_ref: &ConstructorRef): TreeMutateRef {
        TreeMutateRef { inner: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun create_empty(constructor_ref: &ConstructorRef): TreeMutateRef {
        let signer = object::generate_signer(constructor_ref);
        move_to(&signer, BorrowingBaseTree { nodes: vector::empty() });

        TreeMutateRef { inner: signer::address_of(&signer) }
    }

    public fun add_root(
        mutate_ref: &TreeMutateRef, node: VersionedBorrowingBaseNode
    ) acquires BorrowingBaseTree {
        add_root_internal(borrow_global_mut<BorrowingBaseTree>(mutate_ref.inner), node);
    }

    public fun add_child(
        mutate_ref: &TreeMutateRef,
        parent_index: u64,
        child_node: VersionedBorrowingBaseNode
    ): u64 acquires BorrowingBaseTree {
        add_child_internal(
            borrow_global_mut<BorrowingBaseTree>(mutate_ref.inner),
            parent_index,
            child_node
        )
    }

    public fun clear_tree(mutate_ref: &TreeMutateRef) acquires BorrowingBaseTree {
        clear_tree_internal(borrow_global_mut<BorrowingBaseTree>(mutate_ref.inner));
    }

    public fun create_value_node(value_node: ValueNode): VersionedBorrowingBaseNode {
        VersionedBorrowingBaseNode::V1(BorrowingBaseNodeV1::Value(value_node))
    }

    public fun create_complex_node(complex_node: ComplexNode): VersionedBorrowingBaseNode {
        VersionedBorrowingBaseNode::V1(
            BorrowingBaseNodeV1::Complex {
                node: complex_node,
                children_indices: vector::empty()
            }
        )
    }

    public fun evaluate_node(
        tree: &BorrowingBaseTree, node_index: u64, flag: u256
    ): u64 {
        let node = vector::borrow(&tree.nodes, node_index);
        match(node) {
            VersionedBorrowingBaseNode::V1(BorrowingBaseNodeV1::Value(value_node)) => bb_value_nodes::evaluate(
                value_node, &vector::empty(), flag
            ),
            VersionedBorrowingBaseNode::V1(
                BorrowingBaseNodeV1::Complex { node: complex_node, children_indices }
            ) => {
                let children = vector::map_ref(
                    children_indices, |index: &u64| evaluate_node(tree, *index, flag)
                );
                bb_complex_nodes::evaluate(complex_node, &children, flag)
            }
        }
    }

    fun add_root_internal(
        tree: &mut BorrowingBaseTree, node: VersionedBorrowingBaseNode
    ) {
        assert!(vector::length(&tree.nodes) == 0, E_TREE_NOT_EMPTY);
        vector::push_back(&mut tree.nodes, node);
    }

    fun add_child_internal(
        tree: &mut BorrowingBaseTree,
        parent_index: u64,
        child_node: VersionedBorrowingBaseNode
    ): u64 {
        let new_child_index = vector::length(&tree.nodes);
        vector::push_back(&mut tree.nodes, child_node);

        let node = vector::borrow_mut(&mut tree.nodes, parent_index);

        match(node) {
            VersionedBorrowingBaseNode::V1(
                BorrowingBaseNodeV1::Complex { node: complex_node, children_indices }
            ) => {
                let current_child_count = children_indices.length();
                let max_child_count = bb_complex_nodes::max_children_count(complex_node);

                assert!(
                    !max_child_count.is_some() || current_child_count < *option::borrow(
                        &max_child_count
                    ),
                    E_MAX_CHILDREN_COUNT_EXCEEDED
                );
                vector::push_back(children_indices, new_child_index);
                new_child_index
            }
            _ => abort(E_INVALID_PARENT_NODE)
        }
    }

    fun clear_tree_internal(tree: &mut BorrowingBaseTree) {
        tree.nodes = vector::empty();
    }

    #[test_only]
    use aptos_framework::primary_fungible_store;
    #[test_only]
    use lucid::utils;
    #[test_only]
    use aptos_framework::timestamp;
    #[test_only]
    use lucid::bb_flags;

    #[test_only]
    fun setup_tests(aptos_framework: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
    }

    #[test_only]
    fun create_empty_test(owner: address): TreeMutateRef {
        let constructor_ref = object::create_object(owner);
        create_empty(&constructor_ref)
    }

    #[test_only]
    public fun create_test_tree(
        constructor_ref: &ConstructorRef, return_value: u64
    ): (TreeMutateRef, Object<BorrowingBaseTree>) acquires BorrowingBaseTree {
        let mutate_ref = create_empty(constructor_ref);
        let signer = object::generate_signer(constructor_ref);
        let value_node =
            bb_value_nodes::create_attested_value_node_with_value(
                &signer, return_value, b"test"
            );
        add_root(&mutate_ref, create_value_node(value_node));
        let tree_object = tree_from_mutate_ref(&mutate_ref);

        (mutate_ref, tree_object)
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    public fun test_can_update_value_node(
        aptos_framework: signer, signer: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";

        let value_node =
            bb_value_nodes::create_attested_value_node(update_key, whitelist, 1000000);
        add_root(&mutate_ref, create_value_node(value_node));

        attest_value(&signer, tree_object, update_key, 100);
        let result = evaluate(tree_object);
        assert!(result == 100, result);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    public fun test_add_two_value_nodes(
        aptos_framework: signer, signer: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let value_node_1 =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 100, b"test");
        let value_node_2 =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 200, b"test");
        let sum_node = bb_complex_nodes::create_addition_node();

        add_root(&mutate_ref, create_complex_node(sum_node));
        add_child(&mutate_ref, 0, create_value_node(value_node_1));
        add_child(&mutate_ref, 0, create_value_node(value_node_2));

        let result = evaluate(tree_object);
        assert!(result == 300, result);
    }

    #[test(
        aptos_framework = @aptos_framework, signer = @lucid, balance_ref = @test_wallet_1
    )]
    public fun test_advance_rate_can_be_applied(
        aptos_framework: signer, signer: signer, balance_ref: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let (_, fa_metadata, fa_mint_ref) =
            utils::create_test_token(&signer, option::none());

        let attested_value_node =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 100, b"test");
        let balance_node =
            bb_value_nodes::create_fungible_asset_balance_node(
                fa_metadata, signer::address_of(&balance_ref)
            );
        let sum_node = bb_complex_nodes::create_addition_node();

        let fa_advance_rate_node =
            bb_complex_nodes::create_simple_advance_rate_node(90, 100);
        let loan_principal_advance_rate_node =
            bb_complex_nodes::create_simple_advance_rate_node(80, 100);

        add_root(&mutate_ref, create_complex_node(sum_node));
        let fa_advance_rate_index =
            add_child(&mutate_ref, 0, create_complex_node(fa_advance_rate_node));
        let loan_principal_advance_rate_index =
            add_child(
                &mutate_ref, 0, create_complex_node(loan_principal_advance_rate_node)
            );

        add_child(&mutate_ref, fa_advance_rate_index, create_value_node(balance_node));
        add_child(
            &mutate_ref,
            loan_principal_advance_rate_index,
            create_value_node(attested_value_node)
        );

        primary_fungible_store::mint(
            &fa_mint_ref, signer::address_of(&balance_ref), 1000
        );

        let result = evaluate(tree_object);
        assert!(result == 980, result);
    }

    #[test(
        aptos_framework = @aptos_framework, signer = @lucid, balance_ref = @test_wallet_1
    )]
    public fun test_advance_rate_can_be_ignored(
        aptos_framework: signer, signer: signer, balance_ref: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let (_, fa_metadata, fa_mint_ref) =
            utils::create_test_token(&signer, option::none());

        let attested_value_node =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 100, b"test");
        let balance_node =
            bb_value_nodes::create_fungible_asset_balance_node(
                fa_metadata, signer::address_of(&balance_ref)
            );
        let sum_node = bb_complex_nodes::create_addition_node();

        let fa_advance_rate_node =
            bb_complex_nodes::create_simple_advance_rate_node(90, 100);
        let loan_principal_advance_rate_node =
            bb_complex_nodes::create_simple_advance_rate_node(80, 100);

        add_root(&mutate_ref, create_complex_node(sum_node));
        let fa_advance_rate_index =
            add_child(&mutate_ref, 0, create_complex_node(fa_advance_rate_node));
        let loan_principal_advance_rate_index =
            add_child(
                &mutate_ref, 0, create_complex_node(loan_principal_advance_rate_node)
            );

        add_child(&mutate_ref, fa_advance_rate_index, create_value_node(balance_node));
        add_child(
            &mutate_ref,
            loan_principal_advance_rate_index,
            create_value_node(attested_value_node)
        );

        primary_fungible_store::mint(
            &fa_mint_ref, signer::address_of(&balance_ref), 1000
        );

        let result = evaluate_with_flag(tree_object, bb_flags::ignore_advance_rate());
        assert!(result == 1100, result);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    #[expected_failure(abort_code = E_INVALID_PARENT_NODE)]
    public fun test_cannot_add_child_to_value_node(
        aptos_framework: signer, signer: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";

        let value_node =
            bb_value_nodes::create_attested_value_node(update_key, whitelist, 1000000);
        add_root(&mutate_ref, create_value_node(value_node));
        add_child(&mutate_ref, 0, create_value_node(value_node));
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    #[expected_failure(abort_code = E_MAX_CHILDREN_COUNT_EXCEEDED)]
    public fun test_max_children_count_exceeded(
        aptos_framework: signer, signer: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let whitelist = utils::whitelist_with_signer(&signer, b"test");
        let update_key = b"test";

        let advance_rate_node = bb_complex_nodes::create_simple_advance_rate_node(
            90, 100
        );
        add_root(&mutate_ref, create_complex_node(advance_rate_node));
        add_child(&mutate_ref, 0, create_complex_node(advance_rate_node));
        add_child(&mutate_ref, 0, create_complex_node(advance_rate_node));
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    public fun test_can_clear_tree(
        aptos_framework: signer, signer: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let value_node_1 =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 100, b"test");
        let value_node_2 =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 200, b"test");

        add_root(&mutate_ref, create_value_node(value_node_1));
        clear_tree(&mutate_ref);
        add_root(&mutate_ref, create_value_node(value_node_2));

        let result = evaluate(tree_object);
        assert!(result == 200, result);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    #[expected_failure(abort_code = E_TREE_NOT_EMPTY)]
    public fun test_cannot_assign_root_twice(
        aptos_framework: signer, signer: signer
    ) acquires BorrowingBaseTree {
        setup_tests(&aptos_framework);

        let mutate_ref = create_empty_test(signer::address_of(&signer));
        let tree_object = tree_from_mutate_ref(&mutate_ref);
        let value_node_1 =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 100, b"test");
        let value_node_2 =
            bb_value_nodes::create_attested_value_node_with_value(&signer, 200, b"test");

        add_root(&mutate_ref, create_value_node(value_node_1));
        add_root(&mutate_ref, create_value_node(value_node_2));
    }
}
