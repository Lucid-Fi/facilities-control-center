module lucid::loan_book {
    use std::signer;
    use std::vector;
    use std::string::{Self, String};
    use std::option::{Self, Option};

    use aptos_std::math64::{Self, min};

    use aptos_framework::object::{Self, Object, ConstructorRef, ExtendRef};
    use aptos_framework::event;
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleAsset};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;

    use aptos_token_objects::collection::{Collection};
    use aptos_token_objects::token::{Token};

    use lucid::whitelist::{Self, BasicWhitelist};
    use lucid::fee_manager::{Self, FeeCollection};
    use lucid::nft_manager;
    use lucid::concurrent_upgrade;
    use lucid::payment_schedule_bitmap::{
        Self,
        get_principal_const,
        get_interest_const,
        get_fee_const,
        get_payment_type
    };

    #[test_only]
    use aptos_framework::fungible_asset::{MintRef};

    #[test_only]
    use aptos_framework::account;

    const STATUS_OFFERED: u8 = 0;
    const STATUS_STARTED: u8 = 1;

    const INTERVAL_PAID: u8 = 1;
    const INTERVAL_ACTIVE: u8 = 2;

    const EREAPYMENT_TOO_HIGH: u64 = 1;
    const ELOAN_NOT_REPAID: u64 = 2;
    const EINVALID_FUNDING_AMOUNT: u64 = 3;
    const ECANNOT_OFFER_LOAN: u64 = 4;
    const ENOT_BORROWER: u64 = 5;
    const EINVALID_LOAN_STARTER_REF: u64 = 6;
    const ENOT_ADMIN: u64 = 7;
    const EINVALID_HISTORICAL_LOAN_BOOK_REF: u64 = 8;
    const EINTERVAL_VECTORS_NOT_EQUAL: u64 = 9;
    const EINTERVAL_VECTORS_NOT_GREATER_THAN_ZERO: u64 = 10;
    const ENEW_INTERVAL_VECTOR_DO_NOT_ADD_TO_OLD_PRINCIPAL: u64 = 11;
    const EINTERVAL_TIMES_NOT_STRICTLY_INCREASING: u64 = 12;
    const ENOT_OWNER: u64 = 13;
    const ELOAN_NOT_FUNDED: u64 = 14;
    const EINCORRECT_FA: u64 = 15;
    const ENOT_FOUND: u64 = 16;
    const E_CANNOT_RECONCILE_SCHEDULE: u64 = 17;
    const E_CONTRIBUTION_TRACKER_NOT_FOUND: u64 = 18;
    const ENO_LATE_FEE_TRACKER: u64 = 19;
    const ENOT_LOAN: u64 = 20;

    struct LoanStarterRef has drop, store {
        self: address
    }

    struct MutationRef has drop, store {
        self: address
    }

    struct OriginationRef has drop, store {
        self: address
    }

    struct PendingLoanMutationRef has drop, store {
        self: address
    }

    struct StartPendingLoanRef has drop, store {
        self: address
    }

    struct HistoricalLoanBookRef has drop, store {
        self: address
    }

    struct UpdatePaymentScheduleRef has drop, store {
        self: address
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    enum PaymentScheduleUpdateStrategy has key, store, drop, copy {
        FullScheduleReplacement,
        AppendKeepCurrent,
        AppendReplaceCurrent
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct LoanBook has key, store {
        owner: address,
        collection: Object<Collection>,
        originator: address,
        alternate_originators: Object<BasicWhitelist>,
        repayment_fees: Object<FeeCollection>,
        origination_fees: Object<FeeCollection>,
        extend_ref: ExtendRef
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct BurnableLoans has key {}

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct PaymentScheduleUpdateValidationSettings has key, drop, copy {
        validate_principal_continuity: bool,
        validate_due_date_continuity: bool
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    enum LateFeeRules has key, drop, copy, store {
        DelinquentLinearAccrual{ 
            grace_period_micros: u64,
            accrual_period_micros: u64,
            accrual_per_period_numerator: u64,
            accrual_per_period_denominator: u64,
            max_periods: u64
        }
    }
    
    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    enum LateFeeTracker has key, drop, copy, store {
        DelinquentLinearAccrual{ last_accrual_time_us: u64, accrued_late_fees: u64 }
    }

    struct Interval has store, drop, copy {
        time_due_us: u64,
        principal: u64,
        interest: u64,
        fee: u64
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct PendingLoan has key, store, drop {
        loan_book: Object<LoanBook>,
        borrower: address,
        lender: Option<address>,
        alternate_receiver: Option<address>,
        fa_metadata: Object<Metadata>,
        starting_principal: u64,
        start_time_us: Option<u64>,
        extend_ref: ExtendRef,
        payment_schedule: vector<Interval>,
        payment_order_bitmap: u8
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Loan has key, store {
        loan_book: Object<LoanBook>,
        fa_metadata: Object<Metadata>,
        borrower: address,
        starting_principal: u64,
        start_time_us: u64,
        payment_count: u64,
        payment_schedule: vector<Interval>,
        payment_order_bitmap: u8
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct LoanContributionTracker has key, drop {
        total_paid: u64,
        fees_paid: u64,
        principal_paid: u64,
        interest_paid: u64
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    enum LateFeeReceiver has key, drop, copy, store {
        Originator,
        Owner,
        Other{ address: address }
    }

    #[event]
    struct LoanBookCreated has drop, store {
        loan_book_address: address,
        collection_address: address,
        originator: address,
        owner: address,
        alternate_originators: Object<BasicWhitelist>,
        repayment_fees: Object<FeeCollection>,
        origination_fees: Object<FeeCollection>
    }

    #[event]
    struct PendingLoanCreated has store, drop {
        loan_address: address,
        seed: vector<u8>,
        loan_book: Object<LoanBook>,
        borrower: address,
        fa_metadata: Object<Metadata>,
        principal: u64,
        offerer: address,
        originator: address,
        payment_schedule: vector<Interval>,
        payment_order_bitmap: u8
    }

    #[event]
    struct AlternateLoanRecieverDeclared has store, drop {
        pending_loan: Object<PendingLoan>,
        alternate_receiver: address
    }

    #[event]
    struct PendingLoanFunded has store, drop {
        pending_loan: Object<PendingLoan>,
        funder: address,
        amount: u64,
        fa_metadata: Object<Metadata>
    }

    #[event]
    struct LoanStarted has store, drop {
        loan_address: address,
        loan_book: Object<LoanBook>,
        funder: address,
        receiver: address,
        origination_fees: u64,
        start_time_us: u64,
        maturity_time_us: u64
    }

    #[event]
    struct PaymentMade has store, drop {
        loan: Object<Loan>,
        loan_book: Object<LoanBook>,
        fa_metadata: Object<Metadata>,
        amount: u64,
        toward_interest: u64,
        toward_principal: u64,
        toward_fees: u64,
        timestamp_us: u64,
        debt_remaining: u64,
        principal_remaining: u64,
        late_us: u64,
        next_payment_us: u64,
        payment_index: u64
    }

    #[event]
    struct OriginatorWhitelistUpdated has drop, store {
        loan_book: Object<LoanBook>,
        new_whitelist: Object<BasicWhitelist>
    }

    // This event is deprecated, for indexing use the PaymentScheduleUpdatedV2 event
    #[event]
    struct PaymentScheduleUpdated has drop, store {
        loan_address: address,
        next_due_index: u16,
        old_payment_schedule: vector<Interval>,
        new_payment_schedule: vector<Interval>
    }

    #[event]
    struct PaymentScheduleUpdatedV2 has drop, store {
        timestamp_us: u64,
        loan_address: address,
        loan_book_address: address,
        next_due_index: u16,
        old_payment_schedule: vector<Interval>,
        new_payment_schedule: vector<Interval>
    }

    #[event]
    struct PaymentScheduleIndexUpdated has drop, store {
        loan_address: address,
        index: u16,
        next_due_index: u16,
        old_interval: Interval,
        new_interval: Interval
    }

    #[event]
    struct BurnableLoansEnabled has drop, store {
        loan_book: address
    }

    #[event]
    struct LateFeeRulesUpdated has drop, store {
        loan_book: address,
        rules: LateFeeRules
    }

    #[event]
    struct LateFeeAccrued has drop, store {
        loan: address,
        late_fee: u64
    }

    #[event]
    struct LateFeePaid has drop, store {
        loan_book: address,
        loan: address,
        amount: u64,
        remaining_fee: u64
    }

    public fun generate_historical_loan_book_ref(
        constructor_ref: &ConstructorRef
    ): HistoricalLoanBookRef {
        HistoricalLoanBookRef {
            self: object::address_from_constructor_ref(constructor_ref)
        }
    }

    public fun generate_loan_starter_ref(constructor_ref: &ConstructorRef): LoanStarterRef {
        LoanStarterRef { self: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun generate_mutation_ref(constructor_ref: &ConstructorRef): MutationRef {
        MutationRef { self: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun generate_origination_ref(constructor_ref: &ConstructorRef): OriginationRef {
        OriginationRef { self: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun generate_pending_loan_mutation_ref(
        constructor_ref: &ConstructorRef
    ): PendingLoanMutationRef {
        PendingLoanMutationRef {
            self: object::address_from_constructor_ref(constructor_ref)
        }
    }

    public fun generate_start_pending_loan_ref(
        constructor_ref: &ConstructorRef
    ): StartPendingLoanRef {
        StartPendingLoanRef { self: object::address_from_constructor_ref(constructor_ref) }
    }

    public fun generate_payment_schedule_update_ref(
        constructor_ref: &ConstructorRef
    ): UpdatePaymentScheduleRef {
        UpdatePaymentScheduleRef {
            self: object::address_from_constructor_ref(constructor_ref)
        }
    }

    public fun from_constructor_ref(constructor_ref: &ConstructorRef): Object<LoanBook> {
        object::object_from_constructor_ref<LoanBook>(constructor_ref)
    }

    public fun loan_from_constructor_ref(constructor_ref: &ConstructorRef): Object<Loan> {
        object::object_from_constructor_ref<Loan>(constructor_ref)
    }

    public fun enable_burnable_loans(
        signer: &signer, loan_book: Object<LoanBook>
    ) acquires LoanBook {
        assert!(is_admin(loan_book, signer::address_of(signer)), ENOT_ADMIN);
        let loan_book = borrow_global<LoanBook>(object::object_address(&loan_book));
        let loan_book_signer =
            object::generate_signer_for_extending(&loan_book.extend_ref);

        move_to(&loan_book_signer, BurnableLoans {});

        event::emit(
            BurnableLoansEnabled { loan_book: signer::address_of(&loan_book_signer) }
        );
    }

    #[view]
    public fun can_burn_loans(loan_book: Object<LoanBook>): bool {
        exists<BurnableLoans>(object::object_address(&loan_book))
    }

    #[view]
    public fun get_originator_whitelist(
        loan_book_object: Object<LoanBook>
    ): Object<BasicWhitelist> acquires LoanBook {
        let loan_book =
            borrow_global<LoanBook>(object::object_address(&loan_book_object));
        loan_book.alternate_originators
    }

    #[view]
    public fun get_credit_collection(
        loan_book_object: Object<LoanBook>
    ): Object<Collection> acquires LoanBook {
        let loan_book = borrow_loan_book(&loan_book_object);
        loan_book.collection
    }

    #[view]
    public fun can_offer_loan(
        loan_book_object: Object<LoanBook>, address: address
    ): bool acquires LoanBook {
        let loan_book =
            borrow_global<LoanBook>(object::object_address(&loan_book_object));
        let whitelist = loan_book.alternate_originators;
        object::owner(loan_book_object) == address
            || address == loan_book.originator
            || loan_book.owner == address
            || whitelist::is_whitelisted(whitelist, address)
    }

    #[view]
    public fun is_admin(
        loan_book_object: Object<LoanBook>, address: address
    ): bool acquires LoanBook {
        let loan_book =
            borrow_global<LoanBook>(object::object_address(&loan_book_object));
        object::owner(loan_book_object) == address
            || address == loan_book.originator
            || loan_book.owner == address
    }

    #[view]
    public fun get_originator(loan_book_object: Object<LoanBook>): address acquires LoanBook {
        let loan_book =
            borrow_global<LoanBook>(object::object_address(&loan_book_object));
        loan_book.originator
    }

    #[view]
    public fun get_pending_loan_receiver(
        pending_loan_object: Object<PendingLoan>
    ): address acquires PendingLoan, LoanBook {
        let pending_loan =
            borrow_global<PendingLoan>(object::object_address(&pending_loan_object));
        get_pending_loan_receiver_internal(pending_loan)
    }

    #[view]
    public fun get_fa_metadata(loan_object: Object<Loan>): Object<Metadata> acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        loan.fa_metadata
    }

    fun get_pending_loan_receiver_internal(pending_loan: &PendingLoan): address acquires LoanBook {
        let originator = get_originator(pending_loan.loan_book);
        *option::borrow_with_default(
            &pending_loan.alternate_receiver,
            option::borrow_with_default(&pending_loan.lender, &originator)
        )
    }

    #[view]
    public fun get_pending_loan_funder(
        pending_loan_object: Object<PendingLoan>
    ): address acquires PendingLoan, LoanBook {
        let pending_loan =
            borrow_global<PendingLoan>(object::object_address(&pending_loan_object));
        get_pending_loan_funder_internal(pending_loan)
    }

    fun get_pending_loan_funder_internal(pending_loan: &PendingLoan): address acquires LoanBook {
        let originator = get_originator(pending_loan.loan_book);
        *option::borrow_with_default(&pending_loan.lender, &originator)
    }

    #[view]
    public fun get_pending_loan_borrower(
        pending_loan_object: Object<PendingLoan>
    ): address acquires PendingLoan {
        let pending_loan =
            borrow_global<PendingLoan>(object::object_address(&pending_loan_object));
        pending_loan.borrower
    }

    #[view]
    public fun get_pending_loan_loan_book(
        pending_loan_object: Object<PendingLoan>
    ): Object<LoanBook> acquires PendingLoan {
        let pending_loan =
            borrow_global<PendingLoan>(object::object_address(&pending_loan_object));
        pending_loan.loan_book
    }

    #[view]
    public fun get_borrower(loan_object: Object<Loan>): address acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        loan.borrower
    }

    #[view]
    public fun get_owner(loan_object: Object<Loan>): address {
        object::owner<Loan>(loan_object)
    }

    #[view]
    public fun get_current_payment_installment(loan_object: Object<Loan>): Interval acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        let next_due_index = get_next_due_interval_i(&loan.payment_schedule);
        *vector::borrow(&loan.payment_schedule, (next_due_index as u64))
    }

    #[view]
    public fun get_current_payment_installment_fee(
        loan_object: Object<Loan>
    ): u64 acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        let next_due_index = get_next_due_interval_i(&loan.payment_schedule);
        let interval = vector::borrow(&loan.payment_schedule, (next_due_index as u64));
        interval.fee
    }

    #[view]
    public fun get_current_payment_installment_interest(
        loan_object: Object<Loan>
    ): u64 acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        let next_due_index = get_next_due_interval_i(&loan.payment_schedule);
        let interval = vector::borrow(&loan.payment_schedule, (next_due_index as u64));
        interval.interest
    }

    #[view]
    public fun get_current_payment_installment_principal(
        loan_object: Object<Loan>
    ): u64 acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        let next_due_index = get_next_due_interval_i(&loan.payment_schedule);
        let interval = vector::borrow(&loan.payment_schedule, (next_due_index as u64));
        interval.principal
    }

    #[view]
    public fun get_payment_schedule_summary(loan_object: Object<Loan>): (u64, u64, u64) acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        let payment_schedule = &loan.payment_schedule;
        get_payment_schedule_summary_internal(payment_schedule)
    }

    #[view]
    public fun get_remaining_debt(loan_object: Object<Loan>): u64 acquires Loan {
        let (principal, interest, fees) = get_payment_schedule_summary(loan_object);

        principal + interest + fees
    }

    #[view]
    public fun loan_exists(account: address): bool {
        exists<Loan>(account)
    }

    #[view]
    public fun should_validate_principal_continuity(
        loan_book: Object<LoanBook>
    ): bool acquires PaymentScheduleUpdateValidationSettings {
        let loan_book_address = object::object_address(&loan_book);
        if (!exists<PaymentScheduleUpdateValidationSettings>(loan_book_address)) { true }
        else {
            let config =
                borrow_global<PaymentScheduleUpdateValidationSettings>(loan_book_address);

            config.validate_principal_continuity
        }
    }

    #[view]
    public fun should_validate_due_date_continuity(
        loan_book: Object<LoanBook>
    ): bool acquires PaymentScheduleUpdateValidationSettings {
        let loan_book_address = object::object_address(&loan_book);
        if (!exists<PaymentScheduleUpdateValidationSettings>(loan_book_address)) {
            return true
        } else {
            let config =
                borrow_global<PaymentScheduleUpdateValidationSettings>(loan_book_address);

            config.validate_due_date_continuity
        }
    }

    #[view]
    public fun has_late_fee_rules(loan_book: Object<LoanBook>): bool {
        exists<LateFeeRules>(object::object_address(&loan_book))
    }

    #[view]
    public fun get_late_fee(loan: Object<Loan>): u64 acquires Loan, LateFeeRules, LateFeeTracker {
        let loan_address = object::object_address(&loan);
        let loan = borrow_global<Loan>(loan_address);
        let timestamp_us = timestamp::now_microseconds();
        
        if (!has_late_fee_rules(loan.loan_book)) {
            return 0;
        };

        get_late_fee_internal(timestamp_us, loan_address, loan)
    }

    fun get_late_fee_internal(reference_timestamp_us: u64, loan_address: address, loan: &Loan): u64 acquires LateFeeRules, LateFeeTracker {
        let rules = borrow_global<LateFeeRules>(object::object_address(&loan.loan_book));
        match (rules) {
            DelinquentLinearAccrual { grace_period_micros, accrual_period_micros, accrual_per_period_numerator, accrual_per_period_denominator, max_periods } => {
                delinquent_linear_accrual_late_fee(reference_timestamp_us, loan_address, loan, *grace_period_micros, *accrual_period_micros, *accrual_per_period_numerator, *accrual_per_period_denominator, *max_periods)
            }
        }
    }

    public entry fun toggle_payment_schedule_principal_validation(
        admin: &signer, loan_book: Object<LoanBook>, enforce_principal_continuity: bool
    ) acquires PaymentScheduleUpdateValidationSettings, LoanBook {
        assert!(is_admin(loan_book, signer::address_of(admin)), ENOT_ADMIN);
        let loan_book_address = object::object_address(&loan_book);

        if (exists<PaymentScheduleUpdateValidationSettings>(loan_book_address)) {
            let settings =
                borrow_global_mut<PaymentScheduleUpdateValidationSettings>(
                    loan_book_address
                );
            settings.validate_principal_continuity = enforce_principal_continuity;
        } else {
            let loan_book = borrow_global<LoanBook>(loan_book_address);
            let loan_book_signer =
                object::generate_signer_for_extending(&loan_book.extend_ref);

            move_to(
                &loan_book_signer,
                PaymentScheduleUpdateValidationSettings {
                    validate_principal_continuity: enforce_principal_continuity,
                    validate_due_date_continuity: true
                }
            );
        }
    }

    public entry fun remove_late_fee_rules(
        admin: &signer, loan_book: Object<LoanBook>
    ) acquires LoanBook, LateFeeRules {
        assert!(is_admin(loan_book, signer::address_of(admin)), ENOT_ADMIN);
        let loan_book_address = object::object_address(&loan_book);
        move_from<LateFeeRules>(loan_book_address);
    }

    public fun set_late_fee_rules(
        admin: &signer, loan_book: Object<LoanBook>, rules: LateFeeRules
    ) acquires LoanBook {
        assert!(is_admin(loan_book, signer::address_of(admin)), ENOT_ADMIN);
        let loan_book_address = object::object_address(&loan_book);
        let loan_book = borrow_global_mut<LoanBook>(loan_book_address);
        let loan_book_signer = object::generate_signer_for_extending(&loan_book.extend_ref);

        move_to(
            &loan_book_signer,
            rules
        );

        event::emit(
            LateFeeRulesUpdated {
                loan_book: loan_book_address,
                rules
            }
        );   
    }

    public fun delinquent_linear_accrual_late_fee_rules(
        grace_period_micros: u64,
        accrual_period_micros: u64,
        accrual_per_period_numerator: u64,
        accrual_per_period_denominator: u64,
        max_periods: u64
    ): LateFeeRules {
        LateFeeRules::DelinquentLinearAccrual {
            grace_period_micros,
            accrual_period_micros,
            accrual_per_period_numerator,
            accrual_per_period_denominator,
            max_periods
        }
    }

    fun get_payment_schedule_summary_internal(
        payment_schedule: &vector<Interval>
    ): (u64, u64, u64) {
        let principal_sum = 0;
        let interest_sum = 0;
        let fee_sum = 0;

        let i = 0;
        while (i < vector::length(payment_schedule)) {
            let interval = vector::borrow(payment_schedule, i);
            principal_sum = principal_sum + interval.principal;
            interest_sum = interest_sum + interval.interest;
            fee_sum = fee_sum + interval.fee;
            i = i + 1;
        };

        (principal_sum, interest_sum, fee_sum)
    }

    fun get_remaining_principal(payment_schedule: &vector<Interval>): u64 {
        let (principal, _, _) = get_payment_schedule_summary_internal(payment_schedule);
        principal
    }

    fun get_initial_fa_amount(
        payment_schedule: &vector<Interval>, loan_start_time_us: u64
    ): (u64, u64) {
        let principal = get_remaining_principal(payment_schedule);

        if (vector::length(payment_schedule) == 0
            || vector::borrow(payment_schedule, 0).time_due_us > loan_start_time_us) {
            (principal, 0)
        } else {
            let first_interval = vector::borrow(payment_schedule, 0);
            (principal, first_interval.fee + first_interval.interest)
        }
    }

    public fun create_loan_book(
        owner: &signer,
        originator: address,
        base_name: String,
        holders_whitelist: Object<BasicWhitelist>
    ): ConstructorRef {
        let owner_address = signer::address_of(owner);
        let loan_book_constructor_ref = object::create_sticky_object(owner_address);
        let object_signer = object::generate_signer(&loan_book_constructor_ref);
        let object_address = signer::address_of(&object_signer);

        let collection_constructor_ref =
            create_collection(&object_signer, base_name, holders_whitelist);

        let extend_ref = object::generate_extend_ref(&loan_book_constructor_ref);
        let alternate_originators = whitelist::create_unnamed(&object_signer);
        let repayment_fees = fee_manager::new_collection(object_address);
        let origination_fees = fee_manager::new_collection(object_address);
        let transfer_ref = object::generate_transfer_ref(&collection_constructor_ref);
        let _linear_transfer_ref = object::generate_linear_transfer_ref(&transfer_ref);
        let collection_object =
            object::object_from_constructor_ref<Collection>(&collection_constructor_ref);

        move_to(
            &object_signer,
            LoanBook {
                owner: owner_address,
                collection: collection_object,
                originator: originator,
                alternate_originators: alternate_originators,
                repayment_fees: repayment_fees,
                origination_fees: origination_fees,
                extend_ref: extend_ref
            }
        );

        event::emit(
            LoanBookCreated {
                loan_book_address: object_address,
                collection_address: object::address_from_constructor_ref(
                    &collection_constructor_ref
                ),
                originator: originator,
                owner: owner_address,
                alternate_originators: alternate_originators,
                repayment_fees: repayment_fees,
                origination_fees: origination_fees
            }
        );

        loan_book_constructor_ref
    }

    public fun update_loan_payment_schedule_by_index_with_ref(
        update_ref: &UpdatePaymentScheduleRef,
        index: u16,
        new_time_due_us: u64,
        new_principal: u64,
        new_interest: u64,
        new_fee: u64,
        new_status: u8
    ) acquires Loan, PaymentScheduleUpdateValidationSettings {
        update_loan_payment_schedule_by_index_internal(
            update_ref.self,
            index,
            new_time_due_us,
            new_principal,
            new_interest,
            new_fee,
            new_status
        )
    }

    public fun add_fee_and_interest_to_current_payment_schedule_with_ref(
        update_ref: &UpdatePaymentScheduleRef,
        additional_interest: u64,
        additional_fee: u64
    ) acquires Loan {
        add_fee_and_interest_to_current_payment_schedule_internal(
            update_ref.self, additional_interest, additional_fee
        );
    }

    fun add_fee_and_interest_to_current_payment_schedule_internal(
        loan_address: address, additional_interest: u64, additional_fee: u64
    ) acquires Loan {
        let loan = borrow_global_mut<Loan>(loan_address);
        let next_due_index = get_next_due_interval_i(&loan.payment_schedule);
        let old_interval = *vector::borrow(
            &loan.payment_schedule, (next_due_index as u64)
        );
        let new_interval = vector::borrow_mut(
            &mut loan.payment_schedule, (next_due_index as u64)
        );

        new_interval.fee = old_interval.fee + additional_fee;
        new_interval.interest = old_interval.interest + additional_interest;

        event::emit(
            PaymentScheduleIndexUpdated {
                loan_address,
                index: next_due_index,
                next_due_index,
                old_interval,
                new_interval: *new_interval
            }
        );
    }

    public fun update_current_payment_with_ref(
        update_ref: &UpdatePaymentScheduleRef,
        new_fee: Option<u64>,
        new_interest: Option<u64>
    ) acquires Loan {
        update_current_payment_internal(update_ref.self, new_fee, new_interest);
    }

    public fun update_payment_fee_by_index_with_ref(
        update_ref: &UpdatePaymentScheduleRef, index: u16, new_fee: u64
    ) acquires Loan {
        update_payment_by_index_internal(
            update_ref.self,
            index,
            option::some(new_fee),
            option::none()
        );
    }

    public fun update_payment_schedule_by_index_with_ref(
        update_ref: &UpdatePaymentScheduleRef,
        index: u16,
        new_fee: Option<u64>,
        new_interest: Option<u64>
    ) acquires Loan {
        update_payment_by_index_internal(update_ref.self, index, new_fee, new_interest);
    }

    public fun update_current_payment_fee_with_ref(
        update_ref: &UpdatePaymentScheduleRef, new_fee: u64
    ) acquires Loan {
        update_current_payment_internal(
            update_ref.self, option::some(new_fee), option::none()
        );
    }

    fun update_current_payment_internal(
        loan_address: address, new_fee: Option<u64>, new_interest: Option<u64>
    ) acquires Loan {
        let loan = borrow_global_mut<Loan>(loan_address);
        let next_due_index = get_next_due_interval_i(&loan.payment_schedule);
        let old_interval = *vector::borrow(
            &loan.payment_schedule, (next_due_index as u64)
        );
        let new_interval = vector::borrow_mut(
            &mut loan.payment_schedule, (next_due_index as u64)
        );

        new_interval.fee = option::destroy_with_default(new_fee, old_interval.fee);
        new_interval.interest = option::destroy_with_default(
            new_interest, old_interval.interest
        );

        event::emit(
            PaymentScheduleIndexUpdated {
                loan_address,
                index: next_due_index,
                next_due_index,
                old_interval,
                new_interval: *new_interval
            }
        );
    }

    fun update_payment_by_index_internal(
        loan_address: address,
        index: u16,
        new_fee: Option<u64>,
        new_interest: Option<u64>
    ) acquires Loan {
        let loan = borrow_global_mut<Loan>(loan_address);
        let payment_schedule = &mut loan.payment_schedule;

        let old_interval = *vector::borrow(payment_schedule, (index as u64));
        let modified_interval = vector::borrow_mut(payment_schedule, (index as u64));
        modified_interval.fee = option::destroy_with_default(new_fee, old_interval.fee);
        modified_interval.interest = option::destroy_with_default(
            new_interest, old_interval.interest
        );

        let new_interval = *modified_interval;

        let next_due_index = get_next_due_interval_i(payment_schedule);

        event::emit(
            PaymentScheduleIndexUpdated {
                loan_address,
                index,
                next_due_index,
                old_interval,
                new_interval
            }
        );
    }

    fun update_loan_payment_schedule_by_index_internal(
        loan_address: address,
        index: u16,
        new_time_due_us: u64,
        new_principal: u64,
        new_interest: u64,
        new_fee: u64,
        _new_status: u8
    ) acquires Loan, PaymentScheduleUpdateValidationSettings {
        let loan = borrow_global_mut<Loan>(loan_address);
        let old_intervals = loan.payment_schedule;
        let old_interval = *vector::borrow(&loan.payment_schedule, (index as u64));
        let interval = vector::borrow_mut(&mut loan.payment_schedule, (index as u64));
        interval.time_due_us = new_time_due_us;
        interval.principal = new_principal;
        interval.interest = new_interest;
        interval.fee = new_fee;

        let new_interval = *interval;

        if (should_validate_principal_continuity(loan.loan_book)) {
            ensure_remaining_principal_equal_new(&old_intervals, &loan.payment_schedule);
        };

        if (should_validate_due_date_continuity(loan.loan_book)) {
            ensure_time_due_strictly_increases(&loan.payment_schedule);
        };

        let next_i = get_next_due_interval_i(&loan.payment_schedule);

        event::emit(
            PaymentScheduleIndexUpdated {
                loan_address,
                index,
                next_due_index: next_i,
                old_interval,
                new_interval: new_interval
            }
        )
    }

    fun ensure_remaining_principal_equal_new(
        old_payment_schedule: &vector<Interval>, new_payment_schedule: &vector<Interval>
    ) {
        let old_principal_sum = get_remaining_principal(old_payment_schedule);
        let new_principal_sum = get_remaining_principal(new_payment_schedule);
        assert!(
            old_principal_sum == new_principal_sum,
            ENEW_INTERVAL_VECTOR_DO_NOT_ADD_TO_OLD_PRINCIPAL
        );
    }

    fun ensure_time_due_strictly_increases(
        payment_schedule: &vector<Interval>
    ) {
        let i = (get_next_due_interval_i(payment_schedule) as u64);
        let next_due_interval = vector::borrow(payment_schedule, i);
        let last_time_due_us = next_due_interval.time_due_us;
        i = i + 1;
        while (i < vector::length(payment_schedule)) {
            let interval = vector::borrow<Interval>(payment_schedule, i);
            assert!(
                (last_time_due_us < interval.time_due_us),
                EINTERVAL_TIMES_NOT_STRICTLY_INCREASING
            );
            last_time_due_us = interval.time_due_us;
            i = i + 1;
        };
    }

    fun apply_historical_contributions(
        contribution_tracker: &LoanContributionTracker, payment_schedule: &vector<Interval>
    ): vector<Interval> {
        let adjusted_schedule = vector::empty<Interval>();
        let principal = contribution_tracker.principal_paid;
        let interest = contribution_tracker.interest_paid;
        let fees = contribution_tracker.fees_paid;

        let i = 0;
        let schedule_length = vector::length(payment_schedule);

        while (i < schedule_length) {
            let interval = *vector::borrow(payment_schedule, i);

            let principal_difference = math64::min(principal, interval.principal);
            let interest_difference = math64::min(interest, interval.interest);
            let fee_difference = math64::min(fees, interval.fee);

            interval.principal -= principal_difference;
            interval.interest -= interest_difference;
            interval.fee -= fee_difference;
            principal -= principal_difference;
            interest -= interest_difference;
            fees -= fee_difference;

            vector::push_back(&mut adjusted_schedule, interval);
            i += 1;
        };

        assert!(
            principal == 0 && interest == 0 && fees == 0,
            E_CANNOT_RECONCILE_SCHEDULE
        );

        adjusted_schedule
    }

    fun reconcile_new_payment_schedule(
        loan_address: address, new_schedule: &vector<Interval>
    ): vector<Interval> acquires LoanContributionTracker {
        assert!(
            exists<LoanContributionTracker>(loan_address),
            E_CONTRIBUTION_TRACKER_NOT_FOUND
        );

        let contribution_tracker = borrow_global<LoanContributionTracker>(loan_address);
        apply_historical_contributions(contribution_tracker, new_schedule)
    }

    fun update_loan_payment_schedule_internal(
        loan_address: address, new_payment_schedule: vector<Interval>, timestamp_us: u64
    ) acquires Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker {
        let loan = borrow_global_mut<Loan>(loan_address);
        let old_payment_schedule = loan.payment_schedule;
        let reconciled_schedule =
            reconcile_new_payment_schedule(loan_address, &new_payment_schedule);

        loan.payment_schedule = reconciled_schedule;

        if (should_validate_principal_continuity(loan.loan_book)) {
            ensure_remaining_principal_equal_new(
                &old_payment_schedule, &loan.payment_schedule
            );
        };

        if (should_validate_due_date_continuity(loan.loan_book)) {
            ensure_time_due_strictly_increases(&loan.payment_schedule);
        };

        let next_due_index = get_next_due_interval_i(&loan.payment_schedule);

        event::emit(
            PaymentScheduleUpdatedV2 {
                timestamp_us,
                loan_address,
                loan_book_address: object::object_address(&loan.loan_book),
                next_due_index,
                old_payment_schedule,
                new_payment_schedule
            }
        );
    }

    public fun migrate_stores<T: key>(
        admin: &signer, loan_book_object: Object<LoanBook>, metadata: Object<T>
    ) acquires LoanBook {
        assert!(is_admin(loan_book_object, signer::address_of(admin)), ENOT_OWNER);

        let loan_book_address = object::object_address(&loan_book_object);
        let loan_book = borrow_global<LoanBook>(loan_book_address);
        let object_signer = object::generate_signer_for_extending(&loan_book.extend_ref);

        concurrent_upgrade::migrate_to_concurrent(&object_signer, metadata);
        concurrent_upgrade::migrate_apt_store(&object_signer);
    }

    public fun update_loan_payment_schedule_with_ref(
        update_ref: &UpdatePaymentScheduleRef, new_payment_schedule: vector<Interval>
    ) acquires Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker {
        let timestamp_us = timestamp::now_microseconds();
        update_loan_payment_schedule_internal(
            update_ref.self, new_payment_schedule, timestamp_us
        );
    }

    public fun update_loan_payment_schedule_historical_with_ref(
        update_ref: &UpdatePaymentScheduleRef,
        _historical_loan_book_ref: &HistoricalLoanBookRef,
        new_payment_schedule: vector<Interval>,
        timestamp_us: u64
    ) acquires Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker {
        update_loan_payment_schedule_internal(
            update_ref.self, new_payment_schedule, timestamp_us
        );
    }

    public fun offer_loan(
        loan_book: Object<LoanBook>,
        signer: &signer,
        seed: vector<u8>,
        token_metadata: Object<Metadata>,
        borrower: address,
        payment_schedule: vector<Interval>,
        payment_order_bitmap: u8
    ): ConstructorRef acquires LoanBook {
        assert!(
            can_offer_loan(loan_book, signer::address_of(signer)), ECANNOT_OFFER_LOAN
        );

        create_loan_internal(
            signer::address_of(signer),
            loan_book,
            seed,
            token_metadata,
            borrower,
            payment_schedule,
            payment_order_bitmap
        )
    }

    public fun offer_loan_with_ref(
        offerer: &signer,
        origination_ref: &OriginationRef,
        seed: vector<u8>,
        token_metadata: Object<Metadata>,
        borrower: address,
        payment_schedule: vector<Interval>,
        payment_order_bitmap: u8
    ): ConstructorRef acquires LoanBook {
        let loan_book = object::address_to_object<LoanBook>(origination_ref.self);
        create_loan_internal(
            signer::address_of(offerer),
            loan_book,
            seed,
            token_metadata,
            borrower,
            payment_schedule,
            payment_order_bitmap
        )
    }

    public fun fund_loan(
        pending_loan_object: Object<PendingLoan>, funder: address, fa: FungibleAsset
    ) acquires PendingLoan {
        fund_loan_internal(pending_loan_object, fa, funder)
    }

    public fun repay_loan(
        loan_object: Object<Loan>, fa: FungibleAsset
    ) acquires Loan, LoanBook, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let loan_address = object::object_address(&loan_object);
        let loan = borrow_global<Loan>(loan_address);
        let now = timestamp::now_microseconds();
        pay_loan_internal(
            loan_object,
            fa,
            now,
            loan.payment_order_bitmap
        );
    }

    #[lint::skip(needless_mutable_reference)]
    entry public fun reclaim_ownership(
        signer: &signer, loan_book_object: Object<LoanBook>
    ) acquires LoanBook {
        let loan_book_address = object::object_address(&loan_book_object);
        let loan_book = borrow_global_mut<LoanBook>(loan_book_address);
        let signer_address = signer::address_of(signer);
        assert!(loan_book.owner == signer_address, ENOT_OWNER);
        let object_signer = object::generate_signer_for_extending(&loan_book.extend_ref);

        object::transfer(&object_signer, loan_book_object, signer_address);
    }

    #[lint::skip(needless_mutable_reference)]
    public entry fun repay(
        signer: &signer, loan_object: Object<Loan>, amount: u64
    ) acquires Loan, LoanBook, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let loan = borrow_global_mut<Loan>(object::object_address(&loan_object));
        let fa = primary_fungible_store::withdraw(signer, loan.fa_metadata, amount);
        let now = timestamp::now_microseconds();

        pay_loan_internal(
            loan_object,
            fa,
            now,
            loan.payment_order_bitmap
        );
    }

    #[lint::skip(needless_mutable_reference)]
    public fun repay_loan_historical(
        historical_loan_book_ref: &HistoricalLoanBookRef,
        loan_object: Object<Loan>,
        fa: FungibleAsset,
        timestamp_us: u64
    ) acquires Loan, LoanBook, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        let loan_book_address = object::object_address(&loan.loan_book);

        assert!(
            loan_book_address == historical_loan_book_ref.self,
            EINVALID_HISTORICAL_LOAN_BOOK_REF
        );
        pay_loan_internal(
            loan_object,
            fa,
            timestamp_us,
            loan.payment_order_bitmap
        );
    }

    public entry fun accept_loan(
        borrower: &signer, pending_loan: Object<PendingLoan>
    ) acquires PendingLoan, LoanBook, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let intended_borrower = get_pending_loan_borrower(pending_loan);
        assert!(intended_borrower == signer::address_of(borrower), ENOT_BORROWER);

        start_loan(pending_loan);
    }

    public fun accept_loan_with_ref(
        loan_starter_ref: &LoanStarterRef, pending_loan: Object<PendingLoan>
    ) acquires PendingLoan, LoanBook, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let loan_book = get_pending_loan_loan_book(pending_loan);
        let loan_book_address = object::object_address(&loan_book);
        assert!(loan_starter_ref.self == loan_book_address, EINVALID_LOAN_STARTER_REF);

        start_loan(pending_loan);
    }

    public fun start_loan_with_ref(
        start_pending_loan_ref: StartPendingLoanRef
    ) acquires PendingLoan, LoanBook, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let StartPendingLoanRef { self: pending_loan_address } = start_pending_loan_ref;
        let pending_loan = object::address_to_object<PendingLoan>(pending_loan_address);
        start_loan(pending_loan);
    }

    public fun set_alternate_receiver(
        pending_loan_mutation_ref: &PendingLoanMutationRef, alternate_receiver: address
    ) acquires PendingLoan {
        let pending_loan = borrow_global_mut<PendingLoan>(pending_loan_mutation_ref.self);
        pending_loan.alternate_receiver = option::some(alternate_receiver);

        event::emit(
            AlternateLoanRecieverDeclared {
                pending_loan: object::address_to_object<PendingLoan>(
                    pending_loan_mutation_ref.self
                ),
                alternate_receiver
            }
        );
    }

    public fun set_start_time(
        pending_loan_mutation_ref: &PendingLoanMutationRef, start_time_us: u64
    ) acquires PendingLoan {
        let pending_loan = borrow_global_mut<PendingLoan>(pending_loan_mutation_ref.self);
        pending_loan.start_time_us = option::some(start_time_us);
    }

    public fun get_cur_debt_from_payment_schedule(
        payment_schedule: &vector<Interval>
    ): u64 {
        let (principal, interest, fee) =
            get_payment_schedule_summary_internal(payment_schedule);
        principal + interest + fee
    }

    fun create_loan_internal(
        offerer: address,
        loan_book_object: Object<LoanBook>,
        seed: vector<u8>,
        token_metadata: Object<Metadata>,
        borrower: address,
        payment_schedule: vector<Interval>,
        payment_order_bitmap: u8
    ): ConstructorRef acquires LoanBook {
        let loan_book_address = object::object_address(&loan_book_object);
        let loan_book = borrow_global<LoanBook>(loan_book_address);
        let loan_book_signer = make_signer(loan_book);
        let nft_constructor_ref =
            if (can_burn_loans(loan_book_object)) {
                nft_manager::create_token(&loan_book_signer, loan_book.collection)
            } else {
                nft_manager::create_token_from_seed(
                    &loan_book_signer, loan_book.collection, seed
                )
            };

        let object_signer = object::generate_signer(&nft_constructor_ref);

        ensure_time_due_strictly_increases(&payment_schedule);
        move_to(
            &object_signer,
            PendingLoan {
                loan_book: loan_book_object,
                borrower: borrower,
                lender: option::none<address>(),
                alternate_receiver: option::none<address>(),
                fa_metadata: token_metadata,
                start_time_us: option::none<u64>(),
                extend_ref: object::generate_extend_ref(&nft_constructor_ref),
                payment_schedule: payment_schedule,
                starting_principal: get_remaining_principal(&payment_schedule),
                payment_order_bitmap: payment_order_bitmap
            }
        );

        event::emit(
            PendingLoanCreated {
                loan_address: object::address_from_constructor_ref(&nft_constructor_ref),
                seed,
                loan_book: loan_book_object,
                borrower,
                fa_metadata: token_metadata,
                principal: get_remaining_principal(&payment_schedule),
                offerer,
                originator: loan_book.originator,
                payment_schedule: payment_schedule,
                payment_order_bitmap: payment_order_bitmap
            }
        );

        nft_constructor_ref
    }

    fun fund_loan_internal(
        pending_loan_object: Object<PendingLoan>, fa: FungibleAsset, funder: address
    ) acquires PendingLoan {
        let pending_loan_address = object::object_address(&pending_loan_object);
        let pending_loan = borrow_global_mut<PendingLoan>(pending_loan_address);
        let principal_amount = get_remaining_principal(&pending_loan.payment_schedule);

        assert!(
            principal_amount == fungible_asset::amount(&fa),
            EINVALID_FUNDING_AMOUNT
        );

        pending_loan.lender = option::some(funder);
        primary_fungible_store::deposit(pending_loan_address, fa);

        event::emit(
            PendingLoanFunded {
                pending_loan: pending_loan_object,
                funder,
                amount: principal_amount,
                fa_metadata: pending_loan.fa_metadata
            }
        );
    }

    fun create_collection(
        loan_book_signer: &signer,
        base_name: String,
        holder_whitelist: Object<BasicWhitelist>
    ): ConstructorRef {
        let collection_name = base_name;
        string::append(&mut collection_name, string::utf8(b" Loan Book"));

        nft_manager::create_collection(
            loan_book_signer,
            collection_name,
            holder_whitelist,
            true
        )
    }

    public fun update_originator_whitelist_with_ref(
        mutation_ref: &MutationRef, new_whitelist: Object<BasicWhitelist>
    ) acquires LoanBook {
        let loan_book = borrow_global_mut<LoanBook>(mutation_ref.self);
        loan_book.alternate_originators = new_whitelist;

        event::emit(
            OriginatorWhitelistUpdated {
                loan_book: object::address_to_object<LoanBook>(mutation_ref.self),
                new_whitelist
            }
        );
    }

    #[lint::skip(needless_mutable_reference)]
    public fun toggle_additional_originators(
        signer: &signer,
        loan_book_object: Object<LoanBook>,
        new_address: address,
        enabled: bool
    ) acquires LoanBook {
        let loan_book =
            borrow_global<LoanBook>(object::object_address(&loan_book_object));
        assert!(
            loan_book.originator == signer::address_of(signer)
                || object::owner(loan_book_object) == signer::address_of(signer),
            ENOT_ADMIN
        );

        let loan_book_signer = make_signer(loan_book);
        whitelist::toggle(
            &loan_book_signer,
            loan_book.alternate_originators,
            new_address,
            enabled
        );
    }

    fun record_loan(
        pending_loan: &PendingLoan, fees_applied: u64, borrower: address
    ) acquires LoanBook, LateFeeRules {
        let loan_signer = object::generate_signer_for_extending(&pending_loan.extend_ref);
        let current_time = timestamp::now_microseconds();
        let start_time =
            *option::borrow_with_default(&pending_loan.start_time_us, &current_time);
        let receiver = get_pending_loan_receiver_internal(pending_loan);
        let funder = get_pending_loan_funder_internal(pending_loan);
        let last_due_us = vector::borrow(
            &pending_loan.payment_schedule,
            vector::length(&pending_loan.payment_schedule) - 1
        ).time_due_us;

        move_to(
            &loan_signer,
            Loan {
                loan_book: pending_loan.loan_book,
                fa_metadata: pending_loan.fa_metadata,
                borrower,
                start_time_us: start_time,
                payment_count: 0,
                payment_schedule: pending_loan.payment_schedule,
                starting_principal: get_remaining_principal(
                    &pending_loan.payment_schedule
                ),
                payment_order_bitmap: pending_loan.payment_order_bitmap
            }
        );

        move_to(
            &loan_signer,
            LoanContributionTracker {
                total_paid: 0,
                fees_paid: 0,
                principal_paid: 0,
                interest_paid: 0
            }
        );

        move_to(
            &loan_signer,
            PaymentScheduleUpdateStrategy::FullScheduleReplacement
        );

        try_upgrade_with_late_fee_tracker(
            &loan_signer,
            object::object_address(&pending_loan.loan_book)
        );

        event::emit(
            LoanStarted {
                loan_address: signer::address_of(&loan_signer),
                loan_book: pending_loan.loan_book,
                funder: funder,
                receiver: receiver,
                origination_fees: fees_applied,
                start_time_us: start_time,
                maturity_time_us: last_due_us
            }
        );
    }

    fun get_fa_for_loan(
        loan_book_signer: &signer,
        loan_signer: &signer,
        fa_metadata: Object<Metadata>,
        pending_loan_principal: u64
    ): FungibleAsset {
        let loan_book_address = signer::address_of(loan_book_signer);
        let loan_address = signer::address_of(loan_signer);

        if (primary_fungible_store::balance(loan_address, fa_metadata)
            == pending_loan_principal) {
            primary_fungible_store::withdraw(
                loan_signer, fa_metadata, pending_loan_principal
            )
        } else if (primary_fungible_store::balance(loan_book_address, fa_metadata)
            >= pending_loan_principal) {
            primary_fungible_store::withdraw(
                loan_book_signer, fa_metadata, pending_loan_principal
            )
        } else {
            abort(ELOAN_NOT_FUNDED)
        }
    }

    fun start_loan(
        pending_loan_object: Object<PendingLoan>
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let pending_loan_address = object::object_address(&pending_loan_object);
        let pending_loan = move_from<PendingLoan>(pending_loan_address);

        let loan_book_address = object::object_address(&pending_loan.loan_book);
        let receiver = get_pending_loan_receiver_internal(&pending_loan);
        let loan_book = borrow_global<LoanBook>(loan_book_address);
        let loan_book_signer =
            object::generate_signer_for_extending(&loan_book.extend_ref);
        let pending_loan_signer =
            object::generate_signer_for_extending(&pending_loan.extend_ref);
        let current_time = timestamp::now_microseconds();
        let start_time =
            *option::borrow_with_default(&pending_loan.start_time_us, &current_time);

        let (pending_loan_principal, initial_fa_fees) =
            get_initial_fa_amount(&pending_loan.payment_schedule, start_time);

        let fa_store =
            get_fa_for_loan(
                &loan_book_signer,
                &pending_loan_signer,
                pending_loan.fa_metadata,
                pending_loan_principal
            );

        let amount_after_fees =
            fee_manager::disburse_fees(loan_book.origination_fees, fa_store);
        let fees_applied =
            pending_loan_principal - fungible_asset::amount(&amount_after_fees);
        let initial_payment =
            fungible_asset::extract(&mut amount_after_fees, initial_fa_fees);

        primary_fungible_store::deposit(pending_loan.borrower, amount_after_fees);

        record_loan(
            &pending_loan,
            fees_applied,
            pending_loan.borrower
        );

        nft_manager::friendly_token_transfer(
            &loan_book_signer,
            object::convert<PendingLoan, Token>(pending_loan_object),
            receiver
        );

        if (fungible_asset::amount(&initial_payment) > 0) {
            pay_loan_internal(
                object::address_to_object<Loan>(pending_loan_address),
                initial_payment,
                start_time,
                payment_schedule_bitmap::fip()
            );
        } else {
            fungible_asset::destroy_zero(initial_payment);
        }
    }

    fun retire_loan(loan_object: Object<Loan>) acquires LoanBook, Loan, LoanContributionTracker, LateFeeTracker, LateFeeReceiver {
        let token = object::convert<Loan, Token>(loan_object);
        let loan_address = object::object_address(&loan_object);
        let Loan { loan_book, payment_schedule,.. } = move_from<Loan>(loan_address);
        assert!(
            get_cur_debt_from_payment_schedule(&payment_schedule) == 0,
            ELOAN_NOT_REPAID
        );

        if (exists<LoanContributionTracker>(loan_address)) {
            let LoanContributionTracker { .. } =
                move_from<LoanContributionTracker>(loan_address);
        };

        if (exists<LateFeeTracker>(loan_address)) {
            move_from<LateFeeTracker>(loan_address);
        };

        if (exists<LateFeeReceiver>(loan_address)) {
            move_from<LateFeeReceiver>(loan_address);
        };

        if (can_burn_loans(loan_book)) {
            let loan_book = borrow_global<LoanBook>(object::object_address(&loan_book));
            let loan_book_signer =
                object::generate_signer_for_extending(&loan_book.extend_ref);

            nft_manager::burn_token(&loan_book_signer, token);
        };
    }

    fun get_next_payment_timestamp(payment_schedule: &vector<Interval>): u64 {
        let next_payment_index = get_next_due_interval_i(payment_schedule);
        let next_payment_timestamp_us = vector::borrow(
            payment_schedule, (next_payment_index as u64)
        ).time_due_us;
        next_payment_timestamp_us
    }
    

    fun get_next_due_interval_i(payment_schedule: &vector<Interval>): u16 {
        let intervals_len = vector::length(payment_schedule);
        let i = 0;
        let interval = vector::borrow(payment_schedule, i);
        while (interval.principal == 0
            && interval.interest == 0
            && interval.fee == 0
            && i + 1 < intervals_len) {
            i = i + 1;
            interval = vector::borrow(payment_schedule, i);
        };

        if (interval.principal == 0
            && interval.interest == 0
            && interval.fee == 0) {
            (vector::length(payment_schedule) as u16) - 1
        } else {
            (i as u16)
        }
    }

    fun pay_intervals(
        payment_schedule: &mut vector<Interval>, payment: u64, payment_order_bitmap: u8
    ): (u64, u64, u64) {
        let toward_fees = 0;
        let toward_interest = 0;
        let toward_principal = 0;

        let i = get_next_due_interval_i(payment_schedule);
        while ((i as u64) < vector::length(payment_schedule)) {
            let interval = vector::borrow_mut(payment_schedule, (i as u64));
            let j = 0;

            while (j < 3) {

                let res = get_payment_type(payment_order_bitmap, j);

                if (res == get_principal_const()) {
                    let principal_payment = min(interval.principal, payment);
                    interval.principal = interval.principal - principal_payment;
                    payment = payment - principal_payment;
                    toward_principal = toward_principal + principal_payment;
                };
                if (res == get_interest_const()) {
                    let interest_payment = min(interval.interest, payment);
                    interval.interest = interval.interest - interest_payment;
                    payment = payment - interest_payment;
                    toward_interest = toward_interest + interest_payment;
                };
                if (res == get_fee_const()) {
                    let fee_payment = min(interval.fee, payment);
                    interval.fee = interval.fee - fee_payment;
                    payment = payment - fee_payment;
                    toward_fees = toward_fees + fee_payment;
                };
                j = j + 1;
            };

            i = i + 1;
        };

        assert!(payment == 0, EREAPYMENT_TOO_HIGH);

        (toward_fees, toward_interest, toward_principal)
    }

    fun update_late_fee_tracker(
        loan_address: address,
        late_fee: u64,
        reference_timestamp_us: u64
    ) acquires LateFeeTracker {
        assert!(exists<LateFeeTracker>(loan_address), ENO_LATE_FEE_TRACKER);
        let tracker = borrow_global_mut<LateFeeTracker>(loan_address);
        match (tracker) {
            DelinquentLinearAccrual { last_accrual_time_us, accrued_late_fees } => {
                *last_accrual_time_us = reference_timestamp_us;
                *accrued_late_fees = late_fee;
            }
        }
    }

    public fun upgrade_with_late_fee_tracker(loan_signer: &signer) acquires Loan, LateFeeRules {
        let loan = borrow_global<Loan>(signer::address_of(loan_signer));
        try_upgrade_with_late_fee_tracker(loan_signer, object::object_address(&loan.loan_book));
    }

    fun try_upgrade_with_late_fee_tracker(
        loan_signer: &signer,
        loan_book_address: address,
    ) acquires LateFeeRules {
        if (exists<LateFeeRules>(loan_book_address)) {
            let late_fee_rules = borrow_global<LateFeeRules>(loan_book_address);
            add_late_fee_tracker(loan_signer, late_fee_rules);
        }
    }

    fun add_late_fee_tracker(
        loan_signer: &signer,
        late_fee_rules: &LateFeeRules
    ) {
        let loan_address = signer::address_of(loan_signer);
        assert!(exists<Loan>(loan_address) || exists<PendingLoan>(loan_address), ENOT_LOAN);

        match (late_fee_rules) {
            LateFeeRules::DelinquentLinearAccrual { .. } => {
                move_to(loan_signer, LateFeeTracker::DelinquentLinearAccrual {
                    last_accrual_time_us: 0,
                    accrued_late_fees: 0
                });
            }
        }
    }

    fun deduct_late_fees(
        loan: &Loan,
        originator: address,
        loan_address: address,
        reference_timestamp_us: u64,
        available_funds: FungibleAsset
    ): FungibleAsset acquires LateFeeReceiver, LateFeeTracker, LateFeeRules {
        if (!has_late_fee_rules(loan.loan_book)) {
            return available_funds;
        };

        let accrued_late_fees = get_late_fee_internal(reference_timestamp_us, loan_address, loan);

        if (accrued_late_fees == 0) {
            return available_funds;
        };

        let available_funds_amount = fungible_asset::amount(&available_funds);
        let late_fee_amount = min(available_funds_amount, accrued_late_fees);
        let late_fee_asset = fungible_asset::extract(&mut available_funds, late_fee_amount);
        let remaining_late_fee = accrued_late_fees - late_fee_amount;

        disburse_late_fees(loan, loan_address, originator, late_fee_asset);
        update_late_fee_tracker(loan_address, remaining_late_fee, reference_timestamp_us);

        event::emit(
            LateFeePaid {
                loan_book: object::object_address(&loan.loan_book),
                loan: loan_address,
                amount: late_fee_amount,
                remaining_fee: remaining_late_fee
            }
        );

        available_funds
    }

    fun pay_loan_internal(
        loan_object: Object<Loan>,
        fa: FungibleAsset,
        timestamp_us: u64,
        payment_order_bitmap: u8
    ) acquires LoanBook, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let loan_address = object::object_address(&loan_object);
        let loan = borrow_global_mut<Loan>(loan_address);
        let fa_metadata = fungible_asset::metadata_from_asset(&fa);

        assert!(
            object::object_address(&fa_metadata)
                == object::object_address(&loan.fa_metadata),
            EINCORRECT_FA
        );

        let loan_book = borrow_loan_book(&loan.loan_book);
        let expected_payment_timestamp_us =
            get_next_payment_timestamp(&loan.payment_schedule);
        let post_fees_fa = fee_manager::disburse_fees(loan_book.repayment_fees, fa);
        let payment_fa = deduct_late_fees(loan, loan_book.originator, loan_address, timestamp_us, post_fees_fa);
        let payment_amount = fungible_asset::amount(&payment_fa);

        assert!(
            get_cur_debt_from_payment_schedule(&loan.payment_schedule)
                >= payment_amount,
            EREAPYMENT_TOO_HIGH
        );

        let (toward_fees, toward_interest, toward_principal) =
            pay_intervals(
                &mut loan.payment_schedule, payment_amount, payment_order_bitmap
            );

        let fee_payment_fa = fungible_asset::extract(&mut payment_fa, toward_fees);
        let interest_payment_fa = fungible_asset::extract(
            &mut payment_fa, toward_interest
        );

        let principal_remaining = get_remaining_principal(&loan.payment_schedule);

        primary_fungible_store::deposit(loan_book.originator, fee_payment_fa);
        nft_manager::receive_cashflow(
            object::convert<Loan, nft_manager::RwaTokenConfig>(loan_object),
            payment_fa,
            interest_payment_fa,
            fungible_asset::zero(fa_metadata)
        );

        let late_us =
            if (expected_payment_timestamp_us == 0
                || expected_payment_timestamp_us >= timestamp_us) { 0 }
            else {
                timestamp_us - expected_payment_timestamp_us
            };

        let debt_after_payment =
            get_cur_debt_from_payment_schedule(&loan.payment_schedule);
        let next_payment_timestamp_us =
            get_next_payment_timestamp(&loan.payment_schedule);

        event::emit(
            PaymentMade {
                loan: loan_object,
                loan_book: loan.loan_book,
                fa_metadata: loan.fa_metadata,
                amount: payment_amount,
                toward_interest,
                toward_principal,
                toward_fees: toward_fees,
                timestamp_us: timestamp_us,
                debt_remaining: debt_after_payment,
                principal_remaining,
                late_us,
                next_payment_us: next_payment_timestamp_us,
                payment_index: loan.payment_count
            }
        );

        loan.payment_count = loan.payment_count + 1;
        try_update_contribution_tracker(
            loan_address,
            toward_principal,
            toward_interest,
            toward_fees
        );
        if (debt_after_payment == 0) {
            retire_loan(loan_object);
        }
    }

    fun try_update_contribution_tracker(
        loan_address: address,
        towards_principal: u64,
        towards_interest: u64,
        towards_fees: u64
    ) acquires LoanContributionTracker {
        if (exists<LoanContributionTracker>(loan_address)) {
            let tracker = borrow_global_mut<LoanContributionTracker>(loan_address);
            let total = towards_principal + towards_interest + towards_fees;
            tracker.total_paid = tracker.total_paid + total;
            tracker.principal_paid = tracker.principal_paid + towards_principal;
            tracker.interest_paid = tracker.interest_paid + towards_interest;
            tracker.fees_paid = tracker.fees_paid + towards_fees;
        };

    }

    fun make_signer(loan_book: &LoanBook): signer {
        object::generate_signer_for_extending(&loan_book.extend_ref)
    }

    fun loan_book_signer(loan: &Loan): signer acquires LoanBook {
        let loan_book = borrow_loan_book(&loan.loan_book);

        object::generate_signer_for_extending(&loan_book.extend_ref)
    }

    inline fun borrow_loan_book(loan_book: &Object<LoanBook>): &LoanBook acquires LoanBook {
        let addr = object::object_address(loan_book);
        borrow_global<LoanBook>(addr)
    }

    #[view]
    public fun get_cur_debt_from_loan_address(loan_address: address): u64 acquires Loan {
        let loan = borrow_global<Loan>(loan_address);
        get_cur_debt_from_loan(loan)
    }

    #[view]
    public fun get_cur_debt_from_loan_object(loan_object: Object<Loan>): u64 acquires Loan {
        let loan = borrow_global<Loan>(object::object_address(&loan_object));
        get_cur_debt_from_loan(loan)
    }

    public fun get_cur_debt_from_loan(loan: &Loan): u64 {
        get_cur_debt_from_payment_schedule(&loan.payment_schedule)
    }

    #[view]
    public fun get_remaining_principal_from_loan_address(
        loan_address: address
    ): u64 acquires Loan {
        let loan = borrow_global<Loan>(loan_address);
        get_remaining_principal(&loan.payment_schedule)
    }

    #[view]
    public fun get_remaining_principal_from_pending_loan_address(
        loan_address: address
    ): u64 acquires PendingLoan {
        let loan = borrow_global<PendingLoan>(loan_address);
        get_remaining_principal(&loan.payment_schedule)
    }

    #[view]
    public fun get_required_funding_amount(pending_loan_address: address): u64 acquires PendingLoan {
        let now = timestamp::now_microseconds();
        let loan = borrow_global<PendingLoan>(pending_loan_address);
        let start_time = *option::borrow_with_default(&loan.start_time_us, &now);
        let (principal_amount, initial_fa_fees) =
            get_initial_fa_amount(&loan.payment_schedule, start_time);
        principal_amount + initial_fa_fees
    }

    #[view]
    public fun get_starting_principal_from_loan_address(
        loan_address: address
    ): u64 acquires Loan {
        let loan = borrow_global<Loan>(loan_address);
        loan.starting_principal
    }

    //returns 0 if loan is late
    public fun get_tenor_from_payment_schedule(
        payment_schedule: &vector<Interval>
    ): u64 {
        let intervals_len = vector::length(payment_schedule);
        let last_interval = vector::borrow(payment_schedule, intervals_len - 1);
        let now_us = timestamp::now_microseconds();

        if (last_interval.time_due_us < now_us) {
            return 0
        };

        last_interval.time_due_us - now_us
    }

    #[view]
    //returns 0 if loan is late
    public fun get_tenor_from_loan_address(loan_address: address): u64 acquires Loan {
        let loan = borrow_global<Loan>(loan_address);
        get_tenor_from_payment_schedule(&loan.payment_schedule)
    }

    #[view]
    public fun get_expire_time_us_from_loan_address(loan_address: address): u64 acquires Loan {
        let loan = borrow_global<Loan>(loan_address);
        get_expire_time_us_from_payment_schedule(&loan.payment_schedule)
    }

    public fun get_expire_time_us_from_payment_schedule(
        payment_schedule: &vector<Interval>
    ): u64 {
        let intervals_len = vector::length(payment_schedule);
        let last_interval = vector::borrow(payment_schedule, intervals_len - 1);
        return last_interval.time_due_us
    }

    public fun make_interval_vector(
        time_due_by_interval: &vector<u64>,
        fee_by_interval: &vector<u64>,
        interest_by_interval: &vector<u64>,
        principal_by_interval: &vector<u64>
    ): vector<Interval> {
        assert!(
            vector::length(time_due_by_interval) == vector::length(fee_by_interval),
            EINTERVAL_VECTORS_NOT_EQUAL
        );
        assert!(
            vector::length(fee_by_interval) == vector::length(interest_by_interval),
            EINTERVAL_VECTORS_NOT_EQUAL
        );
        assert!(
            vector::length(interest_by_interval)
                == vector::length(principal_by_interval),
            EINTERVAL_VECTORS_NOT_EQUAL
        );
        assert!(
            vector::length(principal_by_interval) > 0,
            EINTERVAL_VECTORS_NOT_GREATER_THAN_ZERO
        );
        let payment_schedule: vector<Interval> = vector::empty();
        let i = 0;
        while (i < vector::length(time_due_by_interval)) {
            let time_due = *vector::borrow(time_due_by_interval, i);
            let fee = *vector::borrow(fee_by_interval, i);
            let interest = *vector::borrow(interest_by_interval, i);
            let principal = *vector::borrow(principal_by_interval, i);

            let interval = Interval {
                time_due_us: time_due,
                interest: interest,
                principal: principal,
                fee: fee
            };
            vector::push_back(&mut payment_schedule, interval);
            i = i + 1;
        };
        payment_schedule
    }

    #[view]
    public fun get_start_time_from_loan_address(loan_address: address): u64 acquires Loan {
        let loan = borrow_global<Loan>(loan_address);
        loan.start_time_us
    }


    fun disburse_late_fees(
        loan: &Loan,
        loan_address: address,
        originator: address,
        late_fee: FungibleAsset
    ) acquires LateFeeReceiver {
        let receiver = get_late_fee_receiver(loan_address);
        match (receiver) {
            LateFeeReceiver::Originator => {
                primary_fungible_store::deposit(originator, late_fee)
            }
            LateFeeReceiver::Owner => {
                nft_manager::receive_cashflow(
                    object::address_to_object(loan_address),
                    fungible_asset::zero(loan.fa_metadata),
                    fungible_asset::zero(loan.fa_metadata),
                    late_fee
                );
            },
            LateFeeReceiver::Other { address } => {
                primary_fungible_store::deposit(*address, late_fee)
            }
        }
    }
    
    fun delinquent_linear_accrual_late_fee(
        reference_time_us: u64,
        loan_address: address,
        loan: &Loan,
        grace_period_micros: u64,
        accrual_period_micros: u64,
        accrual_per_period_numerator: u64,
        accrual_per_period_denominator: u64,
        max_periods: u64
    ): u64 acquires LateFeeTracker {
        let (last_accrual_time_us, accrued_late_fees) = if (exists<LateFeeTracker>(loan_address)) {
            let tracker = borrow_global<LateFeeTracker>(loan_address);
            match (tracker) {
                DelinquentLinearAccrual { last_accrual_time_us, accrued_late_fees } => {
                    (*last_accrual_time_us, *accrued_late_fees)
                }
            }
        } else {
            (0, 0)
        };

        if (last_accrual_time_us >= reference_time_us) {
            return accrued_late_fees;
        };

        let i = 0;
        let payment_schedule_length = vector::length(&loan.payment_schedule);
        let reference_time_us = reference_time_us - grace_period_micros;
        while (i < payment_schedule_length) {
            let interval = vector::borrow(&loan.payment_schedule, i);
            if (interval.time_due_us >= reference_time_us) {
                break;
            } else if (interval.principal > 0) {
                let start_time = math64::max(interval.time_due_us, last_accrual_time_us);
                let difference = reference_time_us - start_time;
                let periods = math64::min(difference / accrual_period_micros, max_periods);
                let accrued = math64::mul_div(periods * interval.principal, accrual_per_period_numerator, accrual_per_period_denominator);
                accrued_late_fees = accrued_late_fees + accrued;
            };

            i = i + 1;
        };

        accrued_late_fees
    }

    inline fun get_late_fee_receiver(loan_address: address): &LateFeeReceiver {
        if (exists<LateFeeReceiver>(loan_address)) {
            borrow_global<LateFeeReceiver>(loan_address)
        } else {
            &LateFeeReceiver::Originator
        }
    }

    #[test_only]
    public fun get_loan_address_from_event(event: &PendingLoanCreated): address {
        event.loan_address
    }

    const EINTERVALS_NOT_CORRECT: u64 = 200;
    const EVECTORS_NOT_EQ_LEN: u64 = 201;
    const EINTERVAL_DEBT_DOESNT_MATCH: u64 = 202;
    const EINTERVAL_TIME_DOESNT_MATCH: u64 = 203;
    const EINTERVAL_STATUS_DOESNT_MATCH: u64 = 204;
    const EINT_ONE_NOT_CORRECT: u64 = 205;
    const PAY_INTERVALS_NOT_EQ_EXPECTED: u64 = 206;
    const EINTERVALS_DONT_MATCH: u64 = 207;
    const EINDEX_DONT_MATCH: u64 = 207;

    #[test_only]
    public fun setup_clock(aptos_signer: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_signer);
        timestamp::update_global_time_for_test(10);
    }

    #[test_only]
    use lucid::utils;

    #[test_only]
    fun setup_test(admin: &signer, originator: &signer):
        (Object<LoanBook>, Object<BasicWhitelist>) {
        account::create_account_for_test(signer::address_of(admin));
        account::create_account_for_test(signer::address_of(originator));

        let holders_whitelist =
            whitelist::create(admin, string::utf8(b"Holders Whitelist"));

        let constructor_ref =
            create_loan_book(
                admin,
                signer::address_of(originator),
                string::utf8(b"Test Loan Book"),
                holders_whitelist
            );

        let loan_book = from_constructor_ref(&constructor_ref);
        (loan_book, holders_whitelist)
    }

    #[test_only]
    fun compare_interval_vectors(
        i_vec_1: &vector<Interval>, i_vec_2: &vector<Interval>
    ): bool {
        assert!(vector::length(i_vec_1) == vector::length(i_vec_2), EVECTORS_NOT_EQ_LEN);
        let i = 0;
        while (i < vector::length(i_vec_1)) {
            let intrvl_1 = vector::borrow(i_vec_1, i);
            let intrvl_2 = vector::borrow(i_vec_2, i);

            assert!(intrvl_1.interest == intrvl_2.interest, EINTERVAL_DEBT_DOESNT_MATCH);
            assert!(
                intrvl_1.time_due_us == intrvl_2.time_due_us,
                EINTERVAL_TIME_DOESNT_MATCH
            );

            i = i + 1;
        };
        true
    }

    #[test_only]
    fun create_test_token(admin: &signer): (ConstructorRef, Object<Metadata>, MintRef) {
        let (constructor_ref, test_token) = fungible_asset::create_test_token(admin);

        let (mint_ref, _, _) =
            primary_fungible_store::init_test_metadata_with_primary_store_enabled(
                &constructor_ref
            );
        let fa_metadata =
            object::address_to_object<Metadata>(object::object_address(&test_token));

        (constructor_ref, fa_metadata, mint_ref)
    }

    #[test_only]
    public fun create_test_3_interval_bullet(
        monthly_fee: u64,
        monthly_interest: u64,
        principal: u64,
        first_interval_us: u64,
        time_between_intervals: u64
    ): (vector<Interval>, u64) {

        let payment_schedule = vector::empty<Interval>();

        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: monthly_fee,
                interest: monthly_interest,
                time_due_us: first_interval_us
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: monthly_fee,
                interest: monthly_interest,
                time_due_us: first_interval_us + (time_between_intervals)
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: principal,
                fee: monthly_fee,
                interest: monthly_interest,
                time_due_us: first_interval_us + (time_between_intervals * 2)
            }
        );

        let debt_sum = principal + (monthly_interest * 3) + (monthly_fee * 3);
        (payment_schedule, debt_sum)
    }

    #[test_only]
    public fun create_test_payment_schedule(): (vector<Interval>, u64) {

        let payment_schedule = vector::empty<Interval>();

        vector::push_back(
            &mut payment_schedule,
            Interval { principal: 100, fee: 5, interest: 10, time_due_us: 1727352000 }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval { principal: 100, fee: 10, interest: 10, time_due_us: 1729944000 }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval { principal: 100, fee: 3, interest: 10, time_due_us: 1732622400 }
        );

        let debt_sum = 348;
        (payment_schedule, debt_sum)
    }

    #[test_only]
    public fun create_test_payment_schedule_2(): (vector<Interval>, u64) {

        let payment_schedule = vector::empty<Interval>();

        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1727842600
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1727929000
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728015400
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728101800
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728188200
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728274600
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728361000
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728447400
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728533800
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728620200
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 150000000,
                time_due_us: 1728706600
            }
        );
        vector::push_back(
            &mut payment_schedule,
            Interval {
                principal: 0,
                fee: 0,
                interest: 10150000000,
                time_due_us: 1728793000
            }
        );

        let debt_sum = (150000000 * 11) + 10150000000;
        (payment_schedule, debt_sum)
    }

    #[test_only]
    public fun create_test_vectors(id: u8):
        (
        vector<u64>, vector<u64>, vector<u64>, vector<u64>, u64
    ) {
        let fees_by_interval = vector::empty<u64>();
        let interest_by_interval = vector::empty<u64>();
        let principal_by_interval = vector::empty<u64>();
        let time_due_by_interval = vector::empty<u64>();
        let debt_sum = 0;

        if (id == 0) {
            vector::push_back(&mut fees_by_interval, 5);
            vector::push_back(&mut fees_by_interval, 10);
            vector::push_back(&mut fees_by_interval, 3);

            vector::push_back(&mut interest_by_interval, 10);
            vector::push_back(&mut interest_by_interval, 10);
            vector::push_back(&mut interest_by_interval, 10);

            vector::push_back(&mut principal_by_interval, 100);
            vector::push_back(&mut principal_by_interval, 100);
            vector::push_back(&mut principal_by_interval, 100);

            vector::push_back(&mut time_due_by_interval, 1727352000);
            vector::push_back(&mut time_due_by_interval, 1729944000);
            vector::push_back(&mut time_due_by_interval, 1732622400);
            debt_sum = 348;
        } else if (id == 1) {
            vector::push_back(&mut fees_by_interval, 20);
            vector::push_back(&mut fees_by_interval, 30);
            vector::push_back(&mut fees_by_interval, 40);

            vector::push_back(&mut interest_by_interval, 100);
            vector::push_back(&mut interest_by_interval, 100);
            vector::push_back(&mut interest_by_interval, 100);

            vector::push_back(&mut principal_by_interval, 5000);
            vector::push_back(&mut principal_by_interval, 5000);
            vector::push_back(&mut principal_by_interval, 5000);

            vector::push_back(&mut time_due_by_interval, 1727352000);
            vector::push_back(&mut time_due_by_interval, 1729944000);
            vector::push_back(&mut time_due_by_interval, 1732622400);
            debt_sum = 1890;

        };
        (
            time_due_by_interval,
            fees_by_interval,
            interest_by_interval,
            principal_by_interval,
            debt_sum
        )

    }

    #[test_only]
    public fun create_test_loan(
        loan_book: Object<LoanBook>, admin: &signer
    ): ConstructorRef acquires LoanBook {
        let (_, fa_metadata, _) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = @test_borrower;
        let (intervals, _) = create_test_payment_schedule();

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        offer_loan(
            loan_book,
            admin,
            seed,
            fa_metadata,
            borrower_address,
            intervals,
            payment_order_bitmap
        )
    }

    #[test_only]
    public fun setup_loan_test(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        owner: address
    ): (Object<Loan>, Object<Metadata>, MintRef) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        let (loan_book, _) = setup_test(admin, originator);
        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 10;
        let monthly_interest = 2;
        let monthly_fee = 1;

        let now = timestamp::now_microseconds() + 1;
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now,
                one_day_us
            );
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_mutation_ref =
            generate_pending_loan_mutation_ref(&pending_loan_constructor_ref);
        set_alternate_receiver(&pending_loan_mutation_ref, owner);

        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == owner, 4);

        (loan_object, fa_metadata, mint_ref)
    }

    #[test_only]
    public fun create_test_loanbook_and_loan(
        admin: &signer, originator: &signer
    ): ConstructorRef acquires LoanBook {
        let (loan_book, _) = setup_test(admin, originator);

        create_test_loan(loan_book, admin)
    }

    #[test(admin = @test_admin, originator = @test_wallet_1)]
    fun test_can_set_late_fee_rules(admin: &signer, originator: &signer) acquires LoanBook, LateFeeRules {
        let (loan_book, _) = setup_test(admin, originator);
        let one_day_us = 86400000000;
        let accrual_numerator = 1;
        let accrual_denominator = 1000;
        let max_accrual = 90;
        let late_fee_rules = delinquent_linear_accrual_late_fee_rules(0, one_day_us, accrual_numerator, accrual_denominator, max_accrual);
        set_late_fee_rules(admin, loan_book, late_fee_rules);
        assert!(has_late_fee_rules(loan_book), 1);
        let late_fee_rules = borrow_global<LateFeeRules>(object::object_address(&loan_book));
        assert!(late_fee_rules is LateFeeRules::DelinquentLinearAccrual, 2);
    }
    
    #[test(admin = @test_admin, originator = @test_wallet_1)]
    fun test_can_calculate_late_fees(admin: &signer, originator: &signer) acquires LoanBook, LateFeeRules, LateFeeTracker {
        let (loan_book, _) = setup_test(admin, originator);
        utils::initialize_timestamp();
        let (_, fa_metadata, _) = utils::create_test_token(admin, option::none());
        let one_day_us = 86400000000;
        let accrual_numerator = 1;
        let accrual_denominator = 1000;
        let max_accrual = 90;
        let late_fee_rules = delinquent_linear_accrual_late_fee_rules(0, one_day_us, accrual_numerator, accrual_denominator, max_accrual);
        set_late_fee_rules(admin, loan_book, late_fee_rules);


        let now = timestamp::now_microseconds();
        let principal_amount = 1000;
        let first_due = now + one_day_us;
        let intervals = vector::singleton(Interval {
            principal: principal_amount,
            fee: 0,
            interest: 0,
            time_due_us: first_due
        });
        intervals.push_back(Interval {
            principal: principal_amount,
            fee: 0,
            interest: 0,
            time_due_us: first_due + (one_day_us * 30)
        });

        let loan = Loan {
            loan_book,
            fa_metadata,
            payment_schedule: intervals,
            borrower: @0x1,
            starting_principal: principal_amount * 2,
            start_time_us: now,
            payment_count: 0,
            payment_order_bitmap: 0
        };

        let reference_timestamp_us = now + (one_day_us * 3);

        let late_fee = get_late_fee_internal(reference_timestamp_us, @0x1, &loan);
        assert!(late_fee == 2, late_fee);
        let Loan { .. } = loan;
    }
    
    #[test(admin = @test_admin, originator = @test_wallet_1)]
    fun test_can_calculate_late_fee_to_multiple_intervals(admin: &signer, originator: &signer) acquires LoanBook, LateFeeRules, LateFeeTracker {
        let (loan_book, _) = setup_test(admin, originator);
        utils::initialize_timestamp();
        let (_, fa_metadata, _) = utils::create_test_token(admin, option::none());
        let one_day_us = 86400000000;
        let accrual_numerator = 1;
        let accrual_denominator = 1000;
        let max_accrual = 90;
        let late_fee_rules = delinquent_linear_accrual_late_fee_rules(0, one_day_us, accrual_numerator, accrual_denominator, max_accrual);
        set_late_fee_rules(admin, loan_book, late_fee_rules);


        let now = timestamp::now_microseconds();
        let principal_amount = 1000;
        let first_due = now + one_day_us;
        let intervals = vector::singleton(Interval {
            principal: principal_amount,
            fee: 0,
            interest: 0,
            time_due_us: first_due
        });
        intervals.push_back(Interval {
            principal: principal_amount,
            fee: 0,
            interest: 0,
            time_due_us: first_due + (one_day_us * 30)
        });

        let loan = Loan {
            loan_book,
            fa_metadata,
            payment_schedule: intervals,
            borrower: @0x1,
            starting_principal: principal_amount * 2,
            start_time_us: now,
            payment_count: 0,
            payment_order_bitmap: 0
        };

        let reference_timestamp_us = now + (one_day_us * 32);

        let late_fee = get_late_fee_internal(reference_timestamp_us, @0x1, &loan);
        assert!(late_fee == 32, late_fee);
        let Loan { .. } = loan;
    }
    
    #[test(admin = @test_admin, originator = @test_wallet_1)]
    fun test_late_fee_caps_at_max_accrual(admin: &signer, originator: &signer) acquires LoanBook, LateFeeRules, LateFeeTracker {
        let (loan_book, _) = setup_test(admin, originator);
        utils::initialize_timestamp();
        let (_, fa_metadata, _) = utils::create_test_token(admin, option::none());
        let one_day_us = 86400000000;
        let accrual_numerator = 1;
        let accrual_denominator = 1000;
        let max_accrual = 90;
        let late_fee_rules = delinquent_linear_accrual_late_fee_rules(0, one_day_us, accrual_numerator, accrual_denominator, max_accrual);
        set_late_fee_rules(admin, loan_book, late_fee_rules);


        let now = timestamp::now_microseconds();
        let principal_amount = 1000;
        let first_due = now + one_day_us;
        let intervals = vector::singleton(Interval {
            principal: principal_amount,
            fee: 0,
            interest: 0,
            time_due_us: first_due
        });

        let loan = Loan {
            loan_book,
            fa_metadata,
            payment_schedule: intervals,
            borrower: @0x1,
            starting_principal: principal_amount,
            start_time_us: now,
            payment_count: 0,
            payment_order_bitmap: 0
        };

        let reference_timestamp_us = now + (one_day_us * 10000);

        let late_fee = get_late_fee_internal(reference_timestamp_us, @0x1, &loan);
        assert!(late_fee == 90, late_fee);
        let Loan { .. } = loan;
    }
    
    #[test(admin = @test_admin, originator = @test_wallet_1)]
    fun test_late_fee_honors_grace_period(admin: &signer, originator: &signer) acquires LoanBook, LateFeeRules, LateFeeTracker {
        let (loan_book, _) = setup_test(admin, originator);
        utils::initialize_timestamp();
        let (_, fa_metadata, _) = utils::create_test_token(admin, option::none());
        let one_day_us = 86400000000;
        let grace_period = 14 * one_day_us;
        let accrual_numerator = 1;
        let accrual_denominator = 1000;
        let max_accrual = 90;
        let late_fee_rules = delinquent_linear_accrual_late_fee_rules(grace_period, one_day_us, accrual_numerator, accrual_denominator, max_accrual);
        set_late_fee_rules(admin, loan_book, late_fee_rules);


        let now = timestamp::now_microseconds();
        let principal_amount = 1000;
        let first_due = now + one_day_us;
        let intervals = vector::singleton(Interval {
            principal: principal_amount,
            fee: 0,
            interest: 0,
            time_due_us: first_due
        });

        let loan = Loan {
            loan_book,
            fa_metadata,
            payment_schedule: intervals,
            borrower: @0x1,
            starting_principal: principal_amount,
            start_time_us: now,
            payment_count: 0,
            payment_order_bitmap: 0
        };

        let reference_timestamp_us = now + (one_day_us * 16);

        let late_fee = get_late_fee_internal(reference_timestamp_us, @0x1, &loan);
        assert!(late_fee == 1, late_fee);
        let Loan { .. } = loan;
    }
    
    #[test(admin = @test_admin, originator = @test_wallet_1, borrower = @test_wallet_2)]
    fun test_late_fee_applied_at_payment(admin: &signer, originator: &signer, borrower: &signer) acquires PendingLoan, LoanBook, LateFeeRules, LateFeeTracker, Loan, LoanContributionTracker, LateFeeReceiver {
        let (loan_book, _) = setup_test(admin, originator);
        utils::initialize_timestamp();
        let (_, fa_metadata, mint_ref) = utils::create_test_token(admin, option::none());
        let one_day_us = 86400000000;
        let accrual_numerator = 1;
        let accrual_denominator = 1000;
        let max_accrual = 90;
        let late_fee_rules = delinquent_linear_accrual_late_fee_rules(0, one_day_us, accrual_numerator, accrual_denominator, max_accrual);
        set_late_fee_rules(admin, loan_book, late_fee_rules);


        let now = timestamp::now_microseconds();
        let principal_amount = 1000;
        let first_due = now + one_day_us;
        let intervals = vector::singleton(Interval {
            principal: principal_amount,
            fee: 0,
            interest: 0,
            time_due_us: first_due
        });
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                b"test_loan",
                fa_metadata,
                signer::address_of(borrower),
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal_amount);
        accept_loan(borrower, pending_loan);
        let loan_object = object::address_to_object<Loan>(pending_loan_address);

        let reference_timestamp_us = now + (one_day_us * 3);
        let loan_signer = account::create_account_for_test(pending_loan_address);
        let fee_receiver = @0xbb;
        move_to(&loan_signer, LateFeeReceiver::Other{ address: fee_receiver });

        let fa = fungible_asset::mint(&mint_ref, 50);
        pay_loan_internal(
            loan_object,
            fa,
            reference_timestamp_us,
            payment_order_bitmap
        );

        let fee_receiver_balance = primary_fungible_store::balance(fee_receiver, fa_metadata);
        let current_principal = get_remaining_debt(loan_object);
        assert!(fee_receiver_balance == 2, fee_receiver_balance);
        assert!(current_principal == 952, current_principal);
    }

    #[test]
    fun test_get_next_interval_due() {
        let i_1 = vector::empty<Interval>();
        vector::push_back(
            &mut i_1,
            Interval { principal: 0, fee: 0, interest: 500, time_due_us: 1727352000 }
        );
        vector::push_back(
            &mut i_1,
            Interval { principal: 0, fee: 0, interest: 550, time_due_us: 1729944000 }
        );
        vector::push_back(
            &mut i_1,
            Interval { principal: 0, fee: 0, interest: 600, time_due_us: 1732622400 }
        );
        assert!(get_next_due_interval_i(&i_1) == 0, EINT_ONE_NOT_CORRECT);
        let i_2 = vector::empty<Interval>();
        vector::push_back(
            &mut i_2,
            Interval { principal: 0, fee: 0, interest: 0, time_due_us: 1727352000 }
        );
        vector::push_back(
            &mut i_2,
            Interval { principal: 0, fee: 0, interest: 550, time_due_us: 1729944000 }
        );
        vector::push_back(
            &mut i_2,
            Interval { principal: 0, fee: 0, interest: 600, time_due_us: 1732622400 }
        );
        assert!(get_next_due_interval_i(&i_2) == 1, EINT_ONE_NOT_CORRECT);
        let i_3 = vector::empty<Interval>();
        vector::push_back(
            &mut i_3,
            Interval { principal: 0, fee: 0, interest: 0, time_due_us: 1727352000 }
        );
        vector::push_back(
            &mut i_3,
            Interval { principal: 0, fee: 0, interest: 0, time_due_us: 1729944000 }
        );
        vector::push_back(
            &mut i_3,
            Interval { principal: 0, fee: 0, interest: 600, time_due_us: 1732622400 }
        );
        assert!(get_next_due_interval_i(&i_3) == 2, EINT_ONE_NOT_CORRECT);
    }

    #[test]
    #[expected_failure(abort_code = EREAPYMENT_TOO_HIGH)]
    fun test_next_interval_due_errors() {
        let i_4 = vector::empty<Interval>();
        let payment_order_bitmap = 24;
        vector::push_back(
            &mut i_4,
            Interval { principal: 0, fee: 0, interest: 500, time_due_us: 1727352000 }
        );
        vector::push_back(
            &mut i_4,
            Interval { principal: 0, fee: 0, interest: 550, time_due_us: 1729944000 }
        );
        vector::push_back(
            &mut i_4,
            Interval { principal: 0, fee: 0, interest: 600, time_due_us: 1732622400 }
        );
        get_next_due_interval_i(&i_4);
        pay_intervals(&mut i_4, 1800, payment_order_bitmap);
    }

    #[test]
    fun test_pay_intervals() {
        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;
        let (intervals, debt_sum) = create_test_payment_schedule();
        let (toward_fees, toward_interest, toward_principal) =
            pay_intervals(&mut intervals, debt_sum, payment_order_bitmap);
        assert!(toward_fees == 18, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_interest == 30, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_principal == 300, PAY_INTERVALS_NOT_EQ_EXPECTED);
    }

    #[test]
    fun test_pay_1_interval() {
        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;
        let (intervals, _) = create_test_payment_schedule();
        let (toward_fees, toward_interest, toward_principal) =
            pay_intervals(&mut intervals, 115, payment_order_bitmap);
        assert!(toward_fees == 5, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_interest == 10, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_principal == 100, PAY_INTERVALS_NOT_EQ_EXPECTED);
        let next_due_i = get_next_due_interval_i(&intervals);
        assert!(next_due_i == 1, PAY_INTERVALS_NOT_EQ_EXPECTED);
    }

    #[test]
    fun test_pay_partial_principal_interval() {
        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;
        let (intervals, _) = create_test_payment_schedule();
        let (toward_fees, toward_interest, toward_principal) =
            pay_intervals(&mut intervals, 215, payment_order_bitmap);
        assert!(toward_fees == 15, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_interest == 20, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_principal == 180, toward_principal);
        let next_due_i = get_next_due_interval_i(&intervals);
        assert!(next_due_i == 1, PAY_INTERVALS_NOT_EQ_EXPECTED);
    }

    #[test]
    fun test_pay_partial_fee_interval_with_orderbits() {
        //001001 = principal -> interest -> fee
        let payment_order_bitmap = 9;
        let (intervals, _) = create_test_payment_schedule();
        let (toward_fees, toward_interest, toward_principal) =
            pay_intervals(&mut intervals, 230, payment_order_bitmap);
        assert!(toward_fees == 10, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_interest == 20, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_principal == 200, toward_principal);
        let next_due_i = get_next_due_interval_i(&intervals);
        assert!(next_due_i == 1, PAY_INTERVALS_NOT_EQ_EXPECTED);
    }

    #[test]
    fun test_pay_partial_interest_interval() {
        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;
        let (intervals, _) = create_test_payment_schedule();
        let (toward_fees, toward_interest, toward_principal) =
            pay_intervals(&mut intervals, 130, payment_order_bitmap);
        assert!(toward_fees == 15, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_interest == 15, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_principal == 100, toward_principal);
        let next_due_i = get_next_due_interval_i(&intervals);
        assert!(next_due_i == 1, PAY_INTERVALS_NOT_EQ_EXPECTED);
    }

    #[test]
    fun test_pay_partial_fee_interval() {
        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;
        let (intervals, _) = create_test_payment_schedule();
        let (toward_fees, toward_interest, toward_principal) =
            pay_intervals(&mut intervals, 120, payment_order_bitmap);
        assert!(toward_fees == 10, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_interest == 10, PAY_INTERVALS_NOT_EQ_EXPECTED);
        assert!(toward_principal == 100, toward_principal);
        let next_due_i = get_next_due_interval_i(&intervals);
        assert!(next_due_i == 1, PAY_INTERVALS_NOT_EQ_EXPECTED);
    }

    #[test]
    fun test_pay_interval_2() {
        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;
        let (intervals, debt) = create_test_payment_schedule_2();
        pay_intervals(&mut intervals, debt - 1, payment_order_bitmap);
        let next_due_i = get_next_due_interval_i(&intervals);
        assert!(next_due_i == 11, PAY_INTERVALS_NOT_EQ_EXPECTED);
    }

    #[test]
    fun test_full_pay_interval_2() {
        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;
        let (intervals, debt) = create_test_payment_schedule_2();
        pay_intervals(&mut intervals, debt, payment_order_bitmap);
        let next_due_index = get_next_due_interval_i(&intervals) as u64;
        assert!(
            next_due_index == vector::length(&intervals) - 1,
            next_due_index
        );
    }

    #[test]
    fun test_create_interval_vector() {
        let (
            time_due_by_interval,
            fee_by_interval,
            interest_by_interval,
            principal_by_interval,
            _
        ) = create_test_vectors(0);
        let (good_vector, _) = create_test_payment_schedule();
        let test_vector =
            make_interval_vector(
                &time_due_by_interval,
                &fee_by_interval,
                &interest_by_interval,
                &principal_by_interval
            );

        assert!(
            compare_interval_vectors(&good_vector, &test_vector),
            EINTERVALS_NOT_CORRECT
        );
    }

    #[test(admin = @test_admin, originator = @test_wallet_1)]
    fun test_can_create_loan_book(admin: signer, originator: signer) {
        let constructor_ref =
            create_loan_book(
                &admin,
                signer::address_of(&originator),
                string::utf8(b""),
                whitelist::create_unnamed(&admin)
            );

        from_constructor_ref(&constructor_ref);
    }

    #[test(admin = @test_admin, originator = @test_originator)]
    fun test_create_loan_book(admin: &signer, originator: &signer) acquires LoanBook {
        let (loan_book, _) = setup_test(admin, originator);

        assert!(
            exists<LoanBook>(object::object_address(&loan_book)),
            0
        );
        let loan_book_data = borrow_global<LoanBook>(object::object_address(&loan_book));
        assert!(loan_book_data.originator == signer::address_of(originator), 1);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_offer_loan(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, _) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 1000;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;

        let (intervals, debt_sum) =
            create_test_3_interval_bullet(0, 0, principal, now, one_day_us);

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        assert!(
            exists<PendingLoan>(object::object_address(&pending_loan)),
            2
        );

        let pending_loan_data =
            borrow_global<PendingLoan>(object::object_address(&pending_loan));
        assert!(pending_loan_data.borrower == borrower_address, 3);
        assert!(
            get_remaining_principal(&pending_loan_data.payment_schedule) == principal,
            4
        );
        assert!(
            get_tenor_from_payment_schedule(&pending_loan_data.payment_schedule)
                == (2 * one_day_us),
            6
        );
        assert!(
            get_cur_debt_from_payment_schedule(&pending_loan_data.payment_schedule)
                == debt_sum,
            7
        );

        let interval_0 = vector::borrow(&pending_loan_data.payment_schedule, 0);
        assert!(interval_0.time_due_us == now, interval_0.time_due_us);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            lender = @test_lender,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_fund_loan(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        lender: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);
        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let lender_address = signer::address_of(lender);
        account::create_account_for_test(lender_address);

        primary_fungible_store::mint(&mint_ref, lender_address, 20);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 10;
        let now = timestamp::now_microseconds() + 1;
        let one_day_us = 86400000000;

        let (intervals, _) = create_test_3_interval_bullet(
            0, 0, principal, now, one_day_us
        );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );

        let fa = primary_fungible_store::withdraw(lender, fa_metadata, principal);
        fund_loan(pending_loan, lender_address, fa);

        let pending_loan_data =
            borrow_global<PendingLoan>(object::object_address(&pending_loan));
        assert!(option::contains(&pending_loan_data.lender, &lender_address), 6);
    }

    #[test(
        admin = @test_admin, originator = @test_originator, unauthroized = @test_borrower
    )]
    #[expected_failure(abort_code = ECANNOT_OFFER_LOAN)]
    fun test_unauthorized_offer_loan(
        admin: &signer, originator: &signer, unauthroized: &signer
    ) acquires LoanBook {
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, _) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = @0x123; // Some random address
        let (intervals, _) = create_test_payment_schedule();

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        offer_loan(
            loan_book,
            unauthroized,
            seed,
            fa_metadata,
            borrower_address,
            intervals,
            payment_order_bitmap
        );
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_payment_history_is_tracked(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan, fa_metadata, mint_ref) =
            setup_loan_test(
                admin,
                originator,
                borrower,
                signer::address_of(admin)
            );
        let loan_address = object::object_address(&loan);
        let principal = get_current_payment_installment_principal(loan);
        let interest = get_current_payment_installment_interest(loan);
        let fee = get_current_payment_installment_fee(loan);

        primary_fungible_store::mint(
            &mint_ref, signer::address_of(borrower), interest + fee
        );
        repay(borrower, loan, principal + interest + fee);
        let tracker = borrow_global<LoanContributionTracker>(loan_address);
        assert!(
            tracker.total_paid == principal + interest + fee,
            0
        );
        assert!(tracker.principal_paid == principal, 1);
        assert!(tracker.interest_paid == interest, 2);
        assert!(tracker.fees_paid == fee, 3);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_loan_fees_go_to_originator(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan, fa_metadata, mint_ref) =
            setup_loan_test(
                admin,
                originator,
                borrower,
                signer::address_of(admin)
            );
        let (principal, interest, fee) = get_payment_schedule_summary(loan);

        primary_fungible_store::mint(
            &mint_ref, signer::address_of(borrower), interest + fee
        );
        repay(borrower, loan, principal + interest + fee);

        assert!(
            primary_fungible_store::balance(signer::address_of(originator), fa_metadata)
                == fee,
            0
        );
        assert!(
            primary_fungible_store::balance(signer::address_of(admin), fa_metadata)
                == principal + interest,
            0
        );
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_initial_fee_paid_on_accept(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 50;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        assert!(get_remaining_principal(&loan.payment_schedule) == principal, 5);

        let tenor = 2 * one_day_us;
        assert!(
            get_tenor_from_payment_schedule(&loan.payment_schedule) == tenor,
            get_tenor_from_payment_schedule(&loan.payment_schedule)
        );
        assert!(loan.start_time_us == timestamp::now_microseconds(), 7);

        let originator_balance =
            primary_fungible_store::balance(signer::address_of(originator), fa_metadata);
        assert!(
            originator_balance == monthly_fee + monthly_interest,
            originator_balance
        );

        let borrower_balance =
            primary_fungible_store::balance(signer::address_of(borrower), fa_metadata);
        assert!(
            borrower_balance == principal - (monthly_fee + monthly_interest),
            borrower_balance
        );
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_borrower_accept_loan(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds() + 1;
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        assert!(get_remaining_principal(&loan.payment_schedule) == principal, 5);

        let tenor = (2 * one_day_us) + 1;
        assert!(
            get_tenor_from_payment_schedule(&loan.payment_schedule) == tenor,
            get_tenor_from_payment_schedule(&loan.payment_schedule)
        );
        assert!(loan.start_time_us == timestamp::now_microseconds(), 7);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_historical_payments_applied_to_new_schedule(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);
        let loan = object::address_to_object<Loan>(pending_loan_address);
        let principal_to_pay = get_current_payment_installment_principal(loan);
        let interest_to_pay = get_current_payment_installment_interest(loan);
        let fee_to_pay = get_current_payment_installment_fee(loan);
        repay(
            borrower,
            loan,
            principal_to_pay + interest_to_pay + fee_to_pay
        );

        let new_fee = monthly_fee + 100;
        let new_interest = monthly_interest + 100;

        let (new_intervals, _) =
            create_test_3_interval_bullet(
                new_fee,
                new_interest,
                principal,
                now,
                one_day_us
            );
        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_loan_payment_schedule_with_ref(&update_ref, new_intervals);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_update_schedule_with_ref(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_fee = monthly_fee + 100;
        let new_interest = monthly_interest + 100;

        let (new_intervals, _) =
            create_test_3_interval_bullet(
                new_fee,
                new_interest,
                principal,
                now,
                one_day_us
            );
        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_loan_payment_schedule_with_ref(&update_ref, new_intervals);

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        assert!(
            compare_interval_vectors(&new_intervals, &loan.payment_schedule),
            EINTERVALS_DONT_MATCH
        );

    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    #[expected_failure(abort_code = ENEW_INTERVAL_VECTOR_DO_NOT_ADD_TO_OLD_PRINCIPAL)]
    fun test_update_schedule_with_ref_validates_principal_continuity(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_fee = monthly_fee + 100;
        let new_interest = monthly_interest + 100;

        let (new_intervals, _) =
            create_test_3_interval_bullet(
                new_fee,
                new_interest,
                principal + 1,
                now,
                one_day_us
            );
        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_loan_payment_schedule_with_ref(&update_ref, new_intervals);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_update_schedule_with_ref_can_disable_principal_validation(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);
        toggle_payment_schedule_principal_validation(admin, loan_book, false);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_fee = monthly_fee + 100;
        let new_interest = monthly_interest + 100;

        let (new_intervals, _) =
            create_test_3_interval_bullet(
                new_fee,
                new_interest,
                principal + 1000,
                now,
                one_day_us
            );
        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_loan_payment_schedule_with_ref(&update_ref, new_intervals);

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        assert!(
            compare_interval_vectors(&new_intervals, &loan.payment_schedule),
            EINTERVALS_DONT_MATCH
        );

    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_update_schedule_by_index_with_ref(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_time_due_us = timestamp::now_microseconds() + 20;
        let new_principal = 0;
        let new_interest = 40;
        let new_fee = 4;
        let new_status = INTERVAL_ACTIVE;

        let index_to_update = 1;

        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_loan_payment_schedule_by_index_with_ref(
            &update_ref,
            index_to_update,
            new_time_due_us,
            new_principal,
            new_interest,
            new_fee,
            new_status
        );

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        let changed_interval = vector::borrow(
            &loan.payment_schedule, (index_to_update as u64)
        );
        assert!(changed_interval.time_due_us == new_time_due_us, 0);
        assert!(changed_interval.principal == new_principal, 0);
        assert!(changed_interval.interest == new_interest, 0);
        assert!(changed_interval.fee == new_fee, 0);
    }

    #[expected_failure(abort_code = ENEW_INTERVAL_VECTOR_DO_NOT_ADD_TO_OLD_PRINCIPAL)]
    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_update_schedule_by_index_with_ref_fail(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_time_due_us = timestamp::now_microseconds() + 20;
        let new_principal = 100;
        let new_interest = 40;
        let new_fee = 4;
        let new_status = INTERVAL_ACTIVE;

        let index_to_update = 1;

        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_loan_payment_schedule_by_index_with_ref(
            &update_ref,
            index_to_update,
            new_time_due_us,
            new_principal,
            new_interest,
            new_fee,
            new_status
        );

    }

    #[expected_failure(abort_code = EINTERVAL_TIMES_NOT_STRICTLY_INCREASING)]
    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_update_schedule_by_index_with_ref_fail_not_increasing_time(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, PaymentScheduleUpdateValidationSettings, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, _) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );

        //011000 = fee -> interest -> principal
        let payment_order_bitmap = 24;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_time_due_us = now - 1;
        let new_principal = 0;
        let new_interest = 40;
        let new_fee = 4;
        let new_status = INTERVAL_ACTIVE;

        let index_to_update = 1;

        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_loan_payment_schedule_by_index_with_ref(
            &update_ref,
            index_to_update,
            new_time_due_us,
            new_principal,
            new_interest,
            new_fee,
            new_status
        );

    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_can_update_current_fee_with_ref(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, starting_debt) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );
        let payment_order_bitmap = 0x18;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_fee = monthly_fee + 100;
        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_current_payment_fee_with_ref(&update_ref, new_fee);

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        let cur_debt = get_cur_debt_from_loan(loan);
        assert!(cur_debt == starting_debt + 100, 5);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_can_update_current_schedule_with_ref(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, starting_debt) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );
        let payment_order_bitmap = 0x18;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_fee = monthly_fee + 100;
        let new_interest = monthly_interest + 100;
        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_current_payment_with_ref(
            &update_ref, option::some(new_fee), option::some(new_interest)
        );

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        let cur_debt = get_cur_debt_from_loan(loan);
        assert!(cur_debt == starting_debt + 200, 5);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_can_update_fee_by_index_with_ref(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, starting_debt) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );
        let payment_order_bitmap = 0x18;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_fee = monthly_fee + 100;
        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_payment_fee_by_index_with_ref(&update_ref, 1, new_fee);

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        let cur_debt = get_cur_debt_from_loan(loan);
        assert!(cur_debt == starting_debt + 100, 5);
    }

    #[
        test(
            admin = @test_admin,
            originator = @test_originator,
            borrower = @test_borrower,
            aptos_framework = @aptos_framework
        )
    ]
    fun test_can_update_payment_schedule_by_index_with_ref(
        admin: &signer,
        originator: &signer,
        borrower: &signer,
        aptos_framework: &signer
    ) acquires LoanBook, PendingLoan, Loan, LoanContributionTracker, LateFeeRules, LateFeeTracker, LateFeeReceiver {
        setup_clock(aptos_framework);
        let (loan_book, _) = setup_test(admin, originator);

        let (_, fa_metadata, mint_ref) = create_test_token(admin);

        let seed = b"test_loan";
        let borrower_address = signer::address_of(borrower);
        let principal = 100;
        let monthly_interest = 10;
        let monthly_fee = 5;

        let now = timestamp::now_microseconds();
        let one_day_us = 86400000000;
        let (intervals, starting_debt) =
            create_test_3_interval_bullet(
                monthly_fee,
                monthly_interest,
                principal,
                now + 1,
                one_day_us
            );
        let payment_order_bitmap = 0x18;

        let pending_loan_constructor_ref =
            offer_loan(
                loan_book,
                originator,
                seed,
                fa_metadata,
                borrower_address,
                intervals,
                payment_order_bitmap
            );

        let pending_loan =
            object::object_from_constructor_ref<PendingLoan>(
                &pending_loan_constructor_ref
            );
        let pending_loan_address = object::object_address(&pending_loan);
        primary_fungible_store::mint(&mint_ref, pending_loan_address, principal);

        accept_loan(borrower, pending_loan);

        assert!(!exists<PendingLoan>(pending_loan_address), 1);
        assert!(exists<Loan>(pending_loan_address), 2);

        let new_fee = monthly_fee + 100;
        let new_interest = monthly_interest + 100;

        let update_ref =
            generate_payment_schedule_update_ref(&pending_loan_constructor_ref);
        update_payment_schedule_by_index_with_ref(
            &update_ref,
            1,
            option::some(new_fee),
            option::some(new_interest)
        );

        let loan_object = object::address_to_object<Loan>(pending_loan_address);
        assert!(get_borrower(loan_object) == borrower_address, 3);
        assert!(get_owner(loan_object) == signer::address_of(originator), 4);

        let loan = borrow_global<Loan>(object::object_address(&pending_loan));
        let cur_debt = get_cur_debt_from_loan(loan);
        assert!(cur_debt == starting_debt + 200, 5);
    }
}
