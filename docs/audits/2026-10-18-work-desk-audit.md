# Work desk audit, 2026-10-18

Owner-facing pages of the work desk released in #58, audited page by page in
a real browser, signed in as the owner, at 1440×900 and 390×844, plus a
320×640 overflow sweep. 13 pages plus the login: `/`, `/ideas`, `/inbox`,
`/projects`, `/decisions-followup`, `/departments`, `/company`, `/sales`,
`/employee-runtime`, `/operations`, `/company-brain`,
`/correspondence-center`, `/status`.

Local build, no Supabase, so pages render their empty and "not configured"
states. Data-heavy states (long lists, real dossiers) were not exercised.

Fixes are in commit `bf8595b`. Every number below was measured, then measured
again on a fresh build after the fix.

## Health score (after fixes)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | AA contrast, labels, landmarks and one `h1` per page now hold on all 28 views. Keyboard and screen-reader paths were not walked end to end. |
| 2 | Performance | 3 | Cold load ≈165 KB JS, 29 KB CSS, 77 KB fonts (compressed). CLS ≤ 0.016. |
| 3 | Theming | 2 | `workspace.css` holds 80 hard-coded colours against 114 token uses; `unified-theme.css` sizes buttons with `!important`, which forces counter-`!important`. Light only. |
| 4 | Responsive | 3 | No page overflows at 320, 390 or 1440 px; every phone control is ≥ 44 px and every phone field 16 px. Tab strips scroll inside their own track by design. |
| 5 | Implementation integrity | 2 | Two design languages coexist (square work-desk dossiers vs. the older rounded cards on the company-tools pages); em dashes and English internal names in Arabic copy. |
| **Total** | | **13/20** | **Acceptable** |

**Integrity verdict: pass with drift.** The work desk itself (`/`, `/ideas`,
`/inbox`, `/projects`, `/decisions-followup`) is one coherent system: one
green-black ink on a tinted off-white, square dossier sheets, a treated dark
rail. The company-tools pages behind "الأقسام وأدوات الشركة" still speak the
previous rounded-card language, so moving between them changes the product's
voice.

## Fixed in `bf8595b`

| Sev | Issue | Root cause | Before → after |
|---|---|---|---|
| P1 | Cards crushed on a phone (`EmployeeRuntimeConsole`, `OrgStructure`, `ShopifyPanel`, `GoldenStarOffice`, `DecisionFollowupCenter`) | Inline `gridTemplateColumns: "repeat(4, …)"` outranks every media query | ~113 px cards, text past the edge → grids fold (`lib/ui/fluidColumns.ts`, tested) |
| P1 | Pages wider than a 320 px screen (`/status` +58 px, `/company-brain` +28 px) | `.page-wrap` and `.readiness-item` used implicit `auto` / `1fr` tracks, which grow to the widest child's min-content | Overflow → 0 |
| P1 | 23 fields named only by a placeholder; 3 hid it behind a default value, 1 had no name | Placeholder used as label | 16 unlabeled per audit → 0; each label carries its unit (ر.س, %, أيام) |
| P1 | iOS Safari zoomed into every phone field | Fields typed at 10–14.4 px (Safari zooms under 16 px) | 16 px, ≥ 44 px tall |
| P1 | Phone controls under 44 px (45 hits, 13 of them the off-screen skip link) | `.btn-sm { min-height: 34px !important }` in `unified-theme.css` | 0 (skip link excluded: it is keyboard-only) |
| P1 | Active nav number unreadable | The rail's number colour kept on the lighter active fill (`#365345`) | 3.88:1 → 5.81:1 |
| P2 | Product remove control drawn as an oval in a bordered circle (`/sales`) | Inline 30 px size fought the class's 36 px flex basis; icon parked in a tile | Bare glyph, 36 px desktop / 44 px phone, confirmed by a real tap |
| P2 | Price placeholder sliced at the field edge on a phone | 90 px flex basis too narrow for a 16 px placeholder | Fully visible |
| P2 | One-edge accent stripe on every notice | Decorative `border-inline-start: 3px` | Removed; fill, icon and text colour carry the state |
| P3 | `/ideas` search typed at 11 px | Caption size reused for an input | 13.6 px |

A regression of my own was caught by measurement and fixed in the same
commit: wrapping fields in `.field-label` made them inherit its 10 px font.

## Open findings

