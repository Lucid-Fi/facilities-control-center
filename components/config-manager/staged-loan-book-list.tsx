"use client"

import * as React from "react"
import { StagedLoanBookResponse } from "@/lib/types/config-manager"
import { StagedLoanBookCard } from "./staged-loan-book-card"
import { FileQuestionIcon } from "lucide-react"

/**
 * Props for the StagedLoanBookList component
 */
interface StagedLoanBookListProps {
  /** Array of staged loan books to display */
  loanBooks: StagedLoanBookResponse[]
  /** Whether the list is currently loading */
  isLoading?: boolean
  /** Callback when View button is clicked on a card */
  onView?: (loanBook: StagedLoanBookResponse) => void
  /** Callback when Edit button is clicked on a card */
  onEdit?: (loanBook: StagedLoanBookResponse) => void
  /** Callback when Delete button is clicked on a card */
  onDelete?: (loanBook: StagedLoanBookResponse) => void
  /** Callback when Promote button is clicked on a card */
  onPromote?: (loanBook: StagedLoanBookResponse) => void
}

/**
 * Loading skeleton component for loan book cards
 */
function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="bg-card rounded-xl border shadow-sm p-6 space-y-4 animate-pulse"
        >
          {/* Header skeleton */}
          <div className="space-y-2">
            <div className="h-5 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>

          {/* Content skeleton */}
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
            <div className="h-4 bg-muted rounded w-4/6"></div>
          </div>

          {/* Footer skeleton */}
          <div className="flex gap-2 pt-2">
            <div className="h-8 bg-muted rounded flex-1"></div>
            <div className="h-8 bg-muted rounded flex-1"></div>
            <div className="h-8 bg-muted rounded flex-1"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Empty state component when no loan books are available
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="bg-muted rounded-full p-6 mb-4">
        <FileQuestionIcon className="size-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No staged loan books found</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        There are no staged loan books to display. Create a new staged loan book to get
        started.
      </p>
    </div>
  )
}

/**
 * A list component that displays multiple staged loan books.
 *
 * Features:
 * - Renders using StagedLoanBookCard for each item
 * - Responsive grid layout (1 col mobile, 2 cols tablet, 3 cols desktop)
 * - Empty state when no items
 * - Loading skeleton state
 * - Passes action callbacks to each card
 *
 * @example
 * ```tsx
 * <StagedLoanBookList
 *   loanBooks={stagedLoanBooks}
 *   isLoading={false}
 *   onView={(lb) => navigate(`/loan-books/${lb.loan_book_address}`)}
 *   onEdit={(lb) => setEditingLoanBook(lb)}
 *   onDelete={(lb) => handleDelete(lb)}
 *   onPromote={(lb) => handlePromote(lb)}
 * />
 * ```
 */
export function StagedLoanBookList({
  loanBooks,
  isLoading = false,
  onView,
  onEdit,
  onDelete,
  onPromote,
}: StagedLoanBookListProps) {
  // Show loading state
  if (isLoading) {
    return <LoadingSkeleton />
  }

  // Show empty state
  if (!loanBooks || loanBooks.length === 0) {
    return <EmptyState />
  }

  // Render loan book cards in a grid
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {loanBooks.map((loanBook) => (
        <StagedLoanBookCard
          key={loanBook.loan_book_address}
          loanBook={loanBook}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onPromote={onPromote}
        />
      ))}
    </div>
  )
}
