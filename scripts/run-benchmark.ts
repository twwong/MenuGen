import { runBenchmarkManifest } from "../src/benchmark/benchmark-runner";
import {
  benchmarkManifest,
  benchmarkManifestVersion,
} from "../tests/fixtures/benchmarks/manifest";

const report = await runBenchmarkManifest(
  benchmarkManifest,
  benchmarkManifestVersion,
);

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
