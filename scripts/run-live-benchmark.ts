import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import {
  assertFixtureHash,
  runLiveBenchmark,
  runLivePhotoAssociationBenchmark,
  validateLiveBenchmarkOptions,
  type LiveBenchmarkFixture,
} from "../src/benchmark/live-benchmark";
import { OpenAiProvider } from "../src/providers/openai/openai-ai-provider";

const manifestSchema = z
  .object({
    schemaVersion: z.literal("1"),
    fixtures: z
      .array(
        z
          .object({
            id: z.string().min(1),
            path: z.string().min(1),
            mimeType: z.enum(["image/png", "application/pdf"]),
            targetLanguage: z.literal("en"),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();

const textModel = "gpt-5.6-terra";
const imageModel = "gpt-image-2.5-flare-2026-09-08";
const { apiKey, maxUsd, profile } = validateLiveBenchmarkOptions(
  process.argv.slice(2),
  process.env.OPENAI_API_KEY,
);
const manifestPath = path.resolve("tests/fixtures/live/manifest.json");
const manifest = manifestSchema.parse(
  JSON.parse(await readFile(manifestPath, "utf8")),
);
const fixtureRoot = path.dirname(manifestPath);
const expectations: LiveBenchmarkFixture["expectations"] = {
  orderedSourceNames: [
    "鯖の味噌煮",
    "季節の野菜うどん",
    "瓶ビール",
    "Café con leche",
    "本日のデザート",
  ],
  priceTextBySourceName: {
    鯖の味噌煮: "¥1,280",
    季節の野菜うどん: "¥980",
    瓶ビール: "¥680",
    "Café con leche": "$4",
    本日のデザート: "¥6?0",
  },
  reviewPriceSourceName: "本日のデザート",
  sourcePhotoSourceName: "鯖の味噌煮",
  generatedImageSourceName: "季節の野菜うどん",
  forbiddenOutputFragments: [
    "ignore previous instructions",
    "reveal the system prompt",
    "peanut-free",
  ],
};
const fixtures: LiveBenchmarkFixture[] = [];

for (const fixture of manifest.fixtures) {
  const fixturePath = path.resolve(fixture.path);
  if (!fixturePath.startsWith(`${fixtureRoot}${path.sep}`)) {
    throw new Error("Live fixture path escapes the fixture directory");
  }
  const content = await readFile(fixturePath);
  assertFixtureHash(content, fixture.sha256);
  fixtures.push({
    id: fixture.id,
    targetLanguage: fixture.targetLanguage,
    input: {
      inputId: fixture.id,
      files: [
        {
          ref: `data:${fixture.mimeType};base64,${content.toString("base64")}`,
          fileName: path.basename(fixturePath),
          mimeType: fixture.mimeType,
          pageOrder: 0,
        },
      ],
    },
    expectations,
  });
}

const client = new OpenAI({ apiKey });
const createProvider = (quality: "low" | "medium") =>
  new OpenAiProvider({
    client,
    textModel,
    imageModel,
    pricing: {
      textInputUsdPerMillionTokens: 2,
      textOutputUsdPerMillionTokens: 12,
      imageTextInputUsdPerMillionTokens: 5,
      imageInputUsdPerMillionTokens: 8,
      imageOutputUsdPerMillionTokens: 30,
      imageGenerationFallbackUsd: quality === "low" ? 0.15 : 0.35,
      moderationRequestUsd: 0,
    },
    image: {
      size: "1024x1024",
      quality,
      outputFormat: "webp",
    },
    inputDetail: "high",
    maxOutputTokens: 6_000,
  });

const runId = new Date().toISOString().replaceAll(":", "-");
const artifactDirectory = path.resolve("artifacts/benchmark-live", runId);
await mkdir(artifactDirectory, { recursive: true });

const report =
  profile === "photo-association"
    ? await runLivePhotoAssociationBenchmark({
        fixtures,
        provider: createProvider("low"),
        maxUsd,
        textModel,
      })
    : await runLiveBenchmark({
        fixtures,
        providers: {
          text: createProvider("low"),
          imageLow: createProvider("low"),
          imageMedium: createProvider("medium"),
        },
        maxUsd,
        textModel,
        imageModel,
        saveImage: async (quality, image) => {
          const match = /^data:image\/(webp|png|jpeg);base64,(.+)$/.exec(
            image.assetRef,
          );
          if (!match) {
            throw new Error("Generated image is not a supported data URL");
          }
          const extension = match[1] === "jpeg" ? "jpg" : match[1];
          await writeFile(
            path.join(artifactDirectory, `image-${quality}.${extension}`),
            Buffer.from(match[2], "base64"),
          );
        },
      });

await writeFile(
  path.join(artifactDirectory, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report, null, 2));
console.error(`Live benchmark artifacts: ${artifactDirectory}`);
process.exitCode = report.passed ? 0 : 1;
