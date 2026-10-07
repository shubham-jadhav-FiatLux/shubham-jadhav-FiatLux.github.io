import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { releaseNotes, releaseTitle } from '../scripts/release.mjs';

const sj_changelog = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-11-02

A short summary that the file wraps
over two lines.

### Added

- A first change, described at some
  length over two lines.
- A second change.

## [1.0.0] - 2026-10-30

### Fixed

- Something old.

[Unreleased]: https://example.com/compare/v1.1.0...HEAD
[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
`;

describe('release notes', () => {
  it('takes the section of one version and joins wrapped lines', () => {
    expect(releaseNotes(sj_changelog, '1.1.0')).toBe(
      [
        'A short summary that the file wraps over two lines.',
        '',
        '### Added',
        '',
        '- A first change, described at some length over two lines.',
        '- A second change.',
      ].join('\n'),
    );
  });

  it('stops at the link references after the last version', () => {
    expect(releaseNotes(sj_changelog, '1.0.0')).toBe('### Fixed\n\n- Something old.');
  });

  it('knows when a version is missing', () => {
    expect(releaseNotes(sj_changelog, '2.0.0')).toBeNull();
  });

  it('has notes for the version in package.json', () => {
    const sj_root = new URL('../', import.meta.url);
    const { version: sj_version } = JSON.parse(
      readFileSync(new URL('package.json', sj_root), 'utf-8'),
    ) as { version: string };
    const sj_notes = releaseNotes(
      readFileSync(new URL('CHANGELOG.md', sj_root), 'utf-8'),
      sj_version,
    );
    expect(sj_notes?.length).toBeGreaterThan(0);
  });

  it('titles a release from its tag annotation', () => {
    expect(releaseTitle('v0.8.0', "v0.8.0: the tour's director's cut")).toBe(
      "v0.8.0 · The tour's director's cut",
    );
    expect(releaseTitle('v1.0.0', 'v1.0.0')).toBe('v1.0.0');
  });
});
