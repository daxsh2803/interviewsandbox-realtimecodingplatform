const judge0Client = require('../services/judge0Client');
const config = require('../config');

describe('Judge0 Client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should include server-controlled resource limits and secret in the payload', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token' })
    });

    await judge0Client.submitCode({
      sourceCode: 'print(1)',
      language: 'python',
      stdin: '',
      executionId: 'exec-123'
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    // Check the body of the fetch request
    const fetchArgs = global.fetch.mock.calls[0];
    const url = fetchArgs[0];
    const options = fetchArgs[1];
    
    expect(url).toContain(config.judge0.baseUrl);
    
    const body = JSON.parse(options.body);
    expect(body.source_code).toBe('print(1)');
    expect(body.language_id).toBe(71); // Python
    
    // Resource limits
    expect(body.cpu_time_limit).toBe(config.judge0.cpuTimeLimit);
    expect(body.wall_time_limit).toBe(config.judge0.wallTimeLimit);
    expect(body.memory_limit).toBe(config.judge0.memoryLimit);

    // Callback URL and secret
    expect(body.callback_url).toContain(encodeURIComponent(config.judge0.callbackSecret));
  });

  it('should fetch submission with base64_encoded=true and authorization headers', async () => {
    const originalApiKey = config.judge0.apiKey;
    config.judge0.apiKey = 'test-api-key';

    try {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'sub-token-abc',
          status: { id: 3, description: 'Accepted' },
          stdout: 'aGVsbG8=',
        }),
      });

      const res = await judge0Client.getSubmission('sub-token-abc');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];

      expect(url).toBe(`${config.judge0.baseUrl.replace(/\/+$/, '')}/submissions/sub-token-abc?base64_encoded=true`);
      expect(options.method).toBe('GET');
      expect(options.headers['X-Auth-Token']).toBe('test-api-key');
      expect(res.token).toBe('sub-token-abc');
      expect(res.status.id).toBe(3);
    } finally {
      config.judge0.apiKey = originalApiKey;
    }
  });

  it('should include RapidAPI headers when baseUrl contains rapidapi and apiKey is set', async () => {
    const originalBaseUrl = config.judge0.baseUrl;
    const originalApiKey = config.judge0.apiKey;

    config.judge0.baseUrl = 'https://judge0-ce.p.rapidapi.com';
    config.judge0.apiKey = 'rapidapi-key-123';

    try {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'token-rapidapi' }),
      });

      await judge0Client.getSubmission('token-rapidapi');

      const [, options] = global.fetch.mock.calls[0];
      expect(options.headers['X-RapidAPI-Key']).toBe('rapidapi-key-123');
      expect(options.headers['X-RapidAPI-Host']).toBe('judge0-ce.p.rapidapi.com');
    } finally {
      config.judge0.baseUrl = originalBaseUrl;
      config.judge0.apiKey = originalApiKey;
    }
  });

  it('should throw an error if token is not provided to getSubmission', async () => {
    await expect(judge0Client.getSubmission()).rejects.toThrow('Submission token is required');
  });

  it('should throw when getSubmission returns non-200', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Submission not found',
    });

    await expect(judge0Client.getSubmission('non-existent-token')).rejects.toThrow(
      'Judge0 API error: Not Found'
    );
  });
});
