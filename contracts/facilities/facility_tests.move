module lucid::facility_tests {
    use std::vector;
    use std::signer;
    use lucid::borrowing_base_engine::{Self, BorrowingBaseTree};
    use lucid::facility_core;
    use lucid::shares_manager::{Self, SharesManager};

    use aptos_framework::object::{Self, Object};


    const EFAILED_TEST: u64 = 0;
    const EBORROWING_BASE_BREACHED: u64 = 1;
    const EBORROWING_BASE_TREE_MISSING: u64 = 2;
    const ENOT_ADMIN: u64 = 3;
    const ENO_TEST_BASKET: u64 = 4;


    const ENSURE_SATISFIED: u64 = 0x1;

    enum Test has store, drop, copy {
        BorrowingBaseSatisfied
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct TestBasket has key {
        tests: vector<Test>
    }

    #[view]
    public fun vehicle_tests_satisfied(vehicle_address: address): bool acquires TestBasket {
        vehicle_tests_satisfied_with_flags(vehicle_address, 0)
    }

    #[view]
    public fun test_basket_exists(addr: address): bool {
        exists<TestBasket>(addr)
    }

    public fun enrich_with_basket(constructor_ref: &object::ConstructorRef, tests: vector<Test>) {
        let object_signer = object::generate_signer(constructor_ref);
        move_to(&object_signer, TestBasket {
            tests: tests
        });
    }

    public fun empty_tests(): vector<Test> {
        vector::empty()
    }

    public fun borrowing_base_satisfied_test(): Test {
        Test::BorrowingBaseSatisfied
    }

    public fun vehicle_tests_satisfied_with_flags(
        vehicle_address: address,
        run_flags: u64
    ): bool acquires TestBasket {
        let tests = get_tests(vehicle_address);
        vehicle_satisfies(vehicle_address, tests, run_flags)
    }

    public fun vehicle_satisfies(
        vehicle_address: address,
        tests: &vector<Test>,
        run_flags: u64
    ): bool {
        let i = 0;
        let num_tests = vector::length(tests);
        while (i < num_tests) {
            if (!evaluate_test(vector::borrow(tests, i), vehicle_address, run_flags)) {
                return false;
            };

            i = i + 1;
        };

        true
    }

    public fun add_test_to_basket(signer: &signer, basket: object::Object<TestBasket>, test: Test) acquires TestBasket {
        assert!(
            facility_core::is_admin(object::convert(basket), signer::address_of(signer)),
            ENOT_ADMIN
        );
        
        let basket_address = object::object_address(&basket);
        let basket = borrow_global_mut<TestBasket>(basket_address);
        vector::push_back(&mut basket.tests, test);
    }

    public fun add_test(tests: &mut vector<Test>, test: Test) {
        vector::push_back(tests, test);
    }

    fun evaluate_test(
        test: &Test,
        vehicle_address: address,
        run_flags: u64
    ): bool {
        match (test) {
            Test::BorrowingBaseSatisfied => {
                borrowing_base_satisfied(vehicle_address, run_flags & ENSURE_SATISFIED != 0)
            }
        }
    }

    fun borrowing_base_satisfied(
        vehicle_address: address, ensure_satisfied: bool
    ): bool {
        let manager = share_manager(vehicle_address);

        let bb_tree = borrowing_base_tree(vehicle_address);
        let allowed_principal = borrowing_base_engine::evaluate(bb_tree);
        let outstanding_principal = shares_manager::get_outstanding_principal(manager);

        let satisfied = outstanding_principal <= allowed_principal;
        assert!(!ensure_satisfied || satisfied, EBORROWING_BASE_BREACHED);

        satisfied
    }
    
    inline fun get_tests(vehicle_address: address): &vector<Test> {
        let basket = borrow_global<TestBasket>(vehicle_address);
        &basket.tests
    }
    
    inline fun share_manager(facility_address: address): Object<SharesManager> {
        object::address_to_object<shares_manager::SharesManager>(facility_address)
    }

    inline fun borrowing_base_tree(facility_address: address): Object<BorrowingBaseTree> {
        assert!(
            borrowing_base_engine::tree_exists(facility_address),
            EBORROWING_BASE_TREE_MISSING
        );

        object::address_to_object<BorrowingBaseTree>(facility_address)
    }

    public inline fun ensure_satisfied(): u64 {
        ENSURE_SATISFIED
    }
}