# ERSSmartBuddy PRD

## 1. Product Overview

**Product name:** ERSSmartBuddy

**Tagline:** AI-powered expense assistant for faster, safer, and more guided reimbursement workflows.

ERSSmartBuddy is a web-based AI assistant embedded into an existing Expense Reimbursement System (ERS). It helps employees create expense claims from receipts, ask reimbursement policy questions, check claim status, and resolve common ERS issues before escalating to IT.

The product is designed as an assistant, not an autonomous decision-maker. Employees, approvers, Finance, and IT remain accountable for final submission, approval, audit, and support decisions.

## 2. Problem Statement

Employees spend too much time manually entering receipt data into ERS. Manual entry is repetitive, error-prone, and often leads to Finance rejecting claims for correction.

Employees are also unsure about reimbursement policies and claim status. This creates repeated questions to HR, Finance, and approvers.

When ERS issues occur, employees often open IT tickets immediately, even for simple user errors or known issues. This increases ticket volume and slows down IT support.

## 3. Goals

- Reduce employee time spent entering expense claim details.
- Reduce Finance rework caused by incomplete or incorrect expense submissions.
- Help employees understand reimbursement policy using company-approved source documents.
- Let employees check claim status and resend approver notifications from chat.
- Reduce low-value IT tickets by guiding users through self-service troubleshooting first.
- Create better IT tickets when escalation is needed by attaching error context and logs.

## 4. Non-Goals

- ERSSmartBuddy will not approve or reject expense claims.
- ERSSmartBuddy will not submit claims without explicit employee confirmation.
- ERSSmartBuddy will not fine-tune or update a shared AI model automatically from user edits.
- ERSSmartBuddy will not answer policy questions from general internet knowledge.
- MVP will not support all receipt formats, handwritten receipts, or complex tax invoices.

## 5. Target Users

- **Employees:** Submit expense claims, ask policy questions, check status, and troubleshoot ERS issues.
- **Approvers:** Receive claim notifications and follow-up reminders.
- **Finance team:** Review claims with fewer data-entry errors and clearer audit signals.
- **HR/Finance policy owners:** Maintain reimbursement policy documents used by the assistant.
- **IT support team:** Receive better incident tickets with logs, summaries, and user troubleshooting history.
- **Security and compliance teams:** Review data handling, access control, guardrails, and auditability.

## 6. Core Use Cases

### 6.1 Receipt-to-Draft Claim

An employee uploads or captures a receipt image. ERSSmartBuddy extracts key fields and creates a draft expense transaction.

Expected extracted fields:

- Merchant name
- Receipt date
- Total amount
- Currency
- Tax or VAT amount, when available
- Expense category suggestion
- Receipt image attachment
- OCR confidence score

The employee reviews the preview, edits incorrect fields, and manually confirms submission.

### 6.2 Policy Q&A

An employee asks questions such as:

- "Can I reimburse client dinner?"
- "What is the hotel limit for domestic travel?"
- "Can I claim taxi fare without a tax invoice?"

ERSSmartBuddy answers only using approved reimbursement policy documents and includes source references such as document name, section, or page number.

### 6.3 Claim Status Inquiry

An employee asks about a submitted claim. ERSSmartBuddy retrieves real-time claim status from ERS and displays:

- Claim ID
- Current status
- Current approver
- Last action date
- Pending action, if any

If the claim is waiting for approval, the employee can trigger a resend notification to the current approver.

### 6.4 Self-Service IT Troubleshooting

When an employee encounters an ERS issue, ERSSmartBuddy guides them through known troubleshooting steps.

Examples:

- Refresh page
- Re-login
- Clear cache
- Check file format or file size
- Retry upload
- Confirm network or VPN status

If the issue remains unresolved, the employee can confirm ticket creation. ERSSmartBuddy summarizes the issue, attaches relevant error logs, and creates a ticket in the IT support system.

## 7. Functional Requirements

### 7.1 Chat Widget

