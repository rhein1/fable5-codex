# Security and privacy boundary

This is an explicit local context handoff tool, not an authorization system,
security classifier, transcript backup, secret scanner or operating-system sandbox.

## Input and instruction trust

Only supply owner-reviewed, already-redacted records and an independently
reviewed host binding. Hashes bind bytes to that review; they do not authenticate
an author, establish truth or prove that current policy permits an action. Record
kinds, required IDs, source revisions and effect classifications are trusted-host
inputs. A model can misclassify them. The generic CLI does not query ECF or source
permissions; live host checks remain required before using retained information.

All retained text is untrusted data, even when it contains policy-like language.
The hook emits only fixed retrieval guidance and a validated host session ID;
it never promotes retained excerpts into developer context. Source text can still
carry prompt injection. Never replay a send, write, deployment or payment just
because its result is absent from current context.

## Files and isolation

Pack/verify read only explicitly named bounded JSON files. Stage writes only the
reduced capsule to an explicitly selected marked root. Reads and revocation use
a filename derived from the validated session ID. Final symlinks and nonregular
files are rejected; POSIX owner permissions are checked and creation uses private
modes. Parent directories and same-user processes are not isolated. On Windows,
mode bits are not an ACL guarantee: the owner must configure and verify private
ACLs before storing sensitive data. Do not use shared or untrusted filesystems.

A hostile same-user process can change files and hashes or race path operations.
Private file modes, integrity hashes, subprocess environment filtering and a
fixed Git read do not create an OS sandbox. Review the installed Node/Git code
and protect parent directories. There are no hosted requests or ML downloads.

Git HEAD is checked, not every dirty worktree file or external source revision.
Policy revision strings are supplied by the host, not discovered from a policy
server. A source can be revoked or changed before the capsule expires. Revoke or
restage as appropriate and revalidate before taking any action.

## Retention

Staging is opt-in and requires `REVIEWED_REDACTED`. Existing capsules are never
overwritten. Expiry stops reads, but does not erase disk data. Revoke deletes
one plugin-owned file; it does not erase backups, filesystem snapshots, copied
outputs or the original reviewed input. Uninstalling a plugin is not deletion.
There is no automatic Memory ingestion, transcript parser, capture hook, broad
file scan or recursive deletion of owner directories.

Keep private inputs, capsules and reports outside repositories and avoid
synchronization/backups that conflict with the chosen retention policy. Stdout
may contain private material: do not upload it merely because it is a context
pack. The bundled tests and examples use only original synthetic fixtures.

## Reporting

Use the parent repository's security reporting instructions. Do not include
credentials, real transcripts or customer data in public issues. Supply a
minimal synthetic reproduction, exact source revision, OS, Node/Git versions,
and the observed error code. There is no claim of independent certification or
production readiness for this alpha source preview.
