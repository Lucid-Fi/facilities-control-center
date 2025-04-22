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
  actor?: string;
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
    actor: "tester",
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
    actor: "tester",
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
    title: "Setup Test Facility and Loan Book",
    actor: "tester",
    moduleName: "roda_test_harness",
    functionName: "setup_zvt_facility_internal_with_seed",
    description:
      "Set up a test facility with a custom seed prefix and loan book",
    isEntry: true,
    tags: ["setup", "facility", "initialization", "custom-seed", "loan-book"],
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
    actor: "fund-manager",
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
    actor: "fund-manager",
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
    actor: "tester",
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
    actor: "tester",
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
    actor: "originator",
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
    actor: "fund-manager",
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
    actor: "originator",
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
    actor: "tester",
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
  {
    title: "Exchange ZVT for USDT",
    actor: "originator",
    moduleName: "token_exchanger",
    functionName: "exchange",
    description: "Exchange tokens using the single token exchanger",
    isEntry: true,
    tags: ["token", "exchange", "principal"],
    params: [
      {
        name: "exchanger",
        type: "address",
        description: "The single token exchanger object address",
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
    title: "Attest NAV",
    actor: "fund-manager",
    moduleName: "share_exchange",
    functionName: "attest_nav",
    description: "Attest to the Net Asset Value (NAV) for a specific share",
    isEntry: true,
    tags: ["share", "nav", "attestation"],
    params: [
      {
        name: "exchange",
        type: "address",
        description: "The share exchange object address",
      },
      {
        name: "share_index",
        type: "u64",
        description: "Index of the share",
      },
      {
        name: "nav",
        type: "u64",
        description: "Net Asset Value to attest",
      },
    ],
  },
  {
    title: "Force Approve Escrow",
    actor: "fund-manager",
    moduleName: "share_exchange",
    functionName: "force_approve_escrow",
    description: "Force approve an escrowed commitment",
    isEntry: true,
    tags: ["escrow", "approval", "commitment"],
    params: [
      {
        name: "escrow",
        type: "address",
        description: "The escrowed commitment object address",
      },
    ],
  },
  {
    title: "Set Period",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_period",
    description: "Set the period for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "period", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "start_timestamp",
        type: "u64",
        description: "Start timestamp for the period",
      },
      {
        name: "end_timestamp",
        type: "u64",
        description: "End timestamp for the period",
      },
    ],
  },
  {
    title: "Set Min Utilization Timestamp",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_min_utilization_timestamp",
    description: "Set the minimum utilization timestamp for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "utilization", "timestamp", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "min_utilization_timestamp",
        type: "u64",
        description: "Minimum utilization timestamp",
      },
    ],
  },
  {
    title: "Set Min Utilization",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_min_utilization",
    description: "Set the minimum utilization for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "utilization", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "min_utilization",
        type: "u64",
        description: "Minimum utilization value",
      },
    ],
  },
  {
    title: "Set Default Penalty Interest",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_default_penalty_interest",
    description: "Set the default penalty interest for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "penalty", "interest", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "default_penalty_interest",
        type: "u64",
        description: "Default penalty interest value",
      },
    ],
  },
  {
    title: "Set Min Interest Deficit",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_min_interest_deficit",
    description: "Set the minimum interest deficit for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "interest", "deficit", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "min_interest_deficit",
        type: "u64",
        description: "Minimum interest deficit value",
      },
    ],
  },
  {
    title: "Set Min Util Interest Deficit",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_min_util_interest_deficit",
    description:
      "Set the minimum utilization interest deficit for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "utilization", "interest", "deficit", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "min_util_interest_deficit",
        type: "u64",
        description: "Minimum utilization interest deficit value",
      },
    ],
  },
  {
    title: "Set Default Penalty Deficit",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_default_penalty_deficit",
    description: "Set the default penalty deficit for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "penalty", "deficit", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "default_penalty_deficit",
        type: "u64",
        description: "Default penalty deficit value",
      },
    ],
  },
  {
    title: "Set Is In Default",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_is_in_default",
    description: "Set the default status for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "default", "status", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "is_in_default",
        type: "boolean",
        description: "Default status flag",
      },
    ],
  },
  {
    title: "Set Is Early Close",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_is_early_close",
    description: "Set the early close status for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "early-close", "status", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "is_early_close",
        type: "boolean",
        description: "Early close status flag",
      },
    ],
  },
  {
    title: "Set Early Close Penalty",
    actor: "fund-manager",
    moduleName: "roda_waterfall",
    functionName: "set_early_close_penalty",
    description: "Set the early close penalty for a RODA waterfall",
    isEntry: true,
    tags: ["waterfall", "early-close", "penalty", "configuration"],
    params: [
      {
        name: "roda_waterfall",
        type: "address",
        description: "The RODA waterfall object address",
      },
      {
        name: "early_close_penalty",
        type: "u64",
        description: "Early close penalty value",
      },
    ],
  },
  {
    title: "Create Capital Call Request",
    actor: "originator",
    moduleName: "facility_core",
    functionName: "create_capital_call_request",
    description: "Create a capital call request for a facility",
    isEntry: true,
    tags: ["facility", "capital-call", "request"],
    params: [
      {
        name: "facility",
        type: "address",
        description: "The facility base details object address",
      },
      {
        name: "amount",
        type: "u64",
        description: "Amount for the capital call request",
      },
    ],
  },
  {
    title: "Create Recycle Request",
    actor: "originator",
    moduleName: "facility_core",
    functionName: "create_recycle_request",
    description: "Create a recycle request for a facility",
    isEntry: true,
    tags: ["facility", "recycle", "request"],
    params: [
      {
        name: "facility",
        type: "address",
        description: "The facility base details object address",
      },
      {
        name: "amount",
        type: "u64",
        description: "Amount for the recycle request",
      },
    ],
  },
  {
    title: "Respond To Capital Call Request",
    actor: "fund-manager",
    moduleName: "facility_core",
    functionName: "respond_to_capital_call_request",
    description: "Respond to a capital call request for a facility",
    isEntry: true,
    tags: ["facility", "capital-call", "response"],
    params: [
      {
        name: "facility",
        type: "address",
        description: "The facility base details object address",
      },
      {
        name: "approved_amount",
        type: "u64",
        description: "Approved amount for the capital call request",
      },
    ],
  },
  {
    title: "Respond To Recycle Request",
    actor: "fund-manager",
    moduleName: "facility_core",
    functionName: "respond_to_recycle_request",
    description: "Respond to a recycle request for a facility",
    isEntry: true,
    tags: ["facility", "recycle", "response"],
    params: [
      {
        name: "facility",
        type: "address",
        description: "The facility base details object address",
      },
      {
        name: "approved_amount",
        type: "u64",
        description: "Approved amount for the recycle request",
      },
    ],
  },
  {
    title: "Create Whitelist",
    actor: "admin",
    moduleName: "whitelist",
    functionName: "create_whitelist",
    description: "Create a new named whitelist object.",
    isEntry: true,
    tags: ["whitelist", "create", "admin"],
    params: [
      {
        name: "name",
        type: "String",
        description: "The name for the new whitelist.",
      },
    ],
  },
  {
    title: "Toggle Whitelist Member Status",
    actor: "admin",
    moduleName: "whitelist",
    functionName: "toggle",
    description: "Add or remove an address from a whitelist.",
    isEntry: true,
    tags: ["whitelist", "member", "toggle", "admin"],
    params: [
      {
        name: "whitelist_obj",
        type: "address",
        description: "The whitelist object address.",
      },
      {
        name: "new_address",
        type: "address",
        description: "The address to add or remove.",
      },
      {
        name: "status",
        type: "boolean",
        description: "True to add/whitelist, False to remove/unwhitelist.",
      },
    ],
  },
  {
    title: "Bulk Toggle Whitelist Member Status",
    actor: "admin",
    moduleName: "whitelist",
    functionName: "bulk_toggle",
    description: "Add or remove multiple addresses from a whitelist.",
    isEntry: true,
    tags: ["whitelist", "member", "bulk", "toggle", "admin"],
    params: [
      {
        name: "whitelist_obj",
        type: "address",
        description: "The whitelist object address.",
      },
      {
        name: "new_addresses",
        type: "String", // Representing vector<address>
        description:
          "Comma-separated or JSON array of addresses to add or remove.",
      },
      {
        name: "status",
        type: "boolean",
        description: "True to add/whitelist, False to remove/unwhitelist.",
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
