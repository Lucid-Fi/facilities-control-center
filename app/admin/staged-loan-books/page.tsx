"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { StagedLoanBookList } from "@/components/config-manager/staged-loan-book-list";
import {
  useStagedLoanBooks,
  useDeleteStagedLoanBook,
  usePromoteStagedLoanBook,
} from "@/lib/hooks/use-config-manager";
import { StagedLoanBookResponse } from "@/lib/types/config-manager";
import { PlusIcon } from "lucide-react";

export default function StagedLoanBooksPage() {
  const router = useRouter();
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [selectedLoanBook, setSelectedLoanBook] =
    useState<StagedLoanBookResponse | null>(null);

  // Fetch staged loan books based on filter
  const { data: loanBooks, isLoading, error } = useStagedLoanBooks(incompleteOnly);

  // Mutations for delete and promote
  const deleteMutation = useDeleteStagedLoanBook();
  const promoteMutation = usePromoteStagedLoanBook();

  // Action handlers
  const handleView = (loanBook: StagedLoanBookResponse) => {
    router.push(`/admin/staged-loan-books/${loanBook.loan_book_address}`);
  };

  const handleEdit = (loanBook: StagedLoanBookResponse) => {
    router.push(`/admin/staged-loan-books/${loanBook.loan_book_address}/edit`);
  };

  const handleDeleteClick = (loanBook: StagedLoanBookResponse) => {
    setSelectedLoanBook(loanBook);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedLoanBook) {
      deleteMutation.mutate(selectedLoanBook.loan_book_address, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setSelectedLoanBook(null);
        },
      });
    }
  };

  const handlePromoteClick = (loanBook: StagedLoanBookResponse) => {
    setSelectedLoanBook(loanBook);
    setPromoteDialogOpen(true);
  };

  const handlePromoteConfirm = () => {
    if (selectedLoanBook) {
      promoteMutation.mutate(selectedLoanBook.loan_book_address, {
        onSuccess: () => {
          setPromoteDialogOpen(false);
          setSelectedLoanBook(null);
        },
      });
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Staged Loan Books</h1>
              <p className="text-muted-foreground">
                Manage loan book configurations before promoting them to
                production. Staged loan books allow you to create and modify
                loan book settings in a safe staging environment.
              </p>
            </div>
            <Button
              onClick={() => router.push("/admin/staged-loan-books/new")}
              className="flex items-center gap-2"
            >
              <PlusIcon className="size-4" />
              Create New
            </Button>
          </div>

          {/* Filters Section */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="incomplete-only"
                checked={incompleteOnly}
                onCheckedChange={(checked) =>
                  setIncompleteOnly(checked === true)
                }
              />
              <Label
                htmlFor="incomplete-only"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Show incomplete only
              </Label>
            </div>
            <div className="text-sm text-muted-foreground">
              {loanBooks && `${loanBooks.length} loan book${loanBooks.length !== 1 ? 's' : ''} found`}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-destructive/10 border border-destructive rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-destructive mb-1">
              Error loading staged loan books
            </h3>
            <p className="text-sm text-destructive/80">{error.message}</p>
          </div>
        )}

        {/* Loan Books List */}
        <StagedLoanBookList
          loanBooks={loanBooks || []}
          isLoading={isLoading}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          onPromote={handlePromoteClick}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Staged Loan Book</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this staged loan book? This
                action cannot be undone.
                {selectedLoanBook && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <div className="text-sm font-medium text-foreground">
                      {selectedLoanBook.name || "Unnamed"}
                    </div>
                    <code className="text-xs text-muted-foreground">
                      {selectedLoanBook.loan_book_address}
                    </code>
                  </div>
                )}
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
                {selectedLoanBook && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <div className="text-sm font-medium text-foreground">
                      {selectedLoanBook.name || "Unnamed"}
                    </div>
                    <code className="text-xs text-muted-foreground">
                      {selectedLoanBook.loan_book_address}
                    </code>
                    {!selectedLoanBook.is_complete && (
                      <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-500">
                        Warning: This loan book is marked as incomplete.
                      </div>
                    )}
                  </div>
                )}
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
