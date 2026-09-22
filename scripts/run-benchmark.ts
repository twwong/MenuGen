import { runBenchmarkCase } from "../src/benchmark/benchmark-runner";
import { japaneseDinnerBenchmark } from "../tests/fixtures/benchmarks/ja-dinner-menu";

const report = await runBenchmarkCase(japaneseDinnerBenchmark);

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
