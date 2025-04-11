module lucid::shares_manager {
    use std::vector;
    use std::signer;
    use std::option::{Self, Option};

    use aptos_framework::object::{Self, ExtendRef, ConstructorRef, Object};
    use aptos_framework::fungible_asset::{Self, FungibleAsset};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::event;

    use lucid::share_class::{Self, VersionedShareDetails};
    use lucid::whitelist::{Self, BasicWhitelist};
    use lucid::passthrough_token::{Self, PassThroughTokenState};

    const ESHARES_MANAGER_NOT_FOUND: u64 = 1;
    const EALREADY_ACTIVE_CAPITAL_CALL: u64 = 2;
    const ENOT_ADMIN: u64 = 3;
    const ESHARE_INDEX_NOT_FOUND: u64 = 4;

    const MAX_U64: u64 = 18446744073709551615;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct CapitalCallContext has key, drop {
        total_capital_called: u64,
        amount_remaining: u64,
        round_remaining: u64,
        share_indices: vector<u8>
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct SharesManager has key {
        admins: Object<BasicWhitelist>,
        shares: vector<Object<VersionedShareDetails>>,
        total_capital_call_weight: u64,
        extend_ref: ExtendRef
    }

    #[event]
    struct CapitalCallInitiatedEvent has store, drop {
        facility_address: address,
        amount: u64
    }

    #[event]
    struct CapitalCallRoundStartedEventV0 has store, drop {
        facility_address: address,
        total_capital_called: u64,
        amount_remaining: u64,
        round_amount: u64
    }

    #[event]
    struct CapitalCallCompletedEventV0 has store, drop {
        facility_address: address,
        amount: u64
    }

    #[view]
    public fun is_admin(
        manager_obj: Object<SharesManager>, user: address
    ): bool acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager_obj));

        object::owner(manager_obj) == user
            || object::object_address(&manager_obj) == user
            || whitelist::is_member(manager.admins, user)
    }

    #[view]
    public fun has_active_capital_call(manager_obj: Object<SharesManager>): bool {
        exists<CapitalCallContext>(object::object_address(&manager_obj))
    }

    #[view]
    public fun get_outstanding_principal(manager: Object<SharesManager>): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        let accumulator = 0;
        let i = 0;

        while (i < vector::length(&manager.shares)) {
            let share = *vector::borrow(&manager.shares, i);
            accumulator += share_class::get_current_contributed(share);
            i = i + 1;
        };

        accumulator
    }

    #[view]
    public fun get_outstanding_principal_for_share(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));

        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);

        share_class::get_current_contributed(*vector::borrow(&manager.shares, index))
    }

    #[view]
    public fun get_interest_owed_for_share(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));

        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);

        share_class::get_expected_interest(*vector::borrow(&manager.shares, index))
    }

    #[view]
    public fun get_share_class_count(manager: Object<SharesManager>): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        vector::length(&manager.shares)
    }

    #[view]
    public fun get_share_class_by_index(
        manager: Object<SharesManager>, index: u64
    ): Object<VersionedShareDetails> acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        *vector::borrow(&manager.shares, index)
    }

    #[view]
    public fun get_capital_call_total_amount(
        manager: Object<SharesManager>
    ): u64 acquires CapitalCallContext {
        let manager_address = object::object_address(&manager);
        if (!exists<CapitalCallContext>(manager_address)) { 0 }
        else {
            let capital_call = borrow_global<CapitalCallContext>(manager_address);
            capital_call.total_capital_called
        }
    }

    #[view]
    public fun get_capital_call_amount_remaining(
        manager: Object<SharesManager>
    ): u64 acquires CapitalCallContext {
        let manager_address = object::object_address(&manager);
        if (!exists<CapitalCallContext>(manager_address)) { 0 }
        else {
            let capital_call = borrow_global<CapitalCallContext>(manager_address);
            capital_call.amount_remaining
        }
    }

    #[view]
    public fun get_capital_call_round_remaining(
        manager: Object<SharesManager>
    ): u64 acquires CapitalCallContext {
        let manager_address = object::object_address(&manager);
        if (!exists<CapitalCallContext>(manager_address)) { 0 }
        else {
            let capital_call = borrow_global<CapitalCallContext>(manager_address);
            capital_call.round_remaining
        }
    }

    #[view]
    public fun get_share_capital_call_total_amount(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_capital_call_total_amount(
            *vector::borrow(&manager.shares, index)
        )
    }

    #[view]
    public fun get_share_capital_call_amount_remaining(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_capital_call_amount_remaining(
            *vector::borrow(&manager.shares, index)
        )
    }

    #[view]
    public fun get_share_capital_call_weight(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_capital_call_weight(*vector::borrow(&manager.shares, index))
    }

    #[view]
    public fun get_share_capital_call_priority(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_capital_call_priority(*vector::borrow(&manager.shares, index))
    }

    #[view]
    public fun get_share_principal_repay_priority(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_principal_repay_priority(
            *vector::borrow(&manager.shares, index)
        )
    }

    #[view]
    public fun get_share_total_distributed_interest(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_total_distributed_interest(
            *vector::borrow(&manager.shares, index)
        )
    }

    #[view]
    public fun get_share_total_contributed(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_total_contributed(*vector::borrow(&manager.shares, index))
    }

    #[view]
    public fun get_share_current_contributed(
        manager: Object<SharesManager>, index: u64
    ): u64 acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        assert!(index < vector::length(&manager.shares), ESHARE_INDEX_NOT_FOUND);
        share_class::get_current_contributed(*vector::borrow(&manager.shares, index))
    }

    #[view]
    public fun is_interest_deficit(manager: Object<SharesManager>): bool acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        vector::any(&manager.shares, |share| share_class::is_interest_deficit(*share))
    }

    entry public fun mint_shares(
        signer: &signer,
        manager: Object<SharesManager>,
        share_index: u64,
        amount: u64,
        receiver: address
    ) acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&manager));
        let share = *vector::borrow(&manager.shares, share_index);
        let fa = share_class::mint_shares(signer, share, amount);
        primary_fungible_store::deposit(receiver, fa);
    }

    public fun create_manager(
        constructor_ref: &ConstructorRef, admins: Object<BasicWhitelist>
    ): Object<SharesManager> {
        let extend_ref = object::generate_extend_ref(constructor_ref);
        let object_signer = object::generate_signer(constructor_ref);

        move_to(
            &object_signer,
            SharesManager {
                admins,
                shares: vector::empty(),
                total_capital_call_weight: 0,
                extend_ref
            }
        );

        object::object_from_constructor_ref<SharesManager>(constructor_ref)
    }

    public fun get_shares_by_principal_priority(
        shares: &vector<Object<VersionedShareDetails>>,
        lower_bound: Option<u64>,
        upper_bound: Option<u64>
    ): vector<u8> {
        get_shares_by_priority(
            shares,
            |share| share_class::get_principal_repay_priority(share),
            lower_bound,
            upper_bound
        )
    }

    public fun get_shares_by_capital_call_priority(
        shares: &vector<Object<VersionedShareDetails>>,
        lower_bound: Option<u64>,
        upper_bound: Option<u64>
    ): vector<u8> {
        get_shares_by_priority(
            shares,
            |share| if (share_class::get_capital_call_weight(share) > 0) {
                share_class::get_capital_call_priority(share)
            } else {
                MAX_U64
            },
            lower_bound,
            upper_bound
        )
    }

    public fun add_share_to_self(
        signer: &signer, share: Object<VersionedShareDetails>
    ): u64 acquires SharesManager {
        let manager_address = signer::address_of(signer);

        assert!(exists<SharesManager>(manager_address), ESHARES_MANAGER_NOT_FOUND);
        let capital_call_weight = share_class::get_capital_call_weight(share);
        let manager = borrow_global_mut<SharesManager>(manager_address);
        let new_index = vector::length(&manager.shares);

        manager.total_capital_call_weight += capital_call_weight;
        vector::push_back(&mut manager.shares, share);

        new_index
    }

    fun distribute_payment(
        shares: &vector<Object<VersionedShareDetails>>,
        recipient_indices: vector<u8>,
        fa: FungibleAsset
    ): FungibleAsset {
        let total_amount = fungible_asset::amount(&fa);
        let amount_per_class = total_amount / vector::length(&recipient_indices);
        let _fa_metadata = fungible_asset::metadata_from_asset(&fa);
        let i = 0;

        while (i < vector::length(&recipient_indices)) {
            let share_index = *vector::borrow(&recipient_indices, i as u64);
            let leftover_fa =
                share_class::pay_down_contributed(
                    vector::borrow(shares, share_index as u64),
                    fungible_asset::extract(&mut fa, amount_per_class)
                );
            fungible_asset::merge(&mut fa, leftover_fa);
            i = i + 1;
        };

        fa
    }

    fun issue_capital_call(
        manager_signer: &signer,
        shares: &vector<Object<VersionedShareDetails>>,
        share_indices: vector<u8>,
        total_weight: u64,
        total_amount: u64,
        dust_carry: u64
    ): u64 {

        let i = 0;
        let requested = 0;
        while (i < vector::length(&share_indices)) {
            let share_index = *vector::borrow(&share_indices, i) as u64;
            let share = *vector::borrow(shares, share_index);
            let weight = share_class::get_capital_call_weight(share);
            let request_amount = (total_amount * weight) / total_weight;
            requested += request_amount;

            share_class::initiate_capital_call(
                manager_signer, share, request_amount + dust_carry
            );
            dust_carry = 0;

            i = i + 1;
        };

        requested
    }

    public fun initiate_capital_call(
        signer: &signer, manager_object: Object<SharesManager>, requested_amount: u64
    ) acquires SharesManager {
        assert!(!has_active_capital_call(manager_object), EALREADY_ACTIVE_CAPITAL_CALL);
        assert!(is_admin(manager_object, signer::address_of(signer)), ENOT_ADMIN);
        let manager =
            borrow_global<SharesManager>(object::object_address(&manager_object));
        let manager_signer = object::generate_signer_for_extending(&manager.extend_ref);
        let initial_shares =
            get_shares_by_capital_call_priority(
                &manager.shares, option::none(), option::none()
            );
        let dust =
            get_dust(
                &manager.shares,
                |share| share_class::get_capital_call_weight(share),
                manager.total_capital_call_weight,
                requested_amount
            );

        let current_round_requested_amount =
            issue_capital_call(
                &manager_signer,
                &manager.shares,
                initial_shares,
                manager.total_capital_call_weight,
                requested_amount,
                dust
            );

        event::emit(
            CapitalCallInitiatedEvent {
                facility_address: object::object_address(&manager_object),
                amount: requested_amount
            }
        );

        event::emit(
            CapitalCallRoundStartedEventV0 {
                facility_address: object::object_address(&manager_object),
                total_capital_called: requested_amount,
                amount_remaining: requested_amount,
                round_amount: current_round_requested_amount
            }
        );

        move_to(
            &manager_signer,
            CapitalCallContext {
                total_capital_called: requested_amount,
                amount_remaining: requested_amount,
                round_remaining: current_round_requested_amount,
                share_indices: initial_shares
            }
        );
    }
    
    entry public fun snapshot_interest(
        signer: &signer,
        share_manager: Object<SharesManager>,
    ) acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&share_manager));
        let i = 0;
        let n = vector::length(&manager.shares);
        while (i < n) {
            let share = *vector::borrow(&manager.shares, i);
            share_class::snapshot_interest(signer, share);
        };
    }
    
    entry public fun snapshot_principal(
        signer: &signer,
        share_manager: Object<SharesManager>,
    ) acquires SharesManager {
        let manager = borrow_global<SharesManager>(object::object_address(&share_manager));
        let i = 0;
        let n = vector::length(&manager.shares);
        while (i < n) {
            let share = *vector::borrow(&manager.shares, i);
            share_class::snapshot_principal(signer, share);
        };
    }


    fun advance_capital_call(
        manager: &SharesManager, capital_call_context: &mut CapitalCallContext
    ) {
        let manager_signer = object::generate_signer_for_extending(&manager.extend_ref);
        let current_share_indices = &capital_call_context.share_indices;
        let current_share =
            *vector::borrow(
                &manager.shares, (*vector::borrow(current_share_indices, 0) as u64)
            );
        let current_priority = share_class::get_capital_call_priority(current_share);

        let new_share_indices =
            get_shares_by_capital_call_priority(
                &manager.shares, option::some(current_priority + 1), option::none()
            );
        let requested_amount =
            issue_capital_call(
                &manager_signer,
                &manager.shares,
                new_share_indices,
                manager.total_capital_call_weight,
                capital_call_context.total_capital_called,
                0
            );

        event::emit(
            CapitalCallRoundStartedEventV0 {
                facility_address: signer::address_of(&manager_signer),
                total_capital_called: capital_call_context.total_capital_called,
                amount_remaining: capital_call_context.amount_remaining,
                round_amount: requested_amount
            }
        );

        capital_call_context.share_indices = new_share_indices;
        capital_call_context.round_remaining = requested_amount;
    }

    fun update_active_capital_call(
        manager: &SharesManager, filled_amount: u64
    ) acquires CapitalCallContext {
        let manager_signer = object::generate_signer_for_extending(&manager.extend_ref);
        let capital_call_context_address = signer::address_of(&manager_signer);
        let capital_call_context =
            borrow_global_mut<CapitalCallContext>(capital_call_context_address);

        if (capital_call_context.amount_remaining <= filled_amount) {
            event::emit(
                CapitalCallCompletedEventV0 {
                    facility_address: capital_call_context_address,
                    amount: capital_call_context.total_capital_called
                }
            );
            let CapitalCallContext { .. } =
                move_from<CapitalCallContext>(capital_call_context_address);
        } else if (capital_call_context.round_remaining <= filled_amount) {
            capital_call_context.amount_remaining -= filled_amount;
            advance_capital_call(manager, capital_call_context);
        } else {
            capital_call_context.amount_remaining -= filled_amount;
            capital_call_context.round_remaining -= filled_amount;
        }
    }

    fun fulfill_capital_call(
        share: Object<VersionedShareDetails>, fa: FungibleAsset
    ) acquires SharesManager, CapitalCallContext {
        let manager_address = share_class::get_facility_address(share);
        let manager = borrow_global<SharesManager>(manager_address);
        let amount = fungible_asset::amount(&fa);

        update_active_capital_call(manager, amount);
        share_class::fund_facility(share, fa);
    }

    public fun fund_facility(
        manager_object: Object<SharesManager>, share_index: u64, fa: FungibleAsset
    ) acquires SharesManager, CapitalCallContext {
        let _manager_address = object::object_address(&manager_object);
        let share = get_share_class_by_index(manager_object, share_index);
        if (share_class::has_active_capital_call(share)) {
            fulfill_capital_call(share, fa)
        } else {
            share_class::fund_facility(share, fa)
        }
    }

    public fun repay_principal(
        manager_object: Object<SharesManager>, fa: FungibleAsset
    ): FungibleAsset acquires SharesManager {
        let manager =
            borrow_global<SharesManager>(object::object_address(&manager_object));
        let highest_priority_shares =
            get_shares_by_principal_priority(
                &manager.shares, option::none(), option::none()
            );
        let _fa_metadata = fungible_asset::metadata_from_asset(&fa);
        let amount_remaining = fungible_asset::amount(&fa);

        while (vector::length(&highest_priority_shares) > 0 && amount_remaining > 0) {
            let cur_priority =
                share_class::get_principal_repay_priority(
                    *vector::borrow(
                        &manager.shares,
                        (*vector::borrow(&highest_priority_shares, 0)) as u64
                    )
                );

            let carried_fa =
                distribute_payment(
                    &manager.shares,
                    highest_priority_shares,
                    fungible_asset::extract(&mut fa, amount_remaining)
                );
            fungible_asset::merge(&mut fa, carried_fa);
            amount_remaining = fungible_asset::amount(&fa);

            highest_priority_shares = get_shares_by_principal_priority(
                &manager.shares, option::some(cur_priority + 1), option::none()
            );
        };

        fa
    }

    inline fun get_shares_by_priority(
        shares: &vector<Object<VersionedShareDetails>>,
        f: |Object<VersionedShareDetails>| u64,
        lower_bound: Option<u64>,
        upper_bound: Option<u64>
    ): vector<u8> {
        let lower_bound = option::get_with_default(&lower_bound, 0);
        let upper_bound = option::get_with_default(&upper_bound, MAX_U64 - 1);

        let found = vector::empty<u8>();
        let min_so_far = upper_bound;
        let i = 0;

        while (i < vector::length(shares)) {
            let share = *vector::borrow(shares, i);
            let priority = f(share);

            if (priority == min_so_far) {
                vector::push_back(&mut found, i as u8);
            } else if (priority >= lower_bound && priority < min_so_far) {
                min_so_far = priority;
                found = vector::singleton(i as u8);
            };

            i = i + 1;
        };

        found
    }

    inline fun get_dust(
        shares: &vector<Object<VersionedShareDetails>>,
        weight_extractor: |Object<VersionedShareDetails>| u64,
        total_weight: u64,
        payment_amount: u64
    ): u64 {
        let remaining = payment_amount;
        let i = 0;

        while (i < vector::length(shares)) {
            let weight = weight_extractor(*vector::borrow(shares, i));
            let share_split = (weight * payment_amount) / total_weight;
            remaining -= share_split;
            i = i + 1;
        };

        remaining
    }
}
