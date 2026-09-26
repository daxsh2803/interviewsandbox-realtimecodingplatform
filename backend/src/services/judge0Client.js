const config = require('../config');

// Language ID mapping for Judge0 (Common CE defaults)
const LANGUAGE_MAP = {
  javascript: 63,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
};

function getLanguageId(appLanguage) {
  const id = LANGUAGE_MAP[appLanguage.toLowerCase()];
  if (!id) throw new Error(`Unsupported language: ${appLanguage}`);
  return id;
}

// Maps Judge0 Status ID to Application Status
const STATUS_MAP = {
  1: 'Processing', // In Queue
  2: 'Processing', // Processing
  3: 'Accepted',
  4: 'Wrong Answer',
  5: 'Time Limit Exceeded',
  6: 'Compilation Error',
  7: 'Runtime Error', // SIGSEGV
  8: 'Runtime Error', // SIGXFSZ
  9: 'Runtime Error', // SIGFPE
  10: 'Runtime Error', // SIGABRT
  11: 'Runtime Error', // NZEC
  12: 'Runtime Error', // Other
  13: 'Internal Error',
  14: 'Internal Error',
};

function mapJudge0Status(statusId) {
  return STATUS_MAP[statusId] || 'Internal Error';
}

/**
 * Submits code to Judge0 for asynchronous execution.
 * @param {Object} params - { sourceCode, language, stdin, executionId }
 * @returns {Promise<string>} judge0 submission token
 */
async function submitCode({ sourceCode, language, stdin, executionId, callbackUrlOverride }) {
  const language_id = getLanguageId(language);
  const url = `${config.judge0.baseUrl}/submissions?base64_encoded=false&wait=false`;

  const body = {
    source_code: sourceCode,
    language_id,
    stdin: stdin || '',
    cpu_time_limit: config.judge0.cpuTimeLimit,
    wall_time_limit: config.judge0.wallTimeLimit,
    memory_limit: config.judge0.memoryLimit,
    callback_url: callbackUrlOverride !== undefined 
      ? callbackUrlOverride 
      : (config.judge0.callbackUrl 
        ? `${config.judge0.callbackUrl}?secret=${encodeURIComponent(config.judge0.callbackSecret)}`
        : undefined)
  };

  const headers = {
    'Content-Type': 'application/json',
  };
  if (config.judge0.apiKey) {
    headers['X-Auth-Token'] = config.judge0.apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Judge0 Submission Failed: ${response.status} - ${text}`);
    throw new Error(`Judge0 API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.token;
}

module.exports = {
  submitCode,
  getLanguageId,
  mapJudge0Status,
};
