module lucid::time_series_tracker {
    use std::vector;
    use std::option::{Self, Option};

    use aptos_framework::timestamp;

    struct TimeSeriesTracker<T> has store, copy, drop {
        values: vector<T>,
        timestamps: vector<u64>
    }

    public fun empty<T>(): TimeSeriesTracker<T> {
        TimeSeriesTracker {
            values: vector[],
            timestamps: vector[]
        }
    }

    public fun singleton<T>(value: T, timestamp: u64): TimeSeriesTracker<T> {
        let values = vector::empty<T>();
        let timestamps = vector::empty<u64>();
        vector::push_back(&mut values, value);
        vector::push_back(&mut timestamps, timestamp);

        TimeSeriesTracker { values, timestamps }
    }

    public fun destroy<T>(tracker: TimeSeriesTracker<T>): (vector<T>, vector<u64>) {
        let TimeSeriesTracker { values, timestamps } = tracker;
        (values, timestamps)
    }

    public fun get_parts<T>(tracker: &TimeSeriesTracker<T>): (&vector<T>, &vector<u64>) {
        (&tracker.values, &tracker.timestamps)
    }

    public fun get_values<T>(tracker: &TimeSeriesTracker<T>): &vector<T> {
        &tracker.values
    }

    public fun get_timestamps<T>(tracker: &TimeSeriesTracker<T>): &vector<u64> {
        &tracker.timestamps
    }

    public fun add_value<T>(
        tracker: &mut TimeSeriesTracker<T>, value: T, timestamp: Option<u64>
    ) {
        let timestamp =
            option::destroy_with_default(timestamp, timestamp::now_microseconds());
        vector::push_back(&mut tracker.values, value);
        vector::push_back(&mut tracker.timestamps, timestamp);
    }

    public inline fun compact<T>(
        tracker: &mut TimeSeriesTracker<T>,
        initial: T,
        reduce: |T, T| T
    ) {
        if (vector::length(&tracker.values) > 0) {
            let latest_timestamp =
                *vector::borrow(
                    &tracker.timestamps, vector::length(&tracker.timestamps) - 1
                );
            let new_value = vector::fold(
                tracker.values,
                initial,
                |acc, el| reduce(acc, el)
            );

            tracker.values = vector::empty();
            tracker.timestamps = vector::empty();
            vector::push_back(&mut tracker.values, new_value);
            vector::push_back(&mut tracker.timestamps, latest_timestamp);
        };
    }

    /// Compact the time series tracker into a new time series tracker.
    /// This avoids a copy of the values and timestamps.
    public inline fun compact_into<T>(
        tracker: TimeSeriesTracker<T>,
        initial: T,
        reduce: |T, T| T
    ): TimeSeriesTracker<T> {
        if (vector::length(&tracker.values) > 0) {
            let TimeSeriesTracker { values, timestamps } = tracker;
            let latest_timestamp =
                *vector::borrow(&timestamps, vector::length(&timestamps) - 1);
            let new_value = vector::fold(values, initial, |acc, el| reduce(acc, el));

            let new_values = vector::empty();
            let new_timestamps = vector::empty();

            vector::push_back(&mut new_values, new_value);
            vector::push_back(&mut new_timestamps, latest_timestamp);

            TimeSeriesTracker { values: new_values, timestamps: new_timestamps }
        } else {
            tracker
        }
    }

    public inline fun fold<T, R>(
        tracker: &TimeSeriesTracker<T>,
        initial: R,
        reduce: |R, &T, &u64| R
    ): R {
        let i = 0;
        let acc = initial;
        while (i < vector::length(&tracker.values)) {
            acc = reduce(
                acc,
                vector::borrow(&tracker.values, i),
                vector::borrow(&tracker.timestamps, i)
            );
            i = i + 1;
        };

        acc
    }

    #[test_only]
    use lucid::utils;

    #[test]
    fun test_empty() {
        utils::initialize_timestamp();
        let tracker = empty<u64>();
        assert!(vector::length(get_values(&tracker)) == 0, 0);
        assert!(vector::length(get_timestamps(&tracker)) == 0, 1);
    }

