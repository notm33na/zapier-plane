/* globals describe, it, expect, afterEach */
'use strict';

const {
  appTester,
  nock,
  BASE,
  SLUG,
  makeBundle,
  plane,
  expectError,
} = require('./helpers');
const { MESSAGES, throttleDelay, describeBadRequest } = require('../lib/errors');
const { request } = require('../lib/client');

const PATH = `/workspaces/${SLUG}/projects/`;

// Ad-hoc function run through appTester so the app's middleware applies.
const callPlane = (options = {}) => (z, bundle) =>
  request(z, bundle, { path: PATH, ...options });

afterEach(() => nock.cleanAll());

describe('T8 error mapping', () => {
  it.each([
    [{ error: 'Name is required' }, 'Plane rejected the request: Name is required'],
    [{ detail: 'Invalid per_page parameter.' }, 'Plane rejected the request: Invalid per_page parameter.'],
    [
      { name: ['This field is required.'], priority: ['"x" is not a valid choice.'] },
      'Plane rejected the request: name: This field is required.; priority: "x" is not a valid choice.',
    ],
  ])('400 body %p', async (body, expected) => {
    plane().get(`${BASE}${PATH}`).reply(400, body);
    const err = await expectError(appTester(callPlane(), makeBundle()));
    expect(err.message).toBe(expected);
    expect(err.status).toBe(400);
  });

  it('400 with a non-JSON body still gives a readable message', () => {
    expect(describeBadRequest(null)).toBe('invalid request');
  });

  it('404 -> not-found message', async () => {
    plane().get(`${BASE}${PATH}`).reply(404, { error: 'The requested resource does not exist.' });
    const err = await expectError(appTester(callPlane(), makeBundle()));
    expect(err.message).toBe(MESSAGES.notFound);
  });

  it('404 passes through when the request allows it', async () => {
    plane().get(`${BASE}${PATH}`).reply(404, { error: 'nope' });
    const response = await appTester(
      callPlane({ planeContext: { allow404: true } }),
      makeBundle(),
    );
    expect(response.status).toBe(404);
  });

  it.each([500, 502, 503])('%p -> server error message', async (status) => {
    plane().get(`${BASE}${PATH}`).reply(status, 'oops');
    const err = await expectError(appTester(callPlane(), makeBundle()));
    expect(err.message).toBe(
      `Plane returned a server error (${status}). Try again in a few minutes.`,
    );
  });

  it('network failure -> could-not-reach message', async () => {
    // nock 14's replyWithError doesn't reach node-fetch 2. With no interceptor and
    // net connect disabled (test/helpers.js) the request fails with ENETUNREACH.
    const err = await expectError(
      appTester(
        callPlane(),
        makeBundle({ authData: { plane_url: 'https://plane.example.com' } }),
      ),
    );
    expect(err.message).toBe(
      "Couldn't reach Plane at https://plane.example.com (ENETUNREACH). Check the Plane URL in your connection.",
    );
  });

  it('timeout -> could-not-reach message', async () => {
    plane().get(`${BASE}${PATH}`).delay(500).reply(200, {});
    const err = await expectError(appTester(callPlane({ timeout: 50 }), makeBundle()));
    expect(err.message).toContain("Couldn't reach Plane at https://api.plane.so");
  });

  it('never includes the API key in messages', async () => {
    plane().get(`${BASE}${PATH}`).reply(400, { error: 'bad' });
    const err = await expectError(appTester(callPlane(), makeBundle()));
    expect(JSON.stringify(err)).not.toContain('test-key');
  });

  it('sends the key as X-API-Key and asks for JSON', async () => {
    const scope = nock('https://api.plane.so', {
      reqheaders: { 'x-api-key': 'test-key', accept: 'application/json' },
    })
      .get(`${BASE}${PATH}`)
      .reply(200, { results: [] });
    await appTester(callPlane(), makeBundle());
    expect(scope.isDone()).toBe(true);
  });
});

describe('T9 rate limiting', () => {
  it('429 with Retry-After -> ThrottledError with that delay', async () => {
    plane().get(`${BASE}${PATH}`).reply(429, {}, { 'Retry-After': '17' });
    const err = await expectError(appTester(callPlane(), makeBundle()));
    expect(err.name).toBe('ThrottledError');
    expect(err.message).toBe(MESSAGES.throttled);
    expect(err.delay).toBe(17);
  });

  it('429 with X-RateLimit-Reset -> delay until reset', async () => {
    const reset = Math.floor(Date.now() / 1000) + 30;
    plane()
      .get(`${BASE}${PATH}`)
      .reply(429, {}, { 'X-RateLimit-Reset': String(reset) });
    const err = await expectError(appTester(callPlane(), makeBundle()));
    expect(err.name).toBe('ThrottledError');
    expect(err.delay).toBeGreaterThanOrEqual(29);
    expect(err.delay).toBeLessThanOrEqual(31);
  });

  it('429 with no headers -> 60 s', async () => {
    plane().get(`${BASE}${PATH}`).reply(429, {});
    const err = await expectError(appTester(callPlane(), makeBundle()));
    expect(err.delay).toBe(60);
  });

  const headers = (values) => ({ get: (name) => values[name] });

  it('clamps X-RateLimit-Reset to 1..300 s', () => {
    const now = 1_000_000_000_000;
    expect(throttleDelay({ headers: headers({ 'x-ratelimit-reset': '0' }) }, now)).toBe(1);
    expect(
      throttleDelay({ headers: headers({ 'x-ratelimit-reset': String(now / 1000 + 9999) }) }, now),
    ).toBe(300);
  });
});
