# ARAL &rarr; TATIL Lead Vetting Pipeline

A Google Workspace web app (Google Apps Script + Tailwind CSS) for **A.
Rauseo & Associates (ARAL)** that automatically intakes General Insurance
leads from a Google Form, vets the uploaded compliance documents, scores
each file's readiness, and routes it into the right Google Drive folder
on the way to TATIL Underwriting.

This is a separate tool from the main `genAssist` quotation app in this
repo — it's built entirely on Google Apps Script/Sheets/Drive/Gmail
rather than Node, because the ask here is specifically a Google
Workspace web app with no server to host.

## What it does

1. An agent submits the Google Form (client details + four document
   uploads).
2. An installable trigger fires, which:
   - Creates a Drive folder `[ARAL-CODE]_[Client_Name]_[Policy_Type]`
     and moves the uploaded files into it.
   - Scores the submission 0–100% against the Motor Insurance checklist.
   - Moves the folder into the matching pipeline stage.
   - Logs a row to the `Pipeline_Tracker` sheet (the dashboard's data
     source).
   - Emails the agent the exact missing items if anything's incomplete,
     or emails Underwriting if it's 100% ready.
3. Admins work the **Admin Dashboard** (desktop) to flag, request info,
   approve, or mark a TATIL policy number as issued — each action moves
   the Drive folder and re-notifies the agent.
4. Agents work the **Agent Portal** (mobile-first) to see their own
   submissions and re-upload exactly the documents that are missing.

## Drive folder architecture

```
/ARAL_Insurance_Pipeline/
  01_Incomplete_Flagged/       Missing KYC, bad photos, or misinformation
  02_Needs_Supplemental_Info/  Needs additional underwriting detail (e.g. valuation)
  03_Ready_For_Underwriting/   100% complete & vetted
  04_Completed_Policies/       Issued policies with TATIL policy numbers
```

Folders are created on first run and their IDs are cached in Script
Properties, so the structure is created once and then just reused.

## Vetting rules (Motor Insurance)

Each worth 25%:

| Check | Notes |
|---|---|
| Driver's Permit | Must be uploaded **and** not expired (checked against the permit expiry date on the form) |
| Vehicle Certified Copy | Must be uploaded |
| Vehicle Valuation | Only required — and only scored — when Policy Type is **Comprehensive**; waived (auto-counted) for Third Party |
| Proof of Address / Utility Bill | Must be uploaded **and** dated within the last 90 days |

Routing:

- **100%** → `Ready for Underwriting`, folder moves to `03_Ready_For_Underwriting`, Underwriting is emailed.
- **Only the valuation is missing** (and the Comprehensive policy needs one) → `Needs Supplemental Info`, folder moves to `02_Needs_Supplemental_Info`.
- **Anything else missing** (permit, cert copy, or utility bill) → `Incomplete / Flagged`, folder moves to `01_Incomplete_Flagged`, and the agent is emailed the exact missing items.
- An admin can also manually flag a submission (e.g. for suspected misinformation) from the dashboard regardless of score — that always re-routes to `01` and emails the agent with the admin's note.

## Project layout

```
appsscript.json      Manifest (time zone, web app access, OAuth scopes)
Code.gs               doGet, onFormSubmit trigger, setup, reprocessing
Config.gs             All the editable constants (folder names, form field titles, cutoff hour, ...)
DriveManager.gs       Folder creation/lookup, moving folders between stages, moving uploaded files
VettingEngine.gs      The scoring/routing logic described above
SheetManager.gs       Reads/writes the Pipeline_Tracker sheet
EmailService.gs       Agent/Underwriting notification emails
AdminController.gs    Server functions the Admin Dashboard calls (google.script.run)
AgentController.gs    Server functions the Agent Portal calls
Index.html            Web app entry point — picks Admin or Agent view server-side
Stylesheet.html       Tailwind CDN + shared styles, included on every page
AdminDashboard.html   Admin table UI (markup only)
AdminScript.html      Admin UI behaviour
AgentPortal.html      Agent mobile UI (markup only)
AgentScript.html      Agent UI behaviour, including document re-upload
```

## Setup

