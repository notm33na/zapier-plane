'use strict';

const nock = require('nock');
const zapier = require('zapier-platform-core');

const App = require('../index');

const appTester = zapier.createAppTester(App);

// Unit tests never touch the network; unmatched requests fail with ENETUNREACH.
nock.disableNetConnect();

const API = 'https://api.plane.so';
const BASE = '/api/v1';
const SLUG = 'acme';
const PROJECT_ID = 'a1b2c3d4-0000-4000-8000-000000000003';

const makeBundle = (overrides = {}) => ({
  authData: { api_key: 'test-key', workspace_slug: SLUG, ...(overrides.authData || {}) },
  inputData: { ...(overrides.inputData || {}) },
  meta: { ...(overrides.meta || {}) },
});

const plane = () =>
  nock(API, { reqheaders: { 'x-api-key': 'test-key' } });

// Zapier errors carry a JSON-encoded message: {"message", "code", "status"} or
// {"message", "delay"} for ThrottledError.
const parseError = (err) => {
  try {
    return { name: err.name, ...JSON.parse(err.message) };
  } catch (e) {
    return { name: err.name, message: err.message };
  }
};

const expectError = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return parseError(err);
  }
  throw new Error('Expected an error to be thrown');
};

const page = (results, { next = null } = {}) => ({
  results,
  next_cursor: next,
  next_page_results: Boolean(next),
  prev_cursor: null,
  prev_page_results: false,
});

module.exports = {
  App,
  appTester,
  nock,
  API,
  BASE,
  SLUG,
  PROJECT_ID,
  makeBundle,
  plane,
  expectError,
  page,
};
