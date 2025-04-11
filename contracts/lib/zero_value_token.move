module lucid::zero_value_token {
    use std::signer;
    use std::vector;
    use std::string::{Self, String};
    use std::option::{Self};
    use aptos_framework::object::{Self, Object, ConstructorRef};
    use aptos_framework::event;

    use aptos_framework::fungible_asset::{
        Self,
        MintRef,
        TransferRef,
        BurnRef,
        FungibleAsset
    };
    use aptos_framework::function_info;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::dispatchable_fungible_asset;
    use aptos_std::string_utils::to_string_with_canonical_addresses;
    use lucid::whitelist::{Self, BasicWhitelist};

    const EONLY_ADMIN_CAN_MODIFY: u64 = 1;
    const EUNAUTHORIZED: u64 = 2;
    const SEED_BASE: vector<u8> = b"lucid-zvt";
    const PROJECT_URI: vector<u8> = b"https://lucidfinance.xyz";
    const BASE_TOKENS_URI: vector<u8> = b"https://metadata.lucidfinance.xyz/aptos/fa/";
    const ICON_SUFIX: vector<u8> = b"/icon.png";

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct TokenState has key {
        is_unlocked: bool,
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
        unchecked_transferers: Object<BasicWhitelist>,
        admins: Object<BasicWhitelist>
    }

    #[event]
    struct ZeroValueTokenCreated has store, drop {
        token_state: Object<TokenState>,
        owner: address,
        name: String,
        symbol: String,
        decimals: u8
    }

    #[view]
    public fun get_admins(
        token_state: Object<TokenState>
    ): Object<BasicWhitelist> acquires TokenState {
        let token_state = borrow_token_state(&token_state);
        token_state.admins
    }

    #[view]
    public fun is_admin(token_state: Object<TokenState>, address: address): bool acquires TokenState {
        let token_state = borrow_token_state(&token_state);
        object::owner(token_state.admins) == address
            || whitelist::is_member(token_state.admins, address)
    }

    #[view]
    public fun is_unlocked(token_state: Object<TokenState>): bool acquires TokenState {
        let token_state = borrow_token_state(&token_state);
        token_state.is_unlocked
    }

    #[view]
    public fun get_unchecked_transferers(
        token_state: Object<TokenState>
    ): Object<BasicWhitelist> acquires TokenState {
        let token_state = borrow_token_state(&token_state);
        token_state.unchecked_transferers
    }

    #[view]
    public fun is_unchecked_transferer(
        token_state: Object<TokenState>, address: address
    ): bool acquires TokenState {
        let token_state = borrow_token_state(&token_state);
        whitelist::is_member(token_state.unchecked_transferers, address)
    }

    #[view]
    public fun is_zvt<T: key>(metadata: Object<T>): bool {
        exists<TokenState>(object::object_address(&metadata))
    }

    public fun toggle_unlocked<T: key>(
        signer: &signer, metadata: Object<T>, unlocked: bool
    ) acquires TokenState {
        let token_state_object = object::convert<T, TokenState>(metadata);
        assert!(
            is_admin(token_state_object, signer::address_of(signer)),
            EONLY_ADMIN_CAN_MODIFY
        );
        let token_state =
            borrow_global_mut<TokenState>(object::object_address(&metadata));

        if (token_state.is_unlocked != unlocked) {
            token_state.is_unlocked = unlocked;
        }
    }

    public fun transfer_for(
        signer: &signer,
        token_state: Object<TokenState>,
        from: address,
        to: address,
        amount: u64
    ) acquires TokenState {
        assert!(
            is_admin(token_state, signer::address_of(signer)), EONLY_ADMIN_CAN_MODIFY
        );

        let token_state = borrow_token_state(&token_state);
        primary_fungible_store::transfer_with_ref(
            &token_state.transfer_ref, from, to, amount
        );
    }

    public fun withdraw_for(
        signer: &signer,
        token_state: Object<TokenState>,
        from: address,
        amount: u64
    ): FungibleAsset acquires TokenState {
        assert!(
            is_admin(token_state, signer::address_of(signer)), EONLY_ADMIN_CAN_MODIFY
        );
        toggle_unlocked(signer, token_state, true);

        let token_state = borrow_token_state(&token_state);
        primary_fungible_store::withdraw_with_ref(
            &token_state.transfer_ref, from, amount
        )
    }

    public fun ensure_balance(
        signer: &signer,
        token_state: Object<TokenState>,
        address: address,
        amount: u64
    ) acquires TokenState {
        assert!(
            is_admin(token_state, signer::address_of(signer)), EONLY_ADMIN_CAN_MODIFY
        );

        if (!primary_fungible_store::is_balance_at_least(address, token_state, amount)) {
            let balance = primary_fungible_store::balance(address, token_state);
            mint_to(signer, token_state, address, amount - balance);
        }
    }

    #[lint::skip(needless_mutable_reference)]
    public fun mint<T: key>(
        signer: &signer, metadata: Object<T>, amount: u64
    ): FungibleAsset acquires TokenState {
        let token_state_object = object::convert<T, TokenState>(metadata);
        assert!(
            is_admin(token_state_object, signer::address_of(signer)),
            EONLY_ADMIN_CAN_MODIFY
        );

        let token_state = borrow_global<TokenState>(object::object_address(&metadata));

        fungible_asset::mint(&token_state.mint_ref, amount)
    }

    public fun mint_to<T: key>(
        signer: &signer,
        metadata: Object<T>,
        receiver: address,
        amount: u64
    ) acquires TokenState {
        let token_state_object = object::convert<T, TokenState>(metadata);
        assert!(
            is_admin(token_state_object, signer::address_of(signer)),
            EONLY_ADMIN_CAN_MODIFY
        );

        let token_state = borrow_global<TokenState>(object::object_address(&metadata));
        primary_fungible_store::mint(&token_state.mint_ref, receiver, amount);
    }

    public entry fun create_new_token(
        signer: &signer,
        name: String,
        symbol: String,
        admins: Object<BasicWhitelist>,
        transfer_whitelist: Object<BasicWhitelist>
    ) {
        new_token(
            signer,
            name,
            symbol,
            transfer_whitelist,
            admins
        );
    }

    public fun create_token_uri(token_address: &address): String {
        let uri = BASE_TOKENS_URI;
        let token_address_string = to_string_with_canonical_addresses(token_address);
        vector::append(&mut uri, *string::bytes(&token_address_string));
        vector::append(&mut uri, ICON_SUFIX);
        string::utf8(uri)
    }

    public fun new_token(
        signer: &signer,
        name: String,
        symbol: String,
        transfer_whitelist: Object<BasicWhitelist>,
        admins: Object<BasicWhitelist>
    ): Object<TokenState> {
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
        register_callbacks(signer, &constructor_ref);

        move_to(
            &object_signer,
            TokenState {
                is_unlocked: false,
                mint_ref: mint_ref,
                transfer_ref: transfer_ref,
                burn_ref: burn_ref,
                unchecked_transferers: transfer_whitelist,
                admins: admins
            }
        );

        let token_state = object::address_to_object<TokenState>(object_address);

        event::emit(
            ZeroValueTokenCreated {
                token_state,
                owner: signer::address_of(signer),
                name,
                symbol,
                decimals
            }
        );

        token_state
    }

    fun register_callbacks(
        signer: &signer, token_constructor_ref: &ConstructorRef
    ) {
        let withdraw_override =
            function_info::new_function_info(
                signer,
                string::utf8(b"zero_value_token"),
                string::utf8(b"withdraw")
            );

        let deposit_override =
            function_info::new_function_info(
                signer,
                string::utf8(b"zero_value_token"),
                string::utf8(b"deposit")
            );

        dispatchable_fungible_asset::register_dispatch_functions(
            token_constructor_ref,
            option::some(withdraw_override),
            option::some(deposit_override),
            option::none()
        );
    }

    public fun withdraw<T: key>(
        store: Object<T>, amount: u64, transfer_ref: &TransferRef
    ): FungibleAsset acquires TokenState {
        let store_owner = object::owner(store);
        let metadata = fungible_asset::transfer_ref_metadata(transfer_ref);
        let metadata_address = object::object_address(&metadata);
        let token_state = borrow_global<TokenState>(metadata_address);
        assert!(
            token_state.is_unlocked
                || whitelist::is_member(token_state.unchecked_transferers, store_owner),
            EUNAUTHORIZED
        );

        fungible_asset::withdraw_with_ref(transfer_ref, store, amount)
    }

    public fun deposit<T: key>(
        store: Object<T>, fa: FungibleAsset, transfer_ref: &TransferRef
    ) acquires TokenState {
        let store_owner = object::owner(store);
        let metadata = fungible_asset::transfer_ref_metadata(transfer_ref);
        let metadata_address = object::object_address(&metadata);
        let token_state = borrow_global<TokenState>(metadata_address);
        assert!(
            token_state.is_unlocked
                || whitelist::is_member(token_state.unchecked_transferers, store_owner),
            EUNAUTHORIZED
        );

        fungible_asset::deposit_with_ref(transfer_ref, store, fa);
    }

    public fun burn(signer: &signer, fa: FungibleAsset) acquires TokenState {
        let metadata = fungible_asset::metadata_from_asset(&fa);
        let metadata_address = object::object_address(&metadata);
        let token_state_object = object::address_to_object<TokenState>(metadata_address);
        assert!(
            is_admin(token_state_object, signer::address_of(signer)),
            EONLY_ADMIN_CAN_MODIFY
        );

        let token_state = borrow_token_state(&token_state_object);

        fungible_asset::burn(&token_state.burn_ref, fa);
    }

    public fun toggle_admin(
        signer: &signer,
        token_state_object: Object<TokenState>,
        address: address,
        is_admin: bool
    ) acquires TokenState {
        assert!(
            is_admin(token_state_object, signer::address_of(signer)),
            EONLY_ADMIN_CAN_MODIFY
        );
        let token_state = borrow_token_state(&token_state_object);
        whitelist::toggle(signer, token_state.admins, address, is_admin);
    }

    inline fun borrow_token_state(token_state: &Object<TokenState>): &TokenState {
        let addr = object::object_address(token_state);
        borrow_global<TokenState>(addr)
    }

    #[view]
    public fun balance(account: address, token_state: Object<TokenState>): u64 {
        primary_fungible_store::balance(account, token_state)
    }

    #[test_only]
    public fun create_for_test(signer: &signer): Object<TokenState> {
        let white_list = whitelist::create(signer, string::utf8(b"whitelist"));
        new_token(
            signer,
            string::utf8(b"name"),
            string::utf8(b"s"),
            white_list,
            white_list
        )
    }

    #[test(signer = @lucid)]
    fun test_can_toggle_unlock(signer: signer) acquires TokenState {
        let white_list = whitelist::create(&signer, string::utf8(b"whitelist"));
        let token_state =
            new_token(
                &signer,
                string::utf8(b"name"),
                string::utf8(b"s"),
                white_list,
                white_list
            );

        toggle_unlocked(&signer, token_state, true);
    }

    #[test(signer = @lucid, wallet_1 = @test_wallet_1)]
    fun test_can_mint(signer: signer, wallet_1: signer) acquires TokenState {
        let white_list = whitelist::create(&signer, string::utf8(b"whitelist"));
        let token_state =
            new_token(
                &signer,
                string::utf8(b"name"),
                string::utf8(b"s"),
                white_list,
                white_list
            );

        mint_to(
            &signer,
            token_state,
            signer::address_of(&wallet_1),
            10
        );
        assert!(
            primary_fungible_store::balance(signer::address_of(&wallet_1), token_state)
                == 10,
            1
        );
    }
}
