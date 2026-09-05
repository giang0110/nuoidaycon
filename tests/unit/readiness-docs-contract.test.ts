import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const README = readFileSync('README.md', 'utf8');
const DEPLOYMENT = readFileSync('docs/ops/DEPLOYMENT.md', 'utf8');
const LAUNCH = readFileSync('docs/ops/LAUNCH_READINESS.md', 'utf8');
const ENV_EXAMPLE = readFileSync('.env.example', 'utf8');

describe('production readiness documentation contract', () => {
  it('states the real deployed production resources instead of the old pre-deploy state', () => {
    expect(README.toLowerCase()).not.toContain('production-ready, not deployed');
    expect(DEPLOYMENT).not.toContain('**NOT DEPLOYED**');
    expect(DEPLOYMENT).not.toContain('No cloud resource has been created');
    expect(README).toContain('https://nuoidaycon-eight.vercel.app');
    expect(DEPLOYMENT).toContain('lpqhxznwdsbvjwglsssr');
  });

  it('documents the Phase 11 operator commands and keeps database credentials out of Vercel', () => {
    expect(DEPLOYMENT).toContain('pnpm smoke:production');
    expect(DEPLOYMENT).toContain('pnpm readiness:db');
    expect(DEPLOYMENT).toContain('PRODUCTION_DATABASE_URL');
    expect(DEPLOYMENT).toMatch(/PRODUCTION_DATABASE_URL[\s\S]{0,160}never[^\n]*Vercel/i);

    expect(ENV_EXAMPLE).toContain('# PRODUCTION_BASE_URL="https://nuoidaycon-eight.vercel.app"');
    expect(ENV_EXAMPLE).toContain('# PRODUCTION_DATABASE_URL=""');
    expect(ENV_EXAMPLE).toContain('# METRICS_DATABASE_URL=""');
    expect(ENV_EXAMPLE).toMatch(/never[^\n]*Vercel/i);
  });

  it('uses explicit machine and human readiness states without pretending empty metrics are zero percent', () => {
    expect(LAUNCH).toContain('machine-verified');
    expect(LAUNCH).toContain('pending_human');
    expect(LAUNCH).toContain('insufficient_data');
    expect(LAUNCH).toMatch(/0 families[\s\S]{0,180}(null|insufficient_data)/i);
  });

  it('keeps the real human-only gates pending and keeps AI disabled', () => {
    expect(LAUNCH).toMatch(/Email deliverability/i);
    expect(LAUNCH).toMatch(/PDPD/i);
    expect(LAUNCH).toMatch(/A4/i);
    expect(LAUNCH).toMatch(/AI[\s\S]{0,160}(disabled|off|false)/i);

    for (const gate of ['Email deliverability', 'data residency', 'legal review']) {
      const line = LAUNCH.split('\n').find((value) =>
        value.toLowerCase().includes(gate.toLowerCase()),
      );
      expect(line, `missing human gate ${gate}`).toBeDefined();
      expect(line).not.toMatch(/^- \[x\]/i);
    }
  });
});
