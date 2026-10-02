# genAssist — Motor Insurance Quotation Intake

A web app for agents to build new motor insurance quotations, built around the
paper "Motor Insurance — Quotation Form":

1. **Your details** (top of `/index.html`) — each agent enters their name,
   their own email, and (optionally) one additional contact email to notify —
   once per device. It's saved and reused for every quotation that agent
   submits afterwards; there's no login to manage.
2. **New Quotation** (`/index.html`) — upload a photo of the client's DP/ID,
   the certified copy of the vehicle, and (if applicable) their No Claim
   Discount letter. Each upload is run through OCR and used to best-effort
   auto-fill a few fields (DP number, dates, registration/chassis/engine
   numbers). The full quotation form mirrors the paper form (proposer
   details, vehicle details, coverage details, additional drivers, accident
   history) and everything stays editable. After saving, the form clears and
   is immediately ready for the next client — agents can reuse the same link
   indefinitely, one submission after another.
3. **Automatic email on save** — every saved quotation (its data and the
   uploaded document images) is emailed to three places: the submitting
   agent's own email, a fixed oversight address (`amii.aral@enbfocus.com` by
   default — see "Email sending" below to change it), and that agent's saved
   additional contact, if they set one.
4. **Records** (`/records.html`) — every saved quotation, filterable by
   date, insurance type, agent, or free text. Each record expands into a
   list of fields with a **Copy** button next to every line (plus a **Copy
   all fields as text** button) so you can paste values straight into
   another system, and shows whether its email actually sent.

Records are grouped automatically by the date/time they were saved.

## Honest note on OCR

Tesseract OCR reads printed text reasonably well but is unreliable on
handwriting, which most of this paper form is filled in with. Treat
auto-filled fields (highlighted in yellow) as a starting point, not a final
answer — always double check against the uploaded photo before saving. The
raw extracted text is always shown under each upload so you can copy exact
values by hand when the auto-fill guesses are wrong.

## Running it locally

```bash
npm install
npm start
```

Then open http://localhost:3000.

No subscriptions are required to run this — OCR runs entirely on-device via
`tesseract.js` (it needs internet access on its *first* run only, to download
its English language model; after that it's cached and works offline), and
data is stored locally in a SQLite file at `data/genassist.db` (uploaded
images are kept in `data/uploads/`). Emailing quotations out (see below) is
the one piece that talks to an outside service, by design — that's the
feature.

## Email sending (required for the "send to agent + office" behaviour)

Without this configured, quotations still save normally — the Records page
will just show **"Not emailed — SMTP not configured on server"** for each
one, and nothing crashes. To turn emailing on, set these environment
variables before `npm start` (e.g. in a `.env` file loaded by your process
manager, or directly in your hosting platform's secret/env settings):

| Variable | Required | Example | Notes |
|---|---|---|---|
| `SMTP_HOST` | yes | `smtp.gmail.com` | Your SMTP provider's host |
| `SMTP_PORT` | no (default `587`) | `587` | |
| `SMTP_SECURE` | no (default `false`) | `true` | Set `true` only if using port 465 |
| `SMTP_USER` | yes | `yourbusiness@gmail.com` | |
| `SMTP_PASS` | yes | `xxxx xxxx xxxx xxxx` | An **app password**, not your normal password, for most providers |
| `EMAIL_FROM` | no (defaults to `SMTP_USER`) | `quotations@yourbusiness.com` | |
| `ADMIN_EMAIL` | no (default `amii.aral@enbfocus.com`) | — | Set this if that address was meant to be a different domain, or should change later |

The simplest free option for a small team is a Gmail account with an
[App Password](https://myaccount.google.com/apppasswords) (requires 2-Step
Verification enabled on that Google account) used as `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASS`. For higher volume or better
deliverability, a transactional email provider (Resend, Mailgun, SES, etc.)
works the same way — they all give you an SMTP host/user/password.

## Deploying so 60+ agents can share one link

Running `npm start` only serves `http://localhost:3000` on whatever machine
runs it — for every agent to use the *same* link, it needs to run on a server
with a public URL instead of a laptop. This app has no database server or
other infrastructure dependency (SQLite is just a file), so it runs on
almost any Node.js host with **persistent disk** (the `data/` folder must
survive restarts/redeploys — plain "serverless" platforms typically wipe
local disk between invocations, so avoid those for this app). Reasonable,
inexpensive options:

- A small VPS (DigitalOcean, Linode, Hetzner) running `npm start` behind a
  process manager like `pm2`, with a reverse proxy (Caddy/nginx) for HTTPS.
- A PaaS with a persistent volume (Render, Railway, Fly.io) — attach a volume
  mounted at `data/`.

I didn't pick one or deploy it myself — hosting needs an account (and
usually a small monthly cost) that's yours to choose and own, and I don't
have credentials for any hosting provider on your behalf. Once you've picked
one and have an account, I can walk through connecting this repo to it and
setting the environment variables above.

## Project layout

```
server/
  index.js        — Express app, routes for OCR, agents, and quotation CRUD
  db.js            — SQLite storage (node:sqlite, no native build step)
  ocr.js           — tesseract.js wrapper + best-effort field guessing
  email.js         — sends the saved quotation + images to agent/office/contact
  fieldLabels.js   — shared field-name → label map used in emails
public/
  index.html, js/new-quotation.js   — agent profile + intake form
  records.html, js/records.js       — backend/records view with copy buttons
  css/style.css
data/        — local database + uploaded document images (gitignored)
```

## Backing it up / moving it

Everything lives in `data/`. Copy that folder to back up or migrate all
saved quotations, agent profiles, and their source document photos.
