---
title: Audit chain
description: A tamper-evident log of every decision, verifiable in the inbox and offline.
---

Every decision, approval, policy change and team change is appended to one hash chain in Postgres. Each entry's hash covers every column of the entry plus the previous entry's hash:

```txt
hash(n) = base64url(sha256(hash(n-1) + "|" + canonicalJson(entry n)))
hash(0) = "GENESIS"
```

Editing, deleting or reordering an entry in the middle breaks every hash after it.

## Browsing

- **Activity** lists every decision. Filter by agent, person, tool, verdict or rule, and open a run to see its plan, policy version and each call's outcome.
- **Audit** verifies the chain on the server and lists flagged entries.

Members see only their own runs.

## Verifying offline

An admin can export the whole chain and verify it with the CLI, using the same hashing code as the server:

```bash
curl -b cookies.txt -o audit.jsonl \
  "https://intentlock.acme.dev/api/v1/audit?format=jsonl"
intentlock audit verify --file audit.jsonl
```

The result is either `ok` with a count, or the first broken sequence number and why. A member's export holds only their own entries, which is not a complete chain.

The chain detects edits, deletions in the middle and reordering. Deleting the newest entries is not detectable from the chain alone; keep regular exports if that matters to you.

## Old entries

Nothing is ever deleted because of the license: its retention only limits how far back Activity, runs, stats and exports reach, and verify still covers every stored entry.

Deleting old entries is off by default. With `AUDIT_DELETE_AFTER_DAYS` set (at least 90), a daily job archives the oldest entries past that age to a folder or S3-compatible storage (`audit-<from>-<to>.jsonl`, the export format), reads each file back and checks its SHA-256, and only then deletes them and appends an `audit_purged` entry with the archive's name, hash and the last deleted entry's hash. Verify then starts at the first kept entry and checks that it links to that record; rows deleted any other way fail verify. If archiving fails, nothing is deleted and admins get an email. To check everything, pass the archives to the CLI with `--archive`.

## Decisions made in your app

In [hybrid mode](/docs/concepts/gates/) the client decides locally and writes every decision to an outbox file, chained with its own hashes, before the tool runs. A background worker uploads batches to the server, which appends them to the same chain. On upload the server:

- checks the client chain, and flags edited entries (`chain_break`) and missing ones (`gap`);
- re-runs `check()` for each decision with its own signed token, and flags any decision looser than the policy (`decision_mismatch`);
- compares the decision count in each report with what it received, and flags a truncated tail (`truncated`).

Flagged entries are stored, never dropped, and shown in the inbox.
