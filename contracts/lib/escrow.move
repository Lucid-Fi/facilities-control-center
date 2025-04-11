module lucid::escrow {
    use std::signer;
    use aptos_std::object::{Self, Object, ConstructorRef, ExtendRef};
    use aptos_framework::fungible_asset::{FungibleAsset};

    use aptos_framework::primary_fungible_store;

    const ENOT_OWNER: u64 = 1;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Escrow has key, drop {
        extend_ref: ExtendRef
    }

    public fun create_unnamed_escrow(owner_address: address): ConstructorRef {
        let constructor_ref = object::create_object(owner_address);
        let escrow_signer = object::generate_signer(&constructor_ref);
        let extend_ref = object::generate_extend_ref(&constructor_ref);

        move_to(&escrow_signer, Escrow { extend_ref });

        constructor_ref
    }

    public fun create_unnamed_escrow_account(owner_address: address): Object<Escrow> {
        let constructor_ref = create_unnamed_escrow(owner_address);
        object::object_from_constructor_ref<Escrow>(&constructor_ref)
    }

    public fun get_signer(signer: &signer, escrow: &Object<Escrow>): signer acquires Escrow {
        ensure_owner(signer, escrow);
        escrow_signer(escrow)
    }

    public fun withdraw_from<T: key>(
        signer: &signer,
        escrow: &Object<Escrow>,
        metadata: Object<T>,
        amount: u64
    ): FungibleAsset acquires Escrow {
        ensure_owner(signer, escrow);
        let escrow_signer = escrow_signer(escrow);
        let fa = primary_fungible_store::withdraw(&escrow_signer, metadata, amount);
        fa
    }

    public fun deposit(escrow: &Object<Escrow>, fa: FungibleAsset) {
        primary_fungible_store::deposit(object::object_address(escrow), fa);
    }

    fun ensure_owner(signer: &signer, escrow: &Object<Escrow>) {
        assert!(object::is_owner(*escrow, signer::address_of(signer)), ENOT_OWNER);
    }

    inline fun escrow_signer(escrow: &Object<Escrow>): signer {
        let escrow = borrow_global<Escrow>(object::object_address(escrow));
        object::generate_signer_for_extending(&escrow.extend_ref)
    }

    #[test_only]
    use lucid::utils;
    #[test_only]
    use std::option;
    #[test_only]
    use aptos_framework::fungible_asset;

    #[test(owner = @lucid)]
    fun test_can_create_escrow(owner: signer) {
        let escrow = create_unnamed_escrow(signer::address_of(&owner));
        let escrow_object = object::object_from_constructor_ref<Escrow>(&escrow);
        assert!(
            exists<Escrow>(object::object_address(&escrow_object))
        );
    }

    #[test(owner = @lucid)]
    fun test_can_get_signer(owner: signer) acquires Escrow {
        let escrow = create_unnamed_escrow(signer::address_of(&owner));
        let escrow_object = object::object_from_constructor_ref<Escrow>(&escrow);
        let signer = get_signer(&owner, &escrow_object);
        assert!(signer::address_of(&signer) == object::object_address(&escrow_object));
    }

    #[test(owner = @lucid)]
    fun test_can_withdraw_from_escrow(owner: signer) acquires Escrow {
        let escrow = create_unnamed_escrow(signer::address_of(&owner));
        let escrow_object = object::object_from_constructor_ref<Escrow>(&escrow);
        let (_, metadata, mint_ref) = utils::create_test_token(&owner, option::none());
        let amount = 100;
        let fa = fungible_asset::mint(&mint_ref, amount);
        primary_fungible_store::deposit(object::object_address(&escrow_object), fa);
        let fa = withdraw_from(&owner, &escrow_object, metadata, amount);
        let fa_amount = fungible_asset::amount(&fa);
        assert!(fa_amount == amount);

        utils::dispose_fa(fa);
    }
}
