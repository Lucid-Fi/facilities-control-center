module lucid::share_class {
    use std::signer;
    use std::string::{String};
    use std::option::{Self, Option};
    use std::vector;

    use aptos_framework::object::{Self, Object, ExtendRef, ConstructorRef};
    use aptos_framework::fungible_asset::{Self, FungibleAsset};
    use aptos_framework::timestamp;
    use aptos_framework::event;

    use aptos_std::math64;

    use lucid::facility_core::{Self, FacilityBaseDetails};
    use lucid::passthrough_token::{Self, PassThroughMintRef};
    use lucid::whitelist::BasicWhitelist;
    use lucid::aggregates::{Self, TimeWeightedValue};
    use lucid::compaction_strategy::{Self, ContributionCompactionStrategy};
    use lucid::time_series_tracker;

    const EINCORRECT_FA: u64 = 1;
    const EREPAYING_MORE_PRINCIPAL_THAN_CONTRIBUTED: u64 = 2;
    const ENOT_A_FACILITY: u64 = 3;
    const ENOT_ADMIN: u64 = 4;
    const EONLY_DEPLOYER_CAN_CREATE_TOKEN: u64 = 5;
    const ENOT_FACILITY: u64 = 6;
    const ENO_INTEREST_TRACKER: u64 = 7;
    const EINVALID_INTEREST_TYPE: u64 = 8;
    const ECASHFLOW_TRACKER_ALREADY_EXISTS: u64 = 9;
    const EMIN_CAPITAL_CALL_BELOW_MIN_DRAW: u64 = 10;

    const ACCRUAL_RATE_DENOMINATOR: u128 = 100000000000000000000;
    const RISK_DENOMINATOR: u128 = 1000000000;

    enum InterestType has store, copy, drop {
        FixedCoupon {
            coupon_amount: u64,
            minimum_interval: u64
        },
        MinimumInterestRate {
            accrual_rate: u128
        }
    }

    enum DeficitTracker has store, copy, drop {
        SimpleDeficit {
            deficit: u64
        }
    }

    enum ClaimableType has copy, drop {
        Principal,
        Interest
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct InterestTracker has key, copy, drop {
        last_interest_paid_timestamp: u64,
        last_interest_payment: u64,
        interest: InterestType,
        deficit: DeficitTracker
    }

    struct ShareDetailsV1 has store, drop {
        facility: address,
        total_distributed_interest: u64,
        total_contributed: u64,
        time_weighted_contribution: TimeWeightedValue,
        current_contributed: u64,
        capital_call_weight: u64,
        capital_call_priority: u64,
        principal_repay_priority: u64,
        min_risk_weight: u64,
        max_risk_weight: u64,
        mint_ref: PassThroughMintRef,
        extend_ref: ExtendRef
    }

    struct ShareMintRef has store, drop {
        inner: address
    }

    struct Cashflow has store, copy, drop {
        is_outflow: bool,
        amount: u64
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct CashflowTracker has key, drop {
        cashflows: time_series_tracker::TimeSeriesTracker<Cashflow>,
        compaction_strategy: ContributionCompactionStrategy
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    enum VersionedShareDetails has key {
        ShareDetailsV1(ShareDetailsV1)
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct CapitalCall has key, copy, drop {
        total_amount: u64,
        amount_remaining: u64
    }

    #[event]
    struct ShareCreatedEventV0 has drop, store {
        share_address: address,
        facility_address: address,
        name: String,
        symbol: String,
        transfer_whitelist: address,
        admins: address,
        capital_call_weight: u64,
        capital_call_priority: u64,
        principal_repay_priority: u64,
        min_risk_weight: u64,
        max_risk_weight: u64
    }

    #[event]
    struct CapitalCallInitiatedEventV0 has drop, store {
        facility_address: address,
        share_address: address,
        amount: u64
    }

    #[event]
    struct CapitalCallPaidDownEventV0 has drop, store {
        facility_address: address,
        share_address: address,
        amount: u64,
        remaining_amount: u64
    }

    #[event]
    struct InterestDistributedEventV0 has drop, store {
        facility_address: address,
        share_address: address,
        amount: u64,
        deficit: u64,
        total_distributed_interest: u64
    }

    #[event]
    struct PrincipalRepaidEventV0 has drop, store {
        facility_address: address,
        share_address: address,
        amount: u64,
        outstanding_principal: u64
    }

    #[event]
    struct ContributionEventV0 has drop, store {
        facility_address: address,
        share_address: address,
        amount: u64,
        total_contributed: u64,
        current_contributed: u64,
        time_weighted_contribution: u64
    }

    #[view]
    public fun get_facility(
        share_details: Object<VersionedShareDetails>
    ): Object<FacilityBaseDetails> acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => object::address_to_object(
                share_details.facility
            )
        }
    }

    #[view]
    public fun get_facility_address(
        share_details: Object<VersionedShareDetails>
    ): address acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.facility
        }
    }

    #[view]
    public fun get_total_contributed(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.total_contributed
        }
    }

    #[view]
    public fun get_current_contributed(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.current_contributed
        }
    }

    #[view]
    public fun get_capital_call_weight(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.capital_call_weight
        }
    }

    #[view]
    public fun get_capital_call_priority(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.capital_call_priority
        }
    }

    #[view]
    public fun get_principal_repay_priority(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.principal_repay_priority
        }
    }

    #[view]
    public fun get_total_distributed_interest(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.total_distributed_interest
        }
    }

    #[view]
    public fun get_min_risk_weight(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.min_risk_weight
        }
    }

    #[view]
    public fun get_max_risk_weight(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details.max_risk_weight
        }
    }

    #[view]
    public fun get_expected_interest(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails, InterestTracker {
        let share_address = object::object_address(&share_details);
        let share_details = borrow_global<VersionedShareDetails>(share_address);

        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => get_expected_interest_v1(
                share_address, share_details
            )
        }
    }

    #[view]
    public fun get_capital_call_total_amount(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires CapitalCall {
        let share_address = object::object_address(&share_details);
        if (!exists<CapitalCall>(share_address)) { 0 }
        else {
            let capital_call = borrow_global<CapitalCall>(share_address);
            capital_call.total_amount
        }
    }

    #[view]
    public fun get_capital_call_amount_remaining(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires CapitalCall {
        let share_address = object::object_address(&share_details);
        if (!exists<CapitalCall>(share_address)) { 0 }
        else {
            let capital_call = borrow_global<CapitalCall>(share_address);
            capital_call.amount_remaining
        }
    }

    #[view]
    public fun has_active_capital_call(
        share_details: Object<VersionedShareDetails>
    ): bool {
        let share_address = object::object_address(&share_details);
        exists<CapitalCall>(share_address)
    }

    #[view]
    public fun is_interest_deficit(
        share_details: Object<VersionedShareDetails>
    ): bool acquires InterestTracker {
        let share_address = object::object_address(&share_details);
        if (!exists<InterestTracker>(share_address)) { false }
        else {
            let interest_tracker = borrow_global<InterestTracker>(share_address);
            let (_, owed_deficit) = get_deficit_internal(&interest_tracker.deficit);
            owed_deficit > 0
        }
    }

    #[view]
    public fun get_time_weighted_contribution(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires VersionedShareDetails {
        let share_details =
            borrow_global<VersionedShareDetails>(object::object_address(&share_details));
        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => aggregates::get_time_weighted_value(
                &share_details.time_weighted_contribution
            )
        }
    }

    #[view]
    public fun risk_weight_denominator(): u128 {
        RISK_DENOMINATOR
    }

    #[view]
    public fun derive_drawdown_balances(
        share_details: Object<VersionedShareDetails>
    ): (vector<u64>, vector<u64>) acquires CashflowTracker {
        let share_address = object::object_address(&share_details);
        let cashflow_tracker = borrow_global<CashflowTracker>(share_address);
        let (values, timestamps) =
            time_series_tracker::get_parts(&cashflow_tracker.cashflows);

        let balances = vector::empty<u64>();

        let i = 0;
        let accumulated_balance = 0;

        while (i < vector::length(values)) {
            let cashflow = vector::borrow(values, i);
            accumulated_balance =
                if (cashflow.is_outflow) {
                    accumulated_balance + cashflow.amount
                } else {
                    accumulated_balance - cashflow.amount
                };

            vector::push_back(&mut balances, accumulated_balance);
            i = i + 1;
        };

        (balances, *timestamps)
    }

    #[view]
    public fun get_last_interest_payment_timestamp(
        share_details: Object<VersionedShareDetails>
    ): u64 acquires InterestTracker {
        let share_address = object::object_address(&share_details);
        assert!(exists<InterestTracker>(share_address), ENO_INTEREST_TRACKER);

        let interest_tracker = borrow_global<InterestTracker>(share_address);
        interest_tracker.last_interest_payment
    }

    #[view]
    public fun get_minium_interest_accrual_per_microsecond(
        share_details: Object<VersionedShareDetails>
    ): (u128, u128) acquires InterestTracker {
        let share_address = object::object_address(&share_details);
        assert!(exists<InterestTracker>(share_address), ENO_INTEREST_TRACKER);

        let interest_tracker = borrow_global<InterestTracker>(share_address);
        match(interest_tracker.interest) {
            InterestType::MinimumInterestRate { accrual_rate } =>(accrual_rate, ACCRUAL_RATE_DENOMINATOR),
            _ => abort EINVALID_INTEREST_TYPE
        }
    }

    public fun to_passthrough_index(claimable_type: ClaimableType): u64 {
        match(claimable_type) {
            ClaimableType::Principal => 0,
            ClaimableType::Interest => 1
        }
    }

    public fun mint_ref_to_address(share_mint_ref: &ShareMintRef): address {
        share_mint_ref.inner
    }

    public fun generate_mint_ref(
        facility_signer: &signer, share_details: Object<VersionedShareDetails>
    ): ShareMintRef acquires VersionedShareDetails {
        let share_details_address = object::object_address(&share_details);
        let share_details_versioned =
            borrow_global<VersionedShareDetails>(share_details_address);
        let share_details = extract_share_details_v1(share_details_versioned);

        assert!(
            signer::address_of(facility_signer) == share_details.facility,
            ENOT_FACILITY
        );

        ShareMintRef { inner: share_details_address }
    }

    fun get_deficit_internal(deficit: &DeficitTracker): (u64, u64) {
        match(deficit) {
            DeficitTracker::SimpleDeficit { deficit } =>(*deficit, *deficit)
        }
    }

    fun get_expected_interest_v1(
        share_address: address, share_details_v1: &ShareDetailsV1
    ): u64 acquires InterestTracker {
        let interest_tracker = borrow_global<InterestTracker>(share_address);
        let (real_deficit, owed_deficit) =
            get_deficit_internal(&interest_tracker.deficit);
        let current_time = timestamp::now_microseconds();

        match(interest_tracker.interest) {
            InterestType::FixedCoupon { coupon_amount, minimum_interval } => {
                let coupon_count = (current_time - interest_tracker.last_interest_payment)
                    / minimum_interval;

                (coupon_count * coupon_amount) + owed_deficit
            },
            InterestType::MinimumInterestRate { accrual_rate } => {
                let contributed_weighted = aggregates::numerator_time_weighted_value(
                    &share_details_v1.time_weighted_contribution
                );
                let total_accrued = ((accrual_rate * contributed_weighted) / ACCRUAL_RATE_DENOMINATOR) as u64;
                let expected_interest = total_accrued - share_details_v1.total_distributed_interest;

                expected_interest - real_deficit + owed_deficit
            }
        }
    }

    public fun facility(share_details: &VersionedShareDetails): Object<FacilityBaseDetails> {
        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => object::address_to_object(
                share_details.facility
            )
        }
    }

    #[lint::skip(needless_mutable_reference)]
    public fun initiate_capital_call(
        signer: &signer, share_details_obj: Object<VersionedShareDetails>, amount: u64
    ) acquires VersionedShareDetails {
        let share_details_versioned =
            borrow_global_mut<VersionedShareDetails>(
                object::object_address(&share_details_obj)
            );
        let share_details = extract_share_details_v1(share_details_versioned);
        let min_draw = facility_core::min_draw(share_details.facility);

        assert!(share_details.facility == signer::address_of(signer), ENOT_FACILITY);
        assert!(amount >= min_draw, EMIN_CAPITAL_CALL_BELOW_MIN_DRAW);

        let share_details_signer =
            object::generate_signer_for_extending(&share_details.extend_ref);
        move_to(
            &share_details_signer,
            CapitalCall { total_amount: amount, amount_remaining: amount }
        );

        event::emit(
            CapitalCallInitiatedEventV0 {
                facility_address: share_details.facility,
                share_address: object::object_address(&share_details_obj),
                amount
            }
        );
    }

    public fun pay_down_contributed(
        share_details_obj: &Object<VersionedShareDetails>, fa: FungibleAsset
    ): FungibleAsset acquires VersionedShareDetails, CashflowTracker {
        let share_details_address = object::object_address(share_details_obj);
        let current_contributed = get_current_contributed(*share_details_obj);
        let facility = get_facility(*share_details_obj);
        let facility_address = object::object_address(&facility);
        let share_details_versioned =
            borrow_global_mut<VersionedShareDetails>(share_details_address);
        let amount = fungible_asset::amount(&fa);
        let repay_amount = math64::min(amount, current_contributed);
        let repay_fa = fungible_asset::extract(&mut fa, repay_amount);

        assert!(facility_core::is_correct_fa(facility, &fa), EINCORRECT_FA);
        on_repay(share_details_versioned, repay_amount);

        let passthrough_token =
            object::convert<VersionedShareDetails, passthrough_token::PassThroughTokenState>(
                *share_details_obj
            );
        let claimable_type_index = to_passthrough_index(ClaimableType::Principal);

        passthrough_token::increase_payout(
            passthrough_token, repay_fa, claimable_type_index
        );

        try_track_cashflow(share_details_address, false, repay_amount);

        event::emit(
            PrincipalRepaidEventV0 {
                facility_address,
                share_address: share_details_address,
                amount: repay_amount,
                outstanding_principal: current_contributed - repay_amount
            }
        );

        fa
    }

    public fun fund_facility(
        share_details_obj: Object<VersionedShareDetails>, fa: FungibleAsset
    ) acquires VersionedShareDetails, CapitalCall, CashflowTracker {
        let facility = get_facility(share_details_obj);
        let amount = fungible_asset::amount(&fa);

        assert!(facility_core::is_correct_fa(facility, &fa), EINCORRECT_FA);

        facility_core::fund_capital_call(facility, fa);
        on_contribution(share_details_obj, amount);
    }

    fun distribute_interest_internal(
        share_details_obj: Object<VersionedShareDetails>, fa: FungibleAsset, deficit: u64
    ) acquires VersionedShareDetails {
        let share_details_versioned =
            borrow_global_mut<VersionedShareDetails>(
                object::object_address(&share_details_obj)
            );
        let share_details = extract_share_details_v1_mut(share_details_versioned);
        let amount = fungible_asset::amount(&fa);

        let passthrough_token =
            object::convert<VersionedShareDetails, passthrough_token::PassThroughTokenState>(
                share_details_obj
            );
        let claimable_type_index = to_passthrough_index(ClaimableType::Interest);

        passthrough_token::increase_payout(passthrough_token, fa, claimable_type_index);

        share_details.total_distributed_interest += amount;

        let share_address = object::object_address(&share_details_obj);
        event::emit(
            InterestDistributedEventV0 {
                facility_address: share_details.facility,
                share_address,
                amount,
                deficit,
                total_distributed_interest: share_details.total_distributed_interest
            }
        );
    }

    public fun snapshot_interest(
        signer: &signer,
        share_details_obj: Object<VersionedShareDetails>
    ) {
        passthrough_token::snapshot_index(signer, object::convert(share_details_obj), to_passthrough_index(ClaimableType::Interest));
    }
    
    public fun snapshot_principal(
        signer: &signer,
        share_details_obj: Object<VersionedShareDetails>
    ) {
        passthrough_token::snapshot_index(signer, object::convert(share_details_obj), to_passthrough_index(ClaimableType::Principal));
    }

    public fun distribute_interest(
        share_details_obj: Object<VersionedShareDetails>, fa: FungibleAsset
    ) acquires VersionedShareDetails, InterestTracker {
        let share_address = object::object_address(&share_details_obj);
        let deficit =
            if (exists<InterestTracker>(share_address)) {
                let interest_tracker = borrow_global<InterestTracker>(share_address);
                let (_, owed_deficit) = get_deficit_internal(&interest_tracker.deficit);
                owed_deficit
            } else { 0 };

        distribute_interest_internal(share_details_obj, fa, deficit);
    }

    public fun distribute_interest_with_deficit(
        facility_signer: &signer,
        share_details_obj: Object<VersionedShareDetails>,
        fa: FungibleAsset,
        deficit: u64
    ) acquires VersionedShareDetails {
        let expected_facility_address = get_facility_address(share_details_obj);
        assert!(
            signer::address_of(facility_signer) == expected_facility_address,
            ENOT_FACILITY
        );

        distribute_interest_internal(share_details_obj, fa, deficit);
    }

    public fun enrich_with_cashflow_tracking(
        signer: &signer,
        share_details_obj: Object<VersionedShareDetails>,
        compaction_strategy: compaction_strategy::ContributionCompactionStrategy
    ) acquires VersionedShareDetails {
        assert!(
            signer::address_of(signer) == object::object_address(&share_details_obj)
                || object::is_owner(share_details_obj, signer::address_of(signer)),
            ENOT_ADMIN
        );
        assert!(
            !exists<CashflowTracker>(object::object_address(&share_details_obj)),
            ECASHFLOW_TRACKER_ALREADY_EXISTS
        );

        let share_details =
            borrow_global<VersionedShareDetails>(
                object::object_address(&share_details_obj)
            );
        let share_extend_ref = extend_ref(share_details);
        let share_signer = object::generate_signer_for_extending(share_extend_ref);

        move_to(
            &share_signer,
            CashflowTracker { compaction_strategy, cashflows: time_series_tracker::empty() }
        )
    }

    public fun new_share_class_extensible(
        lucid_signer: &signer,
        facility_address: address,
        name: String,
        symbol: String,
        transfer_whitelist: Object<BasicWhitelist>,
        admins: Object<BasicWhitelist>,
        capital_call_weight: u64,
        capital_call_priority: u64,
        principal_repay_priority: u64,
        min_risk_weight: u64,
        max_risk_weight: u64,
        interest_tracker_config: Option<InterestTracker>
    ): ConstructorRef {
        assert!(
            signer::address_of(lucid_signer) == @lucid, EONLY_DEPLOYER_CAN_CREATE_TOKEN
        );

        assert!(facility_core::is_facility(facility_address), ENOT_A_FACILITY);
        let facility = object::address_to_object<FacilityBaseDetails>(facility_address);
        let fa_metadata = facility_core::get_fa_metadata(facility);
        let num_pools = 2;

        let pass_through_token_cr =
            passthrough_token::new_token(
                lucid_signer,
                name,
                symbol,
                transfer_whitelist,
                admins,
                fa_metadata,
                num_pools
            );

        passthrough_token::extend_with_holder_tracking(&pass_through_token_cr);

        let share_signer = object::generate_signer(&pass_through_token_cr);
        let extend_ref = object::generate_extend_ref(&pass_through_token_cr);
        let mint_ref =
            passthrough_token::generate_pass_through_mint_ref(&pass_through_token_cr);

        let share_address = object::address_from_constructor_ref(&pass_through_token_cr);

        move_to(
            &share_signer,
            VersionedShareDetails::ShareDetailsV1(
                ShareDetailsV1 {
                    facility: facility_address,
                    total_distributed_interest: 0,
                    total_contributed: 0,
                    time_weighted_contribution: aggregates::new_time_weighted_value(),
                    current_contributed: 0,
                    capital_call_weight,
                    capital_call_priority,
                    principal_repay_priority,
                    min_risk_weight,
                    max_risk_weight,
                    mint_ref,
                    extend_ref
                }
            )
        );

        if (option::is_some(&interest_tracker_config)) {
            let interest_tracker_config = option::extract(&mut interest_tracker_config);
            move_to(&share_signer, interest_tracker_config);
        };

        let share_details_object =
            object::object_from_constructor_ref<VersionedShareDetails>(
                &pass_through_token_cr
            );
        object::transfer(lucid_signer, share_details_object, facility_address);

        event::emit(
            ShareCreatedEventV0 {
                share_address,
                facility_address,
                name,
                symbol,
                transfer_whitelist: object::object_address(&transfer_whitelist),
                admins: object::object_address(&admins),
                capital_call_weight,
                capital_call_priority,
                principal_repay_priority,
                min_risk_weight,
                max_risk_weight
            }
        );

        pass_through_token_cr
    }

    public fun new_share_class(
        lucid_signer: &signer,
        facility_address: address,
        name: String,
        symbol: String,
        transfer_whitelist: Object<BasicWhitelist>,
        admins: Object<BasicWhitelist>,
        capital_call_weight: u64,
        capital_call_priority: u64,
        principal_repay_priority: u64,
        min_risk_weight: u64,
        max_risk_weight: u64,
        interest_tracker_config: Option<InterestTracker>
    ): Object<VersionedShareDetails> {
        let constructor_ref =
            new_share_class_extensible(
                lucid_signer,
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

        let share_details_object =
            object::object_from_constructor_ref<VersionedShareDetails>(&constructor_ref);
        share_details_object
    }

    public fun new_fixed_coupon(coupon_amount: u64, minimum_interval: u64): InterestType {
        InterestType::FixedCoupon { coupon_amount, minimum_interval }
    }

    public fun new_minimum_interest_rate(accrual_rate: u128): InterestType {
        InterestType::MinimumInterestRate { accrual_rate }
    }

    public fun new_simple_deficit(deficit: u64): DeficitTracker {
        DeficitTracker::SimpleDeficit { deficit }
    }

    public fun mint_shares(
        signer: &signer, share_details_obj: Object<VersionedShareDetails>, amount: u64
    ): FungibleAsset acquires VersionedShareDetails {
        let share_details_versioned =
            borrow_global<VersionedShareDetails>(
                object::object_address(&share_details_obj)
            );
        let share_details = extract_share_details_v1(share_details_versioned);

        assert!(signer::address_of(signer) == share_details.facility, ENOT_FACILITY);

        passthrough_token::mint(&share_details.mint_ref, amount)
    }

    public fun mint_with_ref(
        mint_ref: &ShareMintRef, amount: u64
    ): FungibleAsset acquires VersionedShareDetails {
        let share_details_versioned =
            borrow_global<VersionedShareDetails>(mint_ref.inner);
        let share_details = extract_share_details_v1(share_details_versioned);
        passthrough_token::mint(&share_details.mint_ref, amount)
    }

    public fun new_interest_tracker(
        last_interest_payment: u64, interest: InterestType, deficit: DeficitTracker
    ): InterestTracker {
        InterestTracker {
            last_interest_payment,
            interest,
            deficit,
            last_interest_paid_timestamp: 0
        }
    }

    fun update_capital_call_on_contribution(
        capital_call_address: address, facility_address: address, amount: u64
    ) acquires CapitalCall {
        let capital_call = borrow_global_mut<CapitalCall>(capital_call_address);

        let remaining_amount =
            if (capital_call.amount_remaining > amount) {
                capital_call.amount_remaining -= amount;
                capital_call.amount_remaining
            } else {
                let CapitalCall { .. } = move_from<CapitalCall>(capital_call_address);
                0
            };

        event::emit(
            CapitalCallPaidDownEventV0 {
                facility_address,
                share_address: capital_call_address,
                amount,
                remaining_amount
            }
        );
    }

    fun update_share_details_on_contribution(
        share_details: &mut VersionedShareDetails, share_address: address, amount: u64
    ) {
        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => {
                share_details.total_contributed += amount;
                share_details.current_contributed += amount;
                aggregates::update_time_weighted_value(
                    &mut share_details.time_weighted_contribution,
                    share_details.current_contributed
                );

                event::emit(
                    ContributionEventV0 {
                        facility_address: share_details.facility,
                        share_address,
                        amount,
                        total_contributed: share_details.total_contributed,
                        current_contributed: share_details.current_contributed,
                        time_weighted_contribution: aggregates::get_time_weighted_value(
                            &share_details.time_weighted_contribution
                        )
                    }
                );
            }
        };

    }

    fun on_contribution(
        share_details_obj: Object<VersionedShareDetails>, amount: u64
    ) acquires VersionedShareDetails, CapitalCall, CashflowTracker {
        let share_details_address = object::object_address(&share_details_obj);
        let share_details_versioned =
            borrow_global_mut<VersionedShareDetails>(
                object::object_address(&share_details_obj)
            );
        let facility_address = extract_share_details_v1(share_details_versioned).facility;

        if (exists<CapitalCall>(share_details_address)) {
            update_capital_call_on_contribution(
                share_details_address, facility_address, amount
            );
        };

        try_track_cashflow(share_details_address, true, amount);

        update_share_details_on_contribution(
            share_details_versioned, share_details_address, amount
        );
    }

    fun on_repay(share_details: &mut VersionedShareDetails, amount: u64) {
        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => {
                share_details.current_contributed -= amount;
                aggregates::update_time_weighted_value(
                    &mut share_details.time_weighted_contribution,
                    share_details.current_contributed
                );
            }
        }
    }

    fun try_track_cashflow(
        share_address: address, is_outflow: bool, amount: u64
    ) acquires CashflowTracker {
        if (exists<CashflowTracker>(share_address)) {
            let cashflow_tracker = borrow_global_mut<CashflowTracker>(share_address);
            time_series_tracker::add_value(
                &mut cashflow_tracker.cashflows,
                Cashflow { is_outflow, amount },
                option::none()
            );
        }
    }

    public fun compact_cashflows(share_address: address) acquires CashflowTracker {
        if (!exists<CashflowTracker>(share_address)) {
            return;
        };

        let cashflow_tracker = borrow_global_mut<CashflowTracker>(share_address);
        if (!compaction_strategy::allow_compaction_on_demand(
            cashflow_tracker.compaction_strategy
        )) {
            return;
        };

        try_compact_cashflows(cashflow_tracker);
    }

    fun try_compact_cashflows_on_interest_payment(share_address: address) acquires CashflowTracker {
        if (!exists<CashflowTracker>(share_address)) {
            return;
        };

        let cashflow_tracker = borrow_global_mut<CashflowTracker>(share_address);

        if (!compaction_strategy::should_compact_on_interest_payment(
            cashflow_tracker.compaction_strategy
        )) {
            return;
        };

        try_compact_cashflows(cashflow_tracker);
    }

    fun try_compact_cashflows(cashflow_tracker: &mut CashflowTracker) {
        let (values, timestamps) =
            time_series_tracker::get_parts(&cashflow_tracker.cashflows);

        if (vector::length(values) == 0) {
            return;
        };

        let compacted_values = vector::fold<Cashflow, Cashflow>(
            *values,
            Cashflow { is_outflow: false, amount: 0 },
            |accumulator, cashflow| { reduce_cashflow(accumulator, cashflow) }
        );

        cashflow_tracker.cashflows = time_series_tracker::singleton(
            compacted_values,
            *vector::borrow(timestamps, vector::length(timestamps) - 1)
        );
    }

    entry public fun claim_passthrough_principal(
        caller: &signer, owner: address, share_details_obj: Object<VersionedShareDetails>
    ) {

        let passthrough_token =
            object::convert<VersionedShareDetails, passthrough_token::PassThroughTokenState>(
                share_details_obj
            );
        let claimable_type_index = to_passthrough_index(ClaimableType::Principal);

        passthrough_token::claim_payout_by_index(
            caller,
            owner,
            passthrough_token,
            claimable_type_index
        );
    }

    entry public fun claim_passthrough_interest(
        caller: &signer, owner: address, share_details_obj: Object<VersionedShareDetails>
    ) {
        let passthrough_token =
            object::convert<VersionedShareDetails, passthrough_token::PassThroughTokenState>(
                share_details_obj
            );
        let claimable_type_index = to_passthrough_index(ClaimableType::Interest);

        passthrough_token::claim_payout_by_index(
            caller,
            owner,
            passthrough_token,
            claimable_type_index
        );
    }

    entry public fun claim_total_passthrough_payout(
        caller: &signer, owner: address, share_details_obj: Object<VersionedShareDetails>
    ) {
        let passthrough_token =
            object::convert<VersionedShareDetails, passthrough_token::PassThroughTokenState>(
                share_details_obj
            );

        passthrough_token::initiate_claim(caller, owner, passthrough_token);
    }

    inline fun extend_ref(share_details: &VersionedShareDetails): &ExtendRef {
        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => &share_details.extend_ref
        }
    }

    inline fun reduce_cashflow(accumulator: Cashflow, cashflow: Cashflow): Cashflow {
        if (cashflow.is_outflow == accumulator.is_outflow) {
            Cashflow {
                is_outflow: cashflow.is_outflow,
                amount: cashflow.amount + accumulator.amount
            }
        } else if (cashflow.amount > accumulator.amount) {
            Cashflow {
                is_outflow: cashflow.is_outflow,
                amount: cashflow.amount - accumulator.amount
            }
        } else {
            Cashflow {
                is_outflow: cashflow.is_outflow,
                amount: accumulator.amount - cashflow.amount
            }
        }
    }

    inline fun extract_share_details_v1(
        share_details: &VersionedShareDetails
    ): &ShareDetailsV1 {
        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details
        }
    }

    inline fun extract_share_details_v1_mut(
        share_details: &mut VersionedShareDetails
    ): &mut ShareDetailsV1 {
        match(share_details) {
            VersionedShareDetails::ShareDetailsV1(share_details) => share_details
        }
    }

    #[test_only]
    use aptos_framework::fungible_asset::{MintRef, Metadata};
    #[test_only]
    use lucid::utils;
    #[test_only]
    use std::string;

    #[test_only]
    struct TestState has drop {
        share_details: Object<VersionedShareDetails>,
        share_details_constructor_ref: ConstructorRef,
        payment_fa: Object<Metadata>,
        payment_fa_constructor_ref: ConstructorRef,
        payment_fa_mint_ref: MintRef,
        transfer_whitelist: Object<BasicWhitelist>,
        admin_whitelist: Object<BasicWhitelist>,
        facility: Object<facility_core::FacilityBaseDetails>
    }

    #[test_only]
    fun setup_test(creator: &signer): TestState {
        utils::initialize_timestamp();

        let creator_addr = signer::address_of(creator);
        let admin_whitelist = utils::whitelist_with_signer(creator, b"admin");
        let transfer_whitelist = utils::whitelist_with_signer(creator, b"transfer");

        let (fa_constructor_ref, fa_metadata, fa_mint_ref) =
            utils::create_test_token(creator, option::none());

        let facility =
            facility_core::create_facility(
                creator_addr,
                admin_whitelist,
                admin_whitelist,
                fa_metadata,
                creator_addr
            );

        let facility_address = object::address_from_constructor_ref(&facility);

        let share_details_constructor_ref =
            new_share_class_extensible(
                creator,
                facility_address,
                string::utf8(b"test"),
                string::utf8(b"test"),
                transfer_whitelist,
                admin_whitelist,
                1,
                1,
                1,
                1,
                1,
                option::none()
            );

        TestState {
            share_details: object::object_from_constructor_ref<VersionedShareDetails>(
                &share_details_constructor_ref
            ),
            share_details_constructor_ref,
            payment_fa: fa_metadata,
            payment_fa_constructor_ref: fa_constructor_ref,
            payment_fa_mint_ref: fa_mint_ref,
            transfer_whitelist,
            admin_whitelist,
            facility: object::object_from_constructor_ref<facility_core::FacilityBaseDetails>(
                &facility
            )
        }
    }

    #[test_only]
    public fun set_amount_contributed_for_test(
        share_details_obj: Object<VersionedShareDetails>, amount: u64
    ) acquires VersionedShareDetails {
        let share_details_versioned =
            borrow_global_mut<VersionedShareDetails>(
                object::object_address(&share_details_obj)
            );
        let share_details = extract_share_details_v1_mut(share_details_versioned);
        share_details.current_contributed = amount;
    }

    // TODO (claude): add tests, setting up using 'setup_test'
}
