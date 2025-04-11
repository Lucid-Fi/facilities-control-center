module lucid::whitelist {
    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use aptos_std::smart_table::{Self, SmartTable};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::event;

    use lucid::ensure_owner;

    const EONLY_ADMIN_CAN_MODIFY: u64 = 1;
    const EACCOUNT_NOT_WHITELISTED: u64 = 2;

    #[event]
    struct WhitelistCreated has store, drop {
        creator_address: address,
        name: String,
        whitelist: Object<BasicWhitelist>
    }

    #[event]
    struct WhitelistStatusUpdated has store, drop {
        whitelist: Object<BasicWhitelist>,
        member: address,
        status: bool
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct BasicWhitelist has key, store {
        name: String,
        whitelist: SmartTable<address, bool>
    }

    public fun create(signer: &signer, name: String): Object<BasicWhitelist> {
        let signer_address = signer::address_of(signer);
        let constructor_ref = object::create_sticky_object(signer_address);
        let object_signer = object::generate_signer(&constructor_ref);
        let object_address = signer::address_of(&object_signer);

        move_to(
            &object_signer,
            BasicWhitelist {
                name: name,
                whitelist: smart_table::new<address, bool>()
            }
        );

        let whitelist = object::address_to_object<BasicWhitelist>(object_address);

        event::emit(
            WhitelistCreated {
                creator_address: signer_address,
                name: name,
                whitelist: object::address_to_object<BasicWhitelist>(object_address)
            }
        );

        whitelist
    }

    public fun create_unnamed(signer: &signer): Object<BasicWhitelist> {
        create(signer, string::utf8(b""))
    }

    public entry fun create_whitelist(signer: &signer, name: String) {
        create(signer, name);
    }

    public entry fun toggle(
        signer: &signer,
        whitelist_obj: Object<BasicWhitelist>,
        new_address: address,
        status: bool
    ) acquires BasicWhitelist {
        ensure_owner::verify_descendant(
            signer::address_of(signer), object::object_address(&whitelist_obj)
        );
        let whitelist =
            borrow_global_mut<BasicWhitelist>(object::object_address(&whitelist_obj));

        smart_table::upsert(&mut whitelist.whitelist, new_address, status);
    }

    #[lint::skip(needless_mutable_reference)]
    public entry fun bulk_toggle(
        signer: &signer,
        whitelist_obj: Object<BasicWhitelist>,
        new_addresses: vector<address>,
        status: bool
    ) acquires BasicWhitelist {
        ensure_owner::verify_descendant(
            signer::address_of(signer), object::object_address(&whitelist_obj)
        );
        let _whitelist =
            borrow_global<BasicWhitelist>(object::object_address(&whitelist_obj));

        let i = 0;
        while (i < vector::length(&new_addresses)) {
            let addr = *vector::borrow(&new_addresses, i);
            toggle(signer, whitelist_obj, addr, status);
            i = i + 1;
        };
    }

    public fun revert_if_unauthorized(
        whitelist_obj: Object<BasicWhitelist>, address: address
    ) acquires BasicWhitelist {
        let whitelist =
            borrow_global<BasicWhitelist>(object::object_address(&whitelist_obj));
        let is_whitelisted =
            smart_table::contains(&whitelist.whitelist, address)
                && *smart_table::borrow<address, bool>(&whitelist.whitelist, address);
        assert!(is_whitelisted, EACCOUNT_NOT_WHITELISTED);
    }

    #[view]
    public fun is_member(
        whitelist_obj: Object<BasicWhitelist>, address: address
    ): bool acquires BasicWhitelist {
        is_whitelisted(whitelist_obj, address)
    }

    #[view]
    public fun is_whitelisted(
        whitelist_obj: Object<BasicWhitelist>, address: address
    ): bool acquires BasicWhitelist {
        let whitelist =
            borrow_global<BasicWhitelist>(object::object_address(&whitelist_obj));

        smart_table::contains(&whitelist.whitelist, address)
            && *smart_table::borrow<address, bool>(&whitelist.whitelist, address)
    }

    #[view]
    public fun get_name(whitelist_obj: Object<BasicWhitelist>): String acquires BasicWhitelist {
        let whitelist =
            borrow_global<BasicWhitelist>(object::object_address(&whitelist_obj));

        whitelist.name
    }

    #[test_only]
    public fun create_test_whitelist(creator: &signer): Object<BasicWhitelist> {
        create(creator, string::utf8(b"test whitelist"))
    }

    #[test(signer = @test_admin, borrower = @test_borrower)]
    fun test_whitelist_rejects_non_member(
        signer: signer, borrower: signer
    ) acquires BasicWhitelist {
        let whitelist = create(&signer, string::utf8(b"test whitelist"));

        assert!(!is_whitelisted(whitelist, signer::address_of(&borrower)), 1);
    }

    #[test(signer = @test_admin, borrower = @test_borrower)]
    fun test_whitelist_accepts_member(signer: signer, borrower: signer) acquires BasicWhitelist {
        let whitelist = create(&signer, string::utf8(b"test whitelist"));
        let borrower_address = signer::address_of(&borrower);

        toggle(&signer, whitelist, borrower_address, true);

        assert!(is_whitelisted(whitelist, signer::address_of(&borrower)), 1);
    }

    #[test(signer = @test_admin, borrower = @test_borrower)]
    #[expected_failure(abort_code = 327681, location = lucid::ensure_owner)]
    fun test_only_owner_can_control_whitelist(
        signer: signer, borrower: signer
    ) acquires BasicWhitelist {
        let whitelist = create(&signer, string::utf8(b"test whitelist"));
        let borrower_address = signer::address_of(&borrower);

        toggle(&borrower, whitelist, borrower_address, true);
    }
}
