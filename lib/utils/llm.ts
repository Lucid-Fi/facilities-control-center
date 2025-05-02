import {
  SimulationResult,
  SimulationEvent,
  SimulationChange,
} from "@/lib/aptos-service";

interface AddressBook {
  [address: string]: string;
}

interface LLMResponse {
  description: string;
}

async function callLLM(prompt: string): Promise<LLMResponse> {
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error(
        "The AI service is currently unavailable due to quota limitations. Please try again later."
      );
    }
    throw new Error("Failed to get LLM response");
  }

  return response.json();
}

function formatEventForLLM(
  event: SimulationEvent,
  addressBook: AddressBook
): string {
  const type = event.type;
  const data = event.data;
  const key = event.key || "";

  return JSON.stringify(
    {
      type,
      data,
      key: addressBook[key] || key,
    },
    null,
    2
  );
}

function formatChangeForLLM(
  change: SimulationChange,
  addressBook: AddressBook
): string {
  const type = change.type;
  const data = change.data;
  const address = change.address || "";

  return JSON.stringify(
    {
      type,
      data,
      address: addressBook[address] || address,
    },
    null,
    2
  );
}

export async function generateTransactionDescription(
  result: SimulationResult,
  addressBook: AddressBook
): Promise<string> {
  const events = result.events.map((event) =>
    formatEventForLLM(event, addressBook)
  );
  const changes = result.changes.map((change) =>
    formatChangeForLLM(change, addressBook)
  );

  const prompt = `You are an expert in blockchain transactions and smart contracts. Please provide a clear, concise, and human-readable description of what happened in this transaction. Focus on the key changes and their implications.

Transaction Status: ${result.success ? "Success" : "Failed"}
VM Status: ${result.vmStatus}
Gas Used: ${result.gasUsed}

Events:
${events.join("\n")}

State Changes:
${changes.join("\n")}

Please provide a description that:
1. Summarizes the overall outcome of the transaction
2. Explains the key events that occurred
3. Describes the important state changes
4. Uses clear, non-technical language where possible
5. Highlights any potential concerns or notable outcomes

Description:`;

  const response = await callLLM(prompt);
  return response.description;
}
