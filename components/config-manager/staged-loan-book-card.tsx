"use client"

import * as React from "react"
import { format } from "date-fns"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StagedLoanBookResponse } from "@/lib/types/config-manager"
import { EyeIcon, PencilIcon, TrashIcon, RocketIcon } from "lucide-react"

/**
 * Props for the StagedLoanBookCard component
 */
interface StagedLoanBookCardProps {
  /** The staged loan book data to display */
  loanBook: StagedLoanBookResponse
  /** Callback when View button is clicked */
  onView?: (loanBook: StagedLoanBookResponse) => void
  /** Callback when Edit button is clicked */
  onEdit?: (loanBook: StagedLoanBookResponse) => void
  /** Callback when Delete button is clicked */
  onDelete?: (loanBook: StagedLoanBookResponse) => void
  /** Callback when Promote button is clicked */
  onPromote?: (loanBook: StagedLoanBookResponse) => void
}

/**
 * Formats a date string to a readable format
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A"
  try {
    return format(new Date(dateString), "MMM d, yyyy HH:mm")
  } catch {
    return "Invalid date"
  }
}

/**
 * Truncates an address for display
 * @param address - Full address string
 * @param prefixLength - Number of characters to show at start
 * @param suffixLength - Number of characters to show at end
 * @returns Truncated address
 */
function truncateAddress(
  address: string,
  prefixLength: number = 6,
  suffixLength: number = 4
): string {
  if (address.length <= prefixLength + suffixLength) return address
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`
}

/**
 * A card component for displaying a single staged loan book in list views.
 *
 * Features:
 * - Displays key information: address, name, completion status, timestamps
 * - Shows completion badge (green for complete, yellow for incomplete)
 * - Shows loan book variant if available
 * - Action buttons: View, Edit, Delete, Promote (promote only if complete)
 * - Responsive layout
 * - Proper date formatting
 *
 * @example
 * ```tsx
 * <StagedLoanBookCard
 *   loanBook={stagedLoanBook}
 *   onView={(lb) => console.log('View', lb)}
 *   onEdit={(lb) => console.log('Edit', lb)}
 *   onDelete={(lb) => console.log('Delete', lb)}
 *   onPromote={(lb) => console.log('Promote', lb)}
 * />
 * ```
 */
export function StagedLoanBookCard({
  loanBook,
  onView,
  onEdit,
  onDelete,
  onPromote,
}: StagedLoanBookCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate">
              {loanBook.name || truncateAddress(loanBook.loan_book_address)}
            </CardTitle>
            <CardDescription className="mt-1.5">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {truncateAddress(loanBook.loan_book_address, 8, 6)}
              </code>
            </CardDescription>
          </div>
          <CardAction>
            <Badge
              variant={loanBook.is_complete ? "default" : "secondary"}
              className={
                loanBook.is_complete
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-yellow-500 hover:bg-yellow-600 text-white"
              }
            >
              {loanBook.is_complete ? "Complete" : "Incomplete"}
            </Badge>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Loan Book Variant */}
        {loanBook.loan_book_variant && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Variant:</span>
            <Badge variant="outline" className="capitalize">
              {loanBook.loan_book_variant.replace(/_/g, " ")}
            </Badge>
          </div>
        )}

        {/* Organization Info */}
        {(loanBook.org_id || loanBook.tenant_id) && (
          <div className="text-xs space-y-1">
            {loanBook.org_id && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Org ID:</span>
                <span className="font-mono">{loanBook.org_id}</span>
              </div>
            )}
            {loanBook.tenant_id && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Tenant ID:</span>
                <span className="font-mono">{loanBook.tenant_id}</span>
              </div>
            )}
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs space-y-1 pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Created:</span>
            <span>{formatDate(loanBook.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Updated:</span>
            <span>{formatDate(loanBook.updated_at)}</span>
          </div>
          {loanBook.promoted_at && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Promoted:</span>
              <span>{formatDate(loanBook.promoted_at)}</span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {onView && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onView(loanBook)}
            className="flex-1"
          >
            <EyeIcon />
            View
          </Button>
        )}

        {onEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(loanBook)}
            className="flex-1"
          >
            <PencilIcon />
            Edit
          </Button>
        )}

        {onDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(loanBook)}
            className="flex-1 hover:bg-destructive hover:text-white hover:border-destructive"
          >
            <TrashIcon />
            Delete
          </Button>
        )}

        {onPromote && loanBook.is_complete && (
          <Button
            variant="default"
            size="sm"
            onClick={() => onPromote(loanBook)}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <RocketIcon />
            Promote
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
