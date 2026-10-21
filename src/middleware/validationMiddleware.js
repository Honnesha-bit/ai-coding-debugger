import { LanguageRegistry } from '../services/languages/languageRegistry.js';

export const LIMITS = {
  MAX_SOURCE_CODE_CHARS: 65536,         // 64 KB characters
  MAX_SOURCE_CODE_BYTES: 131072,        // 128 KB UTF-8 bytes
  MAX_ERROR_DESC_CHARS: 8192,           // 8 KB characters
  MAX_ERROR_DESC_BYTES: 16384,          // 16 KB UTF-8 bytes
  MAX_EXPECTED_OUTPUT_CHARS: 16384,     // 16 KB characters
  MAX_EXPECTED_OUTPUT_BYTES: 32768,     // 32 KB UTF-8 bytes
  MAX_TEST_CASES_CHARS: 32768,          // 32 KB characters
  MAX_TEST_CASES_BYTES: 65536,          // 64 KB UTF-8 bytes
  MAX_LANGUAGE_ID_CHARS: 32,            // 32 characters
  MAX_FILENAME_CHARS: 256,              // 256 characters
  MAX_STRUCTURED_TEST_CASES: 10,        // Max 10 custom test cases
  MAX_TEST_CASE_FIELD_CHARS: 4096       // Max 4 KB per test case input/expected
};

export class ValidationError extends Error {
  constructor(message, field = null, code = 'INVALID_INPUT', status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
    this.status = status;
    this.statusCode = status;
  }
}

/**
 * Validates debugging submission parameters across routes and internal service boundaries.
 * Throws ValidationError if inputs are invalid or exceed size limits.
 */
export function validateDebugSubmission({ language, sourceCode, errorDescription = '', expectedOutput = '', testCases = '' } = {}) {
  // 1. Validate sourceCode
  if (!sourceCode || typeof sourceCode !== 'string' || !sourceCode.trim()) {
    throw new ValidationError('Source code is required and cannot be empty.', 'sourceCode');
  }

  if (sourceCode.length > LIMITS.MAX_SOURCE_CODE_CHARS) {
    throw new ValidationError(
      `Source code exceeds maximum allowed length of ${LIMITS.MAX_SOURCE_CODE_CHARS.toLocaleString()} characters.`,
      'sourceCode'
    );
  }

  if (Buffer.byteLength(sourceCode, 'utf8') > LIMITS.MAX_SOURCE_CODE_BYTES) {
    throw new ValidationError(
      `Source code exceeds maximum allowed UTF-8 size of ${LIMITS.MAX_SOURCE_CODE_BYTES / 1024}KB.`,
      'sourceCode'
    );
  }

  // 2. Validate language
  if (!language || typeof language !== 'string' || !language.trim()) {
    throw new ValidationError('Programming language is required.', 'language');
  }

  const trimmedLang = language.trim();
  if (trimmedLang.length > LIMITS.MAX_LANGUAGE_ID_CHARS) {
    throw new ValidationError(
      `Language identifier exceeds maximum length of ${LIMITS.MAX_LANGUAGE_ID_CHARS} characters.`,
      'language'
    );
  }

  if (!LanguageRegistry.isSupported(trimmedLang)) {
    throw new ValidationError(
      `Language '${trimmedLang}' is not supported.`,
      'language',
      'UNSUPPORTED_LANGUAGE',
      400
    );
  }

  // 3. Validate errorDescription (optional)
  if (errorDescription !== undefined && errorDescription !== null && errorDescription !== '') {
    if (typeof errorDescription !== 'string') {
      throw new ValidationError('Error description must be a string.', 'errorDescription');
    }
    if (errorDescription.length > LIMITS.MAX_ERROR_DESC_CHARS) {
      throw new ValidationError(
        `Error description exceeds maximum allowed length of ${LIMITS.MAX_ERROR_DESC_CHARS.toLocaleString()} characters.`,
        'errorDescription'
      );
    }
    if (Buffer.byteLength(errorDescription, 'utf8') > LIMITS.MAX_ERROR_DESC_BYTES) {
      throw new ValidationError(
        `Error description exceeds maximum allowed UTF-8 size of ${LIMITS.MAX_ERROR_DESC_BYTES / 1024}KB.`,
        'errorDescription'
      );
    }
  }

  // 4. Validate expectedOutput (optional)
  if (expectedOutput !== undefined && expectedOutput !== null && expectedOutput !== '') {
    if (typeof expectedOutput !== 'string') {
      throw new ValidationError('Expected output must be a string.', 'expectedOutput');
    }
    if (expectedOutput.length > LIMITS.MAX_EXPECTED_OUTPUT_CHARS) {
      throw new ValidationError(
        `Expected output exceeds maximum allowed length of ${LIMITS.MAX_EXPECTED_OUTPUT_CHARS.toLocaleString()} characters.`,
        'expectedOutput'
      );
    }
    if (Buffer.byteLength(expectedOutput, 'utf8') > LIMITS.MAX_EXPECTED_OUTPUT_BYTES) {
      throw new ValidationError(
        `Expected output exceeds maximum allowed UTF-8 size of ${LIMITS.MAX_EXPECTED_OUTPUT_BYTES / 1024}KB.`,
        'expectedOutput'
      );
    }
  }

  // 5. Validate testCases (optional)
  if (testCases !== undefined && testCases !== null && testCases !== '') {
    if (Array.isArray(testCases)) {
      if (testCases.length > LIMITS.MAX_STRUCTURED_TEST_CASES) {
        throw new ValidationError(
          `Test cases array exceeds maximum allowed count of ${LIMITS.MAX_STRUCTURED_TEST_CASES} test cases.`,
          'testCases'
        );
      }
      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
          throw new ValidationError(`Test case at index ${i} must be an object.`, 'testCases');
        }
        if (tc.input !== undefined && tc.input !== null) {
          if (typeof tc.input !== 'string') {
            throw new ValidationError(`Test case input at index ${i} must be a string.`, 'testCases');
          }
          if (tc.input.length > LIMITS.MAX_TEST_CASE_FIELD_CHARS) {
            throw new ValidationError(
              `Test case input at index ${i} exceeds maximum allowed size of ${LIMITS.MAX_TEST_CASE_FIELD_CHARS.toLocaleString()} characters.`,
              'testCases'
            );
          }
        }
        if (tc.expected !== undefined && tc.expected !== null) {
          if (typeof tc.expected !== 'string') {
            throw new ValidationError(`Test case expected output at index ${i} must be a string.`, 'testCases');
          }
          if (tc.expected.length > LIMITS.MAX_TEST_CASE_FIELD_CHARS) {
            throw new ValidationError(
              `Test case expected output at index ${i} exceeds maximum allowed size of ${LIMITS.MAX_TEST_CASE_FIELD_CHARS.toLocaleString()} characters.`,
              'testCases'
            );
          }
        }
      }
    } else if (typeof testCases === 'string') {
      if (testCases.length > LIMITS.MAX_TEST_CASES_CHARS) {
        throw new ValidationError(
          `Test cases exceed maximum allowed length of ${LIMITS.MAX_TEST_CASES_CHARS.toLocaleString()} characters.`,
          'testCases'
        );
      }
      if (Buffer.byteLength(testCases, 'utf8') > LIMITS.MAX_TEST_CASES_BYTES) {
        throw new ValidationError(
          `Test cases exceed maximum allowed UTF-8 size of ${LIMITS.MAX_TEST_CASES_BYTES / 1024}KB.`,
          'testCases'
        );
      }
    } else {
      throw new ValidationError('Test cases must be a string or array.', 'testCases');
    }
  }

  return true;
}

