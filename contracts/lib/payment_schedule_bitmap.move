module lucid::payment_schedule_bitmap {
    const EINVALID_ORDER_BITMAP: u64 = 444;
    const EINVALID_BITMAP_PRIORITY: u64 = 444;

    const FEE: u8 = 1;
    const PRINCIPAL: u8 = 2;
    const INTEREST: u8 = 3;

    const PRINCIPAL_FIRST: u8 = 0x1;
    const PRINCIPAL_SECOND: u8 = 0x2;
    const INTEREST_FIRST: u8 = 0x4;
    const INTEREST_SECOND: u8 = 0x8;
    const FEE_FIRST: u8 = 0x10;
    const FEE_SECOND: u8 = 0x20;

    #[view]
    public fun pif(): u8 {
        PRINCIPAL_FIRST | INTEREST_SECOND
    }

    #[view]
    public fun ifp(): u8 {
        INTEREST_FIRST | FEE_SECOND
    }

    #[view]
    public fun fip(): u8 {
        FEE_FIRST | INTEREST_SECOND
    }

    public fun get_fee_const(): u8 {
        FEE
    }

    public fun get_interest_const(): u8 {
        INTEREST
    }

    public fun get_principal_const(): u8 {
        PRINCIPAL
    }

    public fun pay_intervals_get_first(order_bitmap: u8): u8 {
        if (order_bitmap & PRINCIPAL_FIRST == PRINCIPAL_FIRST) {
            return PRINCIPAL
        };
        if (order_bitmap & INTEREST_FIRST == INTEREST_FIRST) {
            return INTEREST
        };
        if (order_bitmap & FEE_FIRST == FEE_FIRST) {
            return FEE
        };
        abort(EINVALID_ORDER_BITMAP)
    }

    public fun pay_intervals_get_second(order_bitmap: u8): u8 {
        if (order_bitmap & PRINCIPAL_SECOND == PRINCIPAL_SECOND) {
            return PRINCIPAL
        };
        if (order_bitmap & INTEREST_SECOND == INTEREST_SECOND) {
            return INTEREST
        };
        if (order_bitmap & FEE_SECOND == FEE_SECOND) {
            return FEE
        };
        abort(EINVALID_ORDER_BITMAP)
    }

    public fun pay_intervals_get_third(order_bitmap: u8): u8 {
        let first = pay_intervals_get_first(order_bitmap);
        let second = pay_intervals_get_second(order_bitmap);
        return (FEE + INTEREST + PRINCIPAL) - (first + second)
    }

    public fun get_payment_type(bitmap: u8, priority: u8): u8 {
        if (priority == 0) {
            return pay_intervals_get_first(bitmap)
        } else if (priority == 1) {
            return pay_intervals_get_second(bitmap)
        } else if (priority == 2) {
            return pay_intervals_get_third(bitmap)
        };
        abort(EINVALID_BITMAP_PRIORITY)
    }

    const EBITMAP_ORDER_WRONG: u64 = 100;

    #[test]
    fun test_order_bitmap_get_first_principal() {
        //001001 (principal first, interest second)
        let res = pay_intervals_get_first(PRINCIPAL_FIRST | INTEREST_SECOND);
        assert!(res == PRINCIPAL, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_first_interest() {
        //000110 (interest first, principle second)
        let res = pay_intervals_get_first(INTEREST_FIRST | PRINCIPAL_SECOND);
        assert!(res == INTEREST, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_first_fee() {
        //010010 (fee first, principle second)
        let res = pay_intervals_get_first(FEE_FIRST | PRINCIPAL_SECOND);
        assert!(res == FEE, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_second_principal() {
        //000110 (interest first, principle second)
        let res = pay_intervals_get_second(INTEREST_FIRST | PRINCIPAL_SECOND);
        assert!(res == PRINCIPAL, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_second_interest() {
        //011000 (fee first, interest second)
        let res = pay_intervals_get_second(FEE_FIRST | INTEREST_SECOND);
        assert!(res == INTEREST, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_second_fee() {
        //100001 (principle first, fee second)
        let res = pay_intervals_get_second(PRINCIPAL_FIRST | FEE_SECOND);
        assert!(res == FEE, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_third_principal() {
        let order = INTEREST_FIRST | FEE_SECOND;
        let third = pay_intervals_get_third(order);
        assert!(third == PRINCIPAL, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_third_interest() {
        let order = PRINCIPAL_FIRST | FEE_SECOND;
        let third = pay_intervals_get_third(order);
        assert!(third == INTEREST, EBITMAP_ORDER_WRONG);
    }

    #[test]
    fun test_order_bitmap_get_third_fee() {
        //001001 (principle first, interest second, fee third)
        let order = PRINCIPAL_FIRST | INTEREST_SECOND;
        let third = pay_intervals_get_third(order);
        assert!(third == FEE, EBITMAP_ORDER_WRONG);
    }
}
