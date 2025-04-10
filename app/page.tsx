import ContractInterface from "@/components/contract-interface"

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Aptos Move Contract Interface</h1>
        <p className="text-gray-600 mb-8">Connect your wallet and interact with the contract functions below.</p>
        <ContractInterface />
      </div>
    </main>
  )
}
