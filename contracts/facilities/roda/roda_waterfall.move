module lucid::roda_waterfall {
    use std::vector;
    use std::option;
    use std::signer;

    use aptos_framework::math64;
    use aptos_framework::object::{Self, ExtendRef, Object, ConstructorRef};
    use aptos_framework::fungible_asset::{Self, FungibleAsset};
    use aptos_framework::primary_fungible_store;

    use lucid::facility_core;
    use lucid::shares_manager;
    use lucid::share_class;
    use lucid::utils;
    friend lucid::principal_waterfall;
    friend lucid::interest_waterfall;

    const EPERIODS_NOT_SET: u64 = 0;
    const ENOT_ADMIN: u64 = 1;

    enum RodaLevel has copy, store, drop {
        MinUtilizationDeficit,
        MinUtilization,
        MinInterestDeficit,
        MinInterest,
        DefaultPenalty,
        EarlyClosePenalty,
        SeniorShare,
        RodaSinkPrincipal,
        RodaSinkInterest
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct RodaWaterfall has key, drop {
        period_start_timestamp: option::Option<u64>,
        period_end_timestamp: option::Option<u64>,
        min_utilization_timestamp: u64,
        min_utilization: u64,
        early_close_penalty: u64,
        is_early_close: bool,
        is_in_default: bool,
        default_penalty_interest: u64,
        min_interest_deficit: u64,
        min_util_interest_deficit: u64,
        default_penalty_deficit: u64,
        extend_ref: ExtendRef
    }

    public fun roda_level_min_utilization_deficit(): RodaLevel {
        RodaLevel::MinUtilizationDeficit
    }

    public fun roda_level_min_utilization(): RodaLevel {
        RodaLevel::MinUtilization
    }

    public fun roda_level_min_interest_deficit(): RodaLevel {
        RodaLevel::MinInterestDeficit
    }

    public fun roda_level_min_interest(): RodaLevel {
        RodaLevel::MinInterest
    }

    public fun roda_level_default_penalty(): RodaLevel {
        RodaLevel::DefaultPenalty
    }

    public fun roda_level_senior_share(): RodaLevel {
        RodaLevel::SeniorShare
    }

    public fun roda_level_roda_sink_principal(): RodaLevel {
        RodaLevel::RodaSinkPrincipal
    }

    public fun roda_level_roda_sink_interest(): RodaLevel {
        RodaLevel::RodaSinkInterest
    }

    public fun roda_level_early_close_penalty(): RodaLevel {
        RodaLevel::EarlyClosePenalty
    }

    #[view]
    fun get_senior_share(facility_address: address):
        Object<share_class::VersionedShareDetails> {
        let shares_manager =
            object::address_to_object<shares_manager::SharesManager>(facility_address);
        shares_manager::get_share_class_by_index(shares_manager, 0)
    }

    #[view]
    fun get_min_utilization_cutoff(facility_address: address): u64 acquires RodaWaterfall {
        let roda_waterfall = borrow_global<RodaWaterfall>(facility_address);
        roda_waterfall.min_utilization_timestamp
    }

    #[view]
    fun get_min_utilization(facility_address: address): u64 acquires RodaWaterfall {
        let roda_waterfall = borrow_global<RodaWaterfall>(facility_address);
        roda_waterfall.min_utilization
    }

    #[view]
    fun get_default_penalty_interest(facility_address: address): (u64, u128) acquires RodaWaterfall {
        let roda_waterfall = borrow_global<RodaWaterfall>(facility_address);
        let shares_manager =
            object::address_to_object<shares_manager::SharesManager>(facility_address);
        let senior_share = shares_manager::get_share_class_by_index(shares_manager, 0);
        let (_, denominator) =
            share_class::get_minium_interest_accrual_per_microsecond(senior_share);

        (roda_waterfall.default_penalty_interest, denominator)
    }

    #[view]
    fun is_in_default(facility_address: address): bool acquires RodaWaterfall {
        let roda_waterfall = borrow_global<RodaWaterfall>(facility_address);
        roda_waterfall.is_in_default
    }

    public fun enrich_with_roda_waterfall(
        facility_constructor_ref: &ConstructorRef
    ) {
        let facility_signer = object::generate_signer(facility_constructor_ref);
        let extend_ref = object::generate_extend_ref(facility_constructor_ref);

        move_to(
            &facility_signer,
            RodaWaterfall {
                period_start_timestamp: option::none(),
                period_end_timestamp: option::none(),
                min_utilization_timestamp: 0,
                min_utilization: 0,
                early_close_penalty: 0,
                is_early_close: false,
                is_in_default: false,
                default_penalty_interest: 0,
                min_interest_deficit: 0,
                min_util_interest_deficit: 0,
                default_penalty_deficit: 0,
                extend_ref
            }
        );
    }

    public entry fun set_period(
        signer: &signer,
        roda_waterfall: Object<RodaWaterfall>,
        start_timestamp: u64,
        end_timestamp: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.period_start_timestamp = option::some(start_timestamp);
        roda_waterfall.period_end_timestamp = option::some(end_timestamp);
    }

    public entry fun set_min_utilization_timestamp(
        signer: &signer,
        roda_waterfall: Object<RodaWaterfall>,
        min_utilization_timestamp: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.min_utilization_timestamp = min_utilization_timestamp;
    }

    public entry fun set_min_utilization(
        signer: &signer, roda_waterfall: Object<RodaWaterfall>, min_utilization: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.min_utilization = min_utilization;
    }

    public entry fun set_default_penalty_interest(
        signer: &signer,
        roda_waterfall: Object<RodaWaterfall>,
        default_penalty_interest: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.default_penalty_interest = default_penalty_interest;
    }

    public entry fun set_min_interest_deficit(
        signer: &signer, roda_waterfall: Object<RodaWaterfall>, min_interest_deficit: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.min_interest_deficit = min_interest_deficit;
    }

    public entry fun set_min_util_interest_deficit(
        signer: &signer,
        roda_waterfall: Object<RodaWaterfall>,
        min_util_interest_deficit: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.min_util_interest_deficit = min_util_interest_deficit;
    }

    public entry fun set_default_penalty_deficit(
        signer: &signer,
        roda_waterfall: Object<RodaWaterfall>,
        default_penalty_deficit: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.default_penalty_deficit = default_penalty_deficit;
    }

    public entry fun set_is_in_default(
        signer: &signer, roda_waterfall: Object<RodaWaterfall>, is_in_default: bool
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.is_in_default = is_in_default;
    }

    public entry fun set_is_early_close(
        signer: &signer, roda_waterfall: Object<RodaWaterfall>, is_early_close: bool
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.is_early_close = is_early_close;
    }

    public entry fun set_early_close_penalty(
        signer: &signer, roda_waterfall: Object<RodaWaterfall>, early_close_penalty: u64
    ) acquires RodaWaterfall {
        let facility_base_details =
            object::convert<RodaWaterfall, facility_core::FacilityBaseDetails>(
                roda_waterfall
            );
        assert!(
            facility_core::is_admin(facility_base_details, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let roda_waterfall =
            borrow_global_mut<RodaWaterfall>(
                object::object_address(&facility_base_details)
            );
        roda_waterfall.early_close_penalty = early_close_penalty;
    }

    fun apply_interest(
        balances: vector<u64>,
        timestamps: vector<u64>,
        interest_rate_numerator: u64,
        interest_rate_denominator: u128,
        t_start: u64,
        t_end: u64
    ): u64 {
        if (t_start >= t_end) {
            return 0;
        };

        let principal_mics = 0 as u128;
        let i = 0;
        while (i < vector::length(&balances)) {
            let balance = *vector::borrow(&balances, i);
            let start_timestamp = math64::max(*vector::borrow(&timestamps, i), t_start);
            let end_timestamp =
                if (i == vector::length(&balances) - 1) {
                    math64::max(t_end, t_start)
                } else {
                    math64::max(*vector::borrow(&timestamps, i + 1), t_start)
                };

            let truncated_start = utils::truncate_mics_to_days(start_timestamp);
            let truncated_end = utils::truncate_mics_to_days(end_timestamp);
            let mics_in_period = truncated_end - truncated_start;

            principal_mics +=(balance as u128) * (mics_in_period as u128);

            i = i + 1;
        };

        ((principal_mics * (interest_rate_numerator as u128)) / interest_rate_denominator) as u64
    }

    fun cure_min_interest_deficit(
        facility_address: address, available_fa: FungibleAsset
    ): (address, u64, u64, FungibleAsset) acquires RodaWaterfall {
        let available_fa_amount = fungible_asset::amount(&available_fa);
        let roda_waterfall = borrow_global_mut<RodaWaterfall>(facility_address);
        let shares_manager =
            object::address_to_object<shares_manager::SharesManager>(facility_address);
        let senior_share = shares_manager::get_share_class_by_index(shares_manager, 0);

        let min_interest_deficit = roda_waterfall.min_interest_deficit;

        let available_to_cure = math64::min(min_interest_deficit, available_fa_amount);
        roda_waterfall.min_interest_deficit -= available_to_cure;

        if (available_to_cure > 0) {
            let extracted = fungible_asset::extract(&mut available_fa, available_to_cure);
            let roda_signer =
                object::generate_signer_for_extending(&roda_waterfall.extend_ref);
            share_class::distribute_interest_with_deficit(
                &roda_signer, senior_share, extracted, 0
            );
        };

        (
            object::object_address(&senior_share),
            min_interest_deficit,
            available_to_cure,
            available_fa
        )
    }

    fun cure_min_util_interest_deficit(
        facility_address: address, available_fa: FungibleAsset
    ): (address, u64, u64, FungibleAsset) acquires RodaWaterfall {
        let available_fa_amount = fungible_asset::amount(&available_fa);
        let roda_waterfall = borrow_global_mut<RodaWaterfall>(facility_address);
        let shares_manager =
            object::address_to_object<shares_manager::SharesManager>(facility_address);
        let senior_share = shares_manager::get_share_class_by_index(shares_manager, 0);

        let min_util_interest_deficit = roda_waterfall.min_util_interest_deficit;

        let available_to_cure =
            math64::min(min_util_interest_deficit, available_fa_amount);
        roda_waterfall.min_util_interest_deficit -= available_to_cure;

        if (available_to_cure > 0) {
            let extracted = fungible_asset::extract(&mut available_fa, available_to_cure);
            let roda_signer =
                object::generate_signer_for_extending(&roda_waterfall.extend_ref);
            share_class::distribute_interest_with_deficit(
                &roda_signer, senior_share, extracted, 0
            );
        };

        (
            object::object_address(&senior_share),
            min_util_interest_deficit,
            available_to_cure,
            available_fa
        )
    }

    fun handle_min_utilization(
        facility_address: address, available_fa: FungibleAsset
    ): (address, u64, u64, FungibleAsset) acquires RodaWaterfall {
        let available_fa_amount = fungible_asset::amount(&available_fa);
        let senior_share = get_senior_share(facility_address);

        let (balances_base, timestamps) =
            share_class::derive_drawdown_balances(senior_share);
        let (accrual_rate, denominator) =
            share_class::get_minium_interest_accrual_per_microsecond(senior_share);
        let (t_start_base, t_end) = ensure_periods_set(facility_address);
        let min_utilization_cutoff = get_min_utilization_cutoff(facility_address);
        let t_start = math64::max(t_start_base, min_utilization_cutoff);

        let min_utilization = get_min_utilization(facility_address);
        let balances = vector::map(
            balances_base,
            |balance| {
                if (balance < min_utilization) {
                    min_utilization - balance
                } else { 0 }
            }
        );
        let accrued =
            apply_interest(
                balances,
                timestamps,
                accrual_rate as u64,
                denominator,
                t_start,
                t_end
            );
        let payment_amount = math64::min(accrued, available_fa_amount);

        let roda_waterfall = borrow_global_mut<RodaWaterfall>(facility_address);
        let roda_signer =
            object::generate_signer_for_extending(&roda_waterfall.extend_ref);
        let deficit = accrued - math64::min(accrued, available_fa_amount);
        roda_waterfall.min_util_interest_deficit += deficit;

        if (payment_amount > 0) {
            let extracted = fungible_asset::extract(&mut available_fa, payment_amount);
            share_class::distribute_interest_with_deficit(
                &roda_signer, senior_share, extracted, deficit
            );
        };

        (object::object_address(&senior_share), accrued, payment_amount, available_fa)
    }

    fun handle_min_interest(
        facility_address: address, available_fa: FungibleAsset
    ): (address, u64, u64, FungibleAsset) acquires RodaWaterfall {
        let available_fa_amount = fungible_asset::amount(&available_fa);
        let senior_share = get_senior_share(facility_address);

        let (accrual_rate, denominator) =
            share_class::get_minium_interest_accrual_per_microsecond(senior_share);
        let (t_start, t_end) = ensure_periods_set(facility_address);
        let (balances, timestamps) = share_class::derive_drawdown_balances(senior_share);

        let accrued =
            apply_interest(
                balances,
                timestamps,
                accrual_rate as u64,
                denominator,
                t_start,
                t_end
            );
        let payment_amount = math64::min(accrued, available_fa_amount);

        let roda_waterfall = borrow_global_mut<RodaWaterfall>(facility_address);
        let deficit = accrued - math64::min(accrued, available_fa_amount);
        roda_waterfall.min_interest_deficit += deficit;

        if (payment_amount > 0) {
            let extracted = fungible_asset::extract(&mut available_fa, payment_amount);
            let roda_signer =
                object::generate_signer_for_extending(&roda_waterfall.extend_ref);
            share_class::distribute_interest_with_deficit(
                &roda_signer, senior_share, extracted, deficit
            );
        };

        (object::object_address(&senior_share), accrued, payment_amount, available_fa)
    }

    fun handle_default_penalty(
        facility_address: address, available_fa: FungibleAsset
    ): (address, u64, u64, FungibleAsset) acquires RodaWaterfall {
        let available_fa_amount = fungible_asset::amount(&available_fa);
        let senior_share = get_senior_share(facility_address);

        if (!is_in_default(facility_address)) {
            return (object::object_address(&senior_share), 0, 0, available_fa);
        };

        let (accrual_rate, denominator) = get_default_penalty_interest(facility_address);
        let (t_start, t_end) = ensure_periods_set(facility_address);
        let (balances, timestamps) = share_class::derive_drawdown_balances(senior_share);

        let accrued =
            apply_interest(
                balances,
                timestamps,
                accrual_rate as u64,
                denominator,
                t_start,
                t_end
            );
        let payment_amount = math64::min(accrued, available_fa_amount);

        let roda_waterfall = borrow_global_mut<RodaWaterfall>(facility_address);
        let deficit = accrued - math64::min(accrued, available_fa_amount);
        roda_waterfall.default_penalty_deficit += deficit;

        if (payment_amount > 0) {
            let extracted = fungible_asset::extract(&mut available_fa, payment_amount);
            let roda_signer =
                object::generate_signer_for_extending(&roda_waterfall.extend_ref);
            share_class::distribute_interest_with_deficit(
                &roda_signer, senior_share, extracted, deficit
            );
        };

        (object::object_address(&senior_share), accrued, payment_amount, available_fa)
    }

    fun handle_early_close_penalty(
        facility_address: address, available_fa: FungibleAsset
    ): (address, u64, u64, FungibleAsset) acquires RodaWaterfall {
        let senior_share = get_senior_share(facility_address);
        let roda_waterfall = borrow_global_mut<RodaWaterfall>(facility_address);
        if (!roda_waterfall.is_early_close || roda_waterfall.early_close_penalty == 0) {
            return (facility_address, 0, 0, available_fa);
        };

        let available_fa_amount = fungible_asset::amount(&available_fa);
        let early_close_penalty = roda_waterfall.early_close_penalty;

        let transfer_amount = math64::min(available_fa_amount, early_close_penalty);
        let payment_fa = fungible_asset::extract(&mut available_fa, transfer_amount);
        let roda_signer =
            object::generate_signer_for_extending(&roda_waterfall.extend_ref);
        share_class::distribute_interest_with_deficit(
            &roda_signer, senior_share, payment_fa, 0
        );

        roda_waterfall.early_close_penalty -= transfer_amount;

        (facility_address, early_close_penalty, transfer_amount, available_fa)
    }

    fun payout_senior_share(
        facility_address: address, available_fa: FungibleAsset
    ): (address, u64, u64, FungibleAsset) {
        if (facility_core::in_recycle_period(facility_address)) {
            return (facility_address, 0, 0, available_fa);
        };

        let available_fa_amount = fungible_asset::amount(&available_fa);
        let share_manager =
            object::address_to_object<shares_manager::SharesManager>(facility_address);
        let remaining_fa = shares_manager::repay_principal(share_manager, available_fa);
        let spent = available_fa_amount - fungible_asset::amount(&remaining_fa);

        (facility_address, spent, spent, remaining_fa)
    }

    fun roda_sink(
        facility_address: address, available_fa: FungibleAsset, requires_recycle: bool
    ): (address, u64, u64, FungibleAsset) {
        let facility =
            object::address_to_object<facility_core::FacilityBaseDetails>(facility_address);
        let originator_receivable_account =
            facility_core::get_originator_receivable_account(facility);

        if (requires_recycle && !facility_core::in_recycle_period(facility_address)) {
            return (originator_receivable_account, 0, 0, available_fa);
        };

        let fa_available = fungible_asset::amount(&available_fa);
        let extracted = fungible_asset::extract(&mut available_fa, fa_available);
        primary_fungible_store::deposit(originator_receivable_account, extracted);

        (facility_address, fa_available, fa_available, available_fa)
    }

    fun ensure_periods_set(facility_address: address): (u64, u64) acquires RodaWaterfall {
        let roda_waterfall = borrow_global<RodaWaterfall>(facility_address);
        assert!(
            option::is_some(&roda_waterfall.period_start_timestamp)
                && option::is_some(&roda_waterfall.period_end_timestamp),
            EPERIODS_NOT_SET
        );

        (
            *option::borrow(&roda_waterfall.period_start_timestamp),
            *option::borrow(&roda_waterfall.period_end_timestamp)
        )
    }

    public(friend) fun execute_roda_level(
        facility_address: address, available_fa: FungibleAsset, level: RodaLevel
    ): (address, u64, u64, FungibleAsset) acquires RodaWaterfall {
        match(level) {
            RodaLevel::MinUtilizationDeficit => cure_min_util_interest_deficit(
                facility_address, available_fa
            ),
            RodaLevel::MinUtilization => handle_min_utilization(
                facility_address, available_fa
            ),
            RodaLevel::MinInterestDeficit => cure_min_interest_deficit(
                facility_address, available_fa
            ),
            RodaLevel::MinInterest => handle_min_interest(facility_address, available_fa),
            RodaLevel::DefaultPenalty => handle_default_penalty(
                facility_address, available_fa
            ),
            RodaLevel::SeniorShare => payout_senior_share(facility_address, available_fa),
            RodaLevel::RodaSinkPrincipal => roda_sink(facility_address, available_fa, true),
            RodaLevel::RodaSinkInterest => roda_sink(facility_address, available_fa, false),
            RodaLevel::EarlyClosePenalty => handle_early_close_penalty(
                facility_address, available_fa
            )
        }
    }

    #[test]
    fun test_interest_accrual_simple() {
        let balances = vector::empty<u64>();
        let timestamps = vector::empty<u64>();

        vector::push_back(&mut balances, 100 * 1000000);
        vector::push_back(&mut timestamps, 1740852180000000);

        let t_end = 1743483600000000;
        let t_start = 1740808800000000;

        let accrual_rate = 443937;
        let denominator = 100000000000000000000;

        let accrued_expected = 1189040;

        let accrued =
            apply_interest(
                balances,
                timestamps,
                accrual_rate,
                denominator,
                t_start,
                t_end
            );
        assert!(accrued == accrued_expected, accrued);
    }

    #[test]
    fun test_interest_accrual_multiple_periods() {
        let balances = vector::empty<u64>();
        let timestamps = vector::empty<u64>();

        vector::push_back(&mut balances, 100 * 1000000);
        vector::push_back(&mut timestamps, 1740852180000000);

        vector::push_back(&mut balances, 150 * 1000000);
        vector::push_back(&mut timestamps, 1742058180000000);

        let t_end = 1743483600000000;
        let t_start = 1740808800000000;

        let accrual_rate = 443937;
        let denominator = 100000000000000000000;

        let accrued_expected = 1189041 + 326027;

        let accrued =
            apply_interest(
                balances,
                timestamps,
                accrual_rate,
                denominator,
                t_start,
                t_end
            );
        assert!(accrued == accrued_expected, accrued);
    }
}
