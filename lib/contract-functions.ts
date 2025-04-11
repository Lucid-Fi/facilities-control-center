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
  name: string;
  description: string;
  params: FunctionParam[];
  isEntry: boolean;
}

export const contractFunctions: ContractFunction[] = [
  {
    title: "Setup Test Facility",
    name: "roda_test_harness::setup_test_facility",
    description: "Set up a test facility with default parameters",
    isEntry: true,
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
    name: "roda_test_harness::setup_test_facility_with_seed",
    description: "Set up a test facility with a custom seed prefix",
    isEntry: true,
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
    name: "roda_test_harness::update_attested_borrowing_base_value",
    description: "Update the attested borrowing base value",
    isEntry: true,
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
    name: "roda_test_harness::execute_interest_waterfall",
    description: "Execute the interest waterfall process for a time period",
    isEntry: true,
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
    name: "roda_test_harness::simulate_loan_payment",
    description: "Simulate a loan payment with principal and interest",
    isEntry: true,
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
    name: "roda_test_harness::contribute_principal",
    description: "Contribute principal to a share",
    isEntry: true,
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
    name: "roda_test_harness::request_capital_call",
    description: "Request a capital call as the originator",
    isEntry: true,
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
    name: "roda_test_harness::run_principal_waterfall",
    description: "Run the principal waterfall process",
    isEntry: true,
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
];

// Utility for tracking transaction status
export interface TransactionStatus {
  status: "idle" | "pending" | "success" | "error";
  message: string;
  txHash?: string;
}
