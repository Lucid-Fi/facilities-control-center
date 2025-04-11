module lucid::roda_test_harness {
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
    use lucid::facility_orchestrator::{Self, FacilityOrchestrator};
    use lucid::utils;
    use lucid::bb_value_nodes;
    use lucid::roda_waterfall;
    use lucid::compaction_strategy;
    use lucid::bb_complex_nodes;
    use lucid::token_exchanger;
    use lucid::waterfall_overrides;
    use lucid::facility_tests;

    #[test_only]
    use lucid::bb_flags;
    #[test_only]
    use lucid::waterfall_value_providers;

    use aptos_framework::timestamp;
    use aptos_framework::object::{Self, Object, ConstructorRef};
    use aptos_framework::fungible_asset::{Self, MintRef, FungibleAsset, Metadata};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::math64;
    const BB_UPDATE_KEY: vector<u8> = b"lucid";
    const BB_UPDATE_TTL: u64 = 3600000000;
    const ACCRUAL_RATE_DENOMINATOR: u128 = 100000000000000000000;
    const FACILITY_SIZE: u64 = 250000 * 1000000;
    const MIN_DRAW: u64 = 0;

    const ADVANCE_RATE_NUMERATOR: u64 = 8696;
    const ADVANCE_RATE_DENOMINATOR: u64 = 10000;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct TestToken has key {
        mint_ref: MintRef
    }
    
    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct TestPaymentToken has key {
        mint_ref: MintRef
    }

    entry public fun setup_test_facility(
        signer: &signer, admin: address, originator: address
    ) {
        setup_test_facility_internal(signer, admin, originator);
    }

    entry public fun setup_test_facility_with_seed(
        signer: &signer,
        admin: address,
        originator: address,
        seed_prefix: String
    ) {
        setup_test_facility_internal_with_seed(signer, admin, originator, seed_prefix);
    }

    entry public fun update_attested_borrowing_base_value(
        signer: &signer, facility_orchestrator: Object<FacilityOrchestrator>, value: u64
    ) {
        let tree =
            object::convert<FacilityOrchestrator, BorrowingBaseTree>(facility_orchestrator);
        borrowing_base_engine::attest_value(signer, tree, BB_UPDATE_KEY, value);
    }

    public fun setup_test_facility_internal(
        signer: &signer, admin: address, originator: address
    ): Object<FacilityOrchestrator> {
        setup_test_facility_internal_with_seed(
            signer, admin, originator, string::utf8(b"_")
        )
    }

    public fun setup_test_facility_internal_with_seed(
        signer: &signer,
        admin: address,
        originator: address,
        seed_prefix: String
    ): Object<FacilityOrchestrator> {
        let test_token = create_test_token(signer::address_of(signer));
        let test_payment_token = create_test_payment_token(signer::address_of(signer));
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
        
        waterfall_overrides::enable_overrides<waterfall_overrides::InterestWaterfallOverride>(
            &facility_constructor_ref
        );
        token_exchanger::enrich_with_single_token_exchanger(
            &facility_constructor_ref,
            test_payment_token,
            test_token,
            originator_admin_whitelist
        );


        roda_waterfall::enrich_with_roda_waterfall(&facility_constructor_ref);

        let facility_orchestrator =
            object::object_from_constructor_ref<FacilityOrchestrator>(
                &facility_constructor_ref
            );

        build_tree(&facility_constructor_ref, admin_whitelist);

        facility_core::declare_limits_v1(
            &facility_constructor_ref,
            FACILITY_SIZE,
            MIN_DRAW
        );

        add_senior_tranche(
            signer,
            facility_orchestrator,
            admin_whitelist,
            *string::bytes(&seed_prefix)
        );
        add_waterfalls(signer, facility_orchestrator);
        add_tests(&facility_constructor_ref);

        let facility_signer = object::generate_signer(&facility_constructor_ref);
        setup_roda_details(
            &facility_signer, object::object_address(&facility_orchestrator)
        );

        let current_time = utils::truncate_mics_to_days(timestamp::now_microseconds());
        facility_core::declare_funding_periods(
            &facility_constructor_ref,
            current_time,
            current_time + utils::days_to_mics(31),
            current_time,
            current_time + utils::days_to_mics(90)
        );

        facility_orchestrator
    }

    fun setup_roda_details(signer: &signer, facility_address: address) {
        let roda_waterfall =
            object::address_to_object<roda_waterfall::RodaWaterfall>(facility_address);
        let current_time = utils::truncate_mics_to_days(timestamp::now_microseconds());
        let min_util_threshold = current_time + utils::days_to_mics(90);
        let min_util = 250000 * 1000000000;
        let default_interest = yearly_interest_rate_to_micros(3, 100);

        roda_waterfall::set_min_utilization_timestamp(
            signer, roda_waterfall, min_util_threshold
        );

        roda_waterfall::set_min_utilization(signer, roda_waterfall, min_util);

        roda_waterfall::set_default_penalty_interest(
            signer, roda_waterfall, default_interest as u64
        );
    }

    entry public fun execute_interest_waterfall(
        signer: &signer,
        facility_orchestrator: Object<FacilityOrchestrator>,
        start_time: u64,
        end_time: u64
    ) {
        let roda_waterfall =
            object::convert<FacilityOrchestrator, roda_waterfall::RodaWaterfall>(
                facility_orchestrator
            );
        roda_waterfall::set_period(signer, roda_waterfall, start_time, end_time);

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );

        facility_orchestrator::run_interest_waterfall(signer, facility_base);
    }

    entry public fun simulate_loan_payment(
        facility_orchestrator: Object<FacilityOrchestrator>, principal: u64, interest: u64
    ) acquires TestPaymentToken {
        let principal_fa = mint_test_payment_token(facility_orchestrator, principal);
        let interest_fa = mint_test_payment_token(facility_orchestrator, interest);
        let fee_fa = mint_test_payment_token(facility_orchestrator, 0);

        facility_core::receive_payment(
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            ),
            principal_fa,
            interest_fa,
            fee_fa
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

    fun test_token_balance(
        facility_orchestrator: Object<FacilityOrchestrator>, address: address
    ): u64 {
        let fa_metadata =
            facility_core::get_fa_metadata(
                object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                    facility_orchestrator
                )
            );

        primary_fungible_store::balance(address, fa_metadata)
    }

    public entry fun exchange_tokens(
        signer: &signer,
        facility_orchestrator: Object<FacilityOrchestrator>,    
        amount_source: u64,
        amount_target: u64,
        is_principal: bool
    ) {
        token_exchanger::exchange(
            signer,
            object::convert(facility_orchestrator),
            amount_source,
            amount_target,
            is_principal
        );
    }
    
    public fun add_tests(constructor_ref: &ConstructorRef) {
        let tests = facility_tests::empty_tests();
        vector::push_back(&mut tests, facility_tests::borrowing_base_satisfied_test());
        facility_tests::enrich_with_basket(constructor_ref, tests);
    }

    public entry fun mint_test_token_to(
        facility_orchestrator: Object<FacilityOrchestrator>,
        amount: u64,
        to: address
    ) acquires TestToken {
        let fa = mint_test_token(facility_orchestrator, amount);
        primary_fungible_store::deposit(to, fa);
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
    
    fun mint_test_payment_token(
        facility_orchestrator: Object<FacilityOrchestrator>, amount: u64
    ): FungibleAsset acquires TestPaymentToken {
        let fa_metadata =
            token_exchanger::source_metadata(
                object::convert(facility_orchestrator)
            );
        let test_payment_token = borrow_global<TestPaymentToken>(object::object_address(&fa_metadata));

        fungible_asset::mint(&test_payment_token.mint_ref, amount)
    }

    fun add_waterfalls(
        signer: &signer, facility_orchestrator: Object<FacilityOrchestrator>
    ) {
        let principal_waterfall = principal_waterfall::empty();
        let interest_waterfall = interest_waterfall::empty();

        // Principal Waterfall
        let bb_cure_node = principal_waterfall::create_borrowing_base_cure_node();
        let recycle_node = principal_waterfall::create_recycle_node();
        let capital_call_node = principal_waterfall::create_capital_call_facility_node();

        let roda_paydown_node = roda_waterfall::roda_level_senior_share();
        let paydown_senior = principal_waterfall::create_roda_level(roda_paydown_node);

        let roda_sink_principal_node = roda_waterfall::roda_level_roda_sink_principal();
        let principal_sink =
            principal_waterfall::create_roda_level(roda_sink_principal_node);

        principal_waterfall::add_level(&mut principal_waterfall, bb_cure_node);
        principal_waterfall::add_level(&mut principal_waterfall, recycle_node);
        principal_waterfall::add_level(&mut principal_waterfall, capital_call_node);
        principal_waterfall::add_level(&mut principal_waterfall, paydown_senior);
        principal_waterfall::add_level(&mut principal_waterfall, principal_sink);

        // Interest Waterfall
        let minimum_interest_roda = roda_waterfall::roda_level_min_interest();
        let minimum_interest_deficit_roda =
            roda_waterfall::roda_level_min_interest_deficit();
        let min_util_interest_deficit_roda =
            roda_waterfall::roda_level_min_utilization_deficit();
        let minimum_utilization_roda = roda_waterfall::roda_level_min_utilization();
        let default_penalty_roda = roda_waterfall::roda_level_default_penalty();
        let roda_share_interest = roda_waterfall::roda_level_roda_sink_interest();
        let early_close_penalty_roda = roda_waterfall::roda_level_early_close_penalty();
        let repay_senior_roda = roda_waterfall::roda_level_senior_share();

        let minimum_interest_node =
            interest_waterfall::create_roda_level(minimum_interest_roda);
        let minimum_interest_deficit_node =
            interest_waterfall::create_roda_level(minimum_interest_deficit_roda);
        let minimum_utilization_node =
            interest_waterfall::create_roda_level(minimum_utilization_roda);
        let min_util_interest_deficit_node =
            interest_waterfall::create_roda_level(min_util_interest_deficit_roda);
        let default_penalty_node =
            interest_waterfall::create_roda_level(default_penalty_roda);
        let roda_share_interest_node =
            interest_waterfall::create_roda_level(roda_share_interest);
        let early_close_penalty_node =
            interest_waterfall::create_roda_level(early_close_penalty_roda);
        let repay_senior_node = interest_waterfall::create_roda_level(repay_senior_roda);

        // --- Defecit Coverage ---
        let deficit_coverage_level = vector::singleton(minimum_interest_deficit_node);
        vector::push_back(&mut deficit_coverage_level, min_util_interest_deficit_node);

        interest_waterfall::add_dependent_level(
            &mut interest_waterfall, deficit_coverage_level
        );
        // ---- Minimum Return ----
        let min_return_level = vector::singleton(minimum_interest_node);
        vector::push_back(&mut min_return_level, minimum_utilization_node);

        interest_waterfall::add_dependent_level(
            &mut interest_waterfall, min_return_level
        );

        // ---- Default Penalty ----
        interest_waterfall::add_level(&mut interest_waterfall, default_penalty_node);

        // ---- Early Close Penalty ----
        interest_waterfall::add_level(&mut interest_waterfall, early_close_penalty_node);

        // ---- Borrowing Base Cure ----
        let borrowing_base_cure_node =
            interest_waterfall::create_borrowing_base_cure_level();
        interest_waterfall::add_level(&mut interest_waterfall, borrowing_base_cure_node);

        // ---- Repay Senior ----
        interest_waterfall::add_level(&mut interest_waterfall, repay_senior_node);

        // ---- Roda Sink ----
        interest_waterfall::add_level(&mut interest_waterfall, roda_share_interest_node);

        facility_orchestrator::add_waterfalls(
            signer,
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            ),
            interest_waterfall,
            principal_waterfall,
            option::none(),
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
        let interest_rate = yearly_interest_rate_to_micros(14, 100);
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
            option::some(compaction_strategy::compaction_strategy_on_demand())
        );
    }

    fun build_tree(
        constructor_ref: &ConstructorRef, whitelist: Object<BasicWhitelist>
    ) {
        let tree_mutate_ref = borrowing_base_engine::generate_mutate_ref(constructor_ref);
        let advance_rate_node_inner =
            bb_complex_nodes::create_simple_advance_rate_node(
                ADVANCE_RATE_NUMERATOR as u128, ADVANCE_RATE_DENOMINATOR as u128
            );
        let advance_rate_node =
            borrowing_base_engine::create_complex_node(advance_rate_node_inner);

        let attestable_value_node =
            bb_value_nodes::create_attested_value_node(
                BB_UPDATE_KEY, whitelist, BB_UPDATE_TTL
            );
        let bb_value_node =
            borrowing_base_engine::create_value_node(attestable_value_node);
        borrowing_base_engine::add_root(&tree_mutate_ref, advance_rate_node);

        borrowing_base_engine::add_child(&tree_mutate_ref, 0, bb_value_node);
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
    
    fun create_test_payment_token(owner: address): Object<Metadata> {
        let constructor_ref = object::create_sticky_object(owner);
        let mint_ref =
            utils::init_test_metadata_with_primary_store_enabled(
                &constructor_ref, option::none()
            );
        let signer = object::generate_signer(&constructor_ref);

        move_to(&signer, TestPaymentToken { mint_ref });

        object::object_from_constructor_ref<Metadata>(&constructor_ref)
    }

    fun create_whitelist(
        signer: &signer, admin: address, seed: vector<u8>
    ): Object<BasicWhitelist> {
        let whitelist = utils::whitelist_with_signer(signer, seed);
        whitelist::toggle(signer, whitelist, admin, true);
        whitelist
    }

    fun outstanding_principal(
        facility_orchestrator: Object<FacilityOrchestrator>
    ): u64 {
        let share_manager =
            object::convert<FacilityOrchestrator, SharesManager>(facility_orchestrator);
        let share_class = shares_manager::get_share_class_by_index(share_manager, 0);
        share_class::get_current_contributed(share_class)
    }

    entry public fun request_capital_call(
        originator_signer: &signer,
        facility_orchestrator: Object<FacilityOrchestrator>,
        amount: u64
    ) {
        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );
        facility_core::create_capital_call_request(
            originator_signer, facility_base, amount
        );
    }

    entry public fun run_principal_waterfall(
        signer: &signer,
        attested_borrowing_base: u64,
        facility_orchestrator: Object<FacilityOrchestrator>,
        requested_amount: u64,
        fill_capital_call: bool
    ) acquires TestToken {
        facility_orchestrator::run_principal_waterfall(
            signer,
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            ),
            requested_amount
        );

        let capital_call_amount = shares_manager::get_capital_call_amount_remaining(
            object::convert<FacilityOrchestrator, SharesManager>(facility_orchestrator)
        );

        if (capital_call_amount > 0 && fill_capital_call) {
            contribute_principal(
                facility_orchestrator,
                0,
                capital_call_amount
            );

            facility_orchestrator::run_principal_waterfall_second_phase(
                object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                    facility_orchestrator
                )
            );
        };
    }

    inline fun apply_advance_rate(value: u64): u64 {
        math64::mul_div(value, ADVANCE_RATE_NUMERATOR, ADVANCE_RATE_DENOMINATOR)
    }

    #[test_only]
    use aptos_framework::account;

    #[test_only]
    fun setup_tests(aptos_framework: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        timestamp::update_global_time_for_test(1743046027000000);
    }

    #[test_only]
    fun get_distributed_interest(
        facility_orchestrator: Object<FacilityOrchestrator>
    ): u64 {
        let share_manager =
            object::convert<FacilityOrchestrator, SharesManager>(facility_orchestrator);
        let share_class = shares_manager::get_share_class_by_index(share_manager, 0);
        share_class::get_total_distributed_interest(share_class)
    }

    #[test_only]
    fun exchange_principal_and_interest(
        originator: address,
        facility_orchestrator: Object<FacilityOrchestrator>,
        principal: u64,
        interest: u64
    ) acquires TestToken {
        let originator_signer = account::create_signer_for_test(originator);
        mint_test_token_to(facility_orchestrator, principal + interest, originator);
        exchange_tokens(
            &originator_signer,
            object::convert(facility_orchestrator),
            principal,
            principal,
            true
        );
        exchange_tokens(
            &originator_signer,
            object::convert(facility_orchestrator),
            interest,
            interest,
            false
        );
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_facility_setup(aptos_framework: &signer, signer: &signer) {
        setup_tests(aptos_framework);
        setup_test_facility(signer, @0x1, @0x2);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_contribute_principal_from_senior(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken {
        setup_tests(aptos_framework);
        let facility_orchestrator = setup_test_facility_internal(signer, @0x1, @0x2);
        contribute_principal(facility_orchestrator, 0, 1000000000000000000);
    }
    
    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_borrowing_base_satisfied_test(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken {
        setup_tests(aptos_framework);
        let facility_orchestrator = setup_test_facility_internal(signer, @0x1, @0x2);
        contribute_principal(facility_orchestrator, 0, 1000000000000000000);
        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 999999999999999999
        );

        let satisfied = facility_tests::vehicle_tests_satisfied_with_flags(
            object::object_address(&facility_orchestrator),
            0
        );
        assert!(!satisfied, 0);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_attest_borrowing_base_and_collateral(
        aptos_framework: &signer, signer: &signer
    ) {
        setup_tests(aptos_framework);
        let facility_orchestrator = setup_test_facility_internal(signer, @0x1, @0x2);
        let tree =
            object::convert<FacilityOrchestrator, BorrowingBaseTree>(facility_orchestrator);

        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );

        let borrowing_base = borrowing_base_engine::evaluate(tree);
        let raw_collateral =
            borrowing_base_engine::evaluate_with_flag(
                tree, bb_flags::ignore_advance_rate()
            );
        assert!(raw_collateral == 1000000000000000000, raw_collateral);
        assert!(borrowing_base == 869600000000000000, borrowing_base);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_waterfall_distributes_min_interest(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken, TestPaymentToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let facility_orchestrator = setup_test_facility_internal(signer, @0x1, originator);
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );
        contribute_principal(facility_orchestrator, 0, 100 * 1000000);
        simulate_loan_payment(facility_orchestrator, 100 * 1000000, 1189040);
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            100 * 1000000,
            1189040
        );

        let accrued_expected = 1189040;
        execute_interest_waterfall(
            signer,
            facility_orchestrator,
            truncated_time,
            truncated_time + utils::days_to_mics(31)
        );
        let distributed_interest = get_distributed_interest(facility_orchestrator);
        assert!(distributed_interest == accrued_expected, distributed_interest);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_waterfall_excess_interest_flows_to_roda_during_recycle_period(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken, TestPaymentToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );
        contribute_principal(facility_orchestrator, 0, 100 * 1000000);
        simulate_loan_payment(
            facility_orchestrator,
            100 * 1000000,
            1189040 + 123456789
        );
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            100 * 1000000,
            1189040 + 123456789
        );

        let accrued_expected = 1189040;
        execute_interest_waterfall(
            signer,
            facility_orchestrator,
            truncated_time,
            truncated_time + utils::days_to_mics(31)
        );

        let distributed_interest = get_distributed_interest(facility_orchestrator);
        assert!(distributed_interest == accrued_expected, distributed_interest);

        let roda_balance = test_token_balance(facility_orchestrator, originator);
        assert!(roda_balance == 123456789, roda_balance);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_waterfall_excess_interest_pays_down_senior_share_outside_of_recycle_period(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken, TestPaymentToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let originator_signer = account::create_signer_for_test(originator);
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );
        contribute_principal(facility_orchestrator, 0, 100 * 1000000);

        let principal = 100 * 1000000;
        let interest = 1189040 + (50 * 1000000);
        simulate_loan_payment(
            facility_orchestrator,
            principal,
            interest
        );
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            principal,
            interest
        );



        let accrued_expected = 1189040;
        timestamp::update_global_time_for_test(truncated_time
            + utils::days_to_mics(120));
        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );
        execute_interest_waterfall(
            signer,
            facility_orchestrator,
            truncated_time,
            truncated_time + utils::days_to_mics(31)
        );

        let distributed_interest = get_distributed_interest(facility_orchestrator);
        assert!(distributed_interest == accrued_expected, distributed_interest);

        let roda_balance = test_token_balance(facility_orchestrator, originator);
        assert!(roda_balance == 0, roda_balance);

        let outstanding_principal = outstanding_principal(facility_orchestrator);
        assert!(
            outstanding_principal == 50 * 1000000,
            outstanding_principal
        );
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_interest_waterfall_covers_min_utilization(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken, TestPaymentToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let start_time = truncated_time + utils::days_to_mics(92);
        let end_time = start_time + utils::days_to_mics(31);

        timestamp::update_global_time_for_test(start_time);
        contribute_principal(facility_orchestrator, 0, 100 * 1000000);
        let principal = 100 * 1000000;
        let interest = 10000000000000;
        simulate_loan_payment(
            facility_orchestrator,
            principal,
            interest
        );
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            principal,
            interest
        );

        let accrued_expected = 2972602151999;
        timestamp::update_global_time_for_test(end_time);
        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );
        execute_interest_waterfall(
            signer,
            facility_orchestrator,
            start_time,
            end_time
        );

        let distributed_interest = get_distributed_interest(facility_orchestrator);
        assert!(distributed_interest == accrued_expected, distributed_interest);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_waterfall_distributes_min_interest_and_covers_deficit(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken, TestPaymentToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let facility_orchestrator = setup_test_facility_internal(signer, @0x1, originator);
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        update_attested_borrowing_base_value(
            signer, facility_orchestrator, 1000000000000000000
        );
        contribute_principal(facility_orchestrator, 0, 100 * 1000000);

        let accrued_expected = 1189040;
        execute_interest_waterfall(
            signer,
            facility_orchestrator,
            truncated_time,
            truncated_time + utils::days_to_mics(31)
        );

        let next_start = truncated_time + utils::days_to_mics(31);
        let next_end = next_start + utils::days_to_mics(31);
        simulate_loan_payment(
            facility_orchestrator,
            100 * 1000000,
            1189040 + 300
        );
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            100 * 1000000,
            1189040 + 300
        );
        execute_interest_waterfall(
            signer,
            facility_orchestrator,
            next_start,
            next_end
        );

        let distributed_interest = get_distributed_interest(facility_orchestrator);
        assert!(
            distributed_interest == accrued_expected + 300,
            distributed_interest
        );
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_waterfall_excess_interest_cures_borrowing_base_deficit(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken, TestPaymentToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        update_attested_borrowing_base_value(signer, facility_orchestrator, 100000000);
        contribute_principal(facility_orchestrator, 0, 100000000);
        let collateral_deficit = 100000000 - 86960000;
        simulate_loan_payment(
            facility_orchestrator,
            100 * 1000000,
            1189040 + collateral_deficit
        );
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            100 * 1000000,
            1189040 + collateral_deficit
        );

        let accrued_expected = 1189040;
        execute_interest_waterfall(
            signer,
            facility_orchestrator,
            truncated_time,
            truncated_time + utils::days_to_mics(31)
        );

        let distributed_interest = get_distributed_interest(facility_orchestrator);
        assert!(distributed_interest == accrued_expected, distributed_interest);

        let roda_balance = test_token_balance(facility_orchestrator, originator);
        assert!(roda_balance == 0, roda_balance);

        let outstanding_principal = outstanding_principal(facility_orchestrator);
        assert!(outstanding_principal == 86960000, outstanding_principal);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_share_manager_receives_capital_call(
        aptos_framework: &signer, signer: &signer
    ) {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let originator_signer = account::create_signer_for_test(originator);
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let capital_call_amount = 100000;

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );
        let share_manager =
            object::convert<FacilityBaseDetails, SharesManager>(facility_base);

        facility_core::create_capital_call_request(
            &originator_signer, facility_base, capital_call_amount
        );
        facility_core::respond_to_capital_call_request(
            signer, facility_base, capital_call_amount
        );

        update_attested_borrowing_base_value(signer, facility_orchestrator, 100000000);
        facility_orchestrator::run_principal_waterfall(
            signer, facility_base, capital_call_amount
        );

        let active_capital_call =
            shares_manager::get_share_capital_call_total_amount(share_manager, 0);
        assert!(active_capital_call == capital_call_amount, active_capital_call);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_capital_call_capped_by_facility_size(
        aptos_framework: &signer, signer: &signer
    ) {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let originator_signer = account::create_signer_for_test(originator);
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let capital_call_amount = FACILITY_SIZE + 100000;

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );
        let share_manager =
            object::convert<FacilityBaseDetails, SharesManager>(facility_base);

        facility_core::create_capital_call_request(
            &originator_signer, facility_base, capital_call_amount
        );
        facility_core::respond_to_capital_call_request(
            signer, facility_base, capital_call_amount
        );

        update_attested_borrowing_base_value(
            signer, facility_orchestrator, FACILITY_SIZE * 2
        );
        facility_orchestrator::run_principal_waterfall(
            signer, facility_base, capital_call_amount
        );

        let active_capital_call =
            shares_manager::get_share_capital_call_total_amount(share_manager, 0);
        assert!(active_capital_call == FACILITY_SIZE, active_capital_call);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_capital_call_capped_by_borrowing_base(
        aptos_framework: &signer, signer: &signer
    ) {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let originator_signer = account::create_signer_for_test(originator);
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let capital_call_amount = FACILITY_SIZE + 100000;
        let collateral_value = 100000000;

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );
        let share_manager =
            object::convert<FacilityBaseDetails, SharesManager>(facility_base);

        facility_core::create_capital_call_request(
            &originator_signer, facility_base, capital_call_amount
        );
        facility_core::respond_to_capital_call_request(
            signer, facility_base, capital_call_amount
        );

        update_attested_borrowing_base_value(
            signer, facility_orchestrator, collateral_value
        );
        facility_orchestrator::run_principal_waterfall(
            signer, facility_base, capital_call_amount
        );

        let active_capital_call =
            shares_manager::get_share_capital_call_total_amount(share_manager, 0);
        let borrowing_base = apply_advance_rate(collateral_value);
        assert!(active_capital_call == borrowing_base, active_capital_call);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_fulfill_capital_call(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let originator_signer = account::create_signer_for_test(originator);
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let capital_call_amount = 100000;

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );
        let share_manager =
            object::convert<FacilityBaseDetails, SharesManager>(facility_base);

        facility_core::create_capital_call_request(
            &originator_signer, facility_base, capital_call_amount
        );
        facility_core::respond_to_capital_call_request(
            signer, facility_base, capital_call_amount
        );

        update_attested_borrowing_base_value(signer, facility_orchestrator, 100000000);
        facility_orchestrator::run_principal_waterfall(
            signer, facility_base, capital_call_amount
        );

        contribute_principal(facility_orchestrator, 0, capital_call_amount);
        let has_active_capital_call =
            shares_manager::has_active_capital_call(share_manager);
        assert!(!has_active_capital_call, 0xbeef);

        facility_orchestrator::run_principal_waterfall_second_phase(facility_base);

        let originator_balance = test_token_balance(facility_orchestrator, originator);
        assert!(originator_balance == capital_call_amount, originator_balance);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_two_phase_waterfall_cleans_up_after_fulfillment(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let originator_signer = account::create_signer_for_test(originator);
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let facility_address = object::object_address(&facility_orchestrator);
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let capital_call_amount = 100000;

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );
        let share_manager =
            object::convert<FacilityBaseDetails, SharesManager>(facility_base);
        update_attested_borrowing_base_value(signer, facility_orchestrator, 100000000);

        facility_core::create_capital_call_request(
            &originator_signer, facility_base, capital_call_amount
        );
        facility_core::respond_to_capital_call_request(
            signer, facility_base, capital_call_amount
        );
        facility_orchestrator::run_principal_waterfall(
            signer, facility_base, capital_call_amount
        );
        contribute_principal(facility_orchestrator, 0, capital_call_amount);
        facility_orchestrator::run_principal_waterfall_second_phase(facility_base);

        let has_pending_two_phase_principal_waterfall =
            facility_orchestrator::has_pending_two_phase_principal_waterfall(facility_base);
        assert!(!has_pending_two_phase_principal_waterfall, 0xbeef);

        let max_capital_call_amount =
            facility_core::max_capital_call_amount(facility_address);
        assert!(max_capital_call_amount == 0, max_capital_call_amount);

        let has_active_funding_request =
            shares_manager::has_active_capital_call(share_manager);
        assert!(!has_active_funding_request, 0xbeef);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_fulfill_recycle_request(
        aptos_framework: &signer, signer: &signer
    ) acquires TestPaymentToken, TestToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let originator_signer = account::create_signer_for_test(originator);
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let recycle_amount = 100000;

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );

        facility_core::create_recycle_request(
            &originator_signer, facility_base, recycle_amount
        );
        facility_core::respond_to_recycle_request(signer, facility_base, recycle_amount);

        update_attested_borrowing_base_value(signer, facility_orchestrator, 100000000);
        simulate_loan_payment(facility_orchestrator, recycle_amount, 0);
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            recycle_amount,
            0
        );
        facility_orchestrator::run_principal_waterfall(
            signer, facility_base, recycle_amount
        );

        let originator_balance = test_token_balance(facility_orchestrator, originator);
        assert!(originator_balance == recycle_amount, originator_balance);
    }

    #[test(aptos_framework = @aptos_framework, signer = @lucid)]
    fun test_can_fulfill_recycle_request_prioritizes_borrowing_base_cure(
        aptos_framework: &signer, signer: &signer
    ) acquires TestToken, TestPaymentToken {
        setup_tests(aptos_framework);
        let originator = @0xbeef;
        let originator_signer = account::create_signer_for_test(originator);
        let facility_orchestrator = setup_test_facility_internal(
            signer, @0x1, originator
        );
        let current_time = timestamp::now_microseconds();
        let truncated_time = utils::truncate_mics_to_days(current_time);
        let recycle_amount = 100000;

        let facility_base =
            object::convert<FacilityOrchestrator, FacilityBaseDetails>(
                facility_orchestrator
            );

        facility_core::create_recycle_request(
            &originator_signer, facility_base, recycle_amount
        );
        facility_core::respond_to_recycle_request(signer, facility_base, recycle_amount);

        update_attested_borrowing_base_value(signer, facility_orchestrator, 100000);
        contribute_principal(facility_orchestrator, 0, 100000);
        simulate_loan_payment(facility_orchestrator, recycle_amount, 0);
        exchange_principal_and_interest(
            originator,
            facility_orchestrator,
            recycle_amount,
            0
        );

        let borrowing_base = apply_advance_rate(100000);
        let deficit = 100000 - borrowing_base;
        let expected_amount = recycle_amount - deficit + 100000;
        facility_orchestrator::run_principal_waterfall(
            signer, facility_base, recycle_amount
        );

        let originator_balance = test_token_balance(facility_orchestrator, originator);
        assert!(originator_balance == expected_amount, originator_balance);
    }
}
