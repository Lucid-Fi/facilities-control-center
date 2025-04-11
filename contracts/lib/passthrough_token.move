module lucid::passthrough_token {
    use std::signer;
    use std::vector;
    use std::string::{Self, String};
    use std::option::{Self};
    use std::bcs::to_bytes;
    use aptos_framework::object::{Self, Object, ConstructorRef, ExtendRef};
    use aptos_framework::event;
    use aptos_framework::aggregator_v2::{Self, Aggregator};

    use aptos_framework::fungible_asset::{
        Self,
        MintRef,
        TransferRef,
        BurnRef,
        FungibleAsset,
        Metadata
    };

    use aptos_framework::function_info;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::dispatchable_fungible_asset;
    use aptos_std::string_utils::to_string_with_canonical_addresses;

    use lucid::whitelist::{Self, BasicWhitelist};

    const EONLY_ADMIN_CAN_MODIFY: u64 = 1;
    const EUNAUTHORIZED: u64 = 2;
    const EINTERNAL: u64 = 3;
    const EUNGATED_SNAPSHOT_NOT_SUPPORTED: u64 = 4;
    const ESUPPLY_NOT_FOUND: u64 = 5;
    const ENO_PAYOUT: u64 = 6;
    const ENOT_PAYOUT_FA: u64 = 7;
    const EREQUIRES_NO_SUPPLY: u64 = 8;
    const ETOKEN_DOES_NOT_SUPPORT_SUPPLY: u64 = 9;
    const EREQUIRES_TOKEN_HOLDER_COUNTER: u64 = 10;

    const SEED_BASE: vector<u8> = b"lucid-passthrough";
    const PROJECT_URI: vector<u8> = b"https://lucidfinance.xyz";
    const BASE_TOKENS_URI: vector<u8> = b"https://metadata.lucidfinance.xyz/aptos/fa/";
    const ICON_SUFIX: vector<u8> = b"/icon.png";

    const CLAIMABLE_PER_SHARE_DENOMINATOR: u128 = 1_000_000_000;

    struct PassThroughMintRef has store, drop {
        inner: address
    }

    struct SnapshotRef has store, drop {
        inner: address
    }

    struct InitiateClaimRef has store, drop {
        inner: address
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct PassThroughTokenState has key {
        is_unlocked: bool,
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
        extend_ref: ExtendRef,
        allowed_holders: Object<BasicWhitelist>,
        admins: Object<BasicWhitelist>,
        payout_fa: Object<Metadata>,
        claimable_amount: vector<u64>,
        claimable_history: vector<vector<u128>>
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct TokenHolderCounter has key {
        current_holders: Aggregator<u64>
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct UngatedSnapshot has key {}

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct ClaimRecord has key {
        next_claim_index: vector<u32>,
        extra_claimable: vector<u64>,
        opt_out_auto_claim: bool
    }

    #[event]
    struct PassThroughTokenCreated has store, drop {
        address: address,
        owner: address,
        name: String,
        symbol: String,
        decimals: u8
    }

    #[view]
    public fun is_admin(
        token_state_object: Object<PassThroughTokenState>, address: address
    ): bool acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state_object);
        (object::owner(token_state_object) == address)
            || whitelist::is_member(token_state.admins, address)
    }

    #[view]
    public fun is_unlocked(
        token_state: Object<PassThroughTokenState>
    ): bool acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state);
        token_state.is_unlocked
    }

    #[view]
    public fun get_allowed_holders(
        token_state: Object<PassThroughTokenState>
    ): Object<BasicWhitelist> acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state);
        token_state.allowed_holders
    }

    #[view]
    public fun is_unchecked_transferer(
        token_state: Object<PassThroughTokenState>, address: address
    ): bool acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state);
        whitelist::is_member(token_state.allowed_holders, address)
    }

    #[view]
    public fun balance(
        account: address, token_state: Object<PassThroughTokenState>
    ): u64 {
        if (primary_fungible_store::primary_store_exists_inlined(account, token_state)) {
            let store =
                primary_fungible_store::primary_store_inlined(account, token_state);
            fungible_asset::balance(store)
        } else { 0 }
    }

    #[view]
    public fun get_payout(
        token_state: Object<PassThroughTokenState>, owner: address, index: u64
    ): u64 acquires ClaimRecord, PassThroughTokenState {
        let owner_balance = balance(owner, token_state);
        let claim_record = ensure_claim_record_exists(token_state, owner);
        let claim_record = borrow_claim_record(&claim_record);
        let next_claim_indexed = *vector::borrow(&claim_record.next_claim_index, index);

        calculate_claimable_amount(
            token_state,
            owner_balance,
            next_claim_indexed,
            index
        )
    }

    #[view]
    public fun calculate_claimable_amount(
        token_state: Object<PassThroughTokenState>,
        token_amount: u64,
        starting_index: u32,
        claimable_index: u64
    ): u64 acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state);
        let indexed_claim_history: vector<u128> =
            *vector::borrow(&token_state.claimable_history, claimable_index);
        let max_claim_index = vector::length(&indexed_claim_history);

        let total_claimable_amount = 0u64;
        let i = (starting_index as u64);
        while (i < max_claim_index) {
            let claimable_per_token = *vector::borrow(&indexed_claim_history, i);
            let claimable_amount =
                (claimable_per_token * (token_amount as u128))
                    / CLAIMABLE_PER_SHARE_DENOMINATOR;
            total_claimable_amount = total_claimable_amount + (claimable_amount as u64);
            i = i + 1;
        };

        total_claimable_amount
    }

    #[view]
    public fun claim_record_address(
        token_state_address: address, owner: address
    ): address {
        let seed = to_bytes(&owner);

        object::create_object_address(&token_state_address, seed)
    }

    #[view]
    public fun supports_ungated_snapshot(
        token_state: Object<PassThroughTokenState>
    ): bool {
        let object_address = object::object_address(&token_state);
        exists<UngatedSnapshot>(object_address)
    }

    #[view]
    public fun can_initiate_claim_for(
        token_state: Object<PassThroughTokenState>, owner: address, caller: address
    ): bool acquires ClaimRecord {
        let claim_record_address =
            claim_record_address(object::object_address(&token_state), owner);

        if (owner == caller || !exists<ClaimRecord>(claim_record_address)) { true }
        else {
            let claim_record = borrow_global<ClaimRecord>(claim_record_address);
            !claim_record.opt_out_auto_claim
        }
    }

    #[view]
    public fun claim_record_exists(
        token_state: Object<PassThroughTokenState>, owner: address
    ): bool {
        let claim_record_address =
            claim_record_address(object::object_address(&token_state), owner);
        exists<ClaimRecord>(claim_record_address)
    }

    #[view]
    public fun token_holder_counter_exists(passthrough_token: address): bool {
        exists<TokenHolderCounter>(passthrough_token)
    }

    #[view]
    public fun current_holders_at_most(
        passthrough_token: address, reference: u64
    ): bool acquires TokenHolderCounter {
        assert!(
            token_holder_counter_exists(passthrough_token),
            EREQUIRES_TOKEN_HOLDER_COUNTER
        );
        let counter = borrow_global<TokenHolderCounter>(passthrough_token);

        !aggregator_v2::is_at_least(&counter.current_holders, reference + 1)
    }

    /// Note that this function HAS to be called before the user receives any payout.
    public entry fun confirm_underlying_primary_store(
        token_state: Object<PassThroughTokenState>, owner: address
    ) acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state);
        let payout_fa = token_state.payout_fa;
        primary_fungible_store::ensure_primary_store_exists(owner, payout_fa);
    }

    public entry fun snapshot_index(
        signer: &signer,
        token_state: Object<PassThroughTokenState>,
        index: u64
    ) acquires PassThroughTokenState {
        assert!(
            is_admin(token_state, signer::address_of(signer)),
            EUNAUTHORIZED
        );

        snapshot_by_index(token_state, index);
    }

    public entry fun opt_out_auto_claim(
        signer: &signer, token_state: Object<PassThroughTokenState>
    ) acquires ClaimRecord, PassThroughTokenState {
        let claim_record =
            ensure_claim_record_exists(token_state, signer::address_of(signer));
        let claim_record = mut_claim_record(&claim_record);
        claim_record.opt_out_auto_claim = true;
    }

    public fun token_state_from_constructor_ref(
        constructor_ref: &ConstructorRef
    ): Object<PassThroughTokenState> {
        object::address_to_object<PassThroughTokenState>(
            object::address_from_constructor_ref(constructor_ref)
        )
    }

    public entry fun snapshot_ungated(
        token_state: Object<PassThroughTokenState>
    ) acquires PassThroughTokenState {
        assert!(
            supports_ungated_snapshot(token_state), EUNGATED_SNAPSHOT_NOT_SUPPORTED
        );
        snapshot(token_state);
    }

    public entry fun claim_payout(
        owner: &signer, token_state: Object<PassThroughTokenState>
    ) acquires ClaimRecord, PassThroughTokenState {
        claim_payout_internal(token_state, signer::address_of(owner));
    }

    public entry fun initiate_claim_for_many(
        caller: &signer,
        owners: vector<address>,
        token_state: Object<PassThroughTokenState>
    ) acquires ClaimRecord, PassThroughTokenState {
        let i = 0;
        while (i < vector::length(&owners)) {
            let owner = *vector::borrow(&owners, i);
            if (can_initiate_claim_for(token_state, owner, signer::address_of(caller))) {
                initiate_claim(caller, owner, token_state);
            };

            i = i + 1;
        };
    }

    public entry fun initiate_claim_for(
        caller: &signer, owner: address, token_state: Object<PassThroughTokenState>
    ) acquires ClaimRecord, PassThroughTokenState {
        initiate_claim(caller, owner, token_state);
    }

    public fun initiate_claim(
        caller: &signer, owner: address, token_state: Object<PassThroughTokenState>
    ): u64 acquires ClaimRecord, PassThroughTokenState {
        assert!(
            can_initiate_claim_for(token_state, owner, signer::address_of(caller)),
            EUNAUTHORIZED
        );
        claim_payout_internal(token_state, owner)
    }

    public fun increase_payout(
        token_state: Object<PassThroughTokenState>, fa: FungibleAsset, claimable_index: u64
    ): u64 acquires PassThroughTokenState {
        let amount = fungible_asset::amount(&fa);
        let metadata = fungible_asset::metadata_from_asset(&fa);

        primary_fungible_store::deposit(object::object_address(&token_state), fa);

        let token_state = mut_token_state(&token_state);
        assert!(
            object::object_address(&metadata)
                == object::object_address(&token_state.payout_fa),
            ENOT_PAYOUT_FA
        );
        let claimable_amount: u64 =
            *vector::borrow(&token_state.claimable_amount, claimable_index);
        claimable_amount = claimable_amount + amount;

        vector::replace(
            &mut token_state.claimable_amount, claimable_index, claimable_amount
        );
        claimable_amount
    }

    public fun snapshot_with_ref(snapshot_ref: &SnapshotRef) acquires PassThroughTokenState {
        let token_state_object =
            object::address_to_object<PassThroughTokenState>(snapshot_ref.inner);

        snapshot(token_state_object);
    }

    public fun claim_payout_returning(
        owner: &signer, token_state: Object<PassThroughTokenState>
    ): u64 acquires ClaimRecord, PassThroughTokenState {
        claim_payout_internal(token_state, signer::address_of(owner))
    }

    public fun claim_payout_with_ref(
        initiate_claim_ref: &InitiateClaimRef, owner: &signer
    ): u64 acquires ClaimRecord, PassThroughTokenState {
        claim_payout_internal(
            object::address_to_object<PassThroughTokenState>(initiate_claim_ref.inner),
            signer::address_of(owner)
        )
    }

    public fun generate_pass_through_mint_ref(
        constructor_ref: &ConstructorRef
    ): PassThroughMintRef {
        PassThroughMintRef { inner: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun generate_snapshot_ref(constructor_ref: &ConstructorRef): SnapshotRef {
        SnapshotRef { inner: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun generate_initiate_claim_ref(
        constructor_ref: &ConstructorRef
    ): InitiateClaimRef {
        InitiateClaimRef { inner: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun toggle_unlocked<T: key>(
        signer: &signer, metadata: Object<T>, unlocked: bool
    ) acquires PassThroughTokenState {
        let token_state_object = object::convert<T, PassThroughTokenState>(metadata);
        assert!(
            is_admin(token_state_object, signer::address_of(signer)),
            EONLY_ADMIN_CAN_MODIFY
        );
        let token_state =
            borrow_global_mut<PassThroughTokenState>(object::object_address(&metadata));
        token_state.is_unlocked = unlocked;
    }

    #[lint::skip(needless_mutable_reference)]
    public fun mint(
        mint_ref: &PassThroughMintRef, amount: u64
    ): FungibleAsset acquires PassThroughTokenState {
        let token_state = borrow_global<PassThroughTokenState>(mint_ref.inner);
        let fa_mint_ref = &token_state.mint_ref;
        fungible_asset::mint(fa_mint_ref, amount)
    }

    public fun create_token_uri(token_address: &address): String {
        let uri = BASE_TOKENS_URI;
        let token_address_string = to_string_with_canonical_addresses(token_address);
        vector::append(&mut uri, *string::bytes(&token_address_string));
        vector::append(&mut uri, ICON_SUFIX);
        string::utf8(uri)
    }

    public fun extend_with_holder_tracking(
        constructor_ref: &ConstructorRef
    ) {
        let token_state =
            object::object_from_constructor_ref<PassThroughTokenState>(constructor_ref);
        let current_supply = fungible_asset::supply(token_state);

        assert!(option::is_some(&current_supply), ETOKEN_DOES_NOT_SUPPORT_SUPPLY);
        assert!(*option::borrow(&current_supply) == 0, EREQUIRES_NO_SUPPLY);

        let signer = object::generate_signer(constructor_ref);
        move_to(
            &signer,
            TokenHolderCounter {
                current_holders: aggregator_v2::create_unbounded_aggregator()
            }
        );
    }

    public fun new_token(
        signer: &signer,
        name: String,
        symbol: String,
        transfer_whitelist: Object<BasicWhitelist>,
        admins: Object<BasicWhitelist>,
        underlying_fa: Object<Metadata>,
        num_pools: u32
    ): ConstructorRef {
        let decimals = 8;
        let seed = SEED_BASE;
        vector::append(&mut seed, *string::bytes(&name));

        let constructor_ref = object::create_named_object(signer, seed);
        let object_signer = object::generate_signer(&constructor_ref);
        let object_address = signer::address_of(&object_signer);
        let icon_uri = create_token_uri(&object_address);
        let project_uri = string::utf8(PROJECT_URI);

        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &constructor_ref,
            option::none(),
            name,
            symbol,
            decimals,
            icon_uri,
            project_uri
        );

        let mint_ref = fungible_asset::generate_mint_ref(&constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(&constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(&constructor_ref);
        let extend_ref = object::generate_extend_ref(&constructor_ref);
        register_callbacks(signer, &constructor_ref);

        let claimable_amount_vector = vector::empty<u64>();
        let claimable_history_vector = vector::empty();
        let i: u32 = 0;
        while (i < num_pools) {
            vector::push_back(&mut claimable_amount_vector, 0);
            vector::push_back(&mut claimable_history_vector, vector::empty<u128>());
            i = i + 1;
        };

        move_to(
            &object_signer,
            PassThroughTokenState {
                is_unlocked: false,
                mint_ref: mint_ref,
                transfer_ref: transfer_ref,
                burn_ref: burn_ref,
                extend_ref: extend_ref,
                allowed_holders: transfer_whitelist,
                admins: admins,
                payout_fa: underlying_fa,
                claimable_amount: claimable_amount_vector,
                claimable_history: claimable_history_vector
            }
        );

        event::emit(
            PassThroughTokenCreated {
                address: object_address,
                owner: signer::address_of(signer),
                name,
                symbol,
                decimals
            }
        );

        constructor_ref
    }

    public fun claim_payout_by_index(
        caller: &signer,
        owner: address,
        token_state: Object<PassThroughTokenState>,
        index: u64
    ): u64 acquires ClaimRecord, PassThroughTokenState {
        assert!(
            can_initiate_claim_for(token_state, owner, signer::address_of(caller)),
            EUNAUTHORIZED
        );
        claim_payout_internal_by_index(token_state, owner, index)
    }

    fun claim_payout_internal(
        token_state: Object<PassThroughTokenState>, owner: address
    ): u64 acquires ClaimRecord, PassThroughTokenState {
        let token_state_object = borrow_token_state(&token_state);
        let max_payout_index = vector::length(&token_state_object.claimable_history);

        let total_claimable_payout = 0u64;
        let i: u64 = 0;
        while (i < max_payout_index) {
            let claimable_payout_by_index =
                claim_payout_internal_by_index(token_state, owner, i);
            total_claimable_payout = total_claimable_payout + claimable_payout_by_index;
            i = i + 1;
        };

        total_claimable_payout
    }

    fun claim_payout_internal_by_index(
        token_state: Object<PassThroughTokenState>, owner: address, claimable_index: u64
    ): u64 acquires ClaimRecord, PassThroughTokenState {
        // RETURNS TOTAL CLAIMABLE AMOUNT AS PER SUM OF ALL PENDING HISTORY
        let total_claimable = get_payout(token_state, owner, claimable_index);
        let claim_record = ensure_claim_record_exists(token_state, owner);
        let claim_record = mut_claim_record(&claim_record);

        let extra_claimable =
            *vector::borrow(&claim_record.extra_claimable, claimable_index);

        vector::replace(&mut claim_record.extra_claimable, claimable_index, 0);

        total_claimable = total_claimable + extra_claimable;

        if (total_claimable == 0) {
            return 0;
        };

        let token_state_address = object::object_address(&token_state);
        let token_state = borrow_token_state(&token_state);
        let token_state_signer =
            object::generate_signer_for_extending(&token_state.extend_ref);

        let index_claim_history: vector<u128> =
            *vector::borrow(&token_state.claimable_history, claimable_index);
        // SET THE INDEX TO THE CURRENT INDEX, AS PENDING CLAIMS ARE ALL PROCESSING IN NEXT LINES
        vector::replace(
            &mut claim_record.next_claim_index,
            claimable_index,
            (vector::length(&index_claim_history) as u32)
        );

        let primary_store_internal =
            primary_fungible_store::primary_store_inlined(
                token_state_address, token_state.payout_fa
            );

        let owner_store_internal =
            primary_fungible_store::primary_store_inlined(owner, token_state.payout_fa);

        let fa =
            dispatchable_fungible_asset::withdraw(
                &token_state_signer,
                primary_store_internal,
                total_claimable
            );

        dispatchable_fungible_asset::deposit(owner_store_internal, fa);

        total_claimable
    }

    fun snapshot(token_state_object: Object<PassThroughTokenState>) acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state_object);
        let max_snapshot_index = vector::length(&token_state.claimable_amount);

        let i: u64 = 0;
        while (i < max_snapshot_index) {
            snapshot_by_index(token_state_object, i);
            i = i + 1;
        };
    }

    fun snapshot_by_index(
        token_state_object: Object<PassThroughTokenState>, claimable_index: u64
    ) acquires PassThroughTokenState {
        let token_state =
            borrow_global_mut<PassThroughTokenState>(
                object::object_address(&token_state_object)
            );
        let claimable_amount =
            *vector::borrow(&token_state.claimable_amount, claimable_index);
        let current_supply = fungible_asset::supply(token_state_object);

        assert!(option::is_some(&current_supply), ESUPPLY_NOT_FOUND);
        let current_supply = *option::borrow(&current_supply);

        let claimable_per_share =
            ((claimable_amount as u128) * CLAIMABLE_PER_SHARE_DENOMINATOR)
                / (current_supply as u128);
        let index_claim_history = vector::borrow_mut(
            &mut token_state.claimable_history, claimable_index
        );
        vector::push_back(index_claim_history, claimable_per_share);

        vector::replace(&mut token_state.claimable_amount, claimable_index, 0);
    }

    fun create_claim_record(
        token_state: Object<PassThroughTokenState>, owner: address
    ): ConstructorRef acquires PassThroughTokenState {
        let token_state = borrow_token_state(&token_state);
        let token_state_signer =
            object::generate_signer_for_extending(&token_state.extend_ref);
        let seed = to_bytes(&owner);
        let claim_record_constructor_ref =
            object::create_named_object(&token_state_signer, seed);
        let claim_record_signer = object::generate_signer(&claim_record_constructor_ref);

        // Disable ungated transfer for claim records
        let transfer_ref = &object::generate_transfer_ref(&claim_record_constructor_ref);
        object::disable_ungated_transfer(transfer_ref);

        let max_claimable_history_length = vector::length(&token_state.claimable_history);
        let next_claim_index = vector::empty<u32>();
        let extra_claimable = vector::empty<u64>();

        let i: u64 = 0;
        while (i < max_claimable_history_length) {
            let claim_history = vector::borrow(&token_state.claimable_history, i);
            let claim_history_length = vector::length(claim_history);
            vector::push_back(&mut next_claim_index, claim_history_length as u32);
            vector::push_back(&mut extra_claimable, 0);
            i = i + 1;
        };

        move_to(
            &claim_record_signer,
            ClaimRecord {
                next_claim_index: next_claim_index,
                extra_claimable: extra_claimable,
                opt_out_auto_claim: false
            }
        );

        claim_record_constructor_ref
    }

    fun ensure_claim_record_exists(
        token_state: Object<PassThroughTokenState>, owner: address
    ): Object<ClaimRecord> acquires PassThroughTokenState {
        let claim_record_address =
            claim_record_address(object::object_address(&token_state), owner);
        if (exists<ClaimRecord>(claim_record_address)) {
            object::address_to_object<ClaimRecord>(claim_record_address)
        } else {
            let claim_record_constructor_ref = create_claim_record(token_state, owner);
            assert!(
                exists<ClaimRecord>(claim_record_address),
                EINTERNAL
            );

            object::object_from_constructor_ref<ClaimRecord>(&claim_record_constructor_ref)
        }
    }

    fun register_callbacks(
        signer: &signer, token_constructor_ref: &ConstructorRef
    ) {
        let withdraw_override =
            function_info::new_function_info(
                signer,
                string::utf8(b"passthrough_token"),
                string::utf8(b"withdraw")
            );

        let deposit_override =
            function_info::new_function_info(
                signer,
                string::utf8(b"passthrough_token"),
                string::utf8(b"deposit")
            );

        dispatchable_fungible_asset::register_dispatch_functions(
            token_constructor_ref,
            option::some(withdraw_override),
            option::some(deposit_override),
            option::none()
        );
    }

    public fun update_holder_tracker(
        token_state_address: address, previous_balance: u64, new_balance: u64
    ) acquires TokenHolderCounter {
        if (!token_holder_counter_exists(token_state_address)) {
            return;
        };

        let counter = borrow_global_mut<TokenHolderCounter>(token_state_address);

        if (previous_balance == 0 && new_balance > 0) {
            aggregator_v2::add(&mut counter.current_holders, 1);
        } else if (previous_balance > 0 && new_balance == 0) {
            aggregator_v2::sub(&mut counter.current_holders, 1);
        }
    }

    fun add_to_extra_claimable(
        token_state: Object<PassThroughTokenState>, owner: address
    ) acquires ClaimRecord, PassThroughTokenState {
        let token_state_object = borrow_token_state(&token_state);
        let max_payout_index = vector::length(&token_state_object.claimable_history);

        let i = 0;
        while (i < max_payout_index) {
            add_to_extra_claimable_internal(token_state, owner, i);
            i = i + 1;
        };
    }

    fun add_to_extra_claimable_internal(
        token_state: Object<PassThroughTokenState>, owner: address, claimable_index: u64
    ) acquires ClaimRecord, PassThroughTokenState {
        let total_claimable = get_payout(token_state, owner, claimable_index);
        let claim_record = ensure_claim_record_exists(token_state, owner);
        if (total_claimable == 0) {
            return;
        };

        let claim_record = mut_claim_record(&claim_record);
        let token_state = borrow_token_state(&token_state);

        let index_claim_history: vector<u128> =
            *vector::borrow(&token_state.claimable_history, claimable_index);
        // SET THE INDEX TO THE CURRENT INDEX, AS PENDING CLAIMS ARE ALL PROCESSING IN NEXT LINES
        vector::replace(
            &mut claim_record.next_claim_index,
            claimable_index,
            (vector::length(&index_claim_history) as u32)
        );

        vector::replace(
            &mut claim_record.extra_claimable,
            claimable_index,
            total_claimable
        );
    }

    public fun withdraw<T: key>(
        store: Object<T>, amount: u64, transfer_ref: &TransferRef
    ): FungibleAsset acquires ClaimRecord, PassThroughTokenState, TokenHolderCounter {
        let store_owner = object::owner(store);

        let metadata = fungible_asset::transfer_ref_metadata(transfer_ref);
        let token_balance = fungible_asset::balance(store);
        let token_address = object::object_address(&metadata);
        let token_state_object =
            object::address_to_object<PassThroughTokenState>(token_address);
        let _ = ensure_claim_record_exists(token_state_object, store_owner);
        let token_state = borrow_token_state(&token_state_object);

        assert!(
            token_state.is_unlocked
                || whitelist::is_member(token_state.allowed_holders, store_owner),
            EUNAUTHORIZED
        );

        add_to_extra_claimable(token_state_object, store_owner);

        update_holder_tracker(token_address, token_balance, token_balance - amount);
        fungible_asset::withdraw_with_ref(transfer_ref, store, amount)
    }

    public fun deposit<T: key>(
        store: Object<T>, fa: FungibleAsset, transfer_ref: &TransferRef
    ) acquires ClaimRecord, PassThroughTokenState, TokenHolderCounter {
        let token_balance = fungible_asset::balance(store);
        let deposit_amount = fungible_asset::amount(&fa);

        let store_owner = object::owner(store);

        let metadata = fungible_asset::transfer_ref_metadata(transfer_ref);
        let token_address = object::object_address(&metadata);
        let token_state_object =
            object::address_to_object<PassThroughTokenState>(token_address);
        let _ = ensure_claim_record_exists(token_state_object, store_owner);
        let token_state = borrow_token_state(&token_state_object);

        assert!(
            token_state.is_unlocked
                || whitelist::is_member(token_state.allowed_holders, store_owner),
            EUNAUTHORIZED
        );

        add_to_extra_claimable(token_state_object, store_owner);

        update_holder_tracker(
            token_address, token_balance, token_balance + deposit_amount
        );

        fungible_asset::deposit_with_ref(transfer_ref, store, fa);
    }

    public fun toggle_admin(
        signer: &signer,
        token_state_object: Object<PassThroughTokenState>,
        address: address,
        is_admin: bool
    ) acquires PassThroughTokenState {
        assert!(
            is_admin(token_state_object, signer::address_of(signer)),
            EONLY_ADMIN_CAN_MODIFY
        );
        let token_state = borrow_token_state(&token_state_object);
        whitelist::toggle(signer, token_state.admins, address, is_admin);
    }

    inline fun borrow_token_state(
        token_state: &Object<PassThroughTokenState>
    ): &PassThroughTokenState {
        let addr = object::object_address(token_state);
        borrow_global<PassThroughTokenState>(addr)
    }

    inline fun mut_token_state(
        token_state: &Object<PassThroughTokenState>
    ): &mut PassThroughTokenState {
        let addr = object::object_address(token_state);
        borrow_global_mut<PassThroughTokenState>(addr)
    }

    inline fun borrow_claim_record(claim_record: &Object<ClaimRecord>): &ClaimRecord {
        let addr = object::object_address(claim_record);
        borrow_global<ClaimRecord>(addr)
    }

    inline fun mut_claim_record(claim_record: &Object<ClaimRecord>): &mut ClaimRecord {
        let addr = object::object_address(claim_record);
        borrow_global_mut<ClaimRecord>(addr)
    }
}
