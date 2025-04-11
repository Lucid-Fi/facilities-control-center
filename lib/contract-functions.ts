export type ParamType =
  | "u64"
  | "u128"
  | "address"
  | "boolean"
  | "vector<u8>"
  | "String";

export interface FunctionParam {
  name: string;
  type: ParamType;
  description?: string;
}

export interface ContractFunction {
  title: string;
  moduleName: string;
  functionName: string;
  description: string;
  params: FunctionParam[];
  isEntry: boolean;
  tags: string[];
}

export const contractFunctions: ContractFunction[] = [
  {
    title: "Setup Test Facility",
    moduleName: "roda_test_harness",
    functionName: "setup_test_facility",
    description: "Set up a test facility with default parameters",
    isEntry: true,
    tags: ["setup", "facility", "initialization"],
    params: [
      {
        name: "admin",
        type: "address",
        description: "The admin address for the facility",
      },
      {
        name: "originator",
        type: "address",
        description: "The originator address for the facility",
      },
    ],
  },
  {
    title: "Setup Test Facility with Seed",
    moduleName: "roda_test_harness",
    functionName: "setup_test_facility_with_seed",
    description: "Set up a test facility with a custom seed prefix",
    isEntry: true,
    tags: ["setup", "facility", "initialization", "custom-seed"],
    params: [
      {
        name: "admin",
        type: "address",
        description: "The admin address for the facility",
      },
      {
        name: "originator",
        type: "address",
        description: "The originator address for the facility",
      },
      {
        name: "seed_prefix",
        type: "String",
        description: "Custom seed prefix for the facility",
      },
    ],
  },
  {
    title: "Update Attested Borrowing Base Value",
    moduleName: "roda_test_harness",
    functionName: "update_attested_borrowing_base_value",
    description: "Update the attested borrowing base value",
    isEntry: true,
    tags: ["borrowing", "base-value", "update"],
    params: [
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "value",
        type: "u64",
        description: "The new borrowing base value",
      },
    ],
  },
  {
    title: "Execute Interest Waterfall",
    moduleName: "roda_test_harness",
    functionName: "execute_interest_waterfall",
    description: "Execute the interest waterfall process for a time period",
    isEntry: true,
    tags: ["interest", "waterfall", "execution", "time-based"],
    params: [
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "start_time",
        type: "u64",
        description: "Start time in microseconds",
      },
      {
        name: "end_time",
        type: "u64",
        description: "End time in microseconds",
      },
    ],
  },
  {
    title: "Simulate Loan Payment",
    moduleName: "roda_test_harness",
    functionName: "simulate_loan_payment",
    description: "Simulate a loan payment with principal and interest",
    isEntry: true,
    tags: ["loan", "payment", "simulation", "principal", "interest"],
    params: [
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "principal",
        type: "u64",
        description: "Principal amount to pay",
      },
      {
        name: "interest",
        type: "u64",
        description: "Interest amount to pay",
      },
    ],
  },
  {
    title: "Contribute Principal",
    moduleName: "roda_test_harness",
    functionName: "contribute_principal",
    description: "Contribute principal to a share",
    isEntry: true,
    tags: ["principal", "contribution", "share"],
    params: [
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "share_index",
        type: "u64",
        description: "Index of the share to contribute to",
      },
      {
        name: "amount",
        type: "u64",
        description: "Amount to contribute",
      },
    ],
  },
  {
    title: "Request Capital Call",
    moduleName: "roda_test_harness",
    functionName: "request_capital_call",
    description: "Request a capital call as the originator",
    isEntry: true,
    tags: ["capital-call", "request", "originator"],
    params: [
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "amount",
        type: "u64",
        description: "Amount to request",
      },
    ],
  },
  {
    title: "Run Principal Waterfall",
    moduleName: "roda_test_harness",
    functionName: "run_principal_waterfall",
    description: "Run the principal waterfall process",
    isEntry: true,
    tags: ["principal", "waterfall", "execution", "capital-call"],
    params: [
      {
        name: "attested_borrowing_base",
        type: "u64",
        description: "The attested borrowing base value",
      },
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "requested_amount",
        type: "u64",
        description: "Amount requested for the waterfall",
      },
      {
        name: "fill_capital_call",
        type: "boolean",
        description: "Whether to fill capital call if needed",
      },
    ],
  },
  {
    title: "Exchange Tokens",
    moduleName: "roda_test_harness",
    functionName: "exchange_tokens",
    description:
      "Exchange tokens between source and target amounts with specified principal flag",
    isEntry: true,
    tags: ["token", "exchange", "principal"],
    params: [
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "amount_source",
        type: "u64",
        description: "Source amount for the exchange",
      },
      {
        name: "amount_target",
        type: "u64",
        description: "Target amount for the exchange",
      },
      {
        name: "is_principal",
        type: "boolean",
        description: "Flag indicating if the exchange involves principal",
      },
    ],
  },
  {
    title: "Mint Test Token",
    moduleName: "roda_test_harness",
    functionName: "mint_test_token_to",
    description: "Mint test tokens and deposit them to a specified address",
    isEntry: true,
    tags: ["token", "mint", "test"],
    params: [
      {
        name: "facility_orchestrator",
        type: "address",
        description: "The facility orchestrator object address",
      },
      {
        name: "amount",
        type: "u64",
        description: "Amount of test tokens to mint",
      },
      {
        name: "to",
        type: "address",
        description: "Recipient address for the minted tokens",
      },
    ],
  },
];

// Utility for tracking transaction status
export interface TransactionStatus {
  status: "idle" | "pending" | "success" | "error";
  message: string;
  txHash?: string;
}
