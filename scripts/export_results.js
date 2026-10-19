import fs from 'node:fs';
import path from 'node:path';
import { EvaluationRepository } from '../src/db/repositories/evaluationRepository.js';
import { ExportService } from '../src/services/exportService.js';
import { getDatabase } from '../src/db/database.js';
import { config } from '../src/config.js';

async function main() {
  getDatabase();
  const repo = new EvaluationRepository();
  const latest = repo.getLatestRun();

  if (!latest) {
    console.error('No evaluation runs recorded. Run "npm run evaluate" first.');
    process.exit(1);
  }

  const csvContent = ExportService.toCsv(latest);
  const jsonContent = ExportService.toJson(latest);

  const outDir = path.join(config.ROOT_DIR, 'data');
  const csvPath = path.join(outDir, 'latest_evaluation.csv');
  const jsonPath = path.join(outDir, 'latest_evaluation.json');

  fs.writeFileSync(csvPath, csvContent, 'utf8');
  fs.writeFileSync(jsonPath, jsonContent, 'utf8');

  console.log(`Saved CSV export to: ${csvPath}`);
  console.log(`Saved JSON export to: ${jsonPath}`);
  console.log('Exports generated successfully.');
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