- The web app must provide a chat widget accessible from the ERS interface.
- The widget must support typed questions and guided actions.
- The widget must show AI responses, source references, confidence indicators, and action buttons.
- The widget must preserve conversation context within a user session.
- The widget must support role-based access based on existing ERS user identity.

### 7.2 Receipt Scanning

- Users must be able to upload a receipt image from desktop or mobile browser.
- The system must run OCR and extract structured receipt fields.
- The system must show a draft preview before submission.
- Users must be able to edit extracted fields.
- User edits must be stored as audit trail and feedback logs.
- User edits must not directly train or update a shared model.
- If OCR confidence is below the configured threshold, the system must require manual entry.
- If user-edited amount differs from OCR-extracted amount beyond the configured threshold, the system must flag the claim for Finance review.

Default thresholds for MVP:

- OCR confidence threshold: 80%
- Amount edit anomaly threshold: 10%

### 7.3 Policy Assistant

- The assistant must answer policy questions only from approved company policy documents.
- The assistant must use strict retrieval-augmented generation.
- The assistant must cite source document references in every policy answer.
- If the answer is not found in the approved documents, the assistant must say it cannot determine the answer and suggest contacting the responsible team.
- The assistant must include a disclaimer that final approval depends on approver and Finance review.

### 7.4 Claim Status and Notification

- The assistant must retrieve claim status from ERS APIs.
- The assistant must only show claims accessible to the authenticated employee.
- The assistant must show claim status in a concise structured format.
- Users must be able to resend notification to the current approver when a claim is pending.
- Notification resend actions must be rate-limited and logged.

### 7.5 IT Support Automation

- The assistant must guide users through predefined troubleshooting steps before ticket creation.
- Users must explicitly confirm before creating an IT ticket.
- The system must attach available error logs and browser/session metadata allowed by company policy.
- The system must summarize the issue in a clear ticket description.
- The system must create tickets in the configured IT support platform, such as Jira or ServiceNow.
- Ticket creation must be logged with user ID, timestamp, error category, and troubleshooting steps attempted.

## 8. Security, Privacy, and Compliance Requirements

- The system must use enterprise AI services where customer data is not used to train public models.
- Personally identifiable information must be masked or minimized before AI processing when feasible.
- Access control must follow existing ERS role-based access control.
- Employees must not be able to access other employees' claims unless already permitted by ERS.
- All AI-assisted actions must be logged for audit.
- AI must not approve claims, reject claims, submit claims, or create IT tickets without user confirmation.
- Policy answers must be grounded in approved documents only.
- Prompt injection attempts must be filtered or blocked.
- Uploaded receipt images and extracted data must follow company retention policy.

## 9. AI Guardrails

ERSSmartBuddy must use guardrails to reduce hallucination, data leakage, and unsafe actions.

Required guardrails:

- Strict RAG for policy answers.
- Input filtering for prompt injection and unrelated questions.
- Output validation for policy answers, citations, and unsupported claims.
- Confidence thresholds for OCR extraction.
- Human-in-the-loop review before expense submission.
- Manual confirmation before notification resend or ticket creation.
- Anomaly detection for suspicious amount edits.
- Audit logging for all AI-generated drafts, user edits, and actions.

## 10. MVP Scope

MVP duration: 3 months.

MVP includes:

- Web-based ERSSmartBuddy chat widget prototype.
- Printed receipt upload and OCR extraction.
- Draft expense transaction preview.
- Manual correction and submit confirmation flow.
- Basic policy Q&A using approved reimbursement policy PDFs.
- Source citation for policy answers.
- Confidence threshold handling.
- Audit trail for receipt extraction and user edits.

MVP excludes:

- Handwritten receipt support.
- Full tax invoice validation.
- Multi-language receipt extraction beyond agreed pilot languages.
- Direct IT ticket integration.
- Real-time claim status integration.
- Automatic model personalization.
- Production-scale anomaly detection beyond simple threshold rules.

## 11. Future Scope

Phase 2 includes:

- ERS API integration for real-time claim status.
- Resend approver notification from chat.
- IT support ticket integration with Jira or ServiceNow.
- Error log retrieval and ticket summarization.
- Expanded troubleshooting flows.

