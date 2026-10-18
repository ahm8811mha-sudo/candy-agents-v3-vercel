# Engineering law for this repository

Binding on every agent and every session that touches this code, whoever wrote
the agent. `CLAUDE.md` imports this file, and it holds the design law as well;
the two are read together.

Each rule below exists because the failure it prevents has already happened
here. The incident is named so the rule is not mistaken for ceremony.

---

## 1. Evidence before claims

No statement that something works, passes, is fixed or is deployed without
fresh evidence from this turn.

Before claiming anything:

1. Name the command that proves the claim.
2. Run it in full, now. A previous run does not count.
3. Read the output and the exit code. Count the failures.
4. Claim exactly what the output shows, no more.

"Should work", "probably", "looks right" and "done!" before step 3 are not
status reports, they are guesses.

### The gate for this repository

This is what CI runs, in this order. A change is not ready until each one has
been run locally and read:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:smoke
npm audit --omit=dev --audit-level=high
```

And, for anything a person interacts with (a page, a form, the login, a
button): drive it in a real browser at desktop and phone widths and check the
outcome, not only that the page loads.

### What counts as evidence

| Claim | Evidence | Not evidence |
|---|---|---|
| Tests pass | Test output, 0 failures | An earlier run |
| Build works | `npm run build` exit 0 | Lint passing |
| Bug fixed | The original symptom no longer reproduces | The code was changed |
| Regression test guards the bug | Revert the fix, the test **fails**; restore, it passes | The test passing once |
| UI works | A real click, the expected result on screen | The page returned 200 |
| Deployed | Deployment READY **with the expected commit SHA**, and the live page shows the change | The merge succeeded |
| Another agent's work is done | Its diff, read and verified | Its own success report |

**Incident: the stale server.** During one verification an old `next-server`
from a previous build was still bound to the port and answered every request,
so a fresh build was "verified" against old code. Confirm the running server is
the build you just made (check the version it logs) before trusting any
browser result.

---

## 2. Root cause before fix

No fix until the cause is found and stated. A fix aimed at a symptom is a
second bug.

1. **Read the error in full**, including the code and file it names.
2. **Reproduce it** reliably before changing anything.
3. **Check what changed**, and check *which code is actually running*: the
   deployment the user is on, not `main`.
4. **Trace the data** back to where the wrong value first appears.
5. **One hypothesis, one change, one test.** Never stack fixes.
6. **Write the failing test first**, then the fix, then prove the test goes red
   without the fix.

If three fixes have failed, stop fixing. Three failures mean the model of the
problem is wrong, and the next step is to question the design with the owner,
not to try a fourth fix.

**Incident: the owner lockout.** The owner could not log in with a correct
code. In turn the environment variable, Vercel, the browser and the rate
limiter were suspected. The cause was one line, `code.length < 12`, in
`app/api/owner-access/route.ts`, still present in the *specific commit* the
owner's preview was built from. Two habits would have found it at once:

- **Read the code of the deployment the user is on.** A fix on `main` does
  nothing for a preview built from an older commit.
- **Read what the error proves.** The rate limiter is only consulted when the
  submitted code *mismatches*, so a lockout message is proof the code did not
  match, not proof that a correct code was refused.

---

## 3. Design before building

Before building a new feature: understand the intent, settle the design, then
write a plan, then build. Do not start with code.

A plan is a written list of small, verifiable steps saved in `docs/`. It is the
thing a second agent reads to continue the work without re-deriving it, and the
thing that keeps two agents from building two incompatible versions.

---

## 4. Hard rules for this codebase

These are not judgement calls.

**The repository is public.** Never commit a secret, an access code, an API key
or a connection string. Test fixtures must not mirror any value a deployment
actually uses. Secrets live in Vercel environment variables or GitHub Actions
secrets, nowhere else.

**Schema changes go through `supabase/migrations/` only.** Never apply
`database/schema.sql` wholesale: it carries permissive anonymous policies that
must not reach production.

**Readiness is evidence, never an attestation.** The release gates read the
`readiness_evidence` table. Never record a `PASS` that a real check did not
produce, and never set an env flag to make a gate turn green.

**Execution honesty is load-bearing.** A `REAL_WORLD` task (a registration, a
payment, a signed contract) is never marked done because an agent produced the
paperwork. Only the owner's confirmation, with proof, closes it. A database
trigger enforces this; never route around it.

**Never weaken the CI security audit gate.** When an advisory lands, raise the
affected package to the *lowest* version outside the advisory range, in
`dependencies` or `overrides`, not only in the lockfile. Then re-run the full
gate and the browser check, because a "patch" can resolve to a minor release.

**Merge `main` into a long-lived branch before deploying it.** **Incident:** a
redesign branch was left in draft for a month. When the owner chose its design,
it was still on a Next.js version with a critical remote code execution
advisory that `main` had already closed. Deploying it as it stood would have
reopened the hole. A branch that has drifted from `main` is not ready to ship,
however good it looks.

**The CI gate is the floor, not the finish.** Green CI means nothing a test
checks is broken. It does not mean the feature works for the owner. Section 1
still applies.
