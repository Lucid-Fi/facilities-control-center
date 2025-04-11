"use client";
import ContractInterface from "@/components/contract-interface";
import PactLabsIcon from "@/app/svg/pact-labs.svg";
import Image from "next/image";
import { WalletSelector } from "@/components/wallet-selector";
import { UserRoleDisplay } from "@/components/user-role-display";
import { Suspense } from "react";
export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex w-full justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
              <Image
                src={PactLabsIcon}
                alt="PACT Labs Icon"
                width={48}
                height={48}
                className="inline-block"
              />
              Facility Control Center
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <WalletSelector />
            <Suspense>
              <UserRoleDisplay />
            </Suspense>
          </div>
        </div>
        <Suspense>
          <ContractInterface />
        </Suspense>
      </div>
    </main>
  );
}
