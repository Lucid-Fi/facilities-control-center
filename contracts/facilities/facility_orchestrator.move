module lucid::facility_orchestrator {
    use std::option::{Self, Option};
    use std::string::String;
    use std::signer;

    use lucid::facility_core::{Self, FacilityBaseDetails};
    use lucid::borrowing_base_engine::{Self, TreeMutateRef};
    use lucid::whitelist::{Self, BasicWhitelist};
    use lucid::shares_manager::{Self, SharesManager};
    use lucid::share_class::{Self, InterestTracker, VersionedShareDetails};
    use lucid::interest_waterfall::{Self, InterestWaterfall};
    use lucid::principal_waterfall::{Self, PrincipalWaterfall};
    use lucid::share_exchange::{Self, ShareExchangeBase};
    use lucid::compaction_strategy;
    use lucid::utils;
    use lucid::facility_tests;
    use aptos_framework::object::{Self, Object, ExtendRef, ConstructorRef};
    use aptos_framework::fungible_asset::{Metadata};
    use aptos_framework::guid;
    use aptos_framework::primary_fungible_store;


    const ENOT_ADMIN: u64 = 1;
    const ESHARES_OUT_OF_SYNC: u64 = 2;
    const EONLY_LUCID_CAN_CREATE_TOKEN: u64 = 3;
    const ENO_PENDING_TWO_PHASE_PRINCIPAL_WATERFALL: u64 = 4;
    const ECAPITAL_CALL_NOT_COMPLETE: u64 = 5;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct FacilityOrchestrator has key {
        extend_ref: ExtendRef,
        tree_mutate_ref: TreeMutateRef
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Waterfalls has key {
        interest_waterfall: InterestWaterfall,
        principal_waterfall: PrincipalWaterfall,
        interest_deficit_waterfall: Option<InterestWaterfall>,
        principal_deficit_waterfall: Option<PrincipalWaterfall>
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct TwoPhasePrincipalWaterfallRun has key, drop {
        run_id: guid::ID,
        requested_amount: u64
    }

    struct FacilityMutationRef {
        inner: address
    }

    #[view]
    public fun should_run_deficit_interest_waterfall(
        facility: Object<FacilityBaseDetails>
    ): bool acquires FacilityOrchestrator, Waterfalls {
        let facility_address = object::object_address(&facility);
        let _facility_orchestrator =
            borrow_global<FacilityOrchestrator>(facility_address);
        let waterfalls = borrow_global<Waterfalls>(facility_address);

        shares_manager::is_interest_deficit(
            object::address_to_object<SharesManager>(facility_address)
        ) && option::is_some(&waterfalls.interest_deficit_waterfall)
    }

    #[view]
    public fun has_pending_two_phase_principal_waterfall(
        facility: Object<FacilityBaseDetails>
    ): bool {
        let facility_address = object::object_address(&facility);
        exists<TwoPhasePrincipalWaterfallRun>(facility_address)
    }

    #[view]
    public fun two_phase_principal_waterfall_request_amount(
        facility: Object<FacilityBaseDetails>
    ): u64 acquires TwoPhasePrincipalWaterfallRun {
        let facility_address = object::object_address(&facility);
        let run = borrow_global<TwoPhasePrincipalWaterfallRun>(facility_address);
        run.requested_amount
    }

    fun get_principal_waterfall_run_id(
        facility_address: address
    ): guid::ID acquires FacilityOrchestrator, TwoPhasePrincipalWaterfallRun {
        let active_request_run_id =
            facility_core::get_current_funding_request_run_id(facility_address);

        if (exists<TwoPhasePrincipalWaterfallRun>(facility_address)) {
            let run = borrow_global<TwoPhasePrincipalWaterfallRun>(facility_address);
            run.run_id
        } else if (option::is_some(&active_request_run_id)) {
            *option::borrow(&active_request_run_id)
        } else {
            let facility_orchestrator =
                borrow_global<FacilityOrchestrator>(facility_address);
            let facility_signer =
                object::generate_signer_for_extending(&facility_orchestrator.extend_ref);
            let run_guid = utils::create_guid(&facility_signer);
            guid::id(&run_guid)
        }
    }

    public fun create_facility(
        owner: address,
        admin_whitelist: Object<whitelist::BasicWhitelist>,
        originator_admin_whitelist: Object<whitelist::BasicWhitelist>,
        fa_metadata: Object<Metadata>,
        originator_receivable_account: address
    ): ConstructorRef {
        let facility_core_cr =
            facility_core::create_facility(
                owner,
                admin_whitelist,
                originator_admin_whitelist,
                fa_metadata,
                originator_receivable_account
            );

        let tree_mutate_ref = borrowing_base_engine::create_empty(&facility_core_cr);

        let facility_signer = object::generate_signer(&facility_core_cr);
        let extend_ref = object::generate_extend_ref(&facility_core_cr);
        move_to(
            &facility_signer,
            FacilityOrchestrator { extend_ref, tree_mutate_ref }
        );

        shares_manager::create_manager(&facility_core_cr, admin_whitelist);
        facility_core_cr
    }

    public fun add_waterfalls(
        signer: &signer,
        facility: Object<FacilityBaseDetails>,
        interest_waterfall: InterestWaterfall,
        principal_waterfall: PrincipalWaterfall,
        interest_deficit_waterfall: Option<InterestWaterfall>,
        principal_deficit_waterfall: Option<PrincipalWaterfall>
    ) acquires FacilityOrchestrator {
        assert!(
            facility_core::is_admin(facility, signer::address_of(signer)), ENOT_ADMIN
        );
        let facility_orchestrator =
            borrow_global<FacilityOrchestrator>(object::object_address(&facility));
        let facility_signer =
            object::generate_signer_for_extending(&facility_orchestrator.extend_ref);

        move_to(
            &facility_signer,
            Waterfalls {
                interest_waterfall,
                principal_waterfall,
                interest_deficit_waterfall,
                principal_deficit_waterfall
            }
        );
    }

    entry public fun run_principal_waterfall_second_phase(
        facility: Object<FacilityBaseDetails>
    ) acquires FacilityOrchestrator, Waterfalls, TwoPhasePrincipalWaterfallRun {
        assert!(
            has_pending_two_phase_principal_waterfall(facility),
            ENO_PENDING_TWO_PHASE_PRINCIPAL_WATERFALL
        );
        let share_manager = object::convert<FacilityBaseDetails, SharesManager>(facility);

        assert!(
            !shares_manager::has_active_capital_call(share_manager),
            ECAPITAL_CALL_NOT_COMPLETE
        );

        let funding_request = two_phase_principal_waterfall_request_amount(facility);
        run_principal_waterfall_internal(facility, funding_request);
    }

    entry public fun run_principal_waterfall(
        signer: &signer, facility: Object<FacilityBaseDetails>, funding_request: u64
    ) acquires FacilityOrchestrator, Waterfalls, TwoPhasePrincipalWaterfallRun {
        assert!(
            facility_core::is_admin(facility, signer::address_of(signer)), ENOT_ADMIN
        );
        assert!(
            !has_pending_two_phase_principal_waterfall(facility),
            ECAPITAL_CALL_NOT_COMPLETE
        );
        run_principal_waterfall_internal(facility, funding_request);
    }

    entry public fun run_interest_waterfall(
        signer: &signer, facility: Object<FacilityBaseDetails>
    ) acquires FacilityOrchestrator, Waterfalls {
        assert!(
            facility_core::is_admin(facility, signer::address_of(signer)), ENOT_ADMIN
        );
        let is_using_deficit_interest_waterfall =
            should_run_deficit_interest_waterfall(facility);
        let facility_address = object::object_address(&facility);
        let facility_orchestrator = borrow_global<FacilityOrchestrator>(facility_address);
        let waterfalls = borrow_global<Waterfalls>(facility_address);
        let facility_signer =
            object::generate_signer_for_extending(&facility_orchestrator.extend_ref);
        let fa_available =
            facility_core::collect_from_interest_collection_account(&facility_signer);

        if (is_using_deficit_interest_waterfall
            && option::is_some(&waterfalls.interest_deficit_waterfall)) {
            let interest_deficit_waterfall =
                option::borrow(&waterfalls.interest_deficit_waterfall);
            fa_available = interest_waterfall::execute_waterfall_allow_excess(
                &facility_signer, interest_deficit_waterfall, fa_available
            );
        };

        let excess_fa =
            interest_waterfall::execute_waterfall_allow_excess(
                &facility_signer, &waterfalls.interest_waterfall, fa_available
            );

        facility_core::deposit_into_interest_collection_account(facility, excess_fa);

        ensure_core_tests(facility_address);
    }

    entry public fun fix_interest_waterfall_deficit(
        signer: &signer, facility: Object<FacilityBaseDetails>
    ) acquires FacilityOrchestrator, Waterfalls {
        assert!(
            facility_core::is_admin(facility, signer::address_of(signer)), ENOT_ADMIN
        );
        let facility_address = object::object_address(&facility);
        let facility_orchestrator = borrow_global<FacilityOrchestrator>(facility_address);
        let waterfalls = borrow_global<Waterfalls>(facility_address);
        let facility_signer =
            object::generate_signer_for_extending(&facility_orchestrator.extend_ref);

        let fa_available =
            facility_core::collect_from_interest_collection_account(&facility_signer);
        let excess_fa =
            interest_waterfall::execute_waterfall_allow_excess(
                &facility_signer,
                option::borrow(&waterfalls.interest_deficit_waterfall),
                fa_available
            );
        facility_core::deposit_into_interest_collection_account(facility, excess_fa);
    }

    public fun add_share_class(
        signer: &signer,
        orchestrator: Object<FacilityOrchestrator>,
        name: String,
        symbol: String,
        transfer_whitelist: Object<BasicWhitelist>,
        admins_whitelist: Option<address>,
        capital_call_weight: u64,
        capital_call_priority: u64,
        principal_repay_priority: u64,
        interest_tracker_config: Option<InterestTracker>,
        compaction_strategy: Option<compaction_strategy::ContributionCompactionStrategy>
    ): u64 acquires FacilityOrchestrator {
        let _facility = to_facility(orchestrator);
        assert!(signer::address_of(signer) == @lucid, EONLY_LUCID_CAN_CREATE_TOKEN);

        add_share_class_internal(
            signer,
            object::object_address(&orchestrator),
            name,
            symbol,
            transfer_whitelist,
            admins_whitelist,
            capital_call_weight,
            capital_call_priority,
            principal_repay_priority,
            0, // min_risk_weight
            0, // max_risk_weight
            interest_tracker_config,
            compaction_strategy
        )
    }

    fun run_principal_waterfall_internal(
        facility: Object<FacilityBaseDetails>, funding_request: u64
    ) acquires FacilityOrchestrator, Waterfalls, TwoPhasePrincipalWaterfallRun {
        let facility_address = object::object_address(&facility);
        let facility_orchestrator = borrow_global<FacilityOrchestrator>(facility_address);
        let waterfalls = borrow_global<Waterfalls>(facility_address);
        let facility_signer =
            object::generate_signer_for_extending(&facility_orchestrator.extend_ref);

        let fa_available =
            facility_core::collect_from_principal_collection_account(&facility_signer);
        let fa_capital_call =
            facility_core::collect_from_capital_call_holding_account(&facility_signer);
        let run_id = get_principal_waterfall_run_id(facility_address);

        let waterfall_state =
            principal_waterfall::execute_waterfall_allow_excess(
                run_id,
                &facility_signer,
                &waterfalls.principal_waterfall,
                fa_available,
                fa_capital_call,
                funding_request
            );

        cleanup_principal_waterfall(run_id, &facility_signer);

        let remaining_fa =
            principal_waterfall::extract_fa_from_interim_state(waterfall_state);
        facility_core::deposit_into_principal_collection_account(facility, remaining_fa);
    }

    fun add_share_class_internal(
        signer: &signer,
        facility_address: address,
        name: String,
        symbol: String,
        transfer_whitelist: Object<BasicWhitelist>,
        admins_whitelist: Option<address>,
        capital_call_weight: u64,
        capital_call_priority: u64,
        principal_repay_priority: u64,
        min_risk_weight: u64,
        max_risk_weight: u64,
        interest_tracker_config: Option<InterestTracker>,
        compaction_strategy: Option<compaction_strategy::ContributionCompactionStrategy>
    ): u64 acquires FacilityOrchestrator {
        let facility = object::address_to_object<FacilityBaseDetails>(facility_address);
        let facility_orchestrator = borrow_global<FacilityOrchestrator>(facility_address);
        let facility_signer =
            object::generate_signer_for_extending(&facility_orchestrator.extend_ref);

        let admins =
            if (option::is_some(&admins_whitelist)) {
                let whitelist_address = *option::borrow(&admins_whitelist);
                object::address_to_object<BasicWhitelist>(whitelist_address)
            } else {
                facility_core::get_admin_whitelist(
                    object::address_to_object<FacilityBaseDetails>(facility_address)
                )
            };

        let share_class_cr =
            share_class::new_share_class_extensible(
                signer,
                facility_address,
                name,
                symbol,
                transfer_whitelist,
                admins,
                capital_call_weight,
                capital_call_priority,
                principal_repay_priority,
                min_risk_weight,
                max_risk_weight,
                interest_tracker_config
            );
        let share_class =
            object::object_from_constructor_ref<VersionedShareDetails>(&share_class_cr);

        let mint_ref = share_class::generate_mint_ref(&facility_signer, share_class);
        let shares = share_class::mint_with_ref(&mint_ref, 100000000000);
        primary_fungible_store::deposit(signer::address_of(signer), shares);

        if (option::is_some(&compaction_strategy)) {
            let share_class_signer = object::generate_signer(&share_class_cr);
            share_class::enrich_with_cashflow_tracking(
                &share_class_signer,
                share_class,
                *option::borrow(&compaction_strategy)
            );
        };

        let share_manager_new_index =
            shares_manager::add_share_to_self(&facility_signer, share_class);
        let facility_core_new_index =
            facility_core::add_share(
                &facility_signer, facility, object::object_address(&share_class)
            );

        if (share_exchange::exchange_exists_at(facility_address)) {
            let exchange = object::address_to_object<ShareExchangeBase>(facility_address);
            share_exchange::add_mint_ref(
                &facility_signer,
                exchange,
                share_class::generate_mint_ref(&facility_signer, share_class)
            );
        };

        assert!(share_manager_new_index == facility_core_new_index, ESHARES_OUT_OF_SYNC);

        share_manager_new_index
    }

    fun cleanup_principal_waterfall(
        run_id: guid::ID, facility_signer: &signer
    ) acquires TwoPhasePrincipalWaterfallRun {
        let facility_address = signer::address_of(facility_signer);
        let share_manager = object::address_to_object<SharesManager>(facility_address);

        if (shares_manager::has_active_capital_call(share_manager)) {
            let capital_call_amount =
                shares_manager::get_capital_call_total_amount(share_manager);
            move_to(
                facility_signer,
                TwoPhasePrincipalWaterfallRun {
                    run_id,
                    requested_amount: capital_call_amount
                }
            );
        } else {
            teardown_principal_waterfall(facility_signer);
        };

        ensure_core_tests(facility_address);
    }

    fun teardown_principal_waterfall(
        facility_signer: &signer
    ) acquires TwoPhasePrincipalWaterfallRun {
        let facility_address = signer::address_of(facility_signer);
        facility_core::teardown_funding_request(facility_signer);

        if (exists<TwoPhasePrincipalWaterfallRun>(facility_address)) {
            let TwoPhasePrincipalWaterfallRun { .. } =
                move_from<TwoPhasePrincipalWaterfallRun>(facility_address);
        };
    }

    fun to_facility(orchestrator: Object<FacilityOrchestrator>): Object<FacilityBaseDetails> {
        object::convert<FacilityOrchestrator, FacilityBaseDetails>(orchestrator)
    }

    fun ensure_core_tests(vehicle: address) {
        if (facility_tests::test_basket_exists(vehicle)) {
            let run_flags = facility_tests::ensure_satisfied();
            facility_tests::vehicle_tests_satisfied_with_flags(vehicle, run_flags);
        };
    }
}
