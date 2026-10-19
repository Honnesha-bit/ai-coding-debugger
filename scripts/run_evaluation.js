import { EvaluationService } from '../src/services/evaluationService.js';
import { getDatabase } from '../src/db/database.js';

async function main() {
  console.log('====================================================');
  console.log('AI CODING DEBUGGER — HELD-OUT EVALUATION BENCHMARK');
  console.log('====================================================\n');

  // Initialize DB
  getDatabase();

  const service = new EvaluationService();
  console.log('Loading frozen held-out dataset...');
  const dataset = service.loadDataset();
  console.log(`Loaded ${dataset.length} held-out test cases.\n`);

  console.log('Executing evaluation against sandbox...');
  const startTime = Date.now();
  const run = await service.runEvaluation();
  const totalDurationMs = Date.now() - startTime;

  console.log('\n====================================================');
  console.log('EVALUATION RESULTS & REQUIRED METRICS');
  console.log('====================================================');
  console.log(`Run ID:                     ${run.id}`);
  console.log(`Timestamp:                  ${run.timestamp}`);
  console.log(`Total Cases Evaluated:      ${run.totalCases}`);
  console.log(`1. Fix Success Rate:        ${(run.fixSuccessRate * 100).toFixed(2)}% (${Math.round(run.fixSuccessRate * run.totalCases)}/${run.totalCases})`);
  console.log(`2. Compilation Success Rate:${(run.compilationSuccessRate * 100).toFixed(2)}%`);
  console.log(`3. Regression Rate:         ${(run.regressionRate * 100).toFixed(2)}%`);
  console.log(`4. Explanation Accuracy:    ${(run.explanationAccuracy * 100).toFixed(2)}% (Rubric 1.0/0.7/0.0)`);
  console.log(`5. Sandbox Failure Rate:    ${(run.sandboxFailureRate * 100).toFixed(2)}% (Infrastructure errors)`);
  console.log(`6. Median Latency:          ${run.medianLatencyMs} ms (${run.latencyObservations} observations)`);
  console.log(`7. Failure Counts:          ${JSON.stringify(run.failureCounts)}`);
  console.log(`Total Execution Wall-Time:  ${(totalDurationMs / 1000).toFixed(2)} s`);
  console.log('====================================================\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Evaluation benchmark failed:', err);
  process.exit(1);
});
