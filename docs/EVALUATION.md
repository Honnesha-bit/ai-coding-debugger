# AI Coding Debugger — Evaluation Benchmark & Metrics Specification

## 1. Held-Out Evaluation Dataset Methodology

The evaluation dataset consists of **25 distinct, hand-curated held-out buggy code snippets** (`data/held_out_dataset.json`). The dataset is strictly **frozen** to prevent data contamination and prompt tuning against individual test cases.

### 1.1 Dataset Properties
- **Total Test Cases**: 25 distinct snippets
- **Languages Covered**:
  - Python 3 (13 cases)
  - JavaScript / Node.js (12 cases)
- **Split**: `held-out` (independent of training/prompt tuning)
- **Bug Categories**:
  1. `off-by-one`: Binary search upper bound (`eval-01`)
  2. `logic-error`: Case & whitespace insensitive palindrome (`eval-02`)
  3. `mutation-state`: Python mutable default arguments (`eval-03`)
  4. `type-coercion`: Lexicographical array sorting in JS (`eval-04`)
  5. `boundary-condition`: Division by zero in empty list average (`eval-05`)
  6. `reference-copy`: Shallow vs deep object copy (`eval-06`)
  7. `recursion-depth`: Fibonacci recursion without base case zero (`eval-07`)
  8. `scoping`: Variable closure capture inside loops (`eval-08`)
  9. `null-safety`: Unhandled dictionary key lookups (`eval-09`)
  10. `async-concurrency`: Unawaited Promise arithmetic (`eval-10`)
  11. `type-error`: String concatenation with floating-point values (`eval-11`)
  12. `boundary-condition`: Array reduce without initial value on empty list (`eval-12`)
  13. `data-structure`: Recursive list flattening discarding return values (`eval-13`)
  14. `mutation-state`: In-place object property deletion (`eval-14`)
  15. `logic-error`: Case-sensitive anagram comparison (`eval-15`)
  16. `api-misuse`: JavaScript zero-indexed Date months (`eval-16`)
  17. `numeric-precision`: Integer square root boundary (`eval-17`)
  18. `type-coercion`: NaN strict equality comparison (`eval-18`)
  19. `iterator-invalidation`: In-place list mutation during iteration (`eval-19`)
  20. `reference-equality`: Object deduplication using Set (`eval-20`)
  21. `logic-error`: Two sum duplicate element reuse (`eval-21`)
  22. `api-misuse`: Single-occurrence string replace (`eval-22`)
  23. `boundary-condition`: Prime number checker edge cases (`eval-23`)
  24. `equality`: Object key ordering in JSON equality (`eval-24`)
  25. `mutation-state`: Nested dictionary shallow copy (`eval-25`)

---

## 2. The 7 Required Evaluation Metrics

Every evaluation run records all 7 metrics mandated by the project specification:

### 2.1 Fix Success Rate
- **Definition**: The proportion of eligible evaluated code snippets where the AI-generated correction successfully compiles and passes the verification test suite in the execution sandbox.
- **Formula**: `fixes_succeeded / eligible_cases`
- **Recorded Result**: **80.00%** (20 / 25)

### 2.2 Compilation Success Rate
- **Definition**: The proportion of corrected programs that compiled (or parsed in interpreted runtimes) without syntax or compilation errors.
- **Formula**: `compilations_succeeded / cases_compilation_applies`
- **Recorded Result**: **80.00%** (20 / 25)

### 2.3 Regression Rate
- **Definition**: The proportion of corrected programs that introduced regressions (defined as failing a baseline test that the original buggy program passed, or introducing a crash where the original code ran cleanly).
- **Formula**: `regressions_introduced / eligible_tested_programs`
- **Recorded Result**: **0.00%** (0 / 25)

### 2.4 Explanation Accuracy
- **Definition**: A qualitative scoring rubric assessing the quality of the root-cause diagnosis.
  - **Rubric**:
    - `1.0`: Accurate root-cause identification + clear simple English explanation + successful fix.
    - `0.7`: Partial identification or valid diagnosis with unverified fix.
    - `0.0`: Completely incorrect or irrelevant diagnosis.
- **Formula**: `total_explanation_score / total_cases_reviewed`
- **Recorded Result**: **94.00%** (23.5 / 25.0)

### 2.5 Sandbox Failure Rate
- **Definition**: The proportion of execution attempts that failed due to internal sandbox infrastructure problems (such as missing runtimes, process spawning crashes, or disk failures), as opposed to code-under-test errors.
- **Formula**: `infrastructure_failures / total_execution_attempts`
- **Recorded Result**: **0.00%** (0 / 50 total sandbox executions)

### 2.6 Median Latency
- **Definition**: The median execution time across all evaluation observations, recorded in milliseconds.
- **Recorded Result**: **0 ms** median latency in deterministic mode (<1 ms per observation across 25 cases).

### 2.7 Failure Counts
- **Definition**: Categorized count of distinct failure modes encountered during the evaluation run.
- **Recorded Result**:
  - `providerErrors`: 0
  - `malformedResponses`: 0
  - `timeouts`: 0
  - `compilationFailures`: 5
  - `testFailures`: 0
  - `executionUnavailable`: 0 (when container runtime is functional, increments honestly if unavailable)

### 2.8 Safe Verification & Execution Availability Metrics
To maintain strict evaluation discipline across environments without Docker:
- **`staticCheckSuccessRate`**: Proportion of AI-suggested corrections that pass static delimiter and syntax checks.
- **`executionAvailableRate`**: Proportion of test executions evaluated in an isolated container sandbox.
- **Honest Rule**: An `execution_unavailable` outcome is NEVER counted as a fix success (`fixSuccess: false`).
- **Export Schema**: CSV and JSON exports include `verificationCategory` (one of the 8 canonical categories), `staticCheckPassed`, and `executionAvailable`.

---

## 3. Reproducible CLI Commands

To run the evaluation benchmark:
```bash
npm run evaluate
```

To export evaluation results to CSV and JSON:
```bash
npm run export
```
Outputs are written to:
- `data/latest_evaluation.csv`
- `data/latest_evaluation.json`
