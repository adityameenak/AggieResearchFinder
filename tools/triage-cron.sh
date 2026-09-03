#!/bin/bash
# Scheduled feedback triage, independent of any interactive Claude session.
#
# Shape matters here: triage.py is deterministic and needs no model, so it runs
# on every tick for free. Claude is only invoked when there is actually an open
# issue to act on — waking a model every few hours to be told "0 open issues"
# costs tokens and returns nothing.
#
# Installed as a launchd agent; see triage-cron.plist. Never pushes.

set -uo pipefail

REPO="/Users/akvaithi/Developer/AggieResearchFinder"
TOOLS="$REPO/tools"
PY="$REPO/crawler/.venv/bin/python"
CLAUDE="$HOME/.local/bin/claude"
LOG="$HOME/Library/Logs/srf-triage.log"
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:/usr/bin:/bin:/usr/sbin:/sbin"

say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

cd "$TOOLS" || { say "FATAL: $TOOLS missing"; exit 1; }

report=$("$PY" triage.py --out triage-report.md 2>&1)
if [ $? -ne 0 ]; then
  say "triage.py failed: $(printf '%s' "$report" | tail -2 | tr '\n' ' ')"
  exit 1
fi

# "N open issue(s) labelled `feedback` · dataset: M records"
count=$(printf '%s' "$report" | sed -n 's/^\([0-9]\{1,\}\) open issue(s).*/\1/p' | head -1)
count=${count:-0}

if [ "$count" -eq 0 ]; then
  say "0 open feedback issues — no action, model not invoked"
  exit 0
fi

say "$count open feedback issue(s) — invoking claude to triage"

# Deliberately no `git push` in the allowlist, on top of the prompt saying so.
"$CLAUDE" -p "Feedback triage for AggieResearchFinder. Run:
  cd $TOOLS && $PY triage.py --out triage-report.md

For each open issue act on the report's 'Suggested action':
 - 'no work' / search-discoverability / feature: change nothing; draft a one-paragraph
   reply for Arun and stop.
 - dataset correction: edit the relevant crawler/faculty*.json, then
   $PY $REPO/crawler/merge.py --sync-sources   (never skip --sync-sources)
   then $PY $REPO/crawler/census.py --audit and confirm no school became an outlier.
 - needs a new crawl: do NOT run a crawler. Write the plan and stop.

Hard rules: never push, never commit to main, never create/comment/close/label any
GitHub issue. Work in the working tree; a local branch is fine. Re-crawling destroys
ai_review/scholar_interests/publications unless merge.py --sync-sources carries them
forward — check counts before and after any merge.

End with a short report: issues seen, what changed locally, what awaits Arun's push." \
  --max-turns 40 \
  --allowed-tools "Read,Edit,Write,Grep,Glob,Bash($PY*),Bash(gh issue list*),Bash(gh issue view*),Bash(git status*),Bash(git diff*),Bash(git log*),Bash(git add*),Bash(git commit*),Bash(git checkout*),Bash(git branch*)" \
  >> "$LOG" 2>&1

say "claude run finished (exit $?)"