**[P2] Em dashes in Arabic prose.** About 50 prose instances across 33 files
(`DecisionFollowupCenter`, `OrgStructure`, `GoldenStarOffice`, `SalesConsole`,
`CompanyOverview`, `OrvantaFacade`, …). The design law names the em dash as an
AI-writing tell. A dash standing for "no value" in a stat or table cell is a
typographic convention and should stay. Replace prose dashes with a colon, a
comma or a full stop, sentence by sentence. → `/impeccable clarify`

**[P2] English internal names in the Arabic interface.**
`EmployeeRuntimeConsole.tsx:206` "Employee Runtime V2";
`app/company-brain/page.tsx:249` "Company Brain"; product statuses `active` /
`draft` rendered raw (`SalesConsole.tsx:249`); sale channel default `direct`
(`EmployeeRuntimeConsole.tsx:272`); an environment variable name in copy
(`SalesConsole.tsx:221`); readiness evidence lines in English
(`lib/company/productionReadinessEvidence.ts`). → `/impeccable clarify`

**[P2] Small label over every heading.** 48 files open a page or card with an
`eyebrow` / `bento-kicker` above the heading. The design law lists the
small-label-over-big-heading head as a slop layout. Where the label carries
real information (the breadcrumb "مكتب التطوير / سجل الفرص") it can move into
the breadcrumb that already exists in the top bar; where it repeats the
heading, drop it. This changes the look of every page, so it is the owner's
call. → `/impeccable distill`

**[P2] Two design languages.** The company-tools pages (`/company-brain`,
`/departments`, `/company`, `/sales`, `/operations`, `/status`) keep the
rounded hairline cards and a different display treatment. → `/impeccable
polish` across those pages after `/impeccable document` captures the work
desk as DESIGN.md.

**[P2] Hard-coded colours and `!important` sizing.** 80 hex values in
`workspace.css`; `.btn-sm` sized with `!important` in `unified-theme.css:670`.
→ `/impeccable extract`

**[P3] Dead components with the crushed-grid pattern.**
`components/EmployeeRuntimePanel.tsx` and `EmployeeRuntimePanelV2.tsx` are
imported nowhere and still hold six fixed `repeat(4, …)` grids. Delete them
so the pattern is not copied back.

**[P3] Wrong status code without a database.** `/api/company-brain/platform`
and `/api/system/operations` return 500 with an English message when Supabase
is not configured; other routes return 503 with Arabic copy. Local only.
→ `/impeccable harden`

**[P3] Proof captured through `window.prompt`.**
`DecisionFollowupCenter.tsx:104` asks for completion proof in a browser
prompt. The execution-proof design
(`docs/superpowers/specs/2026-10-18-execution-document-proof-design.md`)
replaces it.

## Detector

`impeccable detect` on the changed files: 4 hits, all in `workspace.css`.
`side-tab` on `.workspace-notice`: real, fixed. Three `border-accent-on-rounded`
on `.priority-dossier`, `.idea-dossier`, `.idea-intake`: false positives, the
computed radius is 0; the 3 px top rule on a square sheet is the dossier
motif of the chosen design and stays.

## What works

- One palette held with discipline on the work desk; no blue-purple, no
  glow.
- RTL layout reads correctly on every page audited.
- Honest state on screen: "بيانات تجريبية", "محاكاة آمنة", "لا يمكن تأكيد
  الحالة الحالية" instead of fake numbers.
- Real-world actions ask before they act (the remove tap opens a
  confirmation; dismissing it sends nothing).
- `prefers-reduced-motion` is respected; layout shift is near zero.
- Phone gets a bottom tab bar for four of the workflow stations.

## Recommended order

1. **[P2] `/impeccable clarify`**: em dashes and English internal names.
2. **[P2] `/impeccable document`** then **`/impeccable extract`**: capture
   the work desk as DESIGN.md and pull its colours into tokens.
3. **[P2] `/impeccable distill`**: the kicker-over-heading pattern, if the
   owner agrees.
4. **[P2] `/impeccable polish`**: bring the company-tools pages into the
   work-desk language.
5. **[P3]** delete the two dead panels; `/impeccable harden` the two 500s.

## How to re-run

Scripts used for this audit are not in the repository. To repeat it: build,
start `next start` with a local owner code, sign in with Playwright at each
width, and record per page the horizontal overflow, controls under 44 px,
fields without a label, text under its WCAG contrast ratio, `h1` count,
`<main>` presence and console errors. Confirm the server logs the expected
Next.js version first (see `AGENTS.md`, the stale-server incident).
