import { describe, it, expect } from 'vitest';
import { createTestIssuer } from '../src/oauth.js';

describe('local test OAuth issuer (stand-in for OAuth 2.1 AS per MCP 2025-06-18)', () => {
  it('mints a token that verifies back to the same org', async () => {
    const issuer = createTestIssuer();
    const token = await issuer.mintToken('org-a');
    const claims = await issuer.verifyToken(token);
    expect(claims.org).toBe('org-a');
  });

  it('rejects a tampered token', async () => {
    const issuer = createTestIssuer();
    const token = await issuer.mintToken('org-a');
    await expect(issuer.verifyToken(token + 'x')).rejects.toBeTruthy();
  });

  it('rejects a token minted by a different issuer secret', async () => {
    const issuerA = createTestIssuer('secret-a');
    const issuerB = createTestIssuer('secret-b');
    const token = await issuerA.mintToken('org-a');
    await expect(issuerB.verifyToken(token)).rejects.toBeTruthy();
  });
});