1. **Create the Google Form.** Add these exact questions (titles must
   match `CONFIG.FORM_FIELDS` in `Config.gs` — edit that file instead if
   you'd rather use your own wording):

   | Question title | Type |
   |---|---|
   | Client Full Name | Short answer |
   | Agent Name | Short answer |
   | Agent Email | Short answer (or use the Form's built-in "collect email" instead and adjust `Config.gs`) |
   | Policy Type | Multiple choice — include an option containing the word "Comprehensive" and one for Third Party |
   | Vehicle Registration Number | Short answer |
   | Upload: Driver's Permit | File upload |
   | Driver's Permit Expiry Date | Date |
   | Upload: Vehicle Certified Copy | File upload |
   | Upload: Vehicle Valuation (Comprehensive only) | File upload |
   | Upload: Proof of Address / Utility Bill | File upload |
   | Utility Bill Date | Date |

2. **Link the Form to a new Google Sheet** (Form → Responses tab → the
   green Sheets icon).

3. **Open the Sheet → Extensions → Apps Script**, and create each file
   above in the script editor (matching filenames exactly, including the
   `appsscript.json` manifest — open it via the gear-icon **Project
   Settings → Show "appsscript.json"**). Copy-paste each file's contents
   from this folder.

4. **Set Script Properties** (Project Settings → Script properties):

   | Property | Value |
   |---|---|
   | `ADMIN_EMAILS` | Comma-separated list of admin Google account emails, e.g. `amii@aral.com,backoffice@aral.com` |
   | `UNDERWRITING_EMAIL` | Where "ready for underwriting" alerts go, e.g. `underwriting@tatil.co.tt` |

5. **Run `setupPipeline` once** from the script editor's function
   dropdown (▶ Run). The first run will ask you to authorize Drive,
   Sheets, Gmail, and trigger-management permissions — approve them.
   This creates the Drive folder structure, the `Pipeline_Tracker`
   sheet, and installs the `onFormSubmitTrigger` trigger.

6. **Deploy as a web app**: Deploy → New deployment → type **Web app**.
   - Execute as: **Me** (so the script can always manage the Drive
     folders/sheet regardless of who's viewing).
   - Who has access: **Anyone within [your domain]** if all agents have
     ARAL Google Workspace accounts (recommended — this lets the app
     detect who's viewing automatically and skips straight to the right
     view). Use **Anyone** instead if some agents use personal Google
     accounts or no Google account at all; the Agent Portal falls back
     to asking for an email address in that case.
   - Copy the resulting web app URL and share it — that's the one link
     for both admins and agents; the app shows each their own view
     automatically.

7. **Test it**: submit the Form once with all four documents and valid
   dates, confirm a folder lands in `03_Ready_For_Underwriting` and a row
   appears in `Pipeline_Tracker`. Submit again missing a document and
   confirm it lands in `01_Incomplete_Flagged` and the agent gets an
   email.

## Useful maintenance functions

Run these from the Apps Script editor's function dropdown when needed:

- `setupPipeline` — safe to re-run any time; won't duplicate folders or
  triggers.
- `reprocessAllRows` — re-scores every tracker row against its Drive
  folder's current contents. Useful after changing `Config.gs`, or after
  manually dropping a file into a folder outside the app.

## Honest notes / limitations

- **Not a true installable PWA.** Apps Script web apps are served from a
  single sandboxed `doGet` endpoint, which can't host a separate
  `manifest.json` or a service worker at a fixed path, so there's no
  offline caching or "Install app" browser prompt. What's here is a
  mobile-first responsive page that works well bookmarked or added to a
  phone's home screen as a shortcut — the day-to-day experience agents
  need — just not an offline-capable PWA in the strict sense.
- **Form field matching is title-based.** `onFormSubmitTrigger` reads
  `e.namedValues` keyed by each question's exact title. If you reword a
  question on the Form, update the matching string in `Config.gs` or the
  trigger will silently treat that field as blank.
- **Identity detection depends on the deployment's access setting.**
  With "Anyone within domain" + "Execute as: Me", `Session.getActiveUser()`
  reliably returns the viewer's email, which drives automatic admin/agent
  routing. With "Anyone" access, Google hides viewer identity for
  privacy, so the Agent Portal asks for an email address once and
  remembers it in that browser.
- **Misinformation flags are a human judgment call**, not something the
  automated scorer detects — that's why "Flag as Incomplete" on the
  Admin Dashboard works independently of the score, for exactly that
  case.
