import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  if (process.env.AI_MODE_ENABLED === "false") {
    return NextResponse.json(
      { description: "AI mode is disabled" },
      { status: 200 }
    );
  }

  try {
    const { prompt } = await request.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Anthropic API key not configured");
    }

    console.log("prompt", prompt);

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-latest",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are an expert in blockchain transactions and smart contracts. 
          Your task is to provide clear, concise, and human-readable descriptions of transaction results. 
          Make sure your answer is succinct. 
          Use proper markdown formatting.
          Assume that numeric values are using 6 decimals, such that 1e6 = 1.0\n\n${prompt}`,
        },
      ],
    });

    const description =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ description });
  } catch (error) {
    console.error("Error in LLM API route:", error);
    return NextResponse.json(
      { error: "Failed to generate description" },
      { status: 500 }
    );
  }
}
