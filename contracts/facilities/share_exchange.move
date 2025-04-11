module lucid::share_exchange {
    use std::vector;
    use std::option::{Self, Option};
    use std::signer;

    use aptos_framework::fungible_asset::{Self, FungibleAsset, FungibleStore, Metadata};
    use aptos_framework::object::{Self, Object, ConstructorRef, ExtendRef, DeleteRef};
    use aptos_framework::event;
    use aptos_framework::primary_fungible_store;
    use aptos_framework::timestamp;
    use aptos_framework::dispatchable_fungible_asset;

    use lucid::share_class::{Self, ShareMintRef, VersionedShareDetails};
    use lucid::whitelist::{Self, BasicWhitelist};
    use lucid::facility_core::{Self, FacilityBaseDetails};
    use lucid::utils;
    use lucid::passthrough_token::{Self};
    use lucid::escrow::{Self, Escrow};

    #[test_only]
    use std::string;
    #[test_only]
    use aptos_framework::fungible_asset::MintRef;

    const DENOMINATOR: u128 = 10000000000000000;

    const ENOT_FACILITY: u64 = 1;
    const ENOT_ATTESTED_EXCHANGE: u64 = 2;
    const ENOT_ACTIVE: u64 = 3;
    const ENOT_ATTESTOR: u64 = 4;
    const ENOT_MIN_FUNDRAISE_AMOUNT: u64 = 5;
    const EEXCEEDS_MINT_CAP: u64 = 6;
    const EEXPLICIT_APPROVAL_REQUIRED: u64 = 7;
    const EINVALID_SHARE_WEIGHTS: u64 = 8;
    const EMAX_INVESTOR_COUNT_REACHED: u64 = 9;
    const EMAX_OWNERSHIP_EXCEEDED: u64 = 10;
    const EBELOW_MIN_INVESTMENT: u64 = 11;
    const ESHARE_NOT_MINTED: u64 = 12;
    const ENOT_ADMIN: u64 = 13;
    const ESHARE_ALREADY_ADDED: u64 = 14;
    const EINVALID_SHARE_INDEX: u64 = 15;
    const EEXCHANGE_NOT_ACTIVE: u64 = 16;
    const EINCORRECT_FA: u64 = 17;
    const EINSUFFICIENT_OUTPUT: u64 = 18;
    const ESHARE_NOT_FOUND: u64 = 19;
    const EUNREACHABLE: u64 = 20;
    const EINVALID_PURCHASE_OPT_OUT_ESCROW: u64 = 21;
    const EINVALID_PURCHASE_POST_ISSUANCE: u64 = 22;
    const EINVALID_PURCHASE_PRE_ISSUANCE: u64 = 23;

    const VALID: u64 = 0;
    const CAN_ESCROW: u64 = 1;

    enum ShareExchangeType has store, drop {
        AttestedNavExchange {
            allowed_attestors: Object<BasicWhitelist>,
            nav_per_class: vector<u64>
        }
    }

    enum ExchangeRule has store, copy, drop {
        MinimumFundraiseAmount {
            amount: u64,
            index: Option<u8>
        },
        MintCap {
            cap: u64,
            index: u8
        },
        RequireExplicitApproval {
            index: Option<u8>
        },
        EnforceShareWeights,
        MaxInvestorCount {
            cap: u64,
            index: u8
        },
        MaxOwnership {
            numerator: u32,
            denominator: u32,
            index: u8
        },
        MinimumInvestmentAmount {
            amount: u64,
            index: Option<u8>
        }
    }

    struct ActiveExchangeStats has store, copy, drop {
        amount_raised: u64,
        pending_raised: u64,
        to_mint: u64,
        minted: u64
    }

    struct ActiveExchange has key, drop {
        time_started: u64,
        time_end: Option<u64>,
        details_per_class: vector<ActiveExchangeStats>,
        pre_issuance_rules: vector<ExchangeRule>,
        post_issuance_rules: vector<ExchangeRule>,
        escrow: Object<Escrow>
    }

    struct ShareExchangeBase has key {
        exchange_type: ShareExchangeType,
        facility_core: Object<FacilityBaseDetails>,
        mint_refs: vector<ShareMintRef>,
        extend_ref: ExtendRef
    }

    struct EscrowedCommitment has key, drop {
        exchange: Object<ShareExchangeBase>,
        share_index: u8,
        amount_expected: u64,
        is_approved: bool,
        extend_ref: ExtendRef,
        delete_ref: DeleteRef
    }

    #[event]
    struct NavAttested has store, drop {
        facility_address: address,
        share_address: address,
        attestor: address,
        nav: u64
    }

    #[event]
    struct ActiveExchangeStarted has store, drop {
        facility_address: address,
        exchange_address: address,
        start_time: u64,
        time_end: Option<u64>,
        pre_issuance_rules: vector<ExchangeRule>,
        post_issuance_rules: vector<ExchangeRule>
    }

    #[event]
    struct EscrowCommitmentMade has store, drop {
        facility_address: address,
        exchange_address: address,
        share_index: u8,
        amount_committed: u64,
        amount_expected: u64,
        purchaser: address,
        escrow_address: address
    }

    #[event]
    struct EscrowExecuted has store, drop {
        facility_address: address,
        exchange_address: address,
        share_index: u8,
        amount_committed: u64,
        amount_expected: u64,
        purchaser: address,
        escrow_address: address
    }

    #[event]
    struct EscrowRescinded has store, drop {
        facility_address: address,
        exchange_address: address,
        share_index: u8,
        amount_committed: u64,
        amount_expected: u64,
        purchaser: address,
        escrow_address: address
    }

    #[view]
    public fun exchange_exists<T: key>(exchange: Object<T>): bool {
        exists<ShareExchangeBase>(object::object_address(&exchange))
    }

    #[view]
    public fun exchange_exists_at(address: address): bool {
        exists<ShareExchangeBase>(address)
    }

    #[view]
    public fun is_exchange_active(exchange: Object<ShareExchangeBase>): bool acquires ActiveExchange {
        let exchange_address = object::object_address(&exchange);
        if (exists<ActiveExchange>(exchange_address)) {
            let active_exchange = borrow_global<ActiveExchange>(exchange_address);
            let time_now = timestamp::now_microseconds();
            let time_started = active_exchange.time_started;
            let time_end = active_exchange.time_end;

            time_now >= time_started
                && (
                    option::is_none(&time_end)
                        || time_now <= option::destroy_some(time_end)
                )
        } else { false }
    }

    #[view]
    public fun expected_shares_for_purchase(
        exchange: Object<ShareExchangeBase>, share_index: u8, purchase_amount: u64
    ): u64 acquires ShareExchangeBase {
        let exchange =
            borrow_global<ShareExchangeBase>(object::object_address(&exchange));
        convert_to_shares(exchange, share_index, purchase_amount)
    }

    public fun create_minimum_fundraise_amount_rule(
        amount: u64, index: Option<u8>
    ): ExchangeRule {
        ExchangeRule::MinimumFundraiseAmount { amount, index }
    }

    public fun create_mint_cap_rule(cap: u64, index: u8): ExchangeRule {
        ExchangeRule::MintCap { cap, index }
    }

    public fun create_require_explicit_approval_rule(index: Option<u8>): ExchangeRule {
        ExchangeRule::RequireExplicitApproval { index }
    }

    public fun create_enforce_share_weights_rule(): ExchangeRule {
        ExchangeRule::EnforceShareWeights
    }

    public fun create_max_investor_count_rule(cap: u64, index: u8): ExchangeRule {
        ExchangeRule::MaxInvestorCount { cap, index }
    }

    public fun create_max_ownership_rule(
        numerator: u32, denominator: u32, index: u8
    ): ExchangeRule {
        ExchangeRule::MaxOwnership { numerator, denominator, index }
    }

    public fun create_minimum_investment_amount_rule(
        amount: u64, index: Option<u8>
    ): ExchangeRule {
        ExchangeRule::MinimumInvestmentAmount { amount, index }
    }

    public entry fun attest_nav(
        signer: &signer,
        exchange: Object<ShareExchangeBase>,
        share_index: u8,
        nav: u64
    ) acquires ShareExchangeBase {
        let exchange =
            borrow_global_mut<ShareExchangeBase>(object::object_address(&exchange));
        let attestor = signer::address_of(signer);
        let share_address = share_address_by_index(exchange, share_index);

        match(&mut exchange.exchange_type) {
            ShareExchangeType::AttestedNavExchange { allowed_attestors, nav_per_class } => {
                assert!(whitelist::is_member(*allowed_attestors, attestor), ENOT_ATTESTOR);
                assert!((share_index as u64) < vector::length(nav_per_class),
                EINVALID_SHARE_INDEX);
                vector::replace(nav_per_class, (share_index as u64), nav);
                event::emit(
                    NavAttested {
                        facility_address: object::object_address(&exchange.facility_core),
                        share_address,
                        attestor,
                        nav
                    }
                );
            }
        };
    }

    public fun add_mint_ref(
        signer: &signer, exchange: Object<ShareExchangeBase>, mint_ref: ShareMintRef
    ) acquires ShareExchangeBase {
        let exchange =
            borrow_global_mut<ShareExchangeBase>(object::object_address(&exchange));
        assert!(
            facility_core::is_admin(exchange.facility_core, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let share_address = share_class::mint_ref_to_address(&mint_ref);
        vector::for_each_ref(
            &exchange.mint_refs,
            |existing_mint_ref| {
                let existing_share_address =
                    share_class::mint_ref_to_address(existing_mint_ref);
                assert!(share_address != existing_share_address, ESHARE_ALREADY_ADDED);
            }
        );

        vector::push_back(&mut exchange.mint_refs, mint_ref);

        match(&mut exchange.exchange_type) {
            ShareExchangeType::AttestedNavExchange {
                allowed_attestors: _allowed_attestors,
                nav_per_class
            } => {
                vector::push_back(nav_per_class, 0);
            }
        };
    }

    public fun extend_with_exchange(
        facility_constructor_ref: &ConstructorRef, exchange_type: ShareExchangeType
    ): Object<ShareExchangeBase> {
        let facility_signer = object::generate_signer(facility_constructor_ref);
        let extend_ref = object::generate_extend_ref(facility_constructor_ref);

        move_to(
            &facility_signer,
            ShareExchangeBase {
                exchange_type,
                facility_core: object::object_from_constructor_ref<FacilityBaseDetails>(
                    facility_constructor_ref
                ),
                mint_refs: vector::empty(),
                extend_ref
            }
        );

        object::object_from_constructor_ref(facility_constructor_ref)
    }

    public fun total_raised(
        active_exchange: &ActiveExchange, share_index: &Option<u8>
    ): u64 {
        if (option::is_some(share_index)) {
            let index = *option::borrow(share_index);
            let stats = vector::borrow(
                &active_exchange.details_per_class, (index as u64)
            );
            stats.amount_raised + stats.pending_raised
        } else {
            utils::vector_fold_ref(
                &active_exchange.details_per_class,
                |stats, total| { total + stats.amount_raised + stats.pending_raised },
                0
            )
        }
    }

    public fun start_exchange(
        signer: &signer,
        exchange: Object<ShareExchangeBase>,
        start_time: u64,
        time_end: Option<u64>,
        pre_issuance_rules: vector<ExchangeRule>,
        post_issuance_rules: vector<ExchangeRule>
    ) acquires ShareExchangeBase {

        let exchange_address = object::object_address(&exchange);
        let exchange = borrow_global_mut<ShareExchangeBase>(exchange_address);
        assert!(
            facility_core::is_admin(exchange.facility_core, signer::address_of(signer)),
            ENOT_ADMIN
        );

        let facility_address = object::object_address(&exchange.facility_core);
        let n_shares = vector::length(&exchange.mint_refs);
        let exchange_signer = object::generate_signer_for_extending(&exchange.extend_ref);
        let details_per_class = empty_active_exchange_stats(n_shares);
        let escrow = escrow::create_unnamed_escrow_account(exchange_address);

        move_to(
            &exchange_signer,
            ActiveExchange {
                time_started: start_time,
                time_end: time_end,
                details_per_class,
                pre_issuance_rules,
                post_issuance_rules,
                escrow
            }
        );

        event::emit(
            ActiveExchangeStarted {
                facility_address,
                exchange_address,
                start_time,
                time_end,
                pre_issuance_rules,
                post_issuance_rules
            }
        );
    }

    public fun attempt_purchase(
        exchange: Object<ShareExchangeBase>,
        purchase_amount: FungibleAsset,
        share_class: Object<VersionedShareDetails>,
        receiver: address,
        minimum_received_shares: u64,
        allow_escrow: bool
    ): u64 acquires ShareExchangeBase, ActiveExchange {
        let active_exchange = active_exchange(exchange, true);
        let exchange_address = object::object_address(&exchange);
        let exchange = borrow_global<ShareExchangeBase>(exchange_address);
        ensure_fa(exchange.facility_core, &purchase_amount);

        let share_index = find_share_index(
            exchange, object::object_address(&share_class)
        );
        let share_amount =
            execute_purchase(
                exchange,
                active_exchange,
                purchase_amount,
                share_index,
                receiver,
                allow_escrow
            );
        assert!(share_amount >= minimum_received_shares, EINSUFFICIENT_OUTPUT);

        share_amount
    }

    public entry fun force_approve_escrow(
        signer: &signer, escrow: Object<EscrowedCommitment>
    ) acquires EscrowedCommitment, ShareExchangeBase {
        let escrow = move_from<EscrowedCommitment>(object::object_address(&escrow));
        let exchange =
            borrow_global<ShareExchangeBase>(object::object_address(&escrow.exchange));
        assert!(
            facility_core::is_admin(exchange.facility_core, signer::address_of(signer)),
            ENOT_ADMIN
        );

        escrow.is_approved = true;
    }

    fun execute_escrow(
        escrow: EscrowedCommitment, owner: address, skip_validation: bool
    ) acquires ActiveExchange, ShareExchangeBase {
        let exchange_address = object::object_address(&escrow.exchange);
        let exchange = borrow_global<ShareExchangeBase>(exchange_address);
        let active_exchange = active_exchange(escrow.exchange, true);
        let share_index = escrow.share_index;
        let share_address = share_address_by_index(exchange, share_index);
        let share_details =
            object::address_to_object<VersionedShareDetails>(share_address);

        let escrow_signer = object::generate_signer_for_extending(&escrow.extend_ref);
        let escrow_address = signer::address_of(&escrow_signer);
        let escrow_store = object::address_to_object<FungibleStore>(escrow_address);
        let escrow_balance = fungible_asset::balance(escrow_store);
        let fa =
            dispatchable_fungible_asset::withdraw(
                &escrow_signer, escrow_store, escrow_balance
            );

        if (!skip_validation) {
            let pre_issuance_check =
                validate_exchange_rules(
                    exchange,
                    active_exchange,
                    &active_exchange.pre_issuance_rules,
                    escrow.share_index,
                    owner,
                    0
                );
            assert!(pre_issuance_check == VALID, EINVALID_PURCHASE_PRE_ISSUANCE);
        };

        share_class::fund_facility(share_details, fa);
        let mint_ref = vector::borrow(&exchange.mint_refs, (share_index as u64));
        let new_shares = share_class::mint_with_ref(mint_ref, escrow.amount_expected);
        primary_fungible_store::deposit(owner, new_shares);

        if (!skip_validation) {
            let post_issuance_check =
                validate_exchange_rules(
                    exchange,
                    active_exchange,
                    &active_exchange.post_issuance_rules,
                    share_index,
                    owner,
                    escrow.amount_expected
                );
            assert!(post_issuance_check == VALID, EINVALID_PURCHASE_POST_ISSUANCE);
        }
    }

    fun execute_purchase(
        exchange: &ShareExchangeBase,
        active_exchange: &mut ActiveExchange,
        purchase_amount: FungibleAsset,
        share_index: u8,
        receiver: address,
        allow_escrow: bool
    ): u64 {
        let pre_issuance_check =
            validate_exchange_rules(
                exchange,
                active_exchange,
                &active_exchange.pre_issuance_rules,
                share_index,
                receiver,
                0
            );
        if (pre_issuance_check != VALID) {
            return if (pre_issuance_check == CAN_ESCROW && allow_escrow) {
                issue_escrow(
                    exchange,
                    active_exchange,
                    share_index,
                    purchase_amount,
                    receiver
                )
            } else {
                abort(EINVALID_PURCHASE_OPT_OUT_ESCROW);
                0
            };
        };

        let mint_ref = vector::borrow(&exchange.mint_refs, (share_index as u64));
        let buying_power = fungible_asset::amount(&purchase_amount);
        let shares = convert_to_shares(exchange, share_index, buying_power);
        let share_address = share_class::mint_ref_to_address(mint_ref);
        let share_details =
            object::address_to_object<VersionedShareDetails>(share_address);
        share_class::fund_facility(share_details, purchase_amount);

        let new_shares = share_class::mint_with_ref(mint_ref, shares);
        primary_fungible_store::deposit(receiver, new_shares);

        let post_issuance_check =
            validate_exchange_rules(
                exchange,
                active_exchange,
                &active_exchange.post_issuance_rules,
                share_index,
                receiver,
                shares
            );
        assert!(post_issuance_check == VALID, EINVALID_PURCHASE_POST_ISSUANCE);

        shares
    }

    fun issue_escrow(
        exchange: &ShareExchangeBase,
        active_exchange: &mut ActiveExchange,
        share_index: u8,
        purchase_fa: FungibleAsset,
        receiver: address
    ): u64 {
        let fa_metadata = fungible_asset::metadata_from_asset(&purchase_fa);
        let exchange_address = object::address_from_extend_ref(&exchange.extend_ref);
        let purchase_amount = fungible_asset::amount(&purchase_fa);
        let shares = convert_to_shares(exchange, share_index, purchase_amount);

        let (escrow_commitment, escrow_store) =
            create_escrow_commitment(
                exchange_address,
                exchange,
                active_exchange,
                fa_metadata,
                share_index,
                receiver,
                shares
            );
        dispatchable_fungible_asset::deposit(escrow_store, purchase_fa);

        let exchange_stats = vector::borrow_mut(
            &mut active_exchange.details_per_class, (share_index as u64)
        );
        exchange_stats.pending_raised = exchange_stats.pending_raised + purchase_amount;
        exchange_stats.to_mint = exchange_stats.to_mint + shares;

        event::emit(
            EscrowCommitmentMade {
                facility_address: object::object_address(&exchange.facility_core),
                exchange_address,
                share_index,
                amount_committed: purchase_amount,
                amount_expected: shares,
                purchaser: receiver,
                escrow_address: object::object_address(&escrow_commitment)
            }
        );

        shares
    }

    fun convert_to_shares(
        exchange: &ShareExchangeBase, share_index: u8, purchase_amount: u64
    ): u64 {
        match(&exchange.exchange_type) {
            ShareExchangeType::AttestedNavExchange { nav_per_class,.. } => {
                let nav_per_share = *vector::borrow(nav_per_class, (share_index as u64));
                let shares = (purchase_amount as u128) * (DENOMINATOR as u128) / (
                    nav_per_share as u128
                );
                shares as u64
            }
        }
    }

    fun find_share_index(
        exchange: &ShareExchangeBase, share_address: address
    ): u8 {
        let i = 0;
        while (i < vector::length(&exchange.mint_refs)) {
            let mint_ref = vector::borrow(&exchange.mint_refs, (i as u64));
            let existing_share_address = share_class::mint_ref_to_address(mint_ref);
            if (share_address == existing_share_address) {
                return i as u8;
            };
            i = i + 1;
        };

        abort(ESHARE_NOT_FOUND);
        0
    }

    fun empty_active_exchange_stats(n_shares: u64): vector<ActiveExchangeStats> {
        let base = vector::empty<ActiveExchangeStats>();
        let i = 0;
        while (i < n_shares) {
            vector::push_back(
                &mut base,
                ActiveExchangeStats {
                    amount_raised: 0,
                    pending_raised: 0,
                    to_mint: 0,
                    minted: 0
                }
            );
            i = i + 1;
        };

        base
    }

    fun validity_check_minimum_fundraise_amount(
        active_exchange: &ActiveExchange,
        min_amount: u64,
        amount_pending: u64,
        share_index: u8,
        reference_index: &Option<u8>
    ): u64 {

        if (option::is_some(reference_index)
            && *option::borrow(reference_index) != share_index) {
            return VALID;
        };

        let amount_raised = total_raised(active_exchange, reference_index)
            + amount_pending;
        if (amount_raised >= min_amount) { VALID }
        else {
            CAN_ESCROW
        }
    }

    fun validity_check_mint_cap(
        active_exchange: &ActiveExchange,
        cap: u64,
        share_index: u8,
        reference_index: u8
    ): u64 {
        if (reference_index != share_index) {
            return VALID;
        };

        let stats = vector::borrow(
            &active_exchange.details_per_class, (share_index as u64)
        );
        let minted_sum = stats.minted + stats.to_mint;

        assert!(minted_sum <= cap, EEXCEEDS_MINT_CAP);
        VALID
    }

    fun validity_check_enforce_share_weights(
        exchange: &ShareExchangeBase, active_exchange: &ActiveExchange
    ): u64 {
        let pending_raise =
            utils::vector_fold_ref(
                &active_exchange.details_per_class,
                |stats, total| { total + stats.pending_raised },
                0
            );

        let current_total_principal =
            utils::vector_fold_ref(
                &exchange.mint_refs,
                |mint_ref, total| {
                    let share = share_class::mint_ref_to_address(mint_ref);

                    total
                        + share_class::get_current_contributed(
                            object::address_to_object(share)
                        )
                },
                0
            );

        let total_principal = (current_total_principal + pending_raise as u128);
        let risk_denominator = share_class::risk_weight_denominator() as u128;

        vector::enumerate_ref(
            &exchange.mint_refs,
            |index, mint_ref| {
                let share = share_class::mint_ref_to_address(mint_ref);
                let share_details = object::address_to_object(share);

                let pending_principal = vector::borrow(
                    &active_exchange.details_per_class, (index as u64)
                ).pending_raised;
                let current_principal =
                    share_class::get_current_contributed(share_details);
                let potential_principal =
                    (current_principal + pending_principal as u128) * risk_denominator;

                let min_risk_weight =
                    share_class::get_min_risk_weight(share_details) as u128;
                let max_risk_weight =
                    share_class::get_max_risk_weight(share_details) as u128;
                let current_risk_weight = potential_principal / total_principal;

                assert!(
                    current_risk_weight >= min_risk_weight
                        && current_risk_weight <= max_risk_weight,
                    EINVALID_SHARE_WEIGHTS
                );
            }
        );

        VALID
    }

    fun validity_check_max_investor_count(
        exchange: &ShareExchangeBase,
        cap: u64,
        share_index: u8,
        reference_index: u8
    ): u64 {
        if (reference_index != share_index) {
            return VALID;
        };

        let share_address = share_address_by_index(exchange, share_index);
        assert!(
            passthrough_token::current_holders_at_most(share_address, cap),
            EMAX_INVESTOR_COUNT_REACHED
        );
        VALID
    }

    fun validity_check_max_ownership(
        exchange: &ShareExchangeBase,
        receiver: address,
        numerator: u32,
        denominator: u32,
        share_index: u8,
        reference_index: u8
    ): u64 {
        if (reference_index != share_index) {
            return VALID;
        };

        let share_address = share_address_by_index(exchange, share_index);
        let share_details =
            object::address_to_object<VersionedShareDetails>(share_address);
        let total_supply_option = fungible_asset::supply(share_details);
        assert!(option::is_some(&total_supply_option), ESHARE_NOT_MINTED);
        let total_supply = option::destroy_some(total_supply_option) as u128;
        let max_ownership = (numerator as u128) * total_supply / (denominator as u128);

        let receiver_ownership =
            primary_fungible_store::balance(receiver, share_details) as u128;
        assert!(receiver_ownership <= max_ownership, EMAX_OWNERSHIP_EXCEEDED);

        VALID
    }

    fun check_validity(
        rule: &ExchangeRule,
        exchange: &ShareExchangeBase,
        active_exchange: &ActiveExchange,
        share_index: u8,
        receiver: address,
        amount_pending: u64
    ): u64 {
        match(rule) {
            ExchangeRule::MinimumFundraiseAmount {
                amount: min_amount,
                index: min_amount_index
            } => {
                validity_check_minimum_fundraise_amount(
                    active_exchange,
                    *min_amount,
                    amount_pending,
                    share_index,
                    min_amount_index
                )
            },
            ExchangeRule::MintCap { cap, index } => {
                validity_check_mint_cap(
                    active_exchange, *cap, share_index, *index
                )
            },
            ExchangeRule::RequireExplicitApproval { index } => {
                if (option::is_none(index) || *option::borrow(index) == share_index) {
                    CAN_ESCROW
                } else { VALID }
            },
            ExchangeRule::EnforceShareWeights => {
                validity_check_enforce_share_weights(exchange, active_exchange)
            },
            ExchangeRule::MaxInvestorCount { cap, index } => {
                validity_check_max_investor_count(
                    exchange, *cap, share_index, *index
                )
            },
            ExchangeRule::MaxOwnership { numerator, denominator, index } => {
                validity_check_max_ownership(
                    exchange, receiver, *numerator, *denominator, share_index, *index
                )
            },
            ExchangeRule::MinimumInvestmentAmount { amount, index: _ } => {
                assert!(amount_pending >= *amount, EBELOW_MIN_INVESTMENT);
                VALID
            }
        }
    }

    fun validate_exchange_rules(
        exchange: &ShareExchangeBase,
        active_exchange: &ActiveExchange,
        rules: &vector<ExchangeRule>,
        share_index: u8,
        receiver: address,
        amount_pending: u64
    ): u64 {
        utils::vector_fold_ref(
            rules,
            |rule, result| {
                result
                    | check_validity(
                        rule,
                        exchange,
                        active_exchange,
                        share_index,
                        receiver,
                        amount_pending
                    )
            },
            VALID
        )
    }

    inline fun create_escrow_commitment(
        exchange_address: address,
        _exchange: &ShareExchangeBase,
        _active_exchange: &mut ActiveExchange,
        fa_metadata: Object<Metadata>,
        share_index: u8,
        receiver: address,
        amount_expected: u64
    ): (Object<EscrowedCommitment>, Object<FungibleStore>) {
        let escrow_commitment_cr = object::create_object(receiver);
        let escrow_extend_ref = object::generate_extend_ref(&escrow_commitment_cr);
        let escrow_delete_ref = object::generate_delete_ref(&escrow_commitment_cr);
        let store = fungible_asset::create_store(&escrow_commitment_cr, fa_metadata);
        let escrow_signer = object::generate_signer(&escrow_commitment_cr);

        move_to(
            &escrow_signer,
            EscrowedCommitment {
                exchange: object::address_to_object(exchange_address),
                share_index,
                amount_expected,
                is_approved: false,
                extend_ref: escrow_extend_ref,
                delete_ref: escrow_delete_ref
            }
        );

        (object::object_from_constructor_ref(&escrow_commitment_cr), store)
    }

    inline fun ensure_fa(
        facility_core: Object<FacilityBaseDetails>, fa: &FungibleAsset
    ) {
        let fa_metadata = fungible_asset::metadata_from_asset(fa);
        let expected_fa_metadata = facility_core::get_fa_metadata(facility_core);

        assert!(
            object::object_address(&fa_metadata)
                == object::object_address(&expected_fa_metadata),
            EINCORRECT_FA
        );
    }

    inline fun active_exchange(
        exchange: Object<ShareExchangeBase>, check_active: bool
    ): &mut ActiveExchange acquires ShareExchangeBase {
        let exchange_address = object::object_address(&exchange);
        assert!(exists<ActiveExchange>(exchange_address), EEXCHANGE_NOT_ACTIVE);
        let active_exchange = borrow_global_mut<ActiveExchange>(exchange_address);
        assert!(
            !check_active
                || active_exchange.time_started <= timestamp::now_microseconds()
                    && (
                        option::is_none(&active_exchange.time_end)
                            || *option::borrow(&active_exchange.time_end)
                                <= timestamp::now_microseconds()
                    ),
            EEXCHANGE_NOT_ACTIVE
        );

        active_exchange
    }

    inline fun share_address_by_index(
        exchange: &ShareExchangeBase, index: u8
    ): address {
        share_class::mint_ref_to_address(
            vector::borrow(&exchange.mint_refs, (index as u64))
        )
    }

    #[test_only]
    use aptos_framework::account;

    #[test_only]
    struct TestState has drop {
        owner: address,
        admin_whitelist: Object<BasicWhitelist>,
        holder_whitelist: Object<BasicWhitelist>,
        attestors_whitelist: Object<BasicWhitelist>,
        facility_core: Object<FacilityBaseDetails>,
        exchange: Object<ShareExchangeBase>,
        senior_share: Object<VersionedShareDetails>,
        junior_share: Object<VersionedShareDetails>,
        senior_mint_ref: ShareMintRef,
        junior_mint_ref: ShareMintRef,
        underlying_fa: Object<Metadata>,
        mint_ref: MintRef
    }

    #[test_only]
    fun owner_signer(test_state: &TestState): signer {
        let owner = test_state.owner;
        account::create_signer_for_test(owner)
    }

    #[test_only]
    fun whitelist_share_owner(test_state: &TestState, owner: address) {
        whitelist::toggle(
            &owner_signer(test_state),
            test_state.holder_whitelist,
            owner,
            true
        );
    }

    #[test_only]
    inline fun test_exchange(test_state: &TestState): &mut ShareExchangeBase {
        borrow_global_mut<ShareExchangeBase>(object::object_address(&test_state.exchange))
    }

    #[test_only]
    inline fun test_active_exchange(test_state: &TestState): &mut ActiveExchange {
        borrow_global_mut<ActiveExchange>(object::object_address(&test_state.exchange))
    }

    #[test_only]
    fun setup_timestamp() {
        let aptos_framework_signer = account::create_signer_for_test(@aptos_framework);
        timestamp::set_time_has_started_for_testing(&aptos_framework_signer);
        timestamp::update_global_time_for_test(1);
    }

    #[test_only]
    public fun create_test_facility(
        creator: &signer, admin_whitelist: Object<BasicWhitelist>
    ): (ConstructorRef, Object<FacilityBaseDetails>, Object<Metadata>, MintRef) {
        let (_, metadata, mint_ref) = utils::create_test_token(creator, option::none());
        let originator_receivable_account = signer::address_of(creator);
        let constructor_ref =
            facility_core::create_facility(
                signer::address_of(creator),
                admin_whitelist,
                admin_whitelist,
                metadata,
                originator_receivable_account
            );

        let facility_details_object =
            object::object_from_constructor_ref<FacilityBaseDetails>(&constructor_ref);

        (constructor_ref, facility_details_object, metadata, mint_ref)
    }

    #[test_only]
    fun create_share(
        facility_address: address,
        seed: vector<u8>,
        admin_whitelist: Object<BasicWhitelist>,
        holder_whitelist: Object<BasicWhitelist>,
        min_risk_weight: u64,
        max_risk_weight: u64
    ): (Object<VersionedShareDetails>, ShareMintRef, ShareMintRef) {
        let lucid_signer = account::create_signer_for_test(@lucid);
        let facility_signer = account::create_signer_for_test(facility_address);

        let facility_core =
            object::address_to_object<FacilityBaseDetails>(facility_address);
        let share_class =
            share_class::new_share_class(
                &lucid_signer,
                facility_address,
                string::utf8(seed),
                string::utf8(seed),
                holder_whitelist,
                admin_whitelist,
                0,
                0,
                0,
                min_risk_weight,
                max_risk_weight,
                option::none()
            );

        (
            share_class,
            share_class::generate_mint_ref(&facility_signer, share_class),
            share_class::generate_mint_ref(&facility_signer, share_class)
        )
    }

    #[test_only]
    fun setup_test_exchange(
        admin: &signer, facility_cr: &ConstructorRef, whitelist: Object<BasicWhitelist>
    ): Object<ShareExchangeBase> {
        let nav_per_class = vector::empty();
        let exchange_type = ShareExchangeType::AttestedNavExchange {
            allowed_attestors: whitelist,
            nav_per_class
        };

        let exchange = extend_with_exchange(facility_cr, exchange_type);
        exchange
    }

    #[test_only]
    fun setup_test(admin: &signer): TestState acquires ShareExchangeBase {
        setup_timestamp();
        let admin_whitelist = utils::whitelist_with_signer(admin, b"admin");
        let holder_whitelist = utils::whitelist_with_signer(admin, b"holder");
        let attestors_whitelist = utils::whitelist_with_signer(admin, b"attestor");

        let (facility_cr, facility_core, metadata, mint_ref) =
            create_test_facility(admin, admin_whitelist);
        let facility_address = object::object_address(&facility_core);
        let risk_denominator = share_class::risk_weight_denominator() as u64;
        let junior_coverage = 20 * risk_denominator / 100;
        let senior_coverage = 80 * risk_denominator / 100;

        let (junior_share, junior_mint_ref, second_junior_mint_ref) =
            create_share(
                facility_address,
                b"junior",
                admin_whitelist,
                holder_whitelist,
                0,
                junior_coverage
            );
        let (senior_share, senior_mint_ref, second_senior_mint_ref) =
            create_share(
                facility_address,
                b"senior",
                admin_whitelist,
                holder_whitelist,
                senior_coverage,
                risk_denominator
            );
        let exchange = setup_test_exchange(admin, &facility_cr, attestors_whitelist);
        add_mint_ref(admin, exchange, junior_mint_ref);
        add_mint_ref(admin, exchange, senior_mint_ref);

        TestState {
            owner: signer::address_of(admin),
            admin_whitelist,
            holder_whitelist,
            attestors_whitelist,
            facility_core,
            exchange,
            senior_share,
            junior_share,
            senior_mint_ref: second_senior_mint_ref,
            junior_mint_ref: second_junior_mint_ref,
            underlying_fa: metadata,
            mint_ref
        }
    }

    #[test_only]
    fun mint_senior_to(
        test_state: &TestState, wallet: address, amount: u64
    ) {
        let admin_signer = account::create_signer_for_test(@lucid);
        passthrough_token::toggle_unlocked(&admin_signer, test_state.senior_share, true);
        let fa = share_class::mint_with_ref(&test_state.senior_mint_ref, amount);
        primary_fungible_store::deposit(wallet, fa);
        passthrough_token::toggle_unlocked(&admin_signer, test_state.senior_share, false);
    }

    #[test_only]
    fun mint_junior_to(
        test_state: &TestState, wallet: address, amount: u64
    ) {
        let admin_signer = account::create_signer_for_test(@lucid);
        passthrough_token::toggle_unlocked(&admin_signer, test_state.junior_share, true);
        let fa = share_class::mint_with_ref(&test_state.junior_mint_ref, amount);
        primary_fungible_store::deposit(wallet, fa);
        passthrough_token::toggle_unlocked(&admin_signer, test_state.junior_share, false);
    }

    #[test(admin = @lucid)]
    fun test_can_successfully_purchase_senior_share(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);

        // Add test wallet to holder whitelist
        whitelist::toggle(
            &admin,
            test_state.holder_whitelist,
            @0xdead,
            true
        );

        // Set NAV for senior share before starting exchange
        let attestor = account::create_signer_for_test(@0xbeef);
        whitelist::toggle(
            &admin,
            test_state.attestors_whitelist,
            @0xbeef,
            true
        );
        attest_nav(
            &attestor,
            test_state.exchange,
            1,
            1000000000000000
        );

        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        // Create purchase amount FA
        let fa = fungible_asset::mint(&test_state.mint_ref, 100);
        let share_amount =
            attempt_purchase(
                test_state.exchange,
                fa,
                test_state.senior_share,
                @0xdead,
                0,
                false
            );
        assert!(share_amount > 0, 0);
        assert!(
            primary_fungible_store::balance(@0xdead, test_state.senior_share)
                == share_amount,
            1
        );
    }

    #[test(admin = @lucid)]
    #[expected_failure(abort_code = EINSUFFICIENT_OUTPUT)]
    fun test_attempt_purchase_fails_minimum_shares(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);

        // Add test wallet to holder whitelist
        whitelist::toggle(
            &admin,
            test_state.holder_whitelist,
            @0xdead,
            true
        );

        // Set NAV for senior share before starting exchange
        let attestor = account::create_signer_for_test(@0xbeef);
        whitelist::toggle(
            &admin,
            test_state.attestors_whitelist,
            @0xbeef,
            true
        );
        attest_nav(
            &attestor,
            test_state.exchange,
            1,
            1000000000000000
        );

        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        // Create purchase amount FA
        let fa = fungible_asset::mint(&test_state.mint_ref, 100);
        attempt_purchase(
            test_state.exchange,
            fa,
            test_state.senior_share,
            @0xdead,
            1000000, // Unreasonably high minimum shares
            false
        );
    }

    #[test(admin = @lucid)]
    #[expected_failure(abort_code = EINCORRECT_FA)]
    fun test_attempt_purchase_fails_incorrect_fa(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);

        // Add test wallet to holder whitelist
        whitelist::toggle(
            &admin,
            test_state.holder_whitelist,
            @0xdead,
            true
        );

        // Set NAV for senior share before starting exchange
        let attestor = account::create_signer_for_test(@0xbeef);
        whitelist::toggle(
            &admin,
            test_state.attestors_whitelist,
            @0xbeef,
            true
        );
        attest_nav(
            &attestor,
            test_state.exchange,
            1,
            1000000000000000
        );

        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        // Create different FA type
        let other_signer = account::create_signer_for_test(@0xfff);
        let (_, wrong_metadata, wrong_mint_ref) =
            utils::create_test_token(&other_signer, option::none());
        let wrong_fa = fungible_asset::mint(&wrong_mint_ref, 100);

        attempt_purchase(
            test_state.exchange,
            wrong_fa,
            test_state.senior_share,
            @0xdead,
            0,
            false
        );
    }

    #[test(admin = @lucid)]
    fun test_attempt_purchase_with_escrow(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange, EscrowedCommitment {
        let test_state = setup_test(&admin);

        // Add test wallet to holder whitelist
        whitelist::toggle(
            &admin,
            test_state.holder_whitelist,
            @0xdead,
            true
        );

        // Set NAV for senior share before starting exchange
        let attestor = account::create_signer_for_test(@0xbeef);
        whitelist::toggle(
            &admin,
            test_state.attestors_whitelist,
            @0xbeef,
            true
        );
        attest_nav(
            &attestor,
            test_state.exchange,
            1,
            1000000000000000
        );

        // Add rule that forces escrow
        let rules = vector::singleton(
            create_require_explicit_approval_rule(option::none())
        );
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            rules,
            vector::empty()
        );

        // Create purchase amount FA
        let fa = fungible_asset::mint(&test_state.mint_ref, 100);
        let share_amount =
            attempt_purchase(
                test_state.exchange,
                fa,
                test_state.senior_share,
                @0xdead,
                0,
                true // Allow escrow
            );

        // Verify shares are not minted but pending in escrow
        assert!(share_amount > 0, 0);
        assert!(primary_fungible_store::balance(@0xdead, test_state.senior_share) == 0, 1);

        let active_exchange = test_active_exchange(&test_state);
        let stats = vector::borrow(&active_exchange.details_per_class, 1);
        assert!(stats.pending_raised == 100, 2);
        assert!(stats.to_mint == share_amount, 3);

        // Verify escrow created
        let events = event::emitted_events<EscrowCommitmentMade>();
        assert!(vector::length(&events) == 1, 4);
        let event = vector::borrow(&events, 0);
        assert!(
            event.exchange_address == object::object_address(&test_state.exchange), 5
        );
        assert!(event.share_index == 1, 6);
        assert!(event.amount_committed == 100, 7);
        assert!(event.amount_expected == share_amount, 8);
        assert!(event.purchaser == @0xdead, 9);

        let escrow_address = event.escrow_address;
        assert!(exists<EscrowedCommitment>(escrow_address), 10);
        let escrow_commitment = borrow_global<EscrowedCommitment>(escrow_address);
        assert!(escrow_commitment.amount_expected == share_amount, 12);

        let escrow_store = object::address_to_object<FungibleStore>(escrow_address);
        let escrow_balance = fungible_asset::balance(escrow_store);
        assert!(escrow_balance == 100, 14);
        assert!(object::owner(escrow_store) == @0xdead, 15);
    }

    #[test_only]
    fun set_contributions_for_test(
        test_state: &TestState, junior: u64, senior: u64
    ) {
        share_class::set_amount_contributed_for_test(test_state.junior_share, junior);
        share_class::set_amount_contributed_for_test(test_state.senior_share, senior);
    }

    #[test(admin = @lucid)]
    fun test_passes_validation(admin: signer) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_minimum_fundraise_amount_rule(100, option::some(0));
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 0, @lucid, 100);
        assert!(result == VALID, 0);
    }

    #[test(admin = @lucid)]
    fun test_can_escrow_if_below_min_fundraise_amount(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_minimum_fundraise_amount_rule(100, option::some(0));
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 0, @lucid, 90);
        assert!(result == CAN_ESCROW, result);
    }

    #[test(admin = @lucid)]
    fun test_passes_mint_cap_validation(admin: signer) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_mint_cap_rule(100, 0);
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 0, @lucid, 100);
        assert!(result == VALID, result);
    }

    #[test(admin = @lucid)]
    #[expected_failure(abort_code = EEXCEEDS_MINT_CAP)]
    fun test_fails_mint_cap_validation_when_minted_exceeds_cap(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_mint_cap_rule(100, 0);
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let active_exchange_details = vector::borrow_mut(
            &mut active_exchange.details_per_class, 0
        );
        active_exchange_details.minted = 101;

        check_validity(&rule, exchange, active_exchange, 0, @lucid, 101);
    }

    #[test(admin = @lucid)]
    #[expected_failure(abort_code = EEXCEEDS_MINT_CAP)]
    fun test_fails_mint_cap_validation_when_to_mint_exceeds_cap(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_mint_cap_rule(100, 0);
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let active_exchange_details = vector::borrow_mut(
            &mut active_exchange.details_per_class, 0
        );
        active_exchange_details.to_mint = 101;

        check_validity(&rule, exchange, active_exchange, 0, @lucid, 101);
    }

    #[test(admin = @lucid)]
    #[expected_failure(abort_code = EEXCEEDS_MINT_CAP)]
    fun test_fails_mint_cap_validation_when_to_mint_and_minted_exceeds_cap(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_mint_cap_rule(100, 0);
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let active_exchange_details = vector::borrow_mut(
            &mut active_exchange.details_per_class, 0
        );
        active_exchange_details.to_mint = 51;
        active_exchange_details.minted = 50;

        check_validity(&rule, exchange, active_exchange, 0, @lucid, 101);
    }

    #[test(admin = @lucid)]
    fun test_explicit_approval_enforces_auto_escrow(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_require_explicit_approval_rule(option::some(0));
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 0, @lucid, 100);
        assert!(result == CAN_ESCROW, result);
    }

    #[test(admin = @lucid)]
    fun test_explicit_approval_enforces_auto_escrow_if_share_index_none(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_require_explicit_approval_rule(option::none());
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result_1 = check_validity(&rule, exchange, active_exchange, 0, @lucid, 100);
        assert!(result_1 == CAN_ESCROW, result_1);

        let result_2 = check_validity(&rule, exchange, active_exchange, 1, @lucid, 100);
        assert!(result_2 == CAN_ESCROW, result_2);
    }

    #[test(admin = @lucid)]
    fun test_explicit_approval_does_not_enforce_auto_escrow_if_share_index_does_not_match(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        let rule = create_require_explicit_approval_rule(option::some(0));
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 1, @lucid, 100);
        assert!(result == VALID, result);
    }

    #[test(admin = @lucid)]
    fun test_enforce_share_weights_approves_junior_share(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );
        set_contributions_for_test(&test_state, 19, 80);

        let rule = create_enforce_share_weights_rule();
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 1, @lucid, 100);
        assert!(result == VALID, result);
    }

    #[test(admin = @lucid)]
    fun test_enforce_share_weights_fails_senior_if_not_enough_junior_minted(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );
        set_contributions_for_test(&test_state, 19, 80);

        let rule = create_enforce_share_weights_rule();
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 0, @lucid, 1);
        assert!(result == VALID, result);
    }

    #[test(admin = @lucid)]
    fun test_enforce_share_weights_passes_if_junior_minted_exceeds_coverage(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );
        set_contributions_for_test(&test_state, 20, 80);

        let rule = create_enforce_share_weights_rule();
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(&rule, exchange, active_exchange, 0, @lucid, 100);
        assert!(result == VALID, result);
    }

    #[test(admin = @lucid)]
    fun test_max_ownership_passes_if_below_threshold(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );
        mint_senior_to(&test_state, @0xbeef, 100);
        mint_senior_to(&test_state, @0xdead, 100);

        let rule = create_max_ownership_rule(51, 100, 0);
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        let result = check_validity(
            &rule,
            exchange,
            active_exchange,
            0,
            @0xdead,
            100
        );
        assert!(result == VALID, result);
    }

    #[test(admin = @lucid)]
    #[expected_failure(abort_code = EMAX_OWNERSHIP_EXCEEDED)]
    fun test_max_ownership_fails_if_above_threshold(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );
        mint_senior_to(&test_state, @0xbeef, 48);
        mint_senior_to(&test_state, @0xdead, 52);

        let dead_balance =
            primary_fungible_store::balance(@0xdead, test_state.senior_share);
        let rule = create_max_ownership_rule(51, 100, 1);
        let exchange = test_exchange(&test_state);
        let active_exchange = test_active_exchange(&test_state);
        check_validity(
            &rule,
            exchange,
            active_exchange,
            1,
            @0xdead,
            100
        );
    }

    #[test(admin = @lucid)]
    #[expected_failure(abort_code = ESHARE_NOT_FOUND)]
    fun test_attempt_purchase_fails_invalid_share(
        admin: signer
    ) acquires ShareExchangeBase, ActiveExchange {
        let test_state = setup_test(&admin);
        start_exchange(
            &admin,
            test_state.exchange,
            1,
            option::none(),
            vector::empty(),
            vector::empty()
        );

        // Create different share class not added to exchange
        let (wrong_share, _, _) =
            create_share(
                object::object_address(&test_state.facility_core),
                b"wrong",
                test_state.admin_whitelist,
                test_state.holder_whitelist,
                0,
                100
            );

        let fa = fungible_asset::mint(&test_state.mint_ref, 100);
        attempt_purchase(
            test_state.exchange,
            fa,
            wrong_share,
            @0xdead,
            0,
            false
        );
    }
}
