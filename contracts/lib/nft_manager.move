module lucid::nft_manager {
    use aptos_token_objects::collection::{Self, Collection};
    use aptos_token_objects::token::{Self, Token, BurnRef};

    use std::signer;
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use std::vector::{Self};
    use aptos_framework::object::{Self, Object, ExtendRef, TransferRef, ConstructorRef};
    use aptos_framework::event;
    use aptos_framework::fungible_asset::{Self, FungibleAsset};
    use aptos_framework::primary_fungible_store;
    use aptos_std::string_utils::to_string_with_canonical_addresses;

    use lucid::whitelist::{Self, BasicWhitelist};
    use lucid::ensure_owner;
    use lucid::facility_core;

    friend lucid::loan_book;

    const ENOT_OWNER_OF_COLLECTION: u64 = 1;
    const ENOT_OWNER_OF_TOKEN: u64 = 2;
    const EACCOUNT_NOT_WHITELISTED: u64 = 3;

    const BASE_DESCRIPTION: vector<u8> = b"Lucid Finance ";
    const BASE_COLLECTIONS_URI: vector<u8> = b"https://metadata.lucidfinance.xyz/aptos/collections/";
    const BASE_TOKENS_URI: vector<u8> = b"https://metadata.lucidfinance.xyz/aptos/tokens/";

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct RwaTokenConfig has key, drop {
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
        mutator_ref: token::MutatorRef,
        deferred_receiver: Option<address>
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct RwaCollectionConfig has key {
        whitelist: Object<BasicWhitelist>,
        extend_ref: ExtendRef,
        mutator_ref: collection::MutatorRef,
        enforce_whitelist: bool,
        loan_book_address: address
    }

    #[event]
    struct RwaTokenTransferred has drop, store {
        loan_book_address: address,
        token_address: address,
        from: address,
        to: address
    }

    public fun receive_cashflow(
        token: Object<RwaTokenConfig>,
        principal: FungibleAsset,
        interest: FungibleAsset,
        fee: FungibleAsset
    ) acquires RwaTokenConfig {
        let owner = object::owner(token);
        let token_address = object::object_address(&token);
        let token_config = borrow_global<RwaTokenConfig>(token_address);
        let deferred_receiver = token_config.deferred_receiver;
        let receiver = option::destroy_with_default(deferred_receiver, owner);

        if (facility_core::is_facility(receiver)) {
            let facility = object::address_to_object(receiver);
            facility_core::receive_payment(facility, principal, interest, fee);
        } else {
            fungible_asset::merge(&mut principal, interest);
            fungible_asset::merge(&mut principal, fee);

            primary_fungible_store::deposit(receiver, principal);
        }
    }

    fun create_collection_uri(
        loan_book_address: &address, collection_name: &String
    ): String {
        let collection_address =
            collection::create_collection_address(loan_book_address, collection_name);
        let collection_address_string =
            to_string_with_canonical_addresses(&collection_address);
        let uri = BASE_COLLECTIONS_URI;
        vector::append(&mut uri, *string::bytes(&collection_address_string));

        string::utf8(uri)
    }

    fun create_token_uri(token_address: &address): String {
        let uri = BASE_TOKENS_URI;
        let token_address_string = to_string_with_canonical_addresses(token_address);
        vector::append(&mut uri, *string::bytes(&token_address_string));

        string::utf8(uri)
    }

    public fun create_collection(
        signer: &signer,
        collection_name: String,
        whitelist: Object<BasicWhitelist>,
        enforce_whitelist: bool
    ): ConstructorRef {
        let loan_book_address = signer::address_of(signer);
        let uri = create_collection_uri(&loan_book_address, &collection_name);

        let collection_constructor_ref =
            collection::create_unlimited_collection(
                signer,
                string::utf8(BASE_DESCRIPTION),
                collection_name,
                option::none(),
                uri
            );

        let extend_ref = object::generate_extend_ref(&collection_constructor_ref);
        let mutator_ref = collection::generate_mutator_ref(&collection_constructor_ref);
        let collection_signer = object::generate_signer(&collection_constructor_ref);

        move_to(
            &collection_signer,
            RwaCollectionConfig {
                whitelist: whitelist,
                extend_ref: extend_ref,
                mutator_ref: mutator_ref,
                enforce_whitelist: enforce_whitelist,
                loan_book_address: loan_book_address
            }
        );

        collection_constructor_ref
    }

    public(friend) fun friendly_token_transfer(
        signer: &signer, token: Object<Token>, recipient: address
    ) acquires RwaTokenConfig {
        assert!(object::owner(token) == signer::address_of(signer), ENOT_OWNER_OF_TOKEN);
        let rwa_token_config =
            borrow_global<RwaTokenConfig>(object::object_address(&token));
        let linear_transfer_ref =
            object::generate_linear_transfer_ref(&rwa_token_config.transfer_ref);
        object::transfer_with_ref(linear_transfer_ref, recipient);
    }

    public fun create_token_from_seed(
        signer: &signer, collection: Object<Collection>, seed: vector<u8>
    ): ConstructorRef acquires RwaCollectionConfig {
        assert!(
            object::owner(collection) == signer::address_of(signer),
            ENOT_OWNER_OF_COLLECTION
        );

        let collection_config =
            borrow_global<RwaCollectionConfig>(object::object_address(&collection));

        let token_constructor_ref =
            token::create_named_token_from_seed(
                signer,
                collection,
                string::utf8(b""),
                string::utf8(b""),
                string::utf8(seed),
                option::none(),
                string::utf8(b"")
            );

        handle_token_ref(token_constructor_ref, collection_config)
    }

    public fun create_token(
        signer: &signer, collection: Object<Collection>
    ): ConstructorRef acquires RwaCollectionConfig {
        assert!(
            object::owner(collection) == signer::address_of(signer),
            ENOT_OWNER_OF_COLLECTION
        );
        let collection_config =
            borrow_global<RwaCollectionConfig>(object::object_address(&collection));

        let token_constructor_ref =
            token::create_token(
                signer,
                collection,
                string::utf8(b""),
                string::utf8(b""),
                option::none(),
                string::utf8(b"")
            );

        handle_token_ref(token_constructor_ref, collection_config)
    }

    fun handle_token_ref(
        token_constructor_ref: ConstructorRef, collection_config: &RwaCollectionConfig
    ): ConstructorRef {
        let transfer_ref = object::generate_transfer_ref(&token_constructor_ref);
        let burn_ref = token::generate_burn_ref(&token_constructor_ref);
        let mutator_ref = token::generate_mutator_ref(&token_constructor_ref);

        if (collection_config.enforce_whitelist)
            object::disable_ungated_transfer(&transfer_ref);

        let token_signer = object::generate_signer(&token_constructor_ref);
        let token_address = object::address_from_constructor_ref(&token_constructor_ref);

        let uri = create_token_uri(&token_address);
        token::set_uri(&mutator_ref, uri);

        move_to(
            &token_signer,
            RwaTokenConfig {
                transfer_ref: transfer_ref,
                burn_ref: burn_ref,
                mutator_ref: mutator_ref,
                deferred_receiver: option::none()
            }
        );

        token_constructor_ref
    }

    public entry fun set_deferred_receiver(
        signer: &signer, token: Object<RwaTokenConfig>, deferred_receiver: address
    ) acquires RwaTokenConfig {
        assert!(object::owner(token) == signer::address_of(signer), ENOT_OWNER_OF_TOKEN);

        let token_address = object::object_address(&token);
        let token_config = borrow_global_mut<RwaTokenConfig>(token_address);
        token_config.deferred_receiver = option::some(deferred_receiver);
    }

    public fun burn_token(
        collection_signer: &signer, token: Object<Token>
    ) acquires RwaTokenConfig {
        let collection = token::collection_object(token);
        ensure_owner::require_signer_owner(collection_signer, collection);

        let RwaTokenConfig {
            transfer_ref: _,
            burn_ref,
            mutator_ref: _,
            deferred_receiver: _
        } = move_from<RwaTokenConfig>(object::object_address(&token));

        token::burn(burn_ref);
    }

    entry public fun transfer(
        signer: &signer, token: Object<Token>, recipient: address
    ) acquires RwaCollectionConfig, RwaTokenConfig {
        assert!(object::owner(token) == signer::address_of(signer), ENOT_OWNER_OF_TOKEN);
        revoke_deferred_receiver(&token);

        let collection = token::collection_object(token);
        let collection_config =
            borrow_global<RwaCollectionConfig>(object::object_address(&collection));
        assert!(
            whitelist::is_whitelisted(
                collection_config.whitelist, signer::address_of(signer)
            ) && whitelist::is_whitelisted(collection_config.whitelist, recipient),
            EACCOUNT_NOT_WHITELISTED
        );

        let token_address = object::object_address(&token);
        let token_config = borrow_global<RwaTokenConfig>(token_address);
        let linear_transfer_ref =
            object::generate_linear_transfer_ref(&token_config.transfer_ref);

        object::transfer_with_ref(linear_transfer_ref, recipient);

        event::emit(
            RwaTokenTransferred {
                loan_book_address: collection_config.loan_book_address,
                token_address: token_address,
                from: signer::address_of(signer),
                to: recipient
            }
        );
    }

    fun revoke_deferred_receiver(token_config: &Object<Token>) acquires RwaTokenConfig {
        let token_address = object::object_address(token_config);
        let token_config = borrow_global_mut<RwaTokenConfig>(token_address);
        token_config.deferred_receiver = option::none();
    }

    inline fun borrow_token_config<T: key>(
        token_config: &Object<T>
    ): &RwaTokenConfig acquires RwaTokenConfig {
        let addr = object::object_address(token_config);
        borrow_global<RwaTokenConfig>(addr)
    }

    #[test_only]
    use aptos_framework::fungible_asset::{Metadata, MintRef};

    #[test_only]
    use lucid::utils;

    #[test_only]
    const COLLECTION_NAME: vector<u8> = b"Test Collection";

    #[test_only]
    struct TestState has drop {
        creator: address,
        collection: Object<Collection>,
        token: Object<RwaTokenConfig>,
        fa_metadata: Object<Metadata>,
        fa_mint_ref: MintRef,
        fa_constructor_ref: ConstructorRef,
        facility: Object<facility_core::FacilityBaseDetails>
    }

    #[test_only]
    fun setup_test(creator: &signer): TestState acquires RwaCollectionConfig {
        let creator_addr = signer::address_of(creator);
        let whitelist = utils::whitelist_with_signer(creator, COLLECTION_NAME);

        let collection_name = string::utf8(COLLECTION_NAME);
        let constructor_ref = create_collection(
            creator, collection_name, whitelist, false
        );

        let collection =
            object::object_from_constructor_ref<Collection>(&constructor_ref);

        // Create a token in the collection
        let token_constructor_ref = create_token(creator, collection);
        let token_obj =
            object::object_from_constructor_ref<RwaTokenConfig>(&token_constructor_ref);

        let (fa_constructor_ref, fa_metadata, fa_mint_ref) =
            utils::create_test_token(creator, option::none());

        let facility =
            facility_core::create_facility(
                creator_addr,
                whitelist,
                whitelist,
                fa_metadata,
                creator_addr
            );

        TestState {
            creator: creator_addr,
            collection: collection,
            token: token_obj,
            fa_metadata: fa_metadata,
            fa_mint_ref: fa_mint_ref,
            fa_constructor_ref: fa_constructor_ref,
            facility: object::object_from_constructor_ref<facility_core::FacilityBaseDetails>(
                &facility
            )
        }
    }

    #[test(creator = @lucid, user = @0x456, receiver = @0x789)]
    fun test_set_deferred_receiver(
        creator: &signer, user: &signer, receiver: &signer
    ) acquires RwaCollectionConfig, RwaTokenConfig {
        let test_state = setup_test(creator);
        let creator_addr = test_state.creator;
        let user_addr = signer::address_of(user);
        let receiver_addr = signer::address_of(receiver);
        let config =
            borrow_global<RwaTokenConfig>(object::object_address(&test_state.token));
        assert!(option::is_none(&config.deferred_receiver), 0);

        let token_addr = object::object_address(&test_state.token);
        let token_for_transfer = object::address_to_object<Token>(token_addr);
        object::transfer(creator, token_for_transfer, user_addr);

        set_deferred_receiver(user, test_state.token, receiver_addr);

        let config =
            borrow_global<RwaTokenConfig>(object::object_address(&test_state.token));
        assert!(option::contains(&config.deferred_receiver, &receiver_addr), 1);
    }

    #[test(creator = @lucid, user = @0x456, receiver = @0x789)]
    fun test_receive_cashflow_with_deferred_receiver(
        creator: &signer, user: &signer, receiver: &signer
    ) acquires RwaCollectionConfig, RwaTokenConfig {
        let test_state = setup_test(creator);
        let user_addr = signer::address_of(user);
        let receiver_addr = signer::address_of(receiver);

        let token_addr = object::object_address(&test_state.token);
        let token_for_transfer = object::address_to_object<Token>(token_addr);
        object::transfer(creator, token_for_transfer, user_addr);
        set_deferred_receiver(user, test_state.token, receiver_addr);

        let receiver_initial_balance =
            primary_fungible_store::balance(receiver_addr, test_state.fa_metadata);

        let principal_amount = 100;
        let interest_amount = 10;
        let fee_amount = 5;

        let principal = fungible_asset::mint(&test_state.fa_mint_ref, principal_amount);
        let interest = fungible_asset::mint(&test_state.fa_mint_ref, interest_amount);
        let fee = fungible_asset::mint(&test_state.fa_mint_ref, fee_amount);

        let total_expected = principal_amount + interest_amount + fee_amount;
        receive_cashflow(test_state.token, principal, interest, fee);

        let receiver_final_balance =
            primary_fungible_store::balance(receiver_addr, test_state.fa_metadata);
        assert!(
            receiver_final_balance == receiver_initial_balance + total_expected,
            0
        );

        let user_balance =
            primary_fungible_store::balance(user_addr, test_state.fa_metadata);
        assert!(user_balance == 0, 1);
    }

    #[test(creator = @lucid, user = @0x456, receiver = @0x789)]
    fun test_receive_cashflow_with_facility(
        creator: &signer, user: &signer, receiver: &signer
    ) acquires RwaCollectionConfig, RwaTokenConfig {
        let test_state = setup_test(creator);
        let user_addr = signer::address_of(user);
        let receiver_addr = signer::address_of(receiver);

        let token_addr = object::object_address(&test_state.token);
        let token_for_transfer = object::address_to_object<Token>(token_addr);
        object::transfer(creator, token_for_transfer, user_addr);
        set_deferred_receiver(
            user, test_state.token, object::object_address(&test_state.facility)
        );

        let receiver_initial_balance =
            primary_fungible_store::balance(receiver_addr, test_state.fa_metadata);

        let principal_amount = 100;
        let interest_amount = 10;
        let fee_amount = 5;

        let principal = fungible_asset::mint(&test_state.fa_mint_ref, principal_amount);
        let interest = fungible_asset::mint(&test_state.fa_mint_ref, interest_amount);
        let fee = fungible_asset::mint(&test_state.fa_mint_ref, fee_amount);
        receive_cashflow(test_state.token, principal, interest, fee);

        let principal_balance =
            facility_core::get_principal_collection_account_balance(test_state.facility);
        let interest_balance =
            facility_core::get_interest_collection_account_balance(test_state.facility);

        assert!(principal_balance == principal_amount, principal_balance);
        assert!(
            interest_balance == interest_amount + fee_amount,
            interest_balance
        );

        let user_balance =
            primary_fungible_store::balance(user_addr, test_state.fa_metadata);
        assert!(user_balance == 0, 1);
    }
}
