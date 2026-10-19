import * as Diff from 'diff';

export class DiffService {
  /**
   * Generates a unified diff string between original and corrected code
   */
  generateUnifiedDiff(originalCode, correctedCode, filename = 'solution') {
    const orig = originalCode || '';
    const corr = correctedCode || '';
    return Diff.createTwoFilesPatch(
      `original/${filename}`,
      `corrected/${filename}`,
      orig,
      corr,
      '',
      '',
      { context: 3 }
    );
  }

  /**
   * Parses line-by-line structured diff for interactive UI display
   */
  generateStructuredDiff(originalCode, correctedCode) {
    const orig = originalCode || '';
    const corr = correctedCode || '';

    if (orig === corr) {
      const lines = orig.split('\n').map((line, idx) => ({
        type: 'normal',
        oldLineNumber: idx + 1,
        newLineNumber: idx + 1,
        content: line
      }));
      return {
        hasChanges: false,
        additions: 0,
        deletions: 0,
        lines
      };
    }

    const changes = Diff.diffLines(orig, corr);
    const lines = [];
    let oldLine = 1;
    let newLine = 1;
    let additions = 0;
    let deletions = 0;

    for (const part of changes) {
      const partLines = part.value.split('\n');
      // If ends with newline, trailing empty element from split is removed
      if (partLines.length > 0 && partLines[partLines.length - 1] === '') {
        partLines.pop();
      }

      for (const line of partLines) {
        if (part.added) {
          additions++;
          lines.push({
            type: 'add',
            oldLineNumber: null,
            newLineNumber: newLine++,
            content: line
          });
        } else if (part.removed) {
          deletions++;
          lines.push({
            type: 'del',
            oldLineNumber: oldLine++,
            newLineNumber: null,
            content: line
          });
        } else {
          lines.push({
            type: 'normal',
            oldLineNumber: oldLine++,
            newLineNumber: newLine++,
            content: line
          });
        }
      }
    }

    return {
      hasChanges: additions > 0 || deletions > 0,
      additions,
      deletions,
      lines
    };
  }
}
