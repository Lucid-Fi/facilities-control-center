module lucid::token_exchanger {
    use std::signer;
    use aptos_framework::fungible_asset;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::object;

    use lucid::facility_core;
    use lucid::whitelist;

    const ENOT_AUTHORIZED: u64 = 0;

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct SingleTokenExchanger has key, drop {
        exchangers: object::Object<whitelist::BasicWhitelist>,
        source_metadata: object::Object<fungible_asset::Metadata>,
        target_metadata: object::Object<fungible_asset::Metadata>,
        extend_ref: object::ExtendRef
    }

    #[view]
    public fun can_exchange(exchanger: object::Object<SingleTokenExchanger>, account: address): bool acquires SingleTokenExchanger {
        let exchanger_address = object::object_address(&exchanger);
        let exchanger = borrow_global<SingleTokenExchanger>(exchanger_address);

        lucid::whitelist::is_whitelisted(
            exchanger.exchangers,
            account
        )
    }

    #[view]
    public fun source_metadata(exchanger: object::Object<SingleTokenExchanger>): object::Object<fungible_asset::Metadata> acquires SingleTokenExchanger {
        let exchanger_address = object::object_address(&exchanger);
        let exchanger = borrow_global<SingleTokenExchanger>(exchanger_address);

        exchanger.source_metadata
    }

    #[view]
    public fun target_metadata(exchanger: object::Object<SingleTokenExchanger>): object::Object<fungible_asset::Metadata> acquires SingleTokenExchanger {
        let exchanger_address = object::object_address(&exchanger);
        let exchanger = borrow_global<SingleTokenExchanger>(exchanger_address);

        exchanger.target_metadata
    }

    public fun enrich_with_single_token_exchanger(
        constructor_ref: &object::ConstructorRef,
        source_metadata: object::Object<fungible_asset::Metadata>,
        target_metadata: object::Object<fungible_asset::Metadata>,
        exchangers: object::Object<whitelist::BasicWhitelist>
    ) {
        let signer = object::generate_signer(constructor_ref);
        let extend_ref = object::generate_extend_ref(constructor_ref);

        move_to(&signer, SingleTokenExchanger {
            exchangers,
            source_metadata,
            target_metadata,
            extend_ref
        });
    }

    public entry fun exchange(
        signer: &signer,
        exchanger: object::Object<SingleTokenExchanger>,
        amount_source: u64,
        amount_target: u64,
        is_principal: bool
    ) acquires SingleTokenExchanger {
        assert!(can_exchange(exchanger, signer::address_of(signer)), ENOT_AUTHORIZED);
        let exchanger_address = object::object_address(&exchanger);
        let facility_base_details = object::address_to_object<facility_core::FacilityBaseDetails>(exchanger_address);
        let exchanger = borrow_global<SingleTokenExchanger>(exchanger_address);
        let exchanger_signer = object::generate_signer_for_extending(&exchanger.extend_ref);
        let target_fa = primary_fungible_store::withdraw(signer, exchanger.target_metadata, amount_target);

        let source_fa = if (is_principal) {
            let base = facility_core::collect_fa_from_principal_collection_account(
                &exchanger_signer,
                exchanger.source_metadata
            );
            
            facility_core::deposit_into_principal_collection_account(facility_base_details, target_fa);
            facility_core::deposit_into_principal_collection_account(facility_base_details, fungible_asset::extract(&mut base, amount_source));
            base
        } else {
            let base = facility_core::collect_fa_from_interest_collection_account(
                &exchanger_signer,
                exchanger.source_metadata
            );

            facility_core::deposit_into_interest_collection_account(facility_base_details, target_fa);
            facility_core::deposit_into_interest_collection_account(facility_base_details, fungible_asset::extract(&mut base, amount_source));
            base
        };

        primary_fungible_store::deposit(signer::address_of(signer), source_fa);
    }
    
}