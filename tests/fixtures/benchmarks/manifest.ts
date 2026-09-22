import type { MenuBenchmarkCase } from "@/benchmark/types";
import { adversarialGlareBenchmark } from "./adversarial-glare-menu";
import { ambiguousPhotoBenchmark } from "./ambiguous-photo-menu";
import { japaneseDinnerBenchmark } from "./ja-dinner-menu";

export const benchmarkManifestVersion = "2" as const;

export const benchmarkManifest: readonly MenuBenchmarkCase[] = [
  japaneseDinnerBenchmark,
  adversarialGlareBenchmark,
  ambiguousPhotoBenchmark,
];
