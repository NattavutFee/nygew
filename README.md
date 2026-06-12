# ERSSmartBuddy Prototype

Clickable Phase 0 prototype generated from `PRD 1.md`.

## Run

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Included Prototype Flows

- Mock ERS workspace with embedded ERSSmartBuddy chat widget.
- Receipt upload or sample receipt selection.
- Deterministic receipt extraction fallback with editable draft preview.
- OCR confidence warning below 80%.
- Amount edit warning above 10%.
- Draft confirmation that clearly states no production ERS submission occurred.
- Policy Q&A using sample Employee Expense Reimbursement Policy 2026 snippets with citations.
- Unsupported policy refusal behavior.
- Seeded claim status lookup and mock approver notification resend.
- Guided ERS troubleshooting and copyable escalation summary.
- Session audit log preview for AI-assisted actions.

## Production Notes

The PRD calls for Neon PostgreSQL with Drizzle ORM for the stakeholder demo. This static prototype does not include database credentials or migrations because no `DATABASE_URL` was available in the workspace. The UI and data model are structured so the mocked arrays in `app.js` can later be replaced by API routes backed by Neon and Drizzle.
