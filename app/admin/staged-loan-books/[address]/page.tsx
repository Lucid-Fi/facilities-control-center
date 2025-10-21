"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StagedLoanBookForm } from "@/components/config-manager/staged-loan-book-form";
import {
  useStagedLoanBook,
  useUpdateStagedLoanBook,
  useDeleteStagedLoanBook,
  usePromoteStagedLoanBook,
} from "@/lib/hooks/use-config-manager";
import {
  CreateStagedLoanBookRequest,
  UpdateStagedLoanBookRequest,
} from "@/lib/types/config-manager";
import {
  ArrowLeftIcon,
  EditIcon,
  TrashIcon,
  RocketIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";

interface PageProps {
  params: Promise<{
    address: string;
  }>;
}

export default function StagedLoanBookDetailPage({ params }: PageProps) {
  const { address } = use(params);
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);

  // Fetch loan book data
  const { data: loanBook, isLoading, error } = useStagedLoanBook(address);

  // Mutations
  const updateMutation = useUpdateStagedLoanBook();
  const deleteMutation = useDeleteStagedLoanBook();
  const promoteMutation = usePromoteStagedLoanBook();

  // Action handlers
  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = (
    data: CreateStagedLoanBookRequest | UpdateStagedLoanBookRequest
  ) => {
    updateMutation.mutate(
      {
        address: address,
        data: data as UpdateStagedLoanBookRequest,
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    deleteMutation.mutate(address, {
      onSuccess: () => {
        router.push("/admin/staged-loan-books");
      },
    });
  };

  const handlePromoteClick = () => {
    setPromoteDialogOpen(true);
  };

  const handlePromoteConfirm = () => {
    promoteMutation.mutate(address, {
      onSuccess: () => {
        router.push("/admin/staged-loan-books");
      },
    });
  };

  const handleBack = () => {
    router.push("/admin/staged-loan-books");
  };

  // Loading state
  if (isLoading) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading loan book...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Error state
  if (error || !loanBook) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <Button variant="ghost" onClick={handleBack} className="mb-4 -ml-2">
            <ArrowLeftIcon className="size-4 mr-2" />
            Back to Staged Loan Books
          </Button>

          <div className="bg-destructive/10 border border-destructive rounded-lg p-6">
            <div className="flex items-start gap-3">
              <XCircleIcon className="size-5 text-destructive mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive mb-1">
                  Loan Book Not Found
                </h3>
                <p className="text-sm text-destructive/80">
                  {error?.message ||
                    "The staged loan book could not be found. It may have been deleted or promoted."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Edit mode
  if (isEditing) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header Section */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={handleCancel}
              className="mb-4 -ml-2"
              disabled={updateMutation.isPending}
            >
              <ArrowLeftIcon className="size-4 mr-2" />
              Back to View Mode
            </Button>

            <div>
              <h1 className="text-3xl font-bold mb-2">
                Edit Staged Loan Book
              </h1>
              <p className="text-muted-foreground">
                Update the configuration for this staged loan book. Changes will
                be saved immediately.
              </p>
            </div>
          </div>

          {/* Form Section */}
          <div className="bg-card border rounded-lg p-6">
            <StagedLoanBookForm
              initialData={loanBook}
              onSubmit={handleSave}
              onCancel={handleCancel}
              isSubmitting={updateMutation.isPending}
            />
          </div>
        </div>
      </main>
    );
  }

  // View mode
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <Button variant="ghost" onClick={handleBack} className="mb-4 -ml-2">
            <ArrowLeftIcon className="size-4 mr-2" />
            Back to Staged Loan Books
          </Button>

          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">
                  {loanBook.name || "Unnamed Loan Book"}
                </h1>
                {loanBook.is_complete ? (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2Icon className="size-3 mr-1" />
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircleIcon className="size-3 mr-1" />
                    Incomplete
                  </Badge>
                )}
              </div>
              <code className="text-sm text-muted-foreground">
                {loanBook.loan_book_address}
              </code>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleEdit}>
                <EditIcon className="size-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={handlePromoteClick}
                disabled={!loanBook.is_complete}
                className="text-green-600 hover:text-green-700"
              >
                <RocketIcon className="size-4 mr-2" />
                Promote
              </Button>
              <Button
                variant="outline"
                onClick={handleDeleteClick}
                className="text-destructive hover:text-destructive"
              >
                <TrashIcon className="size-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Name
                </div>
                <div className="text-sm">
                  {loanBook.name || <span className="text-muted-foreground">Not set</span>}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Organization ID
                </div>
                <div className="text-sm">
                  {loanBook.org_id || <span className="text-muted-foreground">Not set</span>}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Tenant ID
                </div>
                <div className="text-sm">
                  {loanBook.tenant_id || <span className="text-muted-foreground">Not set</span>}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Country Code
                </div>
                <div className="text-sm">
                  {loanBook.country_code || <span className="text-muted-foreground">Not set</span>}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Created By
                </div>
                <div className="text-sm">
                  {loanBook.created_by || <span className="text-muted-foreground">Not set</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Blockchain Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Blockchain Configuration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Chain
                </div>
                <div className="text-sm">
                  {loanBook.chain || <span className="text-muted-foreground">Not set</span>}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Chain ID
                </div>
                <div className="text-sm">
                  {loanBook.chain_id !== null && loanBook.chain_id !== undefined ? (
                    loanBook.chain_id
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Module Address
                </div>
                <div className="text-sm font-mono break-all">
                  {loanBook.module_address || (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Loan Book Config Address
                </div>
                <div className="text-sm font-mono break-all">
                  {loanBook.loan_book_config_address || (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Originator Address
                </div>
                <div className="text-sm font-mono break-all">
                  {loanBook.originator_address || (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Auto Pledge Address
                </div>
                <div className="text-sm font-mono break-all">
                  {loanBook.auto_pledge_address || (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Default Token
                </div>
                <div className="text-sm">
                  {loanBook.default_token || (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loan Book Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Loan Book Configuration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Variant
                </div>
                <div className="text-sm">
                  {loanBook.loan_book_variant ? (
                    <Badge variant="outline">{loanBook.loan_book_variant}</Badge>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Days in Year
                </div>
                <div className="text-sm">
                  {loanBook.days_in_year !== null && loanBook.days_in_year !== undefined ? (
                    loanBook.days_in_year
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  DPD Default Threshold
                </div>
                <div className="text-sm">
                  {loanBook.dpd_default !== null && loanBook.dpd_default !== undefined ? (
                    loanBook.dpd_default
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Expected Originations/Day
                </div>
                <div className="text-sm">
                  {loanBook.expected_originations_per_day !== null &&
                  loanBook.expected_originations_per_day !== undefined ? (
                    loanBook.expected_originations_per_day
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Expected Payments/Day
                </div>
                <div className="text-sm">
                  {loanBook.expected_payments_per_day !== null &&
                  loanBook.expected_payments_per_day !== undefined ? (
                    loanBook.expected_payments_per_day
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feature Flags */}
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div className="text-sm">Custom Late Fee</div>
                <Badge
                  variant={
                    loanBook.feature_flags?.has_custom_latefee
                      ? "default"
                      : "secondary"
                  }
                >
                  {loanBook.feature_flags?.has_custom_latefee
                    ? "Enabled"
                    : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="text-sm">Auto Pull</div>
                <Badge
                  variant={
                    loanBook.feature_flags?.is_autopull ? "default" : "secondary"
                  }
                >
                  {loanBook.feature_flags?.is_autopull ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="text-sm">Historical Data</div>
                <Badge
                  variant={
                    loanBook.feature_flags?.is_historical ? "default" : "secondary"
                  }
                >
                  {loanBook.feature_flags?.is_historical ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="text-sm">Track External IDs</div>
                <Badge
                  variant={
                    loanBook.feature_flags?.is_tracking_external_ids
                      ? "default"
                      : "secondary"
                  }
                >
                  {loanBook.feature_flags?.is_tracking_external_ids
                    ? "Enabled"
                    : "Disabled"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Validation Flags */}
          {loanBook.validation_flags && (
            <Card>
              <CardHeader>
                <CardTitle>Validation Flags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm">Principal Continuity</div>
                  <Badge
                    variant={
                      loanBook.validation_flags?.principal_continuity
                        ? "default"
                        : "secondary"
                    }
                  >
                    {loanBook.validation_flags?.principal_continuity
                      ? "Enabled"
                      : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Late Fee Configuration */}
          {loanBook.late_fee_config && (
            <Card>
              <CardHeader>
                <CardTitle>Late Fee Configuration</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Type
                  </div>
                  <div className="text-sm">
                    <Badge variant="outline">
                      {loanBook.late_fee_config.type}
                    </Badge>
                  </div>
                </div>

                {loanBook.late_fee_config.type === "delinquent_linear_accrual" && (
                  <>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Grace Period (microseconds)
                      </div>
                      <div className="text-sm">
                        {loanBook.late_fee_config.grace_period_micros}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Accrual Period (microseconds)
                      </div>
                      <div className="text-sm">
                        {loanBook.late_fee_config.accrual_period_micros}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Accrual Per Period (Numerator)
                      </div>
                      <div className="text-sm">
                        {loanBook.late_fee_config.accrual_per_period_numerator}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Accrual Per Period (Denominator)
                      </div>
                      <div className="text-sm">
                        {loanBook.late_fee_config.accrual_per_period_denominator}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Maximum Periods
                      </div>
                      <div className="text-sm">
                        {loanBook.late_fee_config.max_periods}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Risk Score Scale */}
          {loanBook.risk_score_scale && (
            <Card>
              <CardHeader>
                <CardTitle>Risk Score Scale</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Type
                  </div>
                  <div className="text-sm">
                    <Badge variant="outline">{loanBook.risk_score_scale.type}</Badge>
                  </div>
                </div>

                {loanBook.risk_score_scale.type === "linear" && (
                  <>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Minimum Score
                      </div>
                      <div className="text-sm">{loanBook.risk_score_scale.min}</div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Maximum Score
                      </div>
                      <div className="text-sm">{loanBook.risk_score_scale.max}</div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Categorization Buckets */}
          {loanBook.categorization_buckets && (
            <Card>
              <CardHeader>
                <CardTitle>Categorization Buckets</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto">
                  {JSON.stringify(loanBook.categorization_buckets, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Notes & Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Notes & Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loanBook.completion_notes && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Completion Notes
                  </div>
                  <div className="text-sm">{loanBook.completion_notes}</div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Created At
                  </div>
                  <div className="text-sm">
                    {new Date(loanBook.created_at).toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Updated At
                  </div>
                  <div className="text-sm">
                    {new Date(loanBook.updated_at).toLocaleString()}
                  </div>
                </div>

                {loanBook.promoted_at && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Promoted At
                    </div>
                    <div className="text-sm">
                      {new Date(loanBook.promoted_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Staged Loan Book</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this staged loan book? This
                action cannot be undone.
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <div className="text-sm font-medium text-foreground">
                    {loanBook.name || "Unnamed"}
                  </div>
                  <code className="text-xs text-muted-foreground">
                    {loanBook.loan_book_address}
                  </code>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Promote Confirmation Dialog */}
        <AlertDialog
          open={promoteDialogOpen}
          onOpenChange={setPromoteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Promote to Production</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to promote this staged loan book to
                production? This will make the configuration active and
                accessible in the production environment.
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <div className="text-sm font-medium text-foreground">
                    {loanBook.name || "Unnamed"}
                  </div>
                  <code className="text-xs text-muted-foreground">
                    {loanBook.loan_book_address}
                  </code>
                  {!loanBook.is_complete && (
                    <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-500">
                      Warning: This loan book is marked as incomplete.
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handlePromoteConfirm}
                className="bg-green-600 hover:bg-green-700"
                disabled={promoteMutation.isPending}
              >
                {promoteMutation.isPending ? "Promoting..." : "Promote"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}
