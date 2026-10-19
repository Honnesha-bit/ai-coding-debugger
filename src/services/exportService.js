export class ExportService {
  /**
   * Prevents CSV Formula Injection (CWE-1236) by neutralizing formula trigger characters
   */
  static sanitizeCsvField(value) {
    if (value === null || value === undefined) {
      return '';
    }

    let str = String(value);

    // Formula injection prevention: if string starts with dangerous characters, prepend with single quote
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }

    // Standard CSV escaping: if contains comma, quote, or newline, escape inner quotes and wrap in quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
  }

  /**
   * Generates a sanitized CSV string from evaluation run results
   */
  static toCsv(evaluationRun) {
    if (!evaluationRun || !evaluationRun.rawResults || evaluationRun.rawResults.length === 0) {
      return 'id,title,language,category,status,fixSuccess,compilationSuccess,regression,explanationScore,latencyMs\n';
    }

    const headers = [
      'id',
      'title',
      'language',
      'category',
      'status',
      'verificationCategory',
      'staticCheckPassed',
      'executionAvailable',
      'fixSuccess',
      'compilationSuccess',
      'regression',
      'explanationScore',
      'latencyMs',
      'diagnosis',
      'rootCause'
    ];

    const lines = [headers.join(',')];

    for (const item of evaluationRun.rawResults) {
      const row = [
        this.sanitizeCsvField(item.id),
        this.sanitizeCsvField(item.title),
        this.sanitizeCsvField(item.language),
        this.sanitizeCsvField(item.category),
        this.sanitizeCsvField(item.correctedStatus || item.status || 'UNKNOWN'),
        this.sanitizeCsvField(item.verificationCategory || (item.fixSuccess ? 'TESTS_PASSED_VERIFIED' : 'TESTS_FAILED_VERIFIED')),
        this.sanitizeCsvField(item.staticCheckPassed !== undefined ? Boolean(item.staticCheckPassed) : true),
        this.sanitizeCsvField(item.executionAvailable !== undefined ? Boolean(item.executionAvailable) : true),
        this.sanitizeCsvField(Boolean(item.fixSuccess)),
        this.sanitizeCsvField(Boolean(item.compilationSuccess)),
        this.sanitizeCsvField(Boolean(item.regression)),
        this.sanitizeCsvField(item.explanationScore ?? 0),
        this.sanitizeCsvField(item.latencyMs ?? 0),
        this.sanitizeCsvField(item.diagnosis || ''),
        this.sanitizeCsvField(item.rootCause || '')
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Formats a clean, secure JSON export with strict types and no sensitive fields
   */
  static toJson(evaluationRun) {
    if (!evaluationRun) {
      return JSON.stringify({ error: 'No evaluation data available' }, null, 2);
    }

    const cleanData = {
      runId: evaluationRun.id,
      timestamp: evaluationRun.timestamp,
      summaryMetrics: {
        totalCases: Number(evaluationRun.totalCases),
        fixSuccessRate: Number(evaluationRun.fixSuccessRate),
        compilationSuccessRate: Number(evaluationRun.compilationSuccessRate),
        staticCheckSuccessRate: evaluationRun.staticCheckSuccessRate !== undefined ? Number(evaluationRun.staticCheckSuccessRate) : undefined,
        executionAvailableRate: evaluationRun.executionAvailableRate !== undefined ? Number(evaluationRun.executionAvailableRate) : undefined,
        regressionRate: Number(evaluationRun.regressionRate),
        explanationAccuracy: Number(evaluationRun.explanationAccuracy),
        sandboxFailureRate: Number(evaluationRun.sandboxFailureRate),
        medianLatencyMs: Number(evaluationRun.medianLatencyMs),
        latencyObservations: Number(evaluationRun.latencyObservations)
      },
      failureCounts: evaluationRun.failureCounts || {},
      results: (evaluationRun.rawResults || []).map(r => ({
        id: r.id,
        title: r.title,
        language: r.language,
        category: r.category,
        verificationCategory: r.verificationCategory || (r.fixSuccess ? 'TESTS_PASSED_VERIFIED' : 'TESTS_FAILED_VERIFIED'),
        staticCheckPassed: r.staticCheckPassed !== undefined ? Boolean(r.staticCheckPassed) : true,
        executionAvailable: r.executionAvailable !== undefined ? Boolean(r.executionAvailable) : true,
        fixSuccess: Boolean(r.fixSuccess),
        compilationSuccess: Boolean(r.compilationSuccess),
        regression: Boolean(r.regression),
        explanationScore: Number(r.explanationScore),
        latencyMs: Number(r.latencyMs),
        diagnosis: r.diagnosis || '',
        rootCause: r.rootCause || '',
        confidence: r.confidence || 'unknown'
      }))
    };

    return JSON.stringify(cleanData, null, 2);
  }
}
