import "server-only";

import OpenAI from "openai";

import { readCreatorEnvironment } from "@/config/env";
import { OpenAiProvider } from "@/providers/openai/openai-ai-provider";

export function createManagedOpenAiProvider() {
  const environment = readCreatorEnvironment();
  if (!environment.OPENAI_API_KEY) throw new Error("openai_not_configured");
  return new OpenAiProvider({
    client: new OpenAI({ apiKey: environment.OPENAI_API_KEY }),
    textModel: environment.EXTRACTION_MODEL,
    imageModel: environment.IMAGE_MODEL,
    pricing: {
      textInputUsdPerMillionTokens: 2,
      textOutputUsdPerMillionTokens: 12,
      imageTextInputUsdPerMillionTokens: 5,
      imageInputUsdPerMillionTokens: 8,
      imageOutputUsdPerMillionTokens: 30,
      imageGenerationFallbackUsd: 0.15,
      moderationRequestUsd: 0,
    },
    image: {
      size: "1024x1024",
      quality: "low",
      outputFormat: "webp",
    },
    inputDetail: "high",
    maxOutputTokens: 6_000,
  });
}
