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

/**
 * Checks whether user code is already a standalone script (reads stdin or has main).
 * @param {string} sourceCode
 * @param {string} language
 * @returns {boolean}
 */
function isStandaloneCode(sourceCode, language) {
  if (!sourceCode || typeof sourceCode !== 'string') return false;
  return STANDALONE_PATTERNS.some((pattern) => pattern.test(sourceCode));
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
