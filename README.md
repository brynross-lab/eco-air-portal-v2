# Eco Air Staff Portal v2

A simpler, phone-first version of the staff portal. It is a **separate app** that reads the
**same Firebase database** as the current portal (`ecoair-portal`). The current portal's
code and deployment are not touched.

## Saving (on since 2026-10-27)

`config.js` has `READ_ONLY: false`: v2 saves to the same Firestore records as the current
portal, so staff can use either one and see the same data.

- **Backup:** admins can download everything from More → Download a backup (one JSON file).
  Do this before big changes. A full Firestore export is in Google Cloud console →
  Firestore → Import/Export.
- **Back to preview:** set `READ_ONLY: true` and redeploy. Every save, upload and delete is
  then refused in the browser, and a yellow "Preview" bar shows.
- **Keeping the two in step:** v2 copies the builders and invoice engine from the current
  portal. When the current portal changes how it saves something, copy that change here too.

## Deploy as its own Vercel project

1. Put this folder in its own GitHub repo (or upload it with the Vercel CLI: `vercel` from
   inside the folder).
2. In Vercel, **Add New → Project**, pick that repo, framework **Other**, no build command,
   output directory `.` (the folder root).
3. You get a new URL such as `eco-air-portal-v2.vercel.app`. The current
   `eco-air-portal.vercel.app` project stays exactly as it is.

Nothing needs building; it's plain HTML, CSS and JavaScript like the current portal.

## What's in it

| Tab | What it does |
| --- | --- |
| **Home** | Today's work, your assigned lot tasks, and one To do list: approvals, work orders ready to invoice, open flags, follow-ups. Admins also see business totals. |
| **Sites** | Builder → site → one page with **Map, Lots, Work orders, Masters, Files**. Lots are coloured by stage from invoiced work orders, same as now. Tap a lot for its flags, work orders, masters, documents and tasks. |
| **Schedule** | Week view of work orders (by their date), invoices and scheduled jobs, filterable by person. |
| **More** | Invoices (active / tendered), Jobs and clients, Flags, Approvals, Staff accounts, Activity. |
| **+ New** | Work order, Measure sheet, Estimate, Invoice, Job, Site map. |

## What's carried over unchanged

So that what gets saved is identical to the current portal:

- `tools/workorder.html`, `tools/measure.html`, `tools/estimate.html`: exact copies of the
  builders embedded in the current portal.
- `tools/v2-skin.css`: the v2 look for the Work Order and Measure builders. It's added on top
  of their own styles when they open in v2. It changes appearance only; their calculations,
  saving and PDFs are untouched.
- `invoice-engine.js`: the current invoice builder's code (totals, HST, apprentice/partner
  pay, split invoices, PDF layout). Two small screen-only changes are noted at the top.
- `legacy-compat.js`: union price defaults and migration, the measure-sheet record shape,
  and the invoice side effects (calendar events, crew names).

Everything else (`app-*.js`, `styles.css`, `index.html`) is new.

## Read Photo (AI measure sheets)

The Measure tool's **Read Photo** button sends a photo of a handwritten measure sheet to
Claude, which fills in the form. In v2 this goes through `api/claude-proxy.js`, a small Vercel
function (the old portal called a Netlify function that doesn't exist on Vercel).

To switch it on, in Vercel → this project → **Settings → Environment Variables** add:

- `ANTHROPIC_API_KEY`: a Claude API key from console.anthropic.com. Required.
- `CLAUDE_MODEL`: optional, defaults to `claude-sonnet-5-5`.

Then redeploy. Only signed-in staff can use it: each request carries the user's sign-in and the
function checks it against the `staff` collection before calling Claude. It reads photos and
fills the form only; nothing is saved until someone saves the measure sheet.

## Still in the current portal for now

Branding, the price-rate editor, Trash/restore, and merging or renaming builders and sites.
More → "Still in the current portal" links there.

## Things worth knowing

- **Sign-in works the same way as the current portal:** usernames and password hashes live in
  the `staff` collection, and the database rules must allow the browser to read them. That
  means anyone with the web config can read the database. Moving both portals to Firebase
  Authentication with proper security rules is the recommended next step.
- Opening a work order in the builder can update its stored total (the builder recalculates
  and reports it). The current portal does the same.
- The Estimate tool saves estimates to a different, older Firebase project
  (`eco-air-portal`) that's hard-coded inside it. That's unchanged from today.
