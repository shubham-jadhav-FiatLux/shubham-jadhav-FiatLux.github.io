#!/usr/bin/env node
/**
 * Publishes GitHub releases for version tags, with each version's notes taken from
 * CHANGELOG.md. The Release workflow runs it:
 *
 *   node scripts/release.mjs v0.9.0    # release one tag
 *   node scripts/release.mjs --all     # release every v* tag that has no release yet
 *
 * Needs the GitHub CLI (`gh`) and a token that may write releases (GH_TOKEN).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The notes for `sj_version` ("0.9.0"): everything under its heading in a Keep a
 * Changelog file, up to the next version or the link references at the bottom. Lines that
 * the file wraps by hand are joined again, because GitHub shows every newline in release
 * notes as a line break. Returns null when the changelog has no such version.
 */
export function releaseNotes(sj_changelog, sj_version) {
  const sj_lines = sj_changelog.split('\n');
  const sj_start = sj_lines.findIndex((sj_line) => sj_line.startsWith(`## [${sj_version}]`));
  if (sj_start < 0) return null;
  let sj_end = sj_lines.findIndex(
    (sj_line, sj_i) =>
      sj_i > sj_start && (sj_line.startsWith('## [') || /^\[[^\]]+\]: /.test(sj_line)),
  );
  if (sj_end < 0) sj_end = sj_lines.length;

  const sj_out = [];
  for (const sj_line of sj_lines.slice(sj_start + 1, sj_end)) {
    const sj_previous = sj_out[sj_out.length - 1];
    // blank lines, list items, headings, tables and code fences start a block of their own
    const sj_startsBlock = !sj_line.trim() || /^(- |\* |#|\||```|\d+\. )/.test(sj_line);
    if (sj_previous?.trim() && !sj_previous.startsWith('#') && !sj_startsBlock)
      sj_out[sj_out.length - 1] = `${sj_previous.trimEnd()} ${sj_line.trim()}`;
    else sj_out.push(sj_line);
  }
  return sj_out.join('\n').trim();
}

/**
 * The release title for a tag from the subject of its annotation:
 * "v0.8.0: the tour's director's cut" becomes "v0.8.0 · The tour's director's cut".
 */
export function releaseTitle(sj_tag, sj_subject) {
  const sj_prefix = `${sj_tag}:`;
  const sj_text = (
    sj_subject.startsWith(sj_prefix) ? sj_subject.slice(sj_prefix.length) : sj_subject
  ).trim();
  return sj_text && sj_text !== sj_tag
    ? `${sj_tag} · ${sj_text[0].toUpperCase()}${sj_text.slice(1)}`
    : sj_tag;
}

function git(...sj_args) {
  return execFileSync('git', sj_args, { encoding: 'utf8' }).trim();
}

function hasRelease(sj_tag) {
  try {
    execFileSync('gh', ['release', 'view', sj_tag], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main(sj_args) {
  if (sj_args.length === 0 || (sj_args[0].startsWith('-') && sj_args[0] !== '--all')) {
    console.log('usage: node scripts/release.mjs <tag>... | --all');
    process.exitCode = 1;
    return;
  }
  const sj_changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const sj_repoUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
      : null;
  // oldest first, so the newest release is also the one created last
  const sj_tags = git('tag', '--list', 'v*', '--sort=v:refname').split('\n').filter(Boolean);
  const sj_wanted = sj_args[0] === '--all' ? sj_tags : sj_args;
  const sj_newest = sj_tags[sj_tags.length - 1];

  for (const sj_tag of sj_wanted) {
    if (!sj_tags.includes(sj_tag)) throw new Error(`no tag ${sj_tag}`);
    if (hasRelease(sj_tag)) {
      console.log(`${sj_tag}: already released`);
      continue;
    }
    const sj_version = sj_tag.replace(/^v/, '');
    let sj_notes = releaseNotes(sj_changelog, sj_version) ?? 'See CHANGELOG.md.';
    const sj_previous = sj_tags[sj_tags.indexOf(sj_tag) - 1];
    if (sj_previous && sj_repoUrl)
      sj_notes += `\n\n**Full changelog:** ${sj_repoUrl}/compare/${sj_previous}...${sj_tag}`;
    const sj_title = releaseTitle(sj_tag, git('tag', '--list', '--format=%(subject)', sj_tag));
    execFileSync(
      'gh',
      [
        'release',
        'create',
        sj_tag,
        '--verify-tag',
        '--title',
        sj_title,
        '--notes',
        sj_notes,
        `--latest=${sj_tag === sj_newest}`,
      ],
      { stdio: 'inherit' },
    );
    console.log(`${sj_tag}: released as "${sj_title}"`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
