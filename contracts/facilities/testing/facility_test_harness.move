module lucid::facility_test_harness {
    use std::option::{Self};
    use std::string::{Self, String};
    use std::signer;
    use std::vector;

    use lucid::facility_core::{Self, FacilityBaseDetails};
    use lucid::borrowing_base_engine::{Self, BorrowingBaseTree};
    use lucid::whitelist::{Self, BasicWhitelist};
    use lucid::shares_manager::{Self, SharesManager};
    use lucid::share_class::{Self};
    use lucid::interest_waterfall::{Self};
    use lucid::principal_waterfall::{Self};
    use lucid::waterfall_value_providers;
    use lucid::facility_orchestrator::{Self, FacilityOrchestrator};
    use lucid::utils;
    use lucid::bb_value_nodes;

    use aptos_framework::object::{Self, Object, ConstructorRef};
    use aptos_framework::fungible_asset::{Self, MintRef, FungibleAsset, Metadata};

    const BB_UPDATE_KEY: vector<u8> = b"lucid";
    const BB_UPDATE_TTL: u64 = 3600000000;
    const ACCRUAL_RATE_DENOMINATOR: u128 = 10000000000000000;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct TestToken has key {
        mint_ref: MintRef
    }

    entry public fun setup_test_facility(
        signer: &signer,
        admin: address,
        originator: address,
        servicer: address,
        data_provider: address
    ) {
        setup_test_facility_internal(
            signer,
            admin,
            originator,
            servicer,
            data_provider
        );
    }

    entry public fun setup_test_facility_with_seed(
        signer: &signer,
        admin: address,
        originator: address,
        servicer: address,
        data_provider: address,
        seed_prefix: String
    ) {
        setup_test_facility_internal_with_seed(
            signer,
            admin,
            originator,
            servicer,
            data_provider,
            seed_prefix
        );
    }

    entry public fun update_attested_borrowing_base_value(
        signer: &signer, facility_orchestrator: Object<FacilityOrchestrator>, value: u64
    ) {
        let tree =
            object::convert<FacilityOrchestrator, BorrowingBaseTree>(facility_orchestrator);
        borrowing_base_engine::attest_value(signer, tree, BB_UPDATE_KEY, value);
    }

    public fun setup_test_facility_internal(
        signer: &signer,
        admin: address,
        originator: address,
        servicer: address,
        data_provider: address
    ): Object<FacilityOrchestrator> {
        setup_test_facility_internal_with_seed(
            signer,
            admin,
            originator,
            servicer,
            data_provider,
            string::utf8(b"_")
        )
    }

    public fun setup_test_facility_internal_with_seed(
        signer: &signer,
        admin: address,
        originator: address,
        servicer: address,
        data_provider: address,
        seed_prefix: String
    ): Object<FacilityOrchestrator> {
        let test_token = create_test_token(signer::address_of(signer));
        let admin_whitelist = create_whitelist(signer, admin, b"admin whitelist");
        let originator_admin_whitelist =
            create_whitelist(signer, originator, b"originator admin whitelist");

        let facility_constructor_ref =
            facility_orchestrator::create_facility(
                admin,
                admin_whitelist,
                originator_admin_whitelist,
                test_token,
                originator
            );

        let facility_orchestrator =
            object::object_from_constructor_ref<FacilityOrchestrator>(
                &facility_constructor_ref
            );

        build_tree(&facility_constructor_ref, admin_whitelist);

        add_senior_tranche(
            signer,
            facility_orchestrator,
            admin_whitelist,
            *string::bytes(&seed_prefix)
        );
        add_equity_tranche(
            signer,
            facility_orchestrator,
            admin_whitelist,
            *string::bytes(&seed_prefix)
        );
        add_waterfalls(
            signer,
            facility_orchestrator,
            servicer,
            data_provider
        );

        facility_orchestrator
    }

    entry public fun simulate_loan_payment(
        facility_orchestrator: Object<FacilityOrchestrator>, principal: u64, interest: u64
    ) acquires TestToken {
        let principal_fa = mint_test_token(facility_orchestrator, principal);
        let interest_fa = mint_test_token(facility_orchestrator, interest);
        let fee_fa = mint_test_token(facility_orchestrator, 0);

        facility_core::receive_payment(
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            ),
            principal_fa,
            interest_fa,
            fee_fa
        );
    }

    public entry fun exchange_tokens_by_rate(
        signer: &signer,
        facility_orchestrator: Object<FacilityOrchestrator>,
        amount_target: u64,
        conversion_rate_numerator: u64,
        conversion_rate_denominator: u64,
        is_principal: bool
    ) {
        let token_exchanger = object::convert(facility_orchestrator);
        let source_amount = amount_target * conversion_rate_numerator / conversion_rate_denominator;
        token_exchanger::exchange(
            signer,
            token_exchanger,
            source_amount,
            amount_target,
            is_principal
        );
    }

    entry public fun contribute_principal(
        facility_orchestrator: Object<FacilityOrchestrator>, share_index: u64, amount: u64
    ) acquires TestToken {
        let principal_fa = mint_test_token(facility_orchestrator, amount);
        let share_manager =
            object::convert<FacilityOrchestrator, SharesManager>(facility_orchestrator);
        shares_manager::fund_facility(share_manager, share_index, principal_fa);
    }

    fun mint_test_token(
        facility_orchestrator: Object<FacilityOrchestrator>, amount: u64
    ): FungibleAsset acquires TestToken {
        let fa_metadata =
            facility_core::get_fa_metadata(
                object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                    facility_orchestrator
                )
            );
        let test_token = borrow_global<TestToken>(object::object_address(&fa_metadata));

        fungible_asset::mint(&test_token.mint_ref, amount)
    }

    fun add_waterfalls(
        signer: &signer,
        facility_orchestrator: Object<FacilityOrchestrator>,
        servicer: address,
        data_provider: address
    ) {
        let shares_manager =
            object::convert<FacilityOrchestrator, SharesManager>(facility_orchestrator);
        let senior_tranche = shares_manager::get_share_class_by_index(shares_manager, 0);
        let equity_tranche = shares_manager::get_share_class_by_index(shares_manager, 1);
        let principal_waterfall = principal_waterfall::empty();
        let interest_waterfall = interest_waterfall::empty();
        let interest_deficit_waterfall = interest_waterfall::empty();

        // Principal Waterfall
        let bb_cure_node = principal_waterfall::create_borrowing_base_cure_node();
        let funding_request_node =
            principal_waterfall::create_fulfill_funding_request_node();
        let capital_call_node = principal_waterfall::create_capital_call_facility_node();
        let repay_facility_node = principal_waterfall::create_repay_facility_node();
        principal_waterfall::add_level(&mut principal_waterfall, bb_cure_node);
        principal_waterfall::add_level(&mut principal_waterfall, funding_request_node);
        principal_waterfall::add_level(&mut principal_waterfall, capital_call_node);
        principal_waterfall::add_level(&mut principal_waterfall, repay_facility_node);

        // Interest Waterfall

        // ---- Servicer Fees ----
        let servicer_receiver = interest_waterfall::create_raw_address_receiver(servicer);
        let data_provider_receiver =
            interest_waterfall::create_raw_address_receiver(data_provider);

        let fee_numerator = 2500000;
        let fee_denominator = 10000000;
        let outstanding_principal_provider =
            waterfall_value_providers::create_outstanding_principal_provider(
                option::none()
            );
        let servicer_fee_node =
            interest_waterfall::create_value_ratio_level(
                servicer_receiver, fee_numerator, outstanding_principal_provider
            );
        let data_provider_fee_node =
            interest_waterfall::create_value_ratio_level(
                data_provider_receiver,
                fee_denominator - fee_numerator,
                outstanding_principal_provider
            );
        let fee_level_vector = vector::singleton(servicer_fee_node);
        vector::push_back(&mut fee_level_vector, data_provider_fee_node);
        let weights_vector = vector::singleton(50);
        vector::push_back(&mut weights_vector, 50);
        interest_waterfall::add_split_level(
            &mut interest_waterfall, weights_vector, fee_level_vector
        );

        // ---- Borrowing Base Cure ----
        let borrowing_base_cure_node =
            interest_waterfall::create_borrowing_base_cure_level();
        interest_waterfall::add_level(&mut interest_waterfall, borrowing_base_cure_node);
        interest_waterfall::add_level(
            &mut interest_deficit_waterfall, borrowing_base_cure_node
        );

        // ---- Senior Tranche Min Return ----
        let senior_tranche_receiver =
            interest_waterfall::create_share_class_receiver(
                object::object_address(&senior_tranche)
            );
        let interest_owed_provider =
            waterfall_value_providers::create_interest_owed_provider(0);
        let senior_tranche_min_return_node =
            interest_waterfall::create_value_ratio_level(
                senior_tranche_receiver, 1000000000, interest_owed_provider
            );
        interest_waterfall::add_level(
            &mut interest_waterfall, senior_tranche_min_return_node
        );
        interest_waterfall::add_level(
            &mut interest_deficit_waterfall, senior_tranche_min_return_node
        );

        // ---- Equity Tranche Catchup ----
        let equity_tranche_receiver =
            interest_waterfall::create_share_class_receiver(
                object::object_address(&equity_tranche)
            );
        let prior_state_fa_available_provider =
            waterfall_value_providers::create_prior_state_fa_available_provider(1);
        let equity_tranche_catchup_node =
            interest_waterfall::create_value_ratio_level(
                equity_tranche_receiver, 300000000, prior_state_fa_available_provider
            );
        interest_waterfall::add_level(
            &mut interest_waterfall, equity_tranche_catchup_node
        );

        // ---- Shared Sink ----
        let senior_sink = interest_waterfall::create_sink_level(senior_tranche_receiver);
        let equity_sink = interest_waterfall::create_sink_level(equity_tranche_receiver);
        let split_sink_vector = vector::singleton(senior_sink);
        vector::push_back(&mut split_sink_vector, equity_sink);
        let weights_vector = vector::singleton(70);
        vector::push_back(&mut weights_vector, 30);
        interest_waterfall::add_split_level(
            &mut interest_waterfall, weights_vector, split_sink_vector
        );

        facility_orchestrator::add_waterfalls(
            signer,
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            ),
            interest_waterfall,
            principal_waterfall,
            option::some(interest_deficit_waterfall),
            option::none()
        );
    }

    fun yearly_interest_rate_to_micros(
        yearly_interest_rate_numerator: u128, yearly_interest_rate_denominator: u128
    ): u128 {
        let numerator = yearly_interest_rate_numerator * ACCRUAL_RATE_DENOMINATOR;
        let denominator = yearly_interest_rate_denominator * 365 * 24 * 60 * 60
            * 1000000;

        numerator / denominator
    }

    fun add_senior_tranche(
        signer: &signer,
        facility_orchestrator: Object<FacilityOrchestrator>,
        whitelist: Object<BasicWhitelist>,
        seed_prefix: vector<u8>
    ) {
        let interest_rate = yearly_interest_rate_to_micros(7, 100);
        let interest_tracker =
            share_class::new_interest_tracker(
                0,
                share_class::new_minimum_interest_rate(interest_rate as u128),
                share_class::new_simple_deficit(0)
            );

        vector::append(&mut seed_prefix, b" s");

        facility_orchestrator::add_share_class(
            signer,
            facility_orchestrator,
            string::utf8(seed_prefix),
            string::utf8(seed_prefix),
            whitelist,
            option::none(),
            100,
            1,
            1,
            option::some(interest_tracker),
            option::none()
        );
    }

    fun add_equity_tranche(
        signer: &signer,
        facility_orchestrator: Object<FacilityOrchestrator>,
        whitelist: Object<BasicWhitelist>,
        seed_prefix: vector<u8>
    ) {
        vector::append(&mut seed_prefix, b" e");

        facility_orchestrator::add_share_class(
            signer,
            facility_orchestrator,
            string::utf8(seed_prefix),
            string::utf8(seed_prefix),
            whitelist,
            option::none(),
            0,
            0,
            2,
            option::none(),
            option::none()
        );
    }

    fun build_tree(
        constructor_ref: &ConstructorRef, whitelist: Object<BasicWhitelist>
    ) {
        let tree_mutate_ref = borrowing_base_engine::generate_mutate_ref(constructor_ref);
        let attestable_value_node =
            bb_value_nodes::create_attested_value_node(
                BB_UPDATE_KEY, whitelist, BB_UPDATE_TTL
            );
        borrowing_base_engine::add_root(
            &tree_mutate_ref,
            borrowing_base_engine::create_value_node(attestable_value_node)
        );
    }

    fun create_test_token(owner: address): Object<Metadata> {
        let constructor_ref = object::create_sticky_object(owner);
        let mint_ref =
            utils::init_test_metadata_with_primary_store_enabled(
                &constructor_ref, option::none()
            );
        let signer = object::generate_signer(&constructor_ref);

        move_to(&signer, TestToken { mint_ref });

        object::object_from_constructor_ref<Metadata>(&constructor_ref)
    }

    fun create_whitelist(
        signer: &signer, admin: address, seed: vector<u8>
    ): Object<BasicWhitelist> {
        let whitelist = utils::whitelist_with_signer(signer, seed);
        whitelist::toggle(signer, whitelist, admin, true);
        whitelist
    }

    #[test_only]
    use aptos_framework::timestamp;

    #[test_only]
    fun setup_tests(aptos_framework: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        timestamp::update_global_time_for_test(1);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_facility_setup(aptos_framework: &signer, signer: &signer) {
        setup_tests(aptos_framework);
        setup_test_facility(signer, @0x1, @0x2, @0x3, @0x4);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_contribute_principal_from_senior(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken {
        setup_tests(aptos_framework);
        let facility_orchestrator =
            setup_test_facility_internal(signer, @0x1, @0x2, @0x3, @0x4);
        contribute_principal(facility_orchestrator, 0, 1000000000000000000);

    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_contribute_principal_from_equity(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken {
        setup_tests(aptos_framework);
        let facility_orchestrator =
            setup_test_facility_internal(signer, @0x1, @0x2, @0x3, @0x4);
        contribute_principal(facility_orchestrator, 1, 1000000000000000000);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_update_attested_value(
        aptos_framework: &signer, signer: &signer
    ) {
        setup_tests(aptos_framework);
        let facility_orchestrator =
            setup_test_facility_internal(signer, @0x1, @0x2, @0x3, @0x4);
        let tree =
            object::convert<FacilityOrchestrator, BorrowingBaseTree>(facility_orchestrator);

        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );
        let value = borrowing_base_engine::evaluate(tree);
        assert!(value == 1000000000000000000, value);
    }
}
