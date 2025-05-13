import { Suspense } from "react";

export default function OfferLoanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div>Loading offer loan page...</div>}>
      {children}
    </Suspense>
  );
}
