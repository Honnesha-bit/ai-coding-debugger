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
