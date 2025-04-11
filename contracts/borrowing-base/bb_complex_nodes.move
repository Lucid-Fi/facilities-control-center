module lucid::bb_complex_nodes {
    use std::vector;
    use std::option;

    use lucid::utils;
    use lucid::bb_flags;

    const E_ADVANCE_RATE_INVALID_CHILDREN_COUNT: u64 = 1;
    const E_INVALID_NODE_TYPE: u64 = 2;
    const E_BINARY_OPERATOR_INVALID_CHILDREN_COUNT: u64 = 3;

    enum BinaryOperator has store, copy, drop {
        Add,
        Subtract,
        Multiply,
        Divide
    }

    struct SimpleAdvanceRateNode has store, copy, drop {
        numerator: u128,
        denominator: u128
    }

    enum ComplexNode has store, copy, drop {
        SimpleAdvanceRate(SimpleAdvanceRateNode),
        BinaryOperator(BinaryOperator)
    }

    public fun create_simple_advance_rate_node(
        numerator: u128, denominator: u128
    ): ComplexNode {
        ComplexNode::SimpleAdvanceRate(SimpleAdvanceRateNode { numerator, denominator })
    }

    public fun create_addition_node(): ComplexNode {
        ComplexNode::BinaryOperator(BinaryOperator::Add)
    }

    public fun create_subtraction_node(): ComplexNode {
        ComplexNode::BinaryOperator(BinaryOperator::Subtract)
    }

    public fun create_multiplication_node(): ComplexNode {
        ComplexNode::BinaryOperator(BinaryOperator::Multiply)
    }

    public fun create_division_node(): ComplexNode {
        ComplexNode::BinaryOperator(BinaryOperator::Divide)
    }

    public fun extract_simple_advance_rate_node(node: &ComplexNode): &SimpleAdvanceRateNode {
        match(node) {
            ComplexNode::SimpleAdvanceRate(node) => node,
            _ => abort E_INVALID_NODE_TYPE
        }
    }

    fun evaluate_simple_advance_rate_node(
        node: &SimpleAdvanceRateNode, children: &vector<u64>, flag: u256
    ): u64 {
        assert!(vector::length(children) == 1, E_ADVANCE_RATE_INVALID_CHILDREN_COUNT);
        let numerator = node.numerator;
        let denominator = node.denominator;
        let value = (*vector::borrow(children, 0)) as u128;

        if (bb_flags::is_ignore_advance_rate(flag)) {
            value as u64
        } else {
            ((numerator * value) / denominator) as u64
        }
    }

    fun evaluate_binary_operator_node(
        node: &BinaryOperator, children: &vector<u64>
    ): u64 {
        assert!(vector::length(children) > 0, E_BINARY_OPERATOR_INVALID_CHILDREN_COUNT);

        match(node) {
            BinaryOperator::Add => utils::vector_reduce(children, |acc, value| acc + value) as u64,
            BinaryOperator::Subtract => utils::vector_reduce(
                children, |acc, value| acc - value
            ) as u64,
            BinaryOperator::Multiply => utils::vector_reduce(
                children, |acc, value| acc * value
            ) as u64,
            BinaryOperator::Divide => utils::vector_reduce(
                children, |acc, value| acc / value
            ) as u64
        }
    }

    public fun evaluate(
        node: &ComplexNode, children: &vector<u64>, flag: u256
    ): u64 {
        match(node) {
            ComplexNode::SimpleAdvanceRate(node) => evaluate_simple_advance_rate_node(
                node, children, flag
            ),
            ComplexNode::BinaryOperator(operation) => evaluate_binary_operator_node(
                operation, children
            )
        }
    }

    public fun max_children_count(node: &ComplexNode): option::Option<u64> {
        match(node) {
            ComplexNode::SimpleAdvanceRate(_) => option::some(1),
            ComplexNode::BinaryOperator(_) => option::none()
        }
    }

    #[test(signer = @lucid)]
    public fun test_evaluate_simple_advance_rate_node(signer: signer) {
        let node = create_simple_advance_rate_node(50, 100); // 50% advance rate
        let children = vector::singleton(1000);
        let result = evaluate(&node, &children, 0);
        assert!(result == 500, result); // 50% of 1000 = 500
    }

    #[test(signer = @lucid)]
    public fun test_can_ignore_advance_rate(signer: signer) {
        let node = create_simple_advance_rate_node(50, 100); // 50% advance rate
        let children = vector::singleton(1000);
        let result = evaluate(&node, &children, bb_flags::ignore_advance_rate());
        assert!(result == 1000, result); // 50% of 1000 = 500
    }

    #[test(signer = @lucid)]
    #[expected_failure(abort_code = E_ADVANCE_RATE_INVALID_CHILDREN_COUNT)]
    public fun test_simple_advance_rate_node_fails_with_no_children(
        signer: signer
    ) {
        let node = create_simple_advance_rate_node(50, 100);
        let children = vector::empty<u64>();
        evaluate(&node, &children, 0);
    }

    #[test(signer = @lucid)]
    public fun test_evaluate_binary_operator_add(signer: signer) {
        let node = create_addition_node();
        let children = vector::empty();
        vector::push_back(&mut children, 100);
        vector::push_back(&mut children, 200);
        vector::push_back(&mut children, 300);
        let result = evaluate(&node, &children, 0);
        assert!(result == 600, result); // 100 + 200 + 300 = 600
    }

    #[test(signer = @lucid)]
    public fun test_evaluate_binary_operator_subtract(signer: signer) {
        let node = create_subtraction_node();
        let children = vector::empty();
        vector::push_back(&mut children, 1000);
        vector::push_back(&mut children, 300);
        vector::push_back(&mut children, 200);
        let result = evaluate(&node, &children, 0);
        assert!(result == 500, result); // 1000 - 300 - 200 = 500
    }

    #[test(signer = @lucid)]
    public fun test_evaluate_binary_operator_multiply(signer: signer) {
        let node = create_multiplication_node();
        let children = vector::empty();
        vector::push_back(&mut children, 2);
        vector::push_back(&mut children, 3);
        vector::push_back(&mut children, 4);
        let result = evaluate(&node, &children, 0);
        assert!(result == 24, result); // 2 * 3 * 4 = 24
    }

    #[test(signer = @lucid)]
    public fun test_evaluate_binary_operator_divide(signer: signer) {
        let node = create_division_node();
        let children = vector::empty();
        vector::push_back(&mut children, 100);
        vector::push_back(&mut children, 2);
        vector::push_back(&mut children, 5);
        let result = evaluate(&node, &children, 0);
        assert!(result == 10, result); // 100 / 2 / 5 = 10
    }

    #[test(signer = @lucid)]
    #[expected_failure(abort_code = E_BINARY_OPERATOR_INVALID_CHILDREN_COUNT)]
    public fun test_binary_operator_fails_with_no_children(signer: signer) {
        let node = create_addition_node();
        let children = vector::empty<u64>();
        evaluate(&node, &children, 0);
    }

    #[test(signer = @lucid)]
    #[expected_failure(abort_code = E_INVALID_NODE_TYPE)]
    public fun test_extract_simple_advance_rate_node_fails_for_wrong_type(
        signer: signer
    ) {
        let node = create_addition_node();
        extract_simple_advance_rate_node(&node);
    }
}
