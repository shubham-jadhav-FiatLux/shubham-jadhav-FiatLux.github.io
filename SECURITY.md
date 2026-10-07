# Security policy

## Supported versions

Only the latest release, the one running at
[shubham-jadhav-fiatlux.github.io](https://shubham-jadhav-fiatlux.github.io/), gets fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately instead,
through GitHub's
[private vulnerability reporting](https://github.com/shubham-jadhav-FiatLux/shubham-jadhav-FiatLux.github.io/security/advisories/new)
(the **Report a vulnerability** button on the repository's **Security** tab).

Please include:

- what the problem is and what an attacker could do with it,
- the steps or a link that shows it,
- the browser and device you used.

You can expect a first reply within a week. Once a fix is live I will credit you in the
changelog, unless you would rather stay anonymous.

## Scope

The site is static and runs entirely in the browser. It has no server, no accounts, no
cookies and no analytics, and it makes no network requests of its own after loading. It
keeps four small settings in `localStorage`: sound on or off, music on or off, the quality
preset and the scrolls already found.

In scope:

- the code in this repository and the site built from it,
- the GitHub Actions workflows that build and publish it.

Out of scope:

- GitHub Pages itself (report those to [GitHub](https://bounty.github.com/)),
- problems that need a compromised browser or device.
