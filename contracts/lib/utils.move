module lucid::utils {
    use std::vector;
    use std::string;
    use std::signer;
    use std::option::{Option};

    use aptos_framework::fungible_asset;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::object::{Self, Object, ConstructorRef};
    use aptos_framework::account;
    use aptos_framework::guid;

    use lucid::whitelist;

    const E_VECTOR_EMPTY: u64 = 1;

    const SECONDS_PER_DAY: u64 = 86400;
    const MICROSECONDS_PER_DAY: u64 = SECONDS_PER_DAY * 1000000;

    public fun vectors_equal<T>(a: &vector<T>, b: &vector<T>): bool {
        if (vector::length(a) != vector::length(b)) { false }
        else {
            let i = 0;
            while (i < vector::length(a)) {
                if (vector::borrow(a, i) != vector::borrow(b, i)) {
                    return false;
                };
                i = i + 1;
            };

            true
        }
    }

    public inline fun vector_reduce<Element>(
        vec: &vector<Element>, f: |Element, Element| Element
    ): Element {
        assert!(vector::length(vec) > 0, E_VECTOR_EMPTY);
        let accu = *vector::borrow(vec, 0);

        let i = 1;
        while (i < vector::length(vec)) {
            accu = f(accu, *vector::borrow(vec, i));
            i = i + 1;
        };

        accu
    }

    public inline fun vector_fold_ref<Element, Accumulator>(
        vec: &vector<Element>,
        f: |&Element, Accumulator| Accumulator,
        accu: Accumulator
    ): Accumulator {
        let i = 0;
        while (i < vector::length(vec)) {
            accu = f(vector::borrow(vec, i), accu);
            i = i + 1;
        };
        accu
    }

    public fun whitelist_with_signer(
        signer: &signer, name: vector<u8>
    ): Object<whitelist::BasicWhitelist> {
        let whitelist = whitelist::create(signer, string::utf8(name));
        whitelist::toggle(
            signer,
            whitelist,
            signer::address_of(signer),
            true
        );
        whitelist
    }

    public fun create_guid(signer: &signer): guid::GUID {
        let signer_address = signer::address_of(signer);
        if (object::is_object(signer_address)) {
            object::create_guid(signer)
        } else {
            account::create_account_if_does_not_exist(signer_address);
            account::create_guid(signer)
        }
    }

    public fun init_test_metadata_with_primary_store_enabled(
        constructor_ref: &ConstructorRef, max_supply: Option<u128>
    ): fungible_asset::MintRef {
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            max_supply,
            string::utf8(b"TEST COIN"),
            string::utf8(b"@T"),
            0,
            string::utf8(b"http://example.com/icon"),
            string::utf8(b"http://example.com")
        );
        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);

        mint_ref
    }

    public inline fun truncate_mics_to_days(timestamp_us: u64): u64 {
        (timestamp_us / MICROSECONDS_PER_DAY) * MICROSECONDS_PER_DAY
    }

    public inline fun timestamp_mics_to_days(timestamp_us: u64): u64 {
        timestamp_us / MICROSECONDS_PER_DAY
    }

    public inline fun days_between_mics(start_us: u64, end_us: u64): u64 {
        (end_us - start_us) / MICROSECONDS_PER_DAY
    }

    public inline fun days_to_mics(days: u64): u64 {
        days * MICROSECONDS_PER_DAY
    }

    public inline fun u64_max(): u64 {
        0xFFFFFFFFFFFFFFFF
    }

    #[test_only]
    use aptos_framework::timestamp;
    #[test_only]
    use aptos_framework::fungible_asset::{MintRef, Metadata, FungibleAsset};

    #[test_only]
    public fun fastforward(forward_us: u64) {
        let current_time = timestamp::now_microseconds();
        let new_time = current_time + forward_us;
        timestamp::update_global_time_for_test(new_time);
    }

    #[test_only]
    public fun create_test_token(
        admin: &signer, max_supply: Option<u128>
    ): (ConstructorRef, Object<Metadata>, MintRef) {
        let (constructor_ref, test_token) = fungible_asset::create_test_token(admin);

        let mint_ref =
            init_test_metadata_with_primary_store_enabled(&constructor_ref, max_supply);
        let fa_metadata =
            object::address_to_object<Metadata>(object::object_address(&test_token));

        (constructor_ref, fa_metadata, mint_ref)
    }

    #[test_only]
    public fun dispose_fa(fa: FungibleAsset) {
        primary_fungible_store::deposit(@disposal, fa);
    }

    #[test_only]
    public fun initialize_timestamp() {
        let aptos_framework_signer = account::create_account_for_test(@aptos_framework);
        timestamp::set_time_has_started_for_testing(&aptos_framework_signer);
    }
}
