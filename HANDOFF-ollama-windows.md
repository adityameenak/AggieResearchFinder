# Handoff — Ollama on the Windows GPU box, reachable from the Mac

For whoever (or whatever) is setting up the Windows machine. Everything here
runs **on Windows** unless a section says otherwise.

Written 2026-09-02. Companion to `HANDOFF.md`, which covers the project itself.

---

## Why this exists

371 faculty records still need an `ai_review` — the paragraph each search-result
card renders as its preview. Generating one takes a local LLM. The Mac that
holds the dataset is an Intel Skylake with no GPU and no Ollama, so the model
has to run on the Windows box.

The dataset stays on the Mac and the enrichment script runs there. Only the
model inference happens on Windows. That split matters: this repo also lives on
this machine at `C:\Users\adity\OneDrive\ResearchFinder`, and letting a script
rewrite 12 MB JSON files inside a OneDrive folder every 25 records is how you
get conflict copies of your dataset.

**Do not run the crawler or the enrichment on Windows. This box serves a model
and nothing else.**

---

## The shape of it

```
   Mac (dataset, enrich_ollama.py)          Windows (RTX GPU)
   ─────────────────────────────            ─────────────────────────
   enrich_ollama.py                         ollama serve
        │  http://localhost:11435             ▲  127.0.0.1:11434
        ▼                                     │
   cloudflared access tcp  ──────────────►  cloudflared tunnel
        (service token)     Cloudflare       (runs as a service)
                            edge + Access
```

Three properties worth keeping:

1. **Ollama never leaves loopback.** `cloudflared` reaches it at
   `127.0.0.1:11434` from the same machine. Nothing binds to the LAN, nothing
   opens in the firewall.
2. **Access authenticates every connection.** See the warning in Part 3 — this
   is not optional.
3. **The Mac sees a plain local port.** `cloudflared access tcp` presents the
   remote Ollama as `localhost:11435`, so `enrich_ollama.py --host
   http://localhost:11435` works with no code change and no credentials in the
   repo.

> If you were told earlier to set `OLLAMA_HOST=0.0.0.0` and open port 11434 in
> the firewall — **don't.** That was for a plain LAN setup. With a tunnel it is
> strictly worse: it exposes an unauthenticated LLM server to every device on
> the network for no benefit.

---

## Part 1 — Ollama

### 1.1 Install

```powershell
winget install --id Ollama.Ollama
```

### 1.2 Leave the bind address alone

Default is `127.0.0.1:11434`. That is what we want. If `OLLAMA_HOST` is already
set to `0.0.0.0` from an earlier attempt, remove it:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", $null, "User")
```

Then quit Ollama from the system tray and relaunch it, or the old value stays
live in the running process.

### 1.3 Pull the model

```powershell
ollama pull gemma3:4b
```

**Use `gemma3:4b`, not a larger model, even though the GPU can take one.** 95%
of the TAMU records and 97% of MIT's were written by `gemma3:4b`. Generating the
remaining 371 with `gemma3:12b` gives a dataset whose card previews visibly
change voice depending on which school you browse. If a bigger model is wanted,
that is a decision to regenerate all 5,641 records, not a decision to make here.

### 1.4 Stop the machine sleeping

The full run is roughly two hours at ~3 records/minute. A box that sleeps at the
90-minute mark drops the connection and the run dies partway through a file.

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 20     # screen may still sleep
```

### 1.5 Keep the model resident

By default Ollama unloads the model after 5 minutes idle, then reloads it —
several seconds of GPU churn each time the script pauses. Set it to stay:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "2h", "User")
```

Restart Ollama from the tray afterwards.

### 1.6 Confirm it is actually on the GPU

```powershell
ollama run gemma3:4b "say hi"
ollama ps
```

The `PROCESSOR` column must read **100% GPU**. If it says CPU, or splits
CPU/GPU, stop and fix that first — CPU inference on this workload is roughly
10× slower and turns a two-hour job into an overnight one. Check `nvidia-smi`
shows the driver and that no other process is holding VRAM.

---

## Part 2 — The tunnel

### 2.1 Install and authenticate

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
```

The browser opens; pick the domain you already have in Cloudflare. This writes
`cert.pem` into `C:\Users\<you>\.cloudflared\`.

### 2.2 Create the tunnel

```powershell
cloudflared tunnel create ollama-gpu
```

Note the **tunnel UUID** it prints. It also writes
`C:\Users\<you>\.cloudflared\<UUID>.json` — that file is a credential. Do not
commit it, do not put it in the OneDrive folder that syncs this repo.

### 2.3 Write the config

Create `C:\Users\<you>\.cloudflared\config.yml`:

```yaml
tunnel: <UUID>
credentials-file: C:\Users\<you>\.cloudflared\<UUID>.json

ingress:
  - hostname: ollama.<your-domain>
    service: tcp://localhost:11434
  - service: http_status:404
```

`tcp://`, not `http://`. It matters. Raw TCP forwarding means the Mac's HTTP
request arrives at Ollama byte-for-byte, so Ollama's origin checking sees a
normal localhost request. With an `http://` ingress the tunnel rewrites the Host
header to your public hostname and Ollama can answer 403 on every call.

### 2.4 Route the hostname

```powershell
cloudflared tunnel route dns ollama-gpu ollama.<your-domain>
```

This creates the proxied CNAME in your existing zone. It does not disturb other
records.

### 2.5 Run it as a service

So it survives reboots. **Run this in an Administrator PowerShell:**

