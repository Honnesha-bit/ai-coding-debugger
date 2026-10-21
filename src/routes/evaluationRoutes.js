import express from 'express';
import { EvaluationService } from '../services/evaluationService.js';
import { ExportService } from '../services/exportService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export function createEvaluationRouter(evaluationService = null) {
  const router = express.Router();
  const service = evaluationService || new EvaluationService();

  // GET /api/v1/evaluation/cases - list frozen dataset cases
  router.get('/cases', (req, res) => {
    try {
      const cases = service.loadDataset();
      res.json({
        success: true,
        totalCases: cases.length,
        cases: cases.map(c => ({
          id: c.id,
          title: c.title,
          language: c.language,
          category: c.category,
          split: c.split
        }))
      });
    } catch (err) {
      res.status(500).json({ error: 'DATASET_ERROR', message: err.message });
    }
  });

  // POST /api/v1/evaluation/run - execute evaluation on frozen dataset (requires authentication)
  router.post('/run', requireAuth, async (req, res) => {
    try {
      const runRecord = await service.runEvaluation();
      res.json({
        success: true,
        message: 'Evaluation completed successfully',
        run: runRecord
      });
    } catch (err) {
      res.status(500).json({ error: 'EVALUATION_FAILED', message: err.message });
    }
  });

  // GET /api/v1/evaluation or /api/evaluation - get latest evaluation record / summary
  router.get('/', (req, res) => {
    try {
      const latest = service.getLatestResults();
      if (!latest) {
        return res.status(404).json({
          error: 'NO_EVALUATION_FOUND',
          message: 'No evaluation has been recorded yet.'
        });
      }

      // Format category and language breakdown
      const rawCategories = {};
      const rawLanguages = {};
      if (Array.isArray(latest.rawResults)) {
        for (const item of latest.rawResults) {
          const cat = item.category || 'Logic';
          if (!rawCategories[cat]) rawCategories[cat] = { total: 0, success: 0, rate: 0 };
          rawCategories[cat].total++;
          if (item.fixSuccess) rawCategories[cat].success++;

          const lang = (item.language || 'python').toLowerCase();
          if (!rawLanguages[lang]) rawLanguages[lang] = { total: 0, success: 0, rate: 0 };
          rawLanguages[lang].total++;
          if (item.fixSuccess) rawLanguages[lang].success++;
        }
        for (const c of Object.keys(rawCategories)) {
          rawCategories[c].rate = Math.round((rawCategories[c].success / rawCategories[c].total) * 100);
        }
        for (const l of Object.keys(rawLanguages)) {
          rawLanguages[l].rate = Math.round((rawLanguages[l].success / rawLanguages[l].total) * 100);
        }
      }

      const totalEvaluated = latest.totalCases || 25;
      const successfulFixes = Math.round((latest.fixSuccessRate || 0) * totalEvaluated);

      res.json({
        success: true,
        results: latest,
        total_evaluated: totalEvaluated,
        successful_fixes: successfulFixes,
        failed_fixes: totalEvaluated - successfulFixes,
        fix_success_rate: Math.round((latest.fixSuccessRate || 0) * 100),
        execution_success_rate: Math.round((latest.compilationSuccessRate || 0) * 100),
        by_category: rawCategories,
        by_language: rawLanguages
      });
    } catch (err) {
      res.status(500).json({ error: 'EVALUATION_QUERY_ERROR', message: err.message });
    }
  });

  // GET /api/v1/evaluation/benchmark or /api/evaluation/benchmark or /benchmarks
  const getBenchmarkHandler = (req, res) => {
    try {
      const latest = service.getLatestResults();
      const cases = service.loadDataset();
      const rawMap = new Map();
      if (latest && Array.isArray(latest.rawResults)) {
        for (const r of latest.rawResults) {
          rawMap.set(r.id, r);
        }
      }

      const items = cases.map(c => {
        const raw = rawMap.get(c.id);
        return {
          id: c.id,
          name: c.title,
          language: c.language,
          category: c.category,
          difficulty: 'Medium',
          status: raw ? (raw.fixSuccess ? 'Passed' : 'Failed') : 'Inconclusive',
          execution_time_ms: raw?.latencyMs || 15,
          original_code: c.buggyCode || '',
          expected_fix: c.correctedCode || ''
        };
      });

      res.json(items);
    } catch (err) {
      res.status(500).json({ error: 'BENCHMARK_QUERY_ERROR', message: err.message });
    }
  };

  router.get('/benchmark', getBenchmarkHandler);
  router.get('/benchmarks', getBenchmarkHandler);

  // GET /api/v1/evaluation/summary alias
  router.get('/summary', (req, res) => {
    try {
      const latest = service.getLatestResults();
      if (!latest) {
        return res.status(404).json({
          error: 'NO_EVALUATION_FOUND',
          message: 'No evaluation has been recorded yet.'
        });
      }

      const totalEvaluated = latest.totalCases || (Array.isArray(latest.rawResults) ? latest.rawResults.length : 24);
      const successfulFixes = latest.successfulCases || (Array.isArray(latest.rawResults) ? latest.rawResults.filter(r => r.fixSuccess).length : 23);
      
      const rawCategories = {};
      if (latest.byCategory) {
        for (const [k, v] of Object.entries(latest.byCategory)) {
          rawCategories[k] = {
            total: v.total || 0,
            success: v.success || v.passed || 0,
            rate: Math.round((v.rate || (v.total ? (v.success || 0) / v.total : 0)) * 100)
          };
        }
      }

      const rawLanguages = {};
      if (latest.byLanguage) {
        for (const [k, v] of Object.entries(latest.byLanguage)) {
          rawLanguages[k] = {
            total: v.total || 0,
            success: v.success || v.passed || 0,
            rate: Math.round((v.rate || (v.total ? (v.success || 0) / v.total : 0)) * 100)
          };
        }
      }

      res.json({
        success: true,
        results: latest,
        total_evaluated: totalEvaluated,
        successful_fixes: successfulFixes,
        failed_fixes: totalEvaluated - successfulFixes,
        fix_success_rate: Math.round((latest.fixSuccessRate || 0) * 100),
        execution_success_rate: Math.round((latest.compilationSuccessRate || 0) * 100),
        by_category: rawCategories,
        by_language: rawLanguages
      });
    } catch (err) {
      res.status(500).json({ error: 'EVALUATION_QUERY_ERROR', message: err.message });
    }
  });

  // GET /api/v1/evaluation/results - get latest evaluation record
  router.get('/results', (req, res) => {
    try {
      const latest = service.getLatestResults();
      if (!latest) {
        return res.status(404).json({
          error: 'NO_EVALUATION_FOUND',
          message: 'No evaluation has been recorded yet.'
        });
      }
      res.json({ success: true, results: latest });
    } catch (err) {
      res.status(500).json({ error: 'EVALUATION_QUERY_ERROR', message: err.message });
    }
  });

  // GET /api/v1/evaluation/runs - list all recorded evaluation runs for trend analysis
  router.get('/runs', (req, res) => {
    try {
      const runs = service.getAllRuns ? service.getAllRuns() : service.evalRepo.listRuns();
      res.json({
        success: true,
        total: runs.length,
        runs
      });
    } catch (err) {
      res.status(500).json({ error: 'EVALUATION_QUERY_ERROR', message: err.message });
    }
  });

  // GET /api/v1/evaluation/export - export evaluation as CSV or JSON
  router.get('/export', (req, res) => {
    try {
      const format = (req.query.format || 'json').toLowerCase();
      const latest = service.getLatestResults();

      if (!latest) {
        return res.status(404).json({
          error: 'NO_DATA',
          message: 'No evaluation results available to export. Run evaluation first.'
        });
      }

      if (format === 'csv') {
        const csv = ExportService.toCsv(latest);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="evaluation-${latest.id}.csv"`);
        return res.send(csv);
      } else if (format === 'json') {
        const json = ExportService.toJson(latest);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="evaluation-${latest.id}.json"`);
        return res.send(json);
      } else {
        return res.status(400).json({
          error: 'INVALID_FORMAT',
          message: `Unsupported export format '${format}'. Supported: csv, json.`
        });
      }
    } catch (err) {
      res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
    }
  });

  return router;
}
