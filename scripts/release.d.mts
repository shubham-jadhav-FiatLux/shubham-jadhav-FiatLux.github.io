/** Types for scripts/release.mjs, so the tests can import it. */

/** The notes for a version ("0.9.0") from a Keep a Changelog file, or null. */
export function releaseNotes(sj_changelog: string, sj_version: string): string | null;

/** The release title for a tag and the subject of its annotation. */
export function releaseTitle(sj_tag: string, sj_subject: string): string;
