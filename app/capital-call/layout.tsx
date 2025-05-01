import { Toaster } from "@/components/ui/sonner";

export default function CapitalCallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
