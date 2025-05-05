import { Toaster } from "@/components/ui/sonner";
import { Suspense } from 'react';

export default function FundingRequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense>
      {children}
      </Suspense>
      <Toaster />
    </>
  );
}