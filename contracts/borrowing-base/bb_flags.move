module lucid::bb_flags {
    const FLAG_IGNORE_ADVANCE_RATE: u256 = 1;

    public inline fun is_ignore_advance_rate(bit_map: u256): bool {
        (bit_map & FLAG_IGNORE_ADVANCE_RATE) != 0
    }

    public inline fun ignore_advance_rate(): u256 {
        FLAG_IGNORE_ADVANCE_RATE
    }
}
