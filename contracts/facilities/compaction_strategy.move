module lucid::compaction_strategy {
    enum ContributionCompactionStrategy has store, copy, drop {
        Never,
        OnDemand,
        OnInterestPayment
    }

    public fun is_compaction_enabled(
        strategy: ContributionCompactionStrategy
    ): bool {
        strategy != ContributionCompactionStrategy::Never
    }

    public fun compaction_strategy_never(): ContributionCompactionStrategy {
        ContributionCompactionStrategy::Never
    }

    public fun compaction_strategy_on_demand(): ContributionCompactionStrategy {
        ContributionCompactionStrategy::OnDemand
    }

    public fun compaction_strategy_on_interest_payment(): ContributionCompactionStrategy {
        ContributionCompactionStrategy::OnInterestPayment
    }

    public fun should_compact_on_interest_payment(
        strategy: ContributionCompactionStrategy
    ): bool {
        strategy == ContributionCompactionStrategy::OnInterestPayment
    }

    public fun allow_compaction_on_demand(
        strategy: ContributionCompactionStrategy
    ): bool {
        strategy == ContributionCompactionStrategy::OnDemand
    }
}