/**
 * Express middleware for pre-validation of submission parameters before reserving guest attempts.
 */
export function validateSubmissionMiddleware(req, res, next) {
  try {
    if (req.body) {
      if (!req.body.sourceCode && req.body.code) req.body.sourceCode = req.body.code;
      if (!req.body.errorDescription && req.body.error_description) req.body.errorDescription = req.body.error_description;
      if (!req.body.expectedOutput && req.body.expected_output) req.body.expectedOutput = req.body.expected_output;
      if (!req.body.testCases && req.body.test_cases) req.body.testCases = req.body.test_cases;
    }
    const { language, sourceCode, errorDescription, expectedOutput, testCases } = req.body || {};
    validateDebugSubmission({ language, sourceCode, errorDescription, expectedOutput, testCases });
    next();
  } catch (err) {
    const status = err.status || 400;
    const code = err.code || 'INVALID_INPUT';
    return res.status(status).json({
      error: code,
      message: err.message,
      ...(err.field ? { field: err.field } : {})
    });
  }
}

/**
 * Validates inputs for the /languages/detect endpoint.
 */
export function validateLanguageDetectionInput({ code, filename } = {}) {
  if (code !== undefined && code !== null) {
    if (typeof code !== 'string') {
      throw new ValidationError('Code must be a string.', 'code');
    }
    if (code.length > LIMITS.MAX_SOURCE_CODE_CHARS) {
      throw new ValidationError(
        `Code exceeds maximum allowed length of ${LIMITS.MAX_SOURCE_CODE_CHARS.toLocaleString()} characters.`,
        'code'
      );
    }
    if (Buffer.byteLength(code, 'utf8') > LIMITS.MAX_SOURCE_CODE_BYTES) {
      throw new ValidationError(
        `Code exceeds maximum allowed UTF-8 size of ${LIMITS.MAX_SOURCE_CODE_BYTES / 1024}KB.`,
        'code'
      );
    }
  }

  if (filename !== undefined && filename !== null) {
    if (typeof filename !== 'string') {
      throw new ValidationError('Filename must be a string.', 'filename');
    }
    if (filename.length > LIMITS.MAX_FILENAME_CHARS) {
      throw new ValidationError(
        `Filename exceeds maximum allowed length of ${LIMITS.MAX_FILENAME_CHARS} characters.`,
        'filename'
      );
    }
  }

  return true;
}
