import type { MenuBenchmarkCase } from "@/benchmark/types";
import { adversarialGlareBenchmark } from "./adversarial-glare-menu";
import { japaneseDinnerBenchmark } from "./ja-dinner-menu";

export const benchmarkManifestVersion = "1" as const;

export const benchmarkManifest: readonly MenuBenchmarkCase[] = [
  japaneseDinnerBenchmark,
  adversarialGlareBenchmark,
];
