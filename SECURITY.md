# Security Policy

## Supported Versions

Fable-5 for Codex is currently alpha software. Security fixes target the latest published alpha and `main`.

## Reporting A Vulnerability

Please report security issues privately instead of opening a public issue with exploit details.

- GitHub: submit a [private security advisory](https://github.com/rhein1/fable5-codex/security/advisories/new).

Include:

- affected version or commit
- reproduction steps
- impact
- whether credentials, secrets, private keys, or sensitive repository data may be involved

Do not paste raw secrets, private keys, API keys, wallet keys, or credential files into issues, PRs, examples, screenshots, benchmark outputs, or logs.

## Scope

In scope:

- installer behavior
- plugin packaging
- skill instructions that could cause unsafe actions
- redaction and secret-handling failures
- misleading subagent, evidence, or workflow trace claims

Out of scope:

- private Full ECF runtime internals, which are not part of this public package
- vulnerabilities in unrelated repositories audited with this plugin
