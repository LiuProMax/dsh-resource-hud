# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.1.x | Yes |
| 1.0.x | No |

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
vulnerability reporting:

<https://github.com/LiuProMax/dhs-resource-hud/security/advisories/new>

If private reporting is unavailable, open an issue that asks for a private
contact channel without disclosing details.

Include the affected version, the Harness version, reproduction steps, and the
impact you believe the issue has.

## Scope

The plugin runs inside the Harness Desktop renderer and only uses services the
application already exposes to its own Web UI. It:

- reads workspace directory listings and file metadata (read-only),
- reads the signed-in account's balance through the account service,
- reads token projections from the session service,
- stores position and visibility in `localStorage`.

It does not write files, execute commands, or make third-party network requests.
The most relevant risks are therefore disclosure of local paths or file names
through the overlay, and UI spoofing inside the overlay. Reports about either are
welcome.
