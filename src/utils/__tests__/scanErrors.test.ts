import { scanErrorFor } from '../scanErrors';

describe('scanErrorFor', () => {
  it("tells someone over their daily limit to come back tomorrow", () => {
    const err = scanErrorFor(429, { error: 'limit', reason: 'device' });
    expect(err.kind).toBe('limit');
    expect(err.message).toMatch(/today's scans/);
  });

  it('says the whole app is paused when the global ceiling is hit', () => {
    const err = scanErrorFor(429, { error: 'limit', reason: 'global' });
    expect(err.kind).toBe('limit');
    expect(err.message).toMatch(/taking a break/);
  });

  it.each([
    [413, { error: 'image_too_large' }, 'parse', /too large/],
    [422, { error: 'refused' }, 'api', /declined/],
    [422, { error: 'too_long' }, 'parse', /too long/],
    [503, { error: 'busy' }, 'api', /busy/],
    [504, { error: 'upstream_timeout' }, 'network', /timed out/],
    [500, { error: 'server_misconfigured' }, 'config', /isn't working/],
    [502, { error: 'upstream_error' }, 'api', /\(502\)/],
    [500, null, 'api', /\(500\)/],
  ])('%i %j → %s', (status, body, kind, message) => {
    const err = scanErrorFor(status, body);
    expect(err.kind).toBe(kind);
    expect(err.message).toMatch(message);
  });
});
