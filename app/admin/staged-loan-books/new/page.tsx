"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StagedLoanBookForm } from "@/components/config-manager/staged-loan-book-form";
import { useCreateStagedLoanBook } from "@/lib/hooks/use-config-manager";
import {
  CreateStagedLoanBookRequest,
  UpdateStagedLoanBookRequest,
} from "@/lib/types/config-manager";
import { ArrowLeftIcon } from "lucide-react";

export default function NewStagedLoanBookPage() {
  const router = useRouter();
  const createMutation = useCreateStagedLoanBook();

  const handleSubmit = (
    data: CreateStagedLoanBookRequest | UpdateStagedLoanBookRequest
  ) => {
    // In create mode, data should always be CreateStagedLoanBookRequest
    createMutation.mutate(data as CreateStagedLoanBookRequest, {
      onSuccess: () => {
        router.push("/admin/staged-loan-books");
      },
    });
  };

  const handleCancel = () => {
    router.push("/admin/staged-loan-books");
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="mb-4 -ml-2"
          >
            <ArrowLeftIcon className="size-4 mr-2" />
            Back to Staged Loan Books
          </Button>

          <div>
            <h1 className="text-3xl font-bold mb-2">
              Create New Staged Loan Book
            </h1>
            <p className="text-muted-foreground">
              Create a new staged loan book configuration. You can set up the
              basic information, blockchain configuration, and all loan book
              parameters. The staged loan book can be edited and refined before
              promoting it to production.
            </p>
          </div>
        </div>

        {/* Form Section */}
        <div className="bg-card border rounded-lg p-6">
          <StagedLoanBookForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={createMutation.isPending}
          />
        </div>
      </div>
    </main>
  );
}
