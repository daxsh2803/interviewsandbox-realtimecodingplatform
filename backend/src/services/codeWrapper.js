/**
 * Code wrapping service to support LeetCode-style function-only solutions.
 * 
 * Embeds candidate function code into driver harnesses via {{USER_CODE}} placeholder,
 * while preserving full backward compatibility for standalone scripts that read stdin
 * or define an entry point.
 */

const STANDALONE_PATTERNS = [
  /readFileSync/i,
  /process\.stdin/i,
  /readline/i,
  /input\s*\(/,
  /sys\.stdin/,
  /int\s+main\s*\(/,
  /public\s+static\s+void\s+main/,
];

const FUNCTION_OR_CLASS_PATTERN = /(?:\bfunction\b|=>|\bdef\s+|\bclass\b)/;
const DIRECT_OUTPUT_PATTERN = /(?:console\.log|print\s*\(|std::cout|System\.out\.(?:print|println))/;

/**
 * Checks whether user code is already a standalone script (reads stdin, has main,
 * or is a direct debug snippet calling output without function/class definitions).
 * @param {string} sourceCode
 * @param {string} language
 * @returns {boolean}
 */
function isStandaloneCode(sourceCode, language) {
  if (!sourceCode || typeof sourceCode !== 'string') return false;

  if (STANDALONE_PATTERNS.some((pattern) => pattern.test(sourceCode))) {
    return true;
  }

  // Debug snippet edge case: direct output calls with no function/class definitions
  if (DIRECT_OUTPUT_PATTERN.test(sourceCode) && !FUNCTION_OR_CLASS_PATTERN.test(sourceCode)) {
    return true;
  }

  return false;
}

/**
 * Wraps user source code inside driver code if applicable.
 * @param {Object} params
 * @param {string} params.sourceCode - Candidate's original code
 * @param {string} params.language - Programming language (e.g. 'javascript', 'python')
 * @param {string} [params.driverCode] - Driver code template containing {{USER_CODE}}
 * @returns {string} The code to send to Judge0
 */
function wrapCode({ sourceCode, language, driverCode }) {
  if (!sourceCode) return '';
  if (!driverCode || typeof driverCode !== 'string' || driverCode.trim() === '') {
    return sourceCode;
  }

  // Bypass wrapping if user submitted a standalone script with stdin reading / main
  if (isStandaloneCode(sourceCode, language)) {
    return sourceCode;
  }

  if (driverCode.includes('{{USER_CODE}}')) {
    return driverCode.split('{{USER_CODE}}').join(sourceCode);
  }

  // Fallback: append driver code if placeholder is missing
  return `${sourceCode}\n\n${driverCode}`;
}

module.exports = {
  isStandaloneCode,
  wrapCode,
};
