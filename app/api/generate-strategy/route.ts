import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { STRATEGY_TEMPLATES } from "@/lib/marketData";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const description = (body.description || "").trim();

    if (!description) {
      return NextResponse.json({ detail: "Description is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== "your_gemini_api_key_here") {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are an expert algorithmic trading Python developer for Indian stock markets (NSE & BSE).
The user wants to create a trading strategy with this description:
"${description}"

Write a Python function called \`run_strategy(df)\` that:
1. Takes a pandas DataFrame \`df\` with standard OHLCV columns: Open, High, Low, Close, Volume.
2. Calculates required technical indicators using pandas or numpy.
3. Adds a boolean 'Buy' column to \`df\` (True when to buy).
4. Adds a boolean 'Sell' column to \`df\` (True when to sell).
5. Returns the modified DataFrame \`df\`.

Rules:
- You MUST include \`import pandas as pd\` and \`import numpy as np\` at the top.
- Make sure to \`.copy()\` the input DataFrame: \`df = df.copy()\`.
- The function must be named exactly \`run_strategy(df)\`.
- Keep it beginner-friendly and heavily commented with explanations for beginners.
- Return ONLY the raw Python code. DO NOT include markdown formatting, backticks, or any conversational text.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });

        let code = response.text?.trim() || "";
        if (code.startsWith("```")) {
          const lines = code.split("\n");
          if (lines[0].startsWith("```")) {
            lines.shift();
          }
          if (lines.length && lines[lines.length - 1].trim() === "```") {
            lines.pop();
          }
          code = lines.join("\n").trim();
        }

        if (code) {
          return NextResponse.json({
            code,
            source: "gemini",
            description,
          });
        }
      } catch (geminiError) {
        console.warn("[generate-strategy] Gemini generation failed, falling back to template:", geminiError);
      }
    }

    // Fallback: keyword matching to templates
    const descLower = description.toLowerCase();
    let templateId = "moving_average_crossover";
    if (descLower.includes("macd") || descLower.includes("convergence") || descLower.includes("divergence")) {
      templateId = "macd_strategy";
    } else if (descLower.includes("rsi") || descLower.includes("relative strength") || descLower.includes("oversold") || descLower.includes("overbought")) {
      templateId = "rsi_mean_reversion";
    } else if (descLower.includes("bollinger") || descLower.includes("band") || descLower.includes("standard deviation")) {
      templateId = "bollinger_bands";
    } else if (descLower.includes("supertrend") || descLower.includes("atr") || descLower.includes("average true range")) {
      templateId = "supertrend";
    }

    const t = STRATEGY_TEMPLATES[templateId] || STRATEGY_TEMPLATES["moving_average_crossover"];

    return NextResponse.json({
      code: t.code,
      source: "template",
      template_id: templateId,
      description,
      note: `Generated using template: ${t.name}. Add a GEMINI_API_KEY in .env for custom AI-powered generation.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || "Failed to generate strategy" },
      { status: 500 }
    );
  }
}
