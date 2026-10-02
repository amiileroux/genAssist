# genAssist — Motor Insurance Quotation Intake

A web app for agents to build new motor insurance quotations, built around the
paper "Motor Insurance — Quotation Form":

1. **New Quotation** (`/index.html`) — upload a photo of the client's DP/ID,
   the certified copy of the vehicle, and (if applicable) their No Claim
   Discount letter. Each upload is run through OCR and used to best-effort
   auto-fill a few fields (DP number, dates, registration/chassis/engine
   numbers). The full quotation form mirrors the paper form (proposer
   details, vehicle details, coverage details, additional drivers, accident
   history) and everything stays editable. There's no login and nothing to
   set up first — an agent opens the link, fills in a client, and saves.
2. **Send to whichever email(s) you type in** — once a quotation is saved,
   a box appears to type in any email address(es) it should go to (the
   client, a colleague, yourself — comma-separated for more than one). That
   send always also includes a fixed oversight address
   (`amii.aral@enbfocus.com` by default — see "Email sending" below to
   change it). There's an optional "Your name" / "Your email" panel above
   the form that just remembers your name (shown in Records) and prefills
   the send box next time — it's a convenience, not a requirement, and the
   form can be saved and reused without ever touching it.
3. **Records** (`/records.html`) — every saved quotation, filterable by
   date, insurance type, agent, or free text. Each record expands into a
   list of fields with a **Copy** button next to every line (plus a **Copy
   all fields as text** button) so you can paste values straight into
   another system. It also has its own "send to" box, so a record can be
   (re)sent to anyone, any time, even long after it was first saved.

The same link is meant to be reused indefinitely by many agents at once —
there's no per-agent setup gate, no session limit, and the form resets and
is ready for the next client immediately after each save.

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

## Email sending (required for the "send to whichever email" button to actually send)

Without this configured, quotations still save normally and the send box
still accepts whatever's typed into it — pressing Send will just come back
with **"Not sent — SMTP not configured on server"**, and nothing crashes.
To turn emailing on, set these environment variables before `npm start`
(e.g. in a `.env` file loaded by your process manager, or directly in your
hosting platform's secret/env settings):

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
with a public URL instead of a laptop, and with **persistent disk** (the
`data/` folder must survive restarts/redeploys — plain "serverless"
platforms typically wipe local disk between invocations, so avoid those).

I can't create a hosting account or pay for one on your behalf, but I did
commit a ready-to-use [Render](https://render.com) blueprint
(`render.yaml`) so the deploy itself is close to one click:

1. Create a free Render account at render.com and connect it to your GitHub.
2. In the Render dashboard: **New +** → **Blueprint** → pick the
   `amiileroux/genAssist` repo → branch `claude/amazing-shannon-1d3yul` (or
   `main`, once this is merged there).
3. Render reads `render.yaml` and sets up a web service with a 1GB
   persistent disk mounted at `data/` automatically. It'll prompt you to
   fill in a few environment variables it left blank on purpose (secrets
   don't belong in the repo) — `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`,
   `EMAIL_FROM` — see "Email sending" above for where those come from.
4. Click **Apply** / **Deploy**. Render builds it and gives you a public
   URL like `https://genassist.onrender.com` — that's the one link to hand
   to all 60+ agents.

Cost: Render's `starter` plan (needed for the persistent disk) runs about
**$7/month** plus roughly $0.25/GB/month for the disk — there's no
realistic way to get persistent storage for free on a managed platform.
If you'd rather avoid any recurring cost, the cheapest path is a small VPS
(Hetzner/DigitalOcean, ~$4–6/month) running `npm start` under `pm2` behind
Caddy for HTTPS — more setup, same idea. Tell me which way you want to go
and I'll either walk the Render blueprint through with you step by step, or
write out the VPS setup commands.

## Project layout

```
server/
  index.js        — Express app, routes for OCR, agents, and quotation CRUD
  db.js            — SQLite storage (node:sqlite, no native build step)
  ocr.js           — tesseract.js wrapper + best-effort field guessing
  email.js         — sends a saved quotation + images to whichever email(s) were typed in
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
