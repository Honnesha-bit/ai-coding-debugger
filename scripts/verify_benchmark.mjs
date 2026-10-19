import fs from 'node:fs';
import { EvaluationService } from '../src/services/evaluationService.js';

async function verifyBenchmark() {
  const content = fs.readFileSync('data/held_out_dataset.json', 'utf8');
  const dataset = JSON.parse(content);

  console.log(`=== HELD-OUT DATASET AUDIT (Total cases: ${dataset.length}) ===`);
  const langCounts = {};
  const catCounts = {};
  const ids = new Set();

  for (const c of dataset) {
    if (ids.has(c.id)) {
      console.error(`Duplicate ID found: ${c.id}`);
    }
    ids.add(c.id);
    langCounts[c.language] = (langCounts[c.language] || 0) + 1;
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
  }

  console.log('Languages distribution:', langCounts);
  console.log('Categories distribution:', catCounts);
  console.log('All IDs unique:', ids.size === dataset.length);

  console.log('\n=== RUNNING BENCHMARK EVALUATION ===');
  const evalService = new EvaluationService();
  const report = await evalService.runEvaluation();

  console.log('\n=== RECALCULATED METRICS ===');
  console.log({
    totalCases: report.totalCases,
    fixSuccessRate: `${(report.fixSuccessRate * 100).toFixed(1)}%`,
    compilationSuccessRate: `${(report.compilationSuccessRate * 100).toFixed(1)}%`,
    regressionRate: `${(report.regressionRate * 100).toFixed(1)}%`,
    explanationAccuracy: `${(report.explanationAccuracy * 100).toFixed(1)}%`,
    sandboxFailureRate: `${(report.sandboxFailureRate * 100).toFixed(1)}%`,
    medianLatencyMs: `${report.medianLatencyMs} ms`,
    failureCounts: report.failureCounts
  });

  const fixSuccesses = report.rawResults.filter(r => r.fixSuccess).length;
  const compSuccesses = report.rawResults.filter(r => r.compilationSuccess).length;
  const regressions = report.rawResults.filter(r => r.regression).length;
  const totalScore = report.rawResults.reduce((acc, r) => acc + (r.explanationScore || 0), 0);

  console.log('\n=== EXACT COUNTS ===');
  console.log(`Fixes Succeeded: ${fixSuccesses} / ${report.totalCases} (${((fixSuccesses / report.totalCases) * 100).toFixed(1)}%)`);
  console.log(`Compilation Succeeded: ${compSuccesses} / ${report.totalCases} (${((compSuccesses / report.totalCases) * 100).toFixed(1)}%)`);
  console.log(`Regressions: ${regressions} / ${report.totalCases} (${((regressions / report.totalCases) * 100).toFixed(1)}%)`);
  console.log(`Total Explanation Score: ${totalScore.toFixed(1)} / ${report.totalCases} (${((totalScore / report.totalCases) * 100).toFixed(1)}%)`);
}

verifyBenchmark();
