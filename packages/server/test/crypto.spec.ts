import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyGithubSignature } from '../src/crypto.js';

describe('webhook HMAC verify (R0 GitHub docs: sha256= + HMAC-SHA256, constant-time compare, raw body)', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ a: 1 });
  const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a correctly signed raw body', () => {
    expect(verifyGithubSignature(secret, body, good)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyGithubSignature(secret, body + ' ', good)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyGithubSignature(secret, body, undefined)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    expect(verifyGithubSignature(secret, body, good.replace('sha256=', ''))).toBe(false);
  });
});
