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
});