    #[test]
    fun test_add_value() {
        // Initialize the timestamp for testing with the account that has authorization
        utils::initialize_timestamp();
        let current_time = 1000000;
        timestamp::update_global_time_for_test_secs(current_time);

        let tracker = empty<u64>();

        // Add with explicit timestamp
        add_value(&mut tracker, 10, option::some(500));
        assert!(*vector::borrow(get_values(&tracker), 0) == 10, 0);
        assert!(*vector::borrow(get_timestamps(&tracker), 0) == 500, 1);

        // Add with default timestamp (current time)
        add_value(&mut tracker, 20, option::none());
        assert!(*vector::borrow(get_values(&tracker), 1) == 20, 2);
        assert!(
            *vector::borrow(get_timestamps(&tracker), 1) == current_time * 1000000,
            3
        );
    }

    #[test]
    fun test_compact() {
        utils::initialize_timestamp();
        let tracker = empty<u64>();
        add_value(&mut tracker, 10, option::some(100));
        add_value(&mut tracker, 20, option::some(200));
        add_value(&mut tracker, 30, option::some(300));

        compact(&mut tracker, 0, |acc, val| acc + val);

        // Should be compacted to a single value (10 + 20 + 30 = 60)
        assert!(vector::length(get_values(&tracker)) == 1, 0);
        assert!(*vector::borrow(get_values(&tracker), 0) == 60, 1);

        // Timestamp should be the latest one
        assert!(*vector::borrow(get_timestamps(&tracker), 0) == 300, 2);
    }

    #[test]
    fun test_compact_empty() {
        utils::initialize_timestamp();
        let tracker = empty<u64>();

        // Compacting an empty tracker should not change it
        compact(&mut tracker, 0, |acc, val| acc + val);

        assert!(vector::length(get_values(&tracker)) == 0, 0);
        assert!(vector::length(get_timestamps(&tracker)) == 0, 1);
    }

    #[test]
    fun test_compact_into() {
        utils::initialize_timestamp();
        let tracker = empty<u64>();
        add_value(&mut tracker, 10, option::some(100));
        add_value(&mut tracker, 20, option::some(200));
        add_value(&mut tracker, 30, option::some(300));

        let compacted = compact_into(tracker, 0, |acc, val| acc + val);

        // Should be compacted to a single value (10 + 20 + 30 = 60)
        assert!(vector::length(get_values(&compacted)) == 1, 0);
        assert!(*vector::borrow(get_values(&compacted), 0) == 60, 1);

        // Timestamp should be the latest one
        assert!(*vector::borrow(get_timestamps(&compacted), 0) == 300, 2);
    }

    #[test]
    fun test_compact_into_empty() {
        utils::initialize_timestamp();
        let tracker = empty<u64>();
        let compacted = compact_into(tracker, 0, |acc, val| acc + val);

        // Compacting an empty tracker should return the original
        assert!(vector::length(get_values(&compacted)) == 0, 0);
        assert!(vector::length(get_timestamps(&compacted)) == 0, 1);
    }

    #[test]
    fun test_fold() {
        utils::initialize_timestamp();
        let tracker = empty<u64>();
        add_value(&mut tracker, 10, option::some(100));
        add_value(&mut tracker, 20, option::some(200));
        add_value(&mut tracker, 30, option::some(300));

        // Sum of all values
        let sum = fold(&tracker, 0, |acc, val, _ts| acc + *val);
        assert!(sum == 60, 0);

        // Sum of values weighted by timestamp
        let weighted_sum = fold(&tracker, 0, |acc, val, ts| acc + (*val * *ts));
        assert!(weighted_sum == (10 * 100 + 20 * 200 + 30 * 300), 1);

        // Count items with timestamp > 150
        let count = fold(
            &tracker,
            0,
            |acc, _val, ts| acc + if (*ts > 150) { 1 }
            else { 0 }
        );
        assert!(count == 2, 2);
    }

    #[test]
    fun test_fold_empty() {
        utils::initialize_timestamp();
        let tracker = empty<u64>();
        let sum = fold(&tracker, 0, |acc, val, _ts| acc + *val);
        assert!(sum == 0, 0);
    }
}
