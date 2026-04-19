# NOVATerra Backup & Disaster Recovery Runbook

> Until you've performed a restore, you don't have backups.

## 0. Automated local snapshot (primary insurance — no Supabase add-on required)

Two scripts under `app/scripts/` handle this without needing PITR:

### 0.1 Take a snapshot

```bash
cd app
node scripts/backup-snapshot.mjs --verify
```

Writes a timestamped JSON file to `/Users/mattnicosia/Desktop/Projects/NOVATerra/backups/novaterra-<ISO>.json` containing all rows from 13 critical tables (user_estimates, user_data, contacts, company_profiles, bid_packages, bid_invitations, organizations, org_members, org_invitations, living_proposals, living_proposal_*). Skips `embeddings` — regenerable via `backfill-history.mjs`. `--verify` re-reads the dump and confirms row counts match.

Typical size: ~40 MB. Takes ~5 seconds.

### 0.2 Restore (dry-run first — ALWAYS)

```bash
cd app
# Dry-run — validates file is usable, writes nothing
node scripts/restore-snapshot.mjs --file=../backups/novaterra-<ISO>.json

# Actual restore (UPSERTs by id/user_id+estimate_id/user_id+key). Use only
# after a real data loss event; pointing this at production with a stale
# snapshot will overwrite newer data.
node scripts/restore-snapshot.mjs --file=../backups/novaterra-<ISO>.json --force
```

The dry-run should report row counts matching §0.1. `--force` is required to actually write; default is safe.

### 0.3 Cadence

Run `backup-snapshot.mjs` weekly (minimum) — wire it to a cron or pre-deploy hook. Keep at least the last 4 weeks locally + sync to external storage (iCloud Drive, S3, B2) for off-device redundancy.

### 0.4 What's covered / not covered

| Covered | Not covered |
|---|---|
| All user_estimates rows (full JSONB data blob) | Storage bucket contents (drawings, PDFs) — see §3 |
| Profiles, contacts, companies, orgs, bid data | Supabase Auth users (auth.* tables — platform-managed) |
| Living proposals + their versions/views | `embeddings` table (regenerate via `backfill-history.mjs`) |
| Schema that exists in `app/supabase/migrations/` | RLS policies (need to re-apply from migrations) |

Restoring into a fresh Supabase project: apply all `app/supabase/migrations/*.sql` first (to create schema + RLS), then run `restore-snapshot.mjs --force`. Users must be re-invited via Supabase Auth separately.

---

## 1. Supabase Point-in-Time Recovery (PITR) — optional add-on

PITR is the primary backup mechanism. It retains write-ahead logs so you can
restore the database to any moment within the retention window.

### 1.1 Verify PITR is enabled

1. Open the Supabase dashboard → project **NOVA** (`pgmefhgbygkqfzcvwxqv`).
2. **Project Settings** → **Database** → **Backups**.
3. Confirm **Point-in-Time Recovery** shows **Enabled**.
4. Note the retention window (Free: 7 days, Pro: 7 days, Pro+Daily: 28 days).
5. If PITR is not enabled, enable it today. This requires Pro plan or higher —
   this is the single cheapest insurance you can buy ($25/mo).

### 1.2 Verify daily logical backups

Supabase also takes daily logical snapshots that live for 7 days (Free) / 28
days (Pro+Daily). Check:

- Supabase dashboard → **Backups** → **Database backups** tab.
- At least one backup from the last 24 hours should be listed as "Completed."

## 2. Quarterly restore drill

**You must do this at least once per quarter.** Pencil it into the calendar.

### 2.1 Create a staging restore target

1. Supabase dashboard → **Create new project** — name it `NOVA-restore-drill`.
2. Pick the same region (us-east-2) and plan tier.
3. Wait for it to provision (~3-5 minutes).

### 2.2 Perform the restore

1. In the original NOVA project → **Backups** → choose a recent backup.
2. Click **Restore to new project** → select `NOVA-restore-drill`.
3. Wait for restore completion (size-dependent: 5-30 min for NOVATerra scale).

### 2.3 Verify data integrity

Run these queries against the restored project:

