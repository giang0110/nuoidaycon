import { describe, it, expect } from 'vitest';
import { toParent, toChild, toInterest } from '@/lib/data/supabase/mappers';

describe('toParent', () => {
  const row = {
    id: 'p1',
    display_name: 'Mẹ Lan',
    locale: 'vi',
    child_mode_pin_hash: '$2b$10$averylonghashvalue',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  it('never carries the PIN hash onto the domain entity', () => {
    const parent = toParent(row);
    expect(parent.hasChildModePin).toBe(true);
    expect(JSON.stringify(parent)).not.toContain('averylonghash');
    expect(parent).not.toHaveProperty('childModePinHash');
  });

  it('reports no PIN when none is set', () => {
    expect(toParent({ ...row, child_mode_pin_hash: null }).hasChildModePin).toBe(false);
  });

  it('falls back to Vietnamese for an unknown locale', () => {
    expect(toParent({ ...row, locale: 'fr' }).locale).toBe('vi');
  });
});

describe('toChild', () => {
  const row = {
    id: 'c1',
    parent_id: 'p1',
    display_name: 'Bé Bi',
    birth_year: 2018,
    birth_month: 6,
    grade: 'grade_2',
    avatar_key: 'cat',
    locale: 'vi',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('maps birth year and month', () => {
    const child = toChild(row);
    expect(child.birthYear).toBe(2018);
    expect(child.birthMonth).toBe(6);
  });

  it('carries no age and no date of birth on the entity', () => {
    const child = toChild(row);
    expect(child).not.toHaveProperty('age');
    expect(child).not.toHaveProperty('dateOfBirth');
    expect(child).not.toHaveProperty('birthDate');
    expect(Object.keys(child).filter((k) => /age|dob|birthdate/i.test(k))).toEqual([]);
  });
});

describe('toInterest', () => {
  it('maps both labels', () => {
    const interest = toInterest({
      id: 'i1',
      slug: 'animals',
      label_vi: 'Động vật',
      label_en: 'Animals',
      sort_order: 1,
    });
    expect(interest.labelVi).toBe('Động vật');
    expect(interest.slug).toBe('animals');
  });
});