```powershell
cloudflared service install
Start-Service cloudflared
Get-Service cloudflared          # expect Status: Running
```

### 2.6 Verify from Windows

```powershell
cloudflared tunnel info ollama-gpu       # expect at least one healthy connector
curl.exe http://localhost:11434/api/tags # expect JSON listing gemma3:4b
```

Both must pass before moving on. The first proves the tunnel is up, the second
proves Ollama is up. They are independent failures and it is worth knowing which
one you have.

---

## Part 3 — Access (do not skip this)

> **Ollama has no authentication of any kind.** The moment
> `ollama.<your-domain>` resolves, anyone who guesses or discovers that
> hostname can run inference on your GPU, list your models, pull new ones, and
> delete them — no password, no rate limit. A tunnel is not a security control;
> it is a public URL. Cloudflare Access is what makes this safe, and it is the
> reason the Mac side needs a service token.

In the Cloudflare dashboard, **Zero Trust → Access → Applications**:

1. **Add an application** → *Self-hosted*.
2. Application domain: `ollama.<your-domain>`.
3. Add a policy:
   - Action: **Service Auth** (not Allow — this is machine-to-machine, there is
     no browser and no human to log in)
   - Include: **Service Token** → the one created in the next step.
4. **Zero Trust → Access → Service Auth → Create Service Token.** Name it
   something like `mac-ollama-client`.

The dashboard shows the **Client ID** and **Client Secret exactly once.** Put
both straight into a password manager.

Then confirm it is actually closed:

```powershell
curl.exe https://ollama.<your-domain>/api/tags
```

You want an Access login page or a **403** — anything other than your model
list. If that command returns JSON, the policy is not applied and the endpoint
is open to the internet. Stop and fix it.

---

## Part 4 — Send back to the Mac

- the hostname: `ollama.<your-domain>`
- confirmation that `ollama ps` reported **100% GPU**
- confirmation that the unauthenticated `curl` above was refused
- the Access **service token ID and secret** — through the password manager or
  another out-of-band channel. Not pasted into a chat window, not committed to
  the repo, not dropped in the OneDrive folder.

---

## Part 5 — What happens on the Mac (no action needed here)

Recorded so both halves are written down. The Mac already has cloudflared
(2026.8.3, at `~/.local/bin/cloudflared`).

```bash
cloudflared access tcp \
  --hostname ollama.<your-domain> \
  --url localhost:11435 \
  --service-token-id     "$CF_ACCESS_CLIENT_ID" \
  --service-token-secret "$CF_ACCESS_CLIENT_SECRET" &

curl -s http://localhost:11435/api/tags        # expect the model list

cd /Users/akvaithi/Developer/AggieResearchFinder/crawler
OLLAMA_HOST=http://localhost:11435 \
  ./.venv/bin/python enrich_ollama.py --file faculty.json
```

`enrich_ollama.py` preflights the host and the model tag before it starts, so a
wrong address or an unpulled model fails in about a second rather than erroring
once per record for an hour.

---

## Verification checklist

Work down it. Each line assumes the ones above it passed.

| # | Check | Where | Expected |
|---|---|---|---|
| 1 | `ollama ps` | Windows | `100% GPU` |
| 2 | `curl.exe http://localhost:11434/api/tags` | Windows | JSON with `gemma3:4b` |
| 3 | `Get-Service cloudflared` | Windows | `Running` |
| 4 | `cloudflared tunnel info ollama-gpu` | Windows | ≥1 healthy connector |
| 5 | `curl.exe https://ollama.<domain>/api/tags` | Windows | **403 / login page** |
| 6 | `cloudflared access tcp …` then `curl localhost:11435/api/tags` | Mac | JSON with `gemma3:4b` |

Check 5 failing open is the one that matters. The others fail closed and cost
you time; that one costs you a GPU.

**All six verified working 2026-09-02** against `ollama.akvaithi.page`: 100% GPU
(2.9/2.9 GB in VRAM), 89.7 tok/s, and 371 reviews generated in under 20 minutes.

Two things learned doing it that this doc did not say:

- **A service token that is present but wrong is indistinguishable from a broken
  policy.** Access returns a byte-identical 403 page for "bad secret" and "no
  matching policy". Hours went into auditing a policy that was correct all
  along, because the secret had been transcribed from a screenshot and `0` was
  read as `O` in three places. **Copy the secret with the dashboard's copy
  button — never retype it, never read it off an image.**
- **Once the token is right, a plain HTTPS request to the hostname returns 200
  with a zero-byte body**, not an error. That is Access admitting you while the
  `tcp://` ingress has no HTTP reply to give — the response carries a
  `CF_Authorization` JWT whose `common_name` is the service token. It is a
  success signal, not a failure.

---

## Troubleshooting

**403 on every request from the Mac** — service token not being sent, or the
Access policy is `Allow` instead of `Service Auth`. An `Allow` policy expects a
browser login, which a script cannot do.

**502 / connection refused through the tunnel** — Ollama is not running, or
`config.yml` points at the wrong port. Check 2 above isolates this.

**Ollama returns 403 but only through the tunnel** — the ingress is `http://`
instead of `tcp://`. See 2.3.

**`ollama ps` shows CPU** — driver, or another process holding VRAM. Do not
start the run; it will take all night.

**Run dies partway** — almost always sleep (1.4). `enrich_ollama.py` checkpoints
every 25 records and skips records that already have a real review, so restart
the same command and it resumes rather than redoing the work.

**Reviews look different from the existing ones** — someone used a model other
than `gemma3:4b`. See 1.3.
