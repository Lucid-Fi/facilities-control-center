/**
 * TypeScript type definitions generated from config-manager-service OpenAPI schema
 * @generated from config-manager-api swagger schema
 */

/**
 * API error response
 */
export interface ApiError {
  /** HTTP status code */
  code: number;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * Value type for categorization buckets (can be string or number)
 */
export type BucketValue = string | number;

/**
 * Categorization bucket definitions for reporting
 */
export type HashMap = Record<string, BucketValue[]>;

/**
 * Feature flags for loan books (hybrid variant)
 */
export interface FeatureFlags {
  /** Enable custom late fee calculation */
  has_custom_latefee?: boolean;
  /** Enable automatic payment pull */
  is_autopull?: boolean;
  /** Mark as historical data */
  is_historical?: boolean;
  /** Track external loan IDs */
  is_tracking_external_ids?: boolean;
}

/**
 * Validation flags for loan book operations
 */
export interface ValidationFlags {
  /** Enable principal continuity validation */
  principal_continuity?: boolean;
}

/**
 * Late fee configuration for delinquent linear accrual
 */
export interface DelinquentLinearAccrualLateFee {
  type: 'delinquent_linear_accrual';
  /** Grace period in microseconds before late fees start accruing */
  grace_period_micros: number;
  /** Time period in microseconds for each accrual calculation */
  accrual_period_micros: number;
  /** Numerator for accrual rate per period */
  accrual_per_period_numerator: number;
  /** Denominator for accrual rate per period */
  accrual_per_period_denominator: number;
  /** Maximum number of accrual periods */
  max_periods: number;
}

/**
 * Late fee configuration variants
 */
export type LateFeeConfig = DelinquentLinearAccrualLateFee;

/**
 * Linear risk score scale configuration
 */
export interface LinearRiskScoreScale {
  type: 'linear';
  /** Minimum risk score value */
  min: number;
  /** Maximum risk score value */
  max: number;
}

/**
 * Risk score range and scaling configuration
 */
export type RiskScoreScale = LinearRiskScoreScale;

/**
 * Loan book variant type
 */
export type LoanBookVariant = 'hybrid' | 'zvt_alpha' | 'zvt_beta';

/**
 * Request to create a new staged loan book with minimal required data
 */
export interface CreateStagedLoanBookRequest {
  /** Blockchain address of the loan book */
  loan_book_address: string;
  /** Auto-pledge contract address */
  auto_pledge_address?: string | null;
  /** Categorization bucket definitions for reporting */
  categorization_buckets?: HashMap | null;
  /** Blockchain network name */
  chain?: string | null;
  /** Blockchain network identifier */
  chain_id?: number | null;
  /** Optional notes about completion status */
  completion_notes?: string | null;
  /** ISO country code */
  country_code?: string | null;
  /** Identifier of the user creating this staged loan book */
  created_by?: string | null;
  /** Number of days in a year for interest calculations */
  days_in_year?: number | null;
  /** Default token for transactions */
  default_token?: string | null;
  /** Days past due threshold for default classification */
  dpd_default?: number | null;
  /** Expected number of loan originations per day */
  expected_originations_per_day?: number | null;
  /** Expected number of loan payments per day */
  expected_payments_per_day?: number | null;
  /** Feature toggles for loan book behavior */
  feature_flags?: FeatureFlags | null;
  /** Late fee calculation configuration */
  late_fee_config?: LateFeeConfig | null;
  /** Loan book configuration contract address */
  loan_book_config_address?: string | null;
  /** Type of loan book implementation */
  loan_book_variant?: LoanBookVariant | null;
  /** Optional module address */
  module_address?: string | null;
  /** Optional human-readable name */
  name?: string | null;
  /** Optional organization identifier */
  org_id?: string | null;
  /** Loan originator address */
  originator_address?: string | null;
  /** Risk score range and scaling configuration */
  risk_score_scale?: RiskScoreScale | null;
  /** Optional tenant identifier */
  tenant_id?: string | null;
  /** Validation rules configuration */
  validation_flags?: ValidationFlags | null;
}

/**
 * Request to update an existing staged loan book with partial data
 */
export interface UpdateStagedLoanBookRequest {
  /** Auto-pledge contract address */
  auto_pledge_address?: string | null;
  /** Categorization bucket definitions for reporting */
  categorization_buckets?: HashMap | null;
  /** Blockchain network name */
  chain?: string | null;
  /** Blockchain network identifier */
  chain_id?: number | null;
  /** Optional notes about completion status */
  completion_notes?: string | null;
  /** ISO country code */
  country_code?: string | null;
  /** Number of days in a year for interest calculations */
  days_in_year?: number | null;
  /** Default token for transactions */
  default_token?: string | null;
  /** Days past due threshold for default classification */
  dpd_default?: number | null;
  /** Expected number of loan originations per day */
  expected_originations_per_day?: number | null;
  /** Expected number of loan payments per day */
  expected_payments_per_day?: number | null;
  /** Feature toggles for loan book behavior */
  feature_flags?: FeatureFlags | null;
  /** Mark the staged loan book as complete and ready for promotion */
  is_complete?: boolean | null;
  /** Late fee calculation configuration */
  late_fee_config?: LateFeeConfig | null;
  /** Loan book configuration contract address */
  loan_book_config_address?: string | null;
  /** Type of loan book implementation */
  loan_book_variant?: LoanBookVariant | null;
  /** Optional module address */
  module_address?: string | null;
  /** Optional human-readable name */
  name?: string | null;
  /** Optional organization identifier */
  org_id?: string | null;
  /** Loan originator address */
  originator_address?: string | null;
  /** Risk score range and scaling configuration */
  risk_score_scale?: RiskScoreScale | null;
  /** Optional tenant identifier */
  tenant_id?: string | null;
  /** Validation rules configuration */
  validation_flags?: ValidationFlags | null;
}

/**
 * Request to promote a staged loan book to production
 * This request has no body properties in the schema
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PromoteStagedLoanBookRequest {}

/**
 * Response containing staged loan book data
 */
export interface StagedLoanBookResponse {
  /** Blockchain address of the loan book */
  loan_book_address: string;
  /** Whether all required fields are populated and ready for promotion */
  is_complete: boolean;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Auto-pledge contract address */
  auto_pledge_address?: string | null;
  /** Categorization bucket definitions for reporting */
  categorization_buckets?: HashMap | null;
  /** Blockchain network name */
  chain?: string | null;
  /** Blockchain network identifier */
  chain_id?: number | null;
  /** Notes about the completion status */
  completion_notes?: string | null;
  /** ISO country code */
  country_code?: string | null;
  /** User who created this staged loan book */
  created_by?: string | null;
  /** Number of days in a year for interest calculations */
  days_in_year?: number | null;
  /** Default token for transactions */
  default_token?: string | null;
  /** Days past due threshold for default classification */
  dpd_default?: number | null;
  /** Expected number of loan originations per day */
  expected_originations_per_day?: number | null;
  /** Expected number of loan payments per day */
  expected_payments_per_day?: number | null;
  /** Feature toggles for loan book behavior */
  feature_flags?: FeatureFlags | null;
  /** Late fee calculation configuration */
  late_fee_config?: LateFeeConfig | null;
  /** Loan book configuration contract address */
  loan_book_config_address?: string | null;
  /** Type of loan book implementation */
  loan_book_variant?: LoanBookVariant | null;
  /** Module address */
  module_address?: string | null;
  /** Human-readable name */
  name?: string | null;
  /** Organization identifier */
  org_id?: string | null;
  /** Loan originator address */
  originator_address?: string | null;
  /** Timestamp when promoted to production */
  promoted_at?: string | null;
  /** Risk score range and scaling configuration */
  risk_score_scale?: RiskScoreScale | null;
  /** Tenant identifier */
  tenant_id?: string | null;
  /** Validation rules configuration */
  validation_flags?: ValidationFlags | null;
}

/**
 * Loan book configuration within a profile response
 */
export interface ProfileLoanBookConfig {
  /** Blockchain address of the loan book */
  loan_book_address: string;
  /** Tenant identifier */
  tenant_id: string;
  /** Organization identifier */
  org_id: string;
  /** Human-readable name of the loan book */
  name: string;
  /** Module contract address */
  module_address: string;
  /** Blockchain network name */
  chain: string;
  /** Blockchain network identifier */
  chain_id: number;
  /** Loan book configuration contract address */
  loan_book_config_address: string;
  /** Type of loan book implementation */
  loan_book_variant: LoanBookVariant;
  /** Number of days in a year for interest calculations */
  days_in_year: number;
  /** Default token for transactions */
  default_token: string;
  /** Loan originator address */
  originator_address: string;
  /** ISO country code */
  country_code: string;
  /** Feature toggles for loan book behavior */
  feature_flags: FeatureFlags;
  /** Validation rules configuration */
  validation_flags: ValidationFlags;
  /** Auto-pledge contract address */
  auto_pledge_address?: string | null;
  /** Categorization bucket definitions for reporting */
  categorization_buckets?: HashMap | null;
  /** Days past due threshold for default classification */
  dpd_default?: number | null;
  /** Expected number of loan originations per day */
  expected_originations_per_day?: number | null;
  /** Expected number of loan payments per day */
  expected_payments_per_day?: number | null;
  /** Late fee calculation configuration */
  late_fee_config?: LateFeeConfig | null;
  /** Risk score range and scaling configuration */
  risk_score_scale?: RiskScoreScale | null;
}

/**
 * Response for profile endpoint containing profile data and associated loan books
 */
export interface ProfileResponse {
  /** Profile identifier */
  id: number;
  /** Tenant identifier */
  tenant_id: string;
  /** Organization identifier */
  org_id: string;
  /** URL-friendly profile identifier */
  profile_slug: string;
  /** Active loan book configurations for this profile */
  loan_books: ProfileLoanBookConfig[];
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** SDK version string */
  profile_version?: string | null;
  /** Comma-separated list of token symbols */
  token_list?: string | null;
}