```sql
-- Table row counts should match production ±5%
SELECT 'user_estimates' AS table_name, COUNT(*) FROM user_estimates
UNION ALL
SELECT 'embeddings', COUNT(*) FROM embeddings
UNION ALL
SELECT 'bid_packages', COUNT(*) FROM bid_packages
UNION ALL
SELECT 'living_proposals', COUNT(*) FROM living_proposals;

-- Spot-check: pick a real user_estimate ID from production, confirm it exists
SELECT id, user_id, estimate_id, updated_at
FROM user_estimates
WHERE id = '<paste-real-id-here>';

-- Confirm RLS policies are intact
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Expected: only {user_estimates_backup_20260407, estimate_migration_conflicts}
```

### 2.4 Verify the app can boot against it

1. Clone the production `.env.vercel-prod` locally.
2. Replace `SUPABASE_URL` and `VITE_SUPABASE_URL` with the staging project URL.
3. Replace `SUPABASE_SERVICE_ROLE_KEY` and `VITE_SUPABASE_ANON_KEY` with the
   staging project keys.
4. `cd app && npm run dev` — sign in with a known test user.
5. Open an estimate, verify items/drawings/cost data all load.

### 2.5 Tear down

1. Delete the `NOVA-restore-drill` Supabase project.
2. Log the drill date and result in this runbook (append a row below).
3. File any issues found (missing rows, RLS drift, etc.) as tickets.

## 3. Storage bucket backups (drawings, proposals)

Supabase Storage is NOT covered by database PITR. Images and PDFs are
separate.

### 3.1 Export buckets

Weekly cron (add to Vercel scheduled function or GitHub Action):

```bash
# Pseudocode — implement as scripts/backup-storage.sh
supabase storage download --project pgmefhgbygkqfzcvwxqv \
  --bucket blobs \
  --dest /tmp/blobs-$(date +%F)
# Upload to S3/B2/R2 for redundancy
aws s3 sync /tmp/blobs-$(date +%F) s3://novaterra-backups/blobs/$(date +%F)
```

> TODO: this script does not yet exist. Write it before a customer uploads
> anything you can't reproduce.

### 3.2 Local IndexedDB (offline-first fallback)

NOVATerra is offline-first — the client keeps a full copy of estimates in
IndexedDB. This means that for most catastrophic events, users can re-sync
their local data back to a restored Supabase. Don't rely on this for
multi-tenant scenarios where the data may only exist on one machine.

## 4. Incident playbook

### Scenario A: Accidental data deletion (single user / table)

1. Identify the exact timestamp of the bad write via `updated_at` columns or
   git history of the frontend change that caused it.
2. Supabase dashboard → **Backups** → **Point in time recovery**.
3. Restore to a new staging project (see §2).
4. Copy only the affected rows back to production using `pg_dump` + `psql`.
5. **Do NOT restore over production directly** — the diff approach avoids
   clobbering legitimate writes that happened after the incident.

### Scenario B: Database corruption / total loss

1. Notify users via status page and in-app banner.
2. Restore latest backup to a NEW project.
3. Swap `SUPABASE_URL` in Vercel env vars to the new project.
4. Redeploy via CLI: `cd app && rm -rf dist && npx vercel --prod`.
5. Re-alias production (GitHub auto-deploy will stomp it otherwise — see
   `feedback_github_autodeploy_breaks_api.md`).

### Scenario C: Storage bucket wiped

1. If storage cron (§3.1) is running, restore from latest S3/R2 backup.
2. If no external backup, data is gone — client IndexedDB is the only recourse.

## 5. Drill log

| Date | Who | Restore time | Data integrity | Issues found |
|------|-----|--------------|----------------|--------------|
| 2026-04-19 | Matt (automated via scripts/) | ~5s snapshot + <1s dry-run restore | ✓ 183 rows across 13 tables, verified readable, dry-run validated | First drill — built + tested the automated snapshot/restore pipeline. PITR not enabled on this project; local JSON dump used as primary mechanism. |

---

**Last updated:** 2026-04-19
**Next drill due:** 2026-07-19
