"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CreateStagedLoanBookRequest,
  UpdateStagedLoanBookRequest,
  StagedLoanBookResponse,
  LoanBookVariant,
} from "@/lib/types/config-manager"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

/**
 * Props for the StagedLoanBookForm component
 */
interface StagedLoanBookFormProps {
  /** Initial data for edit mode (if provided, form is in edit mode) */
  initialData?: StagedLoanBookResponse
  /** Callback when form is submitted with valid data */
  onSubmit: (data: CreateStagedLoanBookRequest | UpdateStagedLoanBookRequest) => void
  /** Callback when cancel is clicked */
  onCancel: () => void
  /** Whether the form is currently submitting */
  isSubmitting?: boolean
}

/**
 * Collapsible section component for organizing form fields
 */
interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
      >
        <h3 className="font-semibold text-sm">{title}</h3>
        {isOpen ? (
          <ChevronUpIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 pt-0 space-y-4 border-t">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Comprehensive form component for creating and editing staged loan books.
 *
 * Features:
 * - Supports both create and edit modes (detected via initialData prop)
 * - Organizes fields into logical collapsible sections
 * - Handles all fields from CreateStagedLoanBookRequest and UpdateStagedLoanBookRequest
 * - Provides form validation and loading states
 * - Uses shadcn/ui components for consistent styling
 *
 * @example
 * ```tsx
 * // Create mode
 * <StagedLoanBookForm
 *   onSubmit={(data) => console.log('Create:', data)}
 *   onCancel={() => console.log('Cancelled')}
 * />
 *
 * // Edit mode
 * <StagedLoanBookForm
 *   initialData={existingLoanBook}
 *   onSubmit={(data) => console.log('Update:', data)}
 *   onCancel={() => console.log('Cancelled')}
 *   isSubmitting={false}
 * />
 * ```
 */
export function StagedLoanBookForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: StagedLoanBookFormProps) {
  const isEditMode = !!initialData

  // Basic Information
  const [address, setAddress] = React.useState(initialData?.loan_book_address || "")
  const [name, setName] = React.useState(initialData?.name || "")
  const [orgId, setOrgId] = React.useState(initialData?.org_id || "")
  const [tenantId, setTenantId] = React.useState(initialData?.tenant_id || "")
  const [createdBy, setCreatedBy] = React.useState(initialData?.created_by || "")
  const [countryCode, setCountryCode] = React.useState(initialData?.country_code || "")

  // Blockchain Configuration
  const [chain, setChain] = React.useState(initialData?.chain || "")
  const [chainId, setChainId] = React.useState(initialData?.chain_id?.toString() || "")
  const [moduleAddress, setModuleAddress] = React.useState(initialData?.module_address || "")
  const [loanBookConfigAddress, setLoanBookConfigAddress] = React.useState(
    initialData?.loan_book_config_address || ""
  )
  const [originatorAddress, setOriginatorAddress] = React.useState(
    initialData?.originator_address || ""
  )
  const [autoPledgeAddress, setAutoPledgeAddress] = React.useState(
    initialData?.auto_pledge_address || ""
  )
  const [defaultToken, setDefaultToken] = React.useState(initialData?.default_token || "")

  // Loan Book Configuration
  const [loanBookVariant, setLoanBookVariant] = React.useState<LoanBookVariant | "">(
    initialData?.loan_book_variant || ""
  )
  const [daysInYear, setDaysInYear] = React.useState(
    initialData?.days_in_year?.toString() || ""
  )
  const [dpdDefault, setDpdDefault] = React.useState(initialData?.dpd_default?.toString() || "")
  const [expectedOriginationsPerDay, setExpectedOriginationsPerDay] = React.useState(
    initialData?.expected_originations_per_day?.toString() || ""
  )
  const [expectedPaymentsPerDay, setExpectedPaymentsPerDay] = React.useState(
    initialData?.expected_payments_per_day?.toString() || ""
  )

  // Feature Flags
  const [hasCustomLatefee, setHasCustomLatefee] = React.useState(
    initialData?.feature_flags?.has_custom_latefee || false
  )
  const [isAutopull, setIsAutopull] = React.useState(
    initialData?.feature_flags?.is_autopull || false
  )
  const [isHistorical, setIsHistorical] = React.useState(
    initialData?.feature_flags?.is_historical || false
  )
  const [isTrackingExternalIds, setIsTrackingExternalIds] = React.useState(
    initialData?.feature_flags?.is_tracking_external_ids || false
  )

  // Validation Flags
  const [principalContinuity, setPrincipalContinuity] = React.useState(
    initialData?.validation_flags?.principal_continuity || false
  )

  // Late Fee Configuration (delinquent_linear_accrual)
  const [enableLateFee, setEnableLateFee] = React.useState(
    !!initialData?.late_fee_config
  )
  const [gracePeriodMicros, setGracePeriodMicros] = React.useState(
    initialData?.late_fee_config?.type === "delinquent_linear_accrual"
      ? initialData.late_fee_config.grace_period_micros.toString()
      : ""
  )
  const [accrualPeriodMicros, setAccrualPeriodMicros] = React.useState(
    initialData?.late_fee_config?.type === "delinquent_linear_accrual"
      ? initialData.late_fee_config.accrual_period_micros.toString()
      : ""
  )
  const [accrualPerPeriodNumerator, setAccrualPerPeriodNumerator] = React.useState(
    initialData?.late_fee_config?.type === "delinquent_linear_accrual"
      ? initialData.late_fee_config.accrual_per_period_numerator.toString()
      : ""
  )
  const [accrualPerPeriodDenominator, setAccrualPerPeriodDenominator] = React.useState(
    initialData?.late_fee_config?.type === "delinquent_linear_accrual"
      ? initialData.late_fee_config.accrual_per_period_denominator.toString()
      : ""
  )
  const [maxPeriods, setMaxPeriods] = React.useState(
    initialData?.late_fee_config?.type === "delinquent_linear_accrual"
      ? initialData.late_fee_config.max_periods.toString()
      : ""
  )

  // Risk Score Scale (linear)
  const [enableRiskScore, setEnableRiskScore] = React.useState(
    !!initialData?.risk_score_scale
  )
  const [riskScoreMin, setRiskScoreMin] = React.useState(
    initialData?.risk_score_scale?.type === "linear"
      ? initialData.risk_score_scale.min.toString()
      : ""
  )
  const [riskScoreMax, setRiskScoreMax] = React.useState(
    initialData?.risk_score_scale?.type === "linear"
      ? initialData.risk_score_scale.max.toString()
      : ""
  )

  // Categorization Buckets (JSON)
  const [categorizationBuckets, setCategorizationBuckets] = React.useState(
    initialData?.categorization_buckets
      ? JSON.stringify(initialData.categorization_buckets, null, 2)
      : ""
  )

  // Notes
  const [completionNotes, setCompletionNotes] = React.useState(
    initialData?.completion_notes || ""
  )

  // Completion status (edit mode only)
  const [isComplete, setIsComplete] = React.useState(initialData?.is_complete || false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Build the request object
    const baseData = {
      name: name || null,
      org_id: orgId || null,
      tenant_id: tenantId || null,
      chain: chain || null,
      chain_id: chainId ? parseInt(chainId) : null,
      module_address: moduleAddress || null,
      loan_book_config_address: loanBookConfigAddress || null,
      originator_address: originatorAddress || null,
      auto_pledge_address: autoPledgeAddress || null,
      default_token: defaultToken || null,
      loan_book_variant: (loanBookVariant || null) as LoanBookVariant | null,
      days_in_year: daysInYear ? parseInt(daysInYear) : null,
      dpd_default: dpdDefault ? parseInt(dpdDefault) : null,
      expected_originations_per_day: expectedOriginationsPerDay
        ? parseInt(expectedOriginationsPerDay)
        : null,
      expected_payments_per_day: expectedPaymentsPerDay
        ? parseInt(expectedPaymentsPerDay)
        : null,
      country_code: countryCode || null,
      feature_flags: {
        has_custom_latefee: hasCustomLatefee,
        is_autopull: isAutopull,
        is_historical: isHistorical,
        is_tracking_external_ids: isTrackingExternalIds,
      },
      validation_flags: {
        principal_continuity: principalContinuity,
      },
      late_fee_config: enableLateFee
        ? {
            type: "delinquent_linear_accrual" as const,
            grace_period_micros: parseInt(gracePeriodMicros) || 0,
            accrual_period_micros: parseInt(accrualPeriodMicros) || 0,
            accrual_per_period_numerator: parseInt(accrualPerPeriodNumerator) || 0,
            accrual_per_period_denominator: parseInt(accrualPerPeriodDenominator) || 0,
            max_periods: parseInt(maxPeriods) || 0,
          }
        : null,
      risk_score_scale: enableRiskScore
        ? {
            type: "linear" as const,
            min: parseFloat(riskScoreMin) || 0,
            max: parseFloat(riskScoreMax) || 0,
          }
        : null,
      categorization_buckets: categorizationBuckets
        ? JSON.parse(categorizationBuckets)
        : null,
      completion_notes: completionNotes || null,
    }

    if (isEditMode) {
      // Update request
      const updateData: UpdateStagedLoanBookRequest = {
        ...baseData,
        is_complete: isComplete,
      }
      onSubmit(updateData)
    } else {
      // Create request
      const createData: CreateStagedLoanBookRequest = {
        loan_book_address: address,
        created_by: createdBy || null,
        ...baseData,
      }
      onSubmit(createData)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Basic Information */}
      <CollapsibleSection title="Basic Information" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="address">
                Loan Book Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..."
                required={!isEditMode}
                disabled={isSubmitting || isEditMode}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Loan Book"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="orgId">Organization ID</Label>
            <Input
              id="orgId"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="org-123"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenantId">Tenant ID</Label>
            <Input
              id="tenantId"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="tenant-123"
              disabled={isSubmitting}
            />
          </div>

          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="createdBy">Created By</Label>
              <Input
                id="createdBy"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="user@example.com"
                disabled={isSubmitting}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="countryCode">Country Code</Label>
            <Input
              id="countryCode"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              placeholder="US"
              maxLength={2}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Blockchain Configuration */}
      <CollapsibleSection title="Blockchain Configuration" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="chain">Chain</Label>
            <Input
              id="chain"
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              placeholder="aptos"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chainId">Chain ID</Label>
            <Input
              id="chainId"
              type="number"
              value={chainId}
              onChange={(e) => setChainId(e.target.value)}
              placeholder="1"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="moduleAddress">Module Address</Label>
            <Input
              id="moduleAddress"
              value={moduleAddress}
              onChange={(e) => setModuleAddress(e.target.value)}
              placeholder="0x..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="loanBookConfigAddress">Loan Book Config Address</Label>
            <Input
              id="loanBookConfigAddress"
              value={loanBookConfigAddress}
              onChange={(e) => setLoanBookConfigAddress(e.target.value)}
              placeholder="0x..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="originatorAddress">Originator Address</Label>
            <Input
              id="originatorAddress"
              value={originatorAddress}
              onChange={(e) => setOriginatorAddress(e.target.value)}
              placeholder="0x..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="autoPledgeAddress">Auto Pledge Address</Label>
            <Input
              id="autoPledgeAddress"
              value={autoPledgeAddress}
              onChange={(e) => setAutoPledgeAddress(e.target.value)}
              placeholder="0x..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultToken">Default Token</Label>
            <Input
              id="defaultToken"
              value={defaultToken}
              onChange={(e) => setDefaultToken(e.target.value)}
              placeholder="USDC"
              disabled={isSubmitting}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Loan Book Configuration */}
      <CollapsibleSection title="Loan Book Configuration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="loanBookVariant">Loan Book Variant</Label>
            <Select
              value={loanBookVariant}
              onValueChange={(value) => setLoanBookVariant(value as LoanBookVariant)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="loanBookVariant" className="w-full">
                <SelectValue placeholder="Select variant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="zvt_alpha">ZVT Alpha</SelectItem>
                <SelectItem value="zvt_beta">ZVT Beta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="daysInYear">Days in Year</Label>
            <Input
              id="daysInYear"
              type="number"
              value={daysInYear}
              onChange={(e) => setDaysInYear(e.target.value)}
              placeholder="360 or 365"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dpdDefault">DPD Default Threshold</Label>
            <Input
              id="dpdDefault"
              type="number"
              value={dpdDefault}
              onChange={(e) => setDpdDefault(e.target.value)}
              placeholder="90"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expectedOriginationsPerDay">
              Expected Originations Per Day
            </Label>
            <Input
              id="expectedOriginationsPerDay"
              type="number"
              value={expectedOriginationsPerDay}
              onChange={(e) => setExpectedOriginationsPerDay(e.target.value)}
              placeholder="10"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expectedPaymentsPerDay">Expected Payments Per Day</Label>
            <Input
              id="expectedPaymentsPerDay"
              type="number"
              value={expectedPaymentsPerDay}
              onChange={(e) => setExpectedPaymentsPerDay(e.target.value)}
              placeholder="50"
              disabled={isSubmitting}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Feature Flags */}
      <CollapsibleSection title="Feature Flags">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="hasCustomLatefee">Custom Late Fee</Label>
              <p className="text-xs text-muted-foreground">
                Enable custom late fee calculation
              </p>
            </div>
            <Switch
              id="hasCustomLatefee"
              checked={hasCustomLatefee}
              onCheckedChange={setHasCustomLatefee}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isAutopull">Auto Pull</Label>
              <p className="text-xs text-muted-foreground">
                Enable automatic payment pull
              </p>
            </div>
            <Switch
              id="isAutopull"
              checked={isAutopull}
              onCheckedChange={setIsAutopull}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isHistorical">Historical Data</Label>
              <p className="text-xs text-muted-foreground">Mark as historical data</p>
            </div>
            <Switch
              id="isHistorical"
              checked={isHistorical}
              onCheckedChange={setIsHistorical}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isTrackingExternalIds">Track External IDs</Label>
              <p className="text-xs text-muted-foreground">
                Track external loan identifiers
              </p>
            </div>
            <Switch
              id="isTrackingExternalIds"
              checked={isTrackingExternalIds}
              onCheckedChange={setIsTrackingExternalIds}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Validation Flags */}
      <CollapsibleSection title="Validation Flags">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="principalContinuity">Principal Continuity</Label>
            <p className="text-xs text-muted-foreground">
              Enable principal continuity validation
            </p>
          </div>
          <Switch
            id="principalContinuity"
            checked={principalContinuity}
            onCheckedChange={setPrincipalContinuity}
            disabled={isSubmitting}
          />
        </div>
      </CollapsibleSection>

      {/* Late Fee Configuration */}
      <CollapsibleSection title="Late Fee Configuration">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableLateFee"
              checked={enableLateFee}
              onCheckedChange={(checked) => setEnableLateFee(checked as boolean)}
              disabled={isSubmitting}
            />
            <Label htmlFor="enableLateFee">Enable late fee configuration</Label>
          </div>

          {enableLateFee && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
              <div className="space-y-2">
                <Label htmlFor="gracePeriodMicros">Grace Period (microseconds)</Label>
                <Input
                  id="gracePeriodMicros"
                  type="number"
                  value={gracePeriodMicros}
                  onChange={(e) => setGracePeriodMicros(e.target.value)}
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accrualPeriodMicros">
                  Accrual Period (microseconds)
                </Label>
                <Input
                  id="accrualPeriodMicros"
                  type="number"
                  value={accrualPeriodMicros}
                  onChange={(e) => setAccrualPeriodMicros(e.target.value)}
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accrualPerPeriodNumerator">
                  Accrual Per Period Numerator
                </Label>
                <Input
                  id="accrualPerPeriodNumerator"
                  type="number"
                  value={accrualPerPeriodNumerator}
                  onChange={(e) => setAccrualPerPeriodNumerator(e.target.value)}
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accrualPerPeriodDenominator">
                  Accrual Per Period Denominator
                </Label>
                <Input
                  id="accrualPerPeriodDenominator"
                  type="number"
                  value={accrualPerPeriodDenominator}
                  onChange={(e) => setAccrualPerPeriodDenominator(e.target.value)}
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxPeriods">Maximum Periods</Label>
                <Input
                  id="maxPeriods"
                  type="number"
                  value={maxPeriods}
                  onChange={(e) => setMaxPeriods(e.target.value)}
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Risk Score Scale */}
      <CollapsibleSection title="Risk Score Scale">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableRiskScore"
              checked={enableRiskScore}
              onCheckedChange={(checked) => setEnableRiskScore(checked as boolean)}
              disabled={isSubmitting}
            />
            <Label htmlFor="enableRiskScore">Enable risk score scale</Label>
          </div>

          {enableRiskScore && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
              <div className="space-y-2">
                <Label htmlFor="riskScoreMin">Minimum Score</Label>
                <Input
                  id="riskScoreMin"
                  type="number"
                  value={riskScoreMin}
                  onChange={(e) => setRiskScoreMin(e.target.value)}
                  placeholder="0"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="riskScoreMax">Maximum Score</Label>
                <Input
                  id="riskScoreMax"
                  type="number"
                  value={riskScoreMax}
                  onChange={(e) => setRiskScoreMax(e.target.value)}
                  placeholder="100"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Categorization Buckets */}
      <CollapsibleSection title="Categorization Buckets">
        <div className="space-y-2">
          <Label htmlFor="categorizationBuckets">Buckets (JSON)</Label>
          <textarea
            id="categorizationBuckets"
            value={categorizationBuckets}
            onChange={(e) => setCategorizationBuckets(e.target.value)}
            placeholder='{"bucket_name": [0, 30, 60, 90]}'
            disabled={isSubmitting}
            rows={6}
            className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Enter categorization buckets as JSON. Example: {`{"dpd_buckets": [0, 30, 60, 90]}`}
          </p>
        </div>
      </CollapsibleSection>

      {/* Notes */}
      <CollapsibleSection title="Notes">
        <div className="space-y-2">
          <Label htmlFor="completionNotes">Completion Notes</Label>
          <textarea
            id="completionNotes"
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder="Add any notes about the completion status..."
            disabled={isSubmitting}
            rows={4}
            className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {isEditMode && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="isComplete">Mark as Complete</Label>
              <p className="text-xs text-muted-foreground">
                Mark this loan book as complete and ready for promotion
              </p>
            </div>
            <Switch
              id="isComplete"
              checked={isComplete}
              onCheckedChange={setIsComplete}
              disabled={isSubmitting}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : isEditMode ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  )
}
