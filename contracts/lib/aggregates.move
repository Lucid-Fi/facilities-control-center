module lucid::aggregates {
    use aptos_framework::timestamp;

    const EDENOMINATOR_IS_ZERO: u64 = 1;
    const ELAST_TIMESTAMP_IS_ZERO: u64 = 2;

    struct TimeWeightedValue has store, drop, copy {
        last_timestamp: u64,
        last_value: u64,
        numerator: u128,
        denominator: u128
    }

    public fun new_time_weighted_value(): TimeWeightedValue {
        let _current_time = timestamp::now_microseconds();

        TimeWeightedValue { last_timestamp: 0, last_value: 0, numerator: 0, denominator: 0 }
    }

    public fun reset_history(aggregate: &mut TimeWeightedValue) {
        aggregate.numerator = 0;
        aggregate.denominator = 0;
    }

    public fun get_time_weighted_value(aggregate: &TimeWeightedValue): u64 {
        let current_time = timestamp::now_microseconds() as u128;
        let elapsed = current_time - (aggregate.last_timestamp as u128);
        let current_weight = elapsed * (aggregate.last_value as u128);

        if (elapsed == 0 && aggregate.denominator == 0) {
            aggregate.last_value
        } else {
            ((current_weight + aggregate.numerator)
                / ((elapsed as u128) + aggregate.denominator)) as u64
        }
    }

    public fun update_time_weighted_value(
        aggregate: &mut TimeWeightedValue, value: u64
    ) {
        let current_time = timestamp::now_microseconds();
        if (!is_new(aggregate)) {
            let elapsed: u128 = (current_time - aggregate.last_timestamp) as u128;
            let last_weight: u128 = (elapsed * (aggregate.last_value as u128)) as u128;

            aggregate.numerator += last_weight;
            aggregate.denominator += elapsed as u128;
        };

        aggregate.last_timestamp = current_time;
        aggregate.last_value = value;
    }

    public fun numerator_time_weighted_value(
        aggregate: &TimeWeightedValue
    ): u128 {
        let current_time = timestamp::now_microseconds() as u128;
        let last_timestamp = aggregate.last_timestamp as u128;
        let last_value = aggregate.last_value as u128;
        let numerator = aggregate.numerator as u128;
        let elapsed: u128 = current_time - last_timestamp;
        let current_weight: u128 = elapsed + last_value;

        (current_weight + numerator) as u128
    }

    fun is_new(aggregate: &TimeWeightedValue): bool {
        aggregate.last_timestamp == 0
    }

    #[test_only]
    use aptos_std::debug::print;

    #[test_only]
    fun setup_test(aptos_framework: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        timestamp::update_global_time_for_test(1);
    }

    #[test_only]
    fun fastforward(forward_us: u64) {
        let current_time = timestamp::now_microseconds();
        let new_time = current_time + forward_us;
        timestamp::update_global_time_for_test(new_time);
    }

    #[test(aptos_framework = @aptos_framework)]
    fun test_simple_single_value(aptos_framework: signer) {
        setup_test(&aptos_framework);
        let aggregate = new_time_weighted_value();

        update_time_weighted_value(&mut aggregate, 10);
        fastforward(1);
        let current_value = get_time_weighted_value(&aggregate);

        assert!(current_value == 10, current_value);
    }

    #[test(aptos_framework = @aptos_framework)]
    fun test_averages_by_equal_weight(aptos_framework: signer) {
        setup_test(&aptos_framework);
        let aggregate = new_time_weighted_value();

        update_time_weighted_value(&mut aggregate, 10);
        fastforward(1);

        update_time_weighted_value(&mut aggregate, 20);
        fastforward(1);

        let current_value = get_time_weighted_value(&aggregate);

        assert!(current_value == 15, current_value);
    }

    #[test(aptos_framework = @aptos_framework)]
    fun test_averages_by_non_equal_weight(aptos_framework: signer) {
        setup_test(&aptos_framework);
        let aggregate = new_time_weighted_value();

        update_time_weighted_value(&mut aggregate, 100);
        fastforward(1);

        update_time_weighted_value(&mut aggregate, 200);
        fastforward(3);

        let current_value = get_time_weighted_value(&aggregate);

        assert!(current_value == 175, current_value);
    }

    #[test(aptos_framework = @aptos_framework)]
    fun test_aggregate_wont_overflow(aptos_framework: signer) {
        setup_test(&aptos_framework);
        let aggregate = new_time_weighted_value();
        let i = 0;
        let max_u64 = 18446744073709551615;
        update_time_weighted_value(&mut aggregate, max_u64);
        fastforward(1);
        update_time_weighted_value(&mut aggregate, max_u64);
        fastforward(max_u64 - 3);

        let current_value = numerator_time_weighted_value(&aggregate);
    }

    #[test(aptos_framework = @aptos_framework)]
    fun test_can_reset_history(aptos_framework: signer) {
        setup_test(&aptos_framework);
        let aggregate = new_time_weighted_value();

        update_time_weighted_value(&mut aggregate, 10);
        fastforward(1);

        update_time_weighted_value(&mut aggregate, 20);
        fastforward(1);

        let current_value = get_time_weighted_value(&aggregate);

        assert!(current_value == 15, current_value);

        reset_history(&mut aggregate);

        let current_value = get_time_weighted_value(&aggregate);

        assert!(current_value == 20, current_value);
    }
}
