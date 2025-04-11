module lucid::ensure_owner {
    use std::signer;
    use std::error;
    use aptos_framework::object::{Self, Object, ObjectCore};

    const ENOT_OWNER: u64 = 1;
    const EOBJECT_DOES_NOT_EXIST: u64 = 2;
    const EMAXIMUM_NESTING: u64 = 3;

    const MAXIMUM_OBJECT_NESTING: u64 = 8;

    public fun is_signer_owner<T: key>(signer: &signer, object: Object<T>): bool {
        object::owner<T>(object) == signer::address_of(signer)
    }

    public fun require_signer_owner<T: key>(
        signer: &signer, object: Object<T>
    ) {
        assert!(
            is_signer_owner<T>(signer, object),
            error::permission_denied(ENOT_OWNER)
        );
    }

    #[view]
    public fun is_owner<T: key>(signer: address, object: Object<T>): bool {
        object::owner<T>(object) == signer
    }

    public fun require_owner<T: key>(signer: address, object: Object<T>) {
        assert!(
            is_owner<T>(signer, object),
            error::permission_denied(ENOT_OWNER)
        );
    }

    public fun verify_descendant(owner: address, destination: address) {
        assert!(
            object::is_object(destination),
            error::not_found(EOBJECT_DOES_NOT_EXIST)
        );

        let current_address = destination;
        let count = 0;
        while (owner != current_address) {
            count = count + 1;
            assert!(
                count < MAXIMUM_OBJECT_NESTING, error::out_of_range(EMAXIMUM_NESTING)
            );
            assert!(
                object::is_object(current_address),
                error::permission_denied(ENOT_OWNER)
            );
            let object = object::address_to_object<ObjectCore>(current_address);
            current_address = object::owner<ObjectCore>(object);
        };
    }

    #[view]
    public fun is_descendant(
        owner: address, destination: address, depth: u8
    ): bool {
        assert!(
            object::is_object(destination),
            error::not_found(EOBJECT_DOES_NOT_EXIST)
        );

        let current_address = destination;
        let count = 0;
        while (owner != current_address && count < depth) {
            count = count + 1;
            let object = object::address_to_object<ObjectCore>(current_address);
            current_address = object::owner<ObjectCore>(object);
        };

        owner == current_address
    }
}
