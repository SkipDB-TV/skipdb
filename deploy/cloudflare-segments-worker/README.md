# skipdb-worker

Cloudflare Worker that serves `GET /api/segments` with a KV edge cache in front of a D1 database, and proxies all other `/api/*` requests to Vercel. Runs at Cloudflare's edge in 300+ locations.

**Read path:** KV (sub-ms, edge-local) → D1 fallback on miss (first request per episode per day). KV is populated lazily and expires after 24h to stay in sync with the daily import. The `Server-Timing` response header shows `kv;dur=X` on cache hits and `d1;dur=X` on misses.

---

## One-time setup

### 1. Install dependencies and log in

```sh
cd deploy/cloudflare-segments-worker
pnpm install
pnpm wrangler login
```

### 2. Create the D1 database

```sh
pnpm wrangler d1 create skipdb
```

This prints something like:

```
✅ Created D1 database 'skipdb'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy that `database_id` and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "skipdb"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← paste here
```

### 3. Create the KV namespace

```sh
pnpm wrangler kv namespace create skipdb-cache
```

This prints something like:

```
✅ Created KV namespace 'skipdb-cache'
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Paste that `id` into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"   # ← paste here
```

### 4. Apply the schema to the remote database

```sh
pnpm wrangler d1 execute skipdb --remote --file=schema.sql
```

> **Note:** Wrangler v4 defaults to local mode — `--remote` is required to target the live D1 database.

### 5. Create a `.env` file for the import script

```sh
cp .env.example .env
```

Fill in the values:

| Var                     | Where to get it                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMPORT_CF_ACCOUNT_ID`  | Cloudflare dashboard → top-right account menu → "Account ID", or run `pnpm wrangler whoami`                                                                                                  |
| `IMPORT_CF_DATABASE_ID` | The UUID printed in step 2, or `pnpm wrangler d1 list`                                                                                                                                       |
| `IMPORT_CF_API_TOKEN`   | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → "Create Token" → use the **"Edit Cloudflare Workers"** template, then add **D1 Edit** permission |

### 6. Run the initial full import

This downloads the dump from GitHub Releases and writes every episode to D1.

```sh
pnpm import:full
```

### 7. Deploy the Worker

```sh
pnpm deploy
```

---

## Manual import commands

```sh
# Incremental — only upserts episodes whose segments changed since last run
pnpm import

# Full replace — re-upserts every episode (use after schema changes or first run)
pnpm import:full
```

---

## Local development

```sh
pnpm dev
```

This starts the Worker locally with a local D1 instance. To populate local D1 for testing:

```sh
pnpm wrangler d1 execute skipdb --local --file=schema.sql
# then run the import against the local DB (not yet supported by the REST API script;
# use wrangler d1 execute --local --command="INSERT ..." for small test data)
```