Phase 3 includes:

- Full rollout to all employees.
- Feedback dashboard for Finance and IT.
- Advanced anomaly detection.
- Broader receipt format coverage.
- Continuous improvement based on audited feedback logs.

## 12. Success Metrics

- Reduce average employee receipt entry time by at least 70%.
- Reduce Finance claim rejection rate from baseline, for example 20%, to below 5%.
- Reduce repeated HR/Finance policy inquiries.
- Reduce low-value ERS-related IT tickets.
- Increase first-time-right claim submission rate.
- Maintain policy answer citation coverage at 100%.
- Maintain zero AI-autonomous claim approvals or submissions.

## 13. Key Risks and Mitigations

### Risk: OCR extracts incorrect receipt data.

Mitigation:

- Show draft preview before submission.
- Require employee confirmation.
- Use confidence score threshold.
- Require manual entry when confidence is low.

### Risk: User edits extracted amount to commit fraud.

Mitigation:

- Store OCR output and user edits in audit trail.
- Flag amount changes beyond threshold.
- Route suspicious claims to Finance review.
- Do not use user edits to automatically train a shared model.

### Risk: AI gives incorrect policy advice.

Mitigation:

- Use strict RAG from approved policy documents only.
- Include source citations in every policy answer.
- Refuse to answer when evidence is unavailable.
- Show disclaimer that final approval depends on approver and Finance review.

### Risk: Auto-ticket feature increases IT workload.

Mitigation:

- Require guided troubleshooting before ticket creation.
- Require explicit user confirmation.
- Rate-limit repeated ticket creation.
- Attach logs and structured summaries to improve ticket quality.

### Risk: Sensitive data is exposed to unauthorized users.

Mitigation:

- Enforce ERS RBAC.
- Minimize and mask PII before AI processing where feasible.
- Log access and actions.
- Use enterprise AI services with appropriate data processing commitments.

## 14. System Architecture

Suggested architecture:

- **Frontend:** React or Vue.js chat widget embedded in ERS web UI.
- **Backend:** Python FastAPI service for orchestration.
- **AI Core:** Azure OpenAI GPT-4o or Google Cloud Vertex AI Gemini.
- **OCR:** Azure AI Document Intelligence receipt model.
- **RAG Store:** Vector database or managed search index containing approved policy documents.
- **ERS Integration:** Existing ERS APIs for claim creation, claim status, approver information, and notifications.
- **ITSM Integration:** Jira Service Management or ServiceNow for ticket creation.
- **Security:** Enterprise identity, RBAC, audit logs, PII masking, and guardrail services.

## 15. User Experience Requirements

- The assistant must feel like part of the ERS workflow, not a separate support portal.
- Receipt scanning must lead to a clear editable preview.
- AI answers must be concise and source-backed.
- Risk flags must be visible to Finance and approvers, not hidden from the review workflow.
- Error handling must be clear and actionable.
- Users must always understand when an action is only a draft versus when it will send a notification, submit a claim, or create a ticket.

## 16. Open Questions

- Which ERS APIs are available for claim creation, claim status, approver lookup, and notification resend?
- Which policy documents are authoritative for reimbursement answers?
- What languages must be supported in MVP?
- What receipt formats are most common among employees?
- What is the acceptable OCR confidence threshold for Finance?
- Which IT support platform should be integrated first?
- What logs can be collected without violating privacy or security policies?
- What data retention policy applies to receipt images, AI prompts, model outputs, and audit trails?
- Who owns policy document updates and approval?

## 17. Launch Plan

### Phase 1: MVP

Duration: 3 months.

Deliver receipt scanning for printed receipts, draft preview, manual correction, basic policy Q&A, strict citation, confidence thresholds, and audit logging.

### Phase 2: Integration

Duration: 3 months.

Connect ERS claim status, approver notifications, IT ticket creation, error log retrieval, and guided troubleshooting.

### Phase 3: Full Rollout

Roll out to production users, monitor success metrics, collect feedback, improve extraction quality, and expand supported receipt and policy scenarios.

