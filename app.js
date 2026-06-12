const OCR_THRESHOLD = 80;
const AMOUNT_WARNING_THRESHOLD = 0.1;

const samples = {
  normal: {
    merchant: "Siam Bistro",
    date: "2026-05-28",
    amount: 1583.6,
    currency: "THB",
    tax: 103.6,
    category: "Meals and entertainment",
    confidence: 92,
    visual: ["Siam Bistro", "Tax invoice / receipt", "Client dinner", "VAT 7%: THB 103.60", "Total THB 1,583.60"],
  },
  low: {
    merchant: "Bangkok Taxi Co.",
    date: "2026-05-30",
    amount: 420,
    currency: "THB",
    tax: 0,
    category: "Taxi and transport",
    confidence: 64,
    visual: ["Bangkok Taxi Co.", "Receipt image blurred", "Airport route", "VAT unreadable", "Total THB 420.00"],
  },
  warning: {
    merchant: "River Hotel",
    date: "2026-06-02",
    amount: 3200,
    currency: "THB",
    tax: 209.35,
    category: "Hotel",
    confidence: 88,
    visual: ["River Hotel", "Domestic travel", "Room + breakfast", "VAT 7%: THB 209.35", "Total THB 3,200.00"],
  },
};

const policySnippets = [
  {
    keys: ["client dinner", "dinner", "meal", "meals", "อาหาร", "เลี้ยงลูกค้า"],
    answer:
      "Client meals can be reimbursed when there is a clear business purpose, attendee information, receipt evidence, and approver review. Alcohol and personal guests are excluded in this sample policy.",
    answerTh:
      "ค่าอาหารเพื่อเลี้ยงลูกค้าสามารถเบิกได้เมื่อระบุวัตถุประสงค์ทางธุรกิจ รายชื่อผู้เข้าร่วม มีใบเสร็จ และผ่านการพิจารณาของผู้อนุมัติ ตัวอย่างนโยบายนี้ไม่ครอบคลุมเครื่องดื่มแอลกอฮอล์หรือผู้ติดตามส่วนตัว",
    citation: "Employee Expense Reimbursement Policy 2026, Section 3.2 Meals and Entertainment",
  },
  {
    keys: ["hotel", "domestic travel", "accommodation", "โรงแรม", "ที่พัก"],
    answer:
      "Domestic hotel reimbursement is allowed up to THB 3,500 per night in the sample policy. Amounts above the limit need business justification and Finance review.",
    answerTh:
      "ตัวอย่างนโยบายกำหนดวงเงินโรงแรมสำหรับการเดินทางในประเทศไม่เกิน 3,500 บาทต่อคืน หากเกินวงเงินต้องมีเหตุผลทางธุรกิจและให้ Finance ตรวจสอบ",
    citation: "Employee Expense Reimbursement Policy 2026, Section 4.1 Domestic Travel Limits",
  },
  {
    keys: ["taxi", "fare", "tax invoice", "without", "แท็กซี่", "ใบกำกับภาษี"],
    answer:
      "Taxi fare may be claimed without a tax invoice when a normal receipt or trip record is provided, the route is business related, and the amount is reasonable.",
    answerTh:
      "ค่าแท็กซี่สามารถเบิกได้โดยไม่ต้องมีใบกำกับภาษี หากมีใบเสร็จหรือหลักฐานการเดินทาง ระบุเส้นทางที่เกี่ยวข้องกับงาน และจำนวนเงินสมเหตุสมผล",
    citation: "Employee Expense Reimbursement Policy 2026, Section 4.3 Local Transport",
  },
  {
    keys: ["receipt", "missing receipt", "lost", "ใบเสร็จหาย", "ไม่มีใบเสร็จ"],
    answer:
      "A receipt is required for normal reimbursement. If it is missing, the employee must provide a missing-receipt declaration and the claim may be routed for additional Finance review.",
    answerTh:
      "โดยทั่วไปต้องมีใบเสร็จสำหรับการเบิกค่าใช้จ่าย หากใบเสร็จหาย พนักงานต้องแนบคำรับรองใบเสร็จหาย และรายการอาจถูกส่งให้ Finance ตรวจสอบเพิ่มเติม",
    citation: "Employee Expense Reimbursement Policy 2026, Section 2.1 Receipt Requirements",
  },
];

const claims = {
  "ERS-1042": {
    id: "ERS-1042",
    status: "Pending approval",
    approver: "Mali Chen",
    lastAction: "2026-06-08",
    pending: "Approver review",
    canResend: true,
  },
  "ERS-1035": {
    id: "ERS-1035",
    status: "Paid",
    approver: "Finance Batch",
    lastAction: "2026-06-04",
    pending: "None",
    canResend: false,
  },
  "ERS-1031": {
    id: "ERS-1031",
    status: "Returned for correction",
    approver: "Finance Review",
    lastAction: "2026-06-01",
    pending: "Add receipt date",
    canResend: false,
  },
  "ERS-1026": {
    id: "ERS-1026",
    status: "Approved",
    approver: "Mali Chen",
    lastAction: "2026-05-29",
    pending: "Payment run",
    canResend: false,
  },
};

const supportFlows = {
  upload: ["Confirm file is JPG, PNG, or text-based PDF.", "Check file size is under the ERS upload limit.", "Retry upload in a refreshed ERS page."],
  login: ["Re-login to ERS.", "Confirm VPN or company network access.", "Clear browser session cookies for ERS."],
  slow: ["Refresh the claim page.", "Retry with stable network or VPN.", "Capture the page URL and approximate time of timeout."],
  format: ["Confirm receipt is not handwritten for MVP.", "Convert unsupported file to JPG, PNG, or text PDF.", "Retry with a single receipt per upload."],
};

const state = {
  currentSample: "normal",
  originalAmount: samples.normal.amount,
  audit: [],
  policyAnswers: 0,
  supportSession: null,
};

const form = document.querySelector("#draftForm");
const confidenceBadge = document.querySelector("#confidenceBadge");
const amountWarning = document.querySelector("#amountWarning");
const auditList = document.querySelector("#auditList");
const auditCount = document.querySelector("#auditCount");
const draftCount = document.querySelector("#draftCount");
const policyCount = document.querySelector("#policyCount");
const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const chatText = document.querySelector("#chatText");
const assistantPanel = document.querySelector("#assistantPanel");

function formatMoney(value, currency = "THB") {
  return `${currency} ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nowLabel() {
  return new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function addAudit(title, detail) {
  state.audit.unshift({ title, detail, time: nowLabel() });
  renderAudit();
}

function renderAudit() {
  auditList.innerHTML = state.audit
    .map((event) => `<li><strong>${event.title}</strong><small>${event.detail}</small><small>${event.time}</small></li>`)
    .join("");
  auditCount.textContent = state.audit.length;
}

function setFormValues(sample) {
  form.merchant.value = sample.merchant;
  form.date.value = sample.date;
  form.amount.value = sample.amount;
  form.currency.value = sample.currency;
  form.tax.value = sample.tax;
  form.category.value = sample.category;
  state.originalAmount = sample.amount;
  renderConfidence(sample.confidence);
  renderReceipt(sample);
  checkAmountWarning();
}

function renderReceipt(sample) {
  const [store, type, line, vat, total] = sample.visual;
  document.querySelector("#receiptVisual").innerHTML = `
    <div class="receipt-paper">
      <span class="store">${store}</span>
      <span>${type}</span>
      <hr />
      <span>${line}</span>
      <span>${vat}</span>
      <strong>${total}</strong>
    </div>
  `;
}

function renderConfidence(confidence) {
  const low = confidence < OCR_THRESHOLD;
  confidenceBadge.textContent = `Confidence ${confidence}%`;
  confidenceBadge.classList.toggle("low", low);
  if (low) {
    addAudit("Low OCR confidence", "Manual review required because confidence is below 80%.");
  }
}

function checkAmountWarning() {
  const edited = Number(form.amount.value || 0);
  const diff = Math.abs(edited - state.originalAmount) / Math.max(state.originalAmount, 1);
  amountWarning.hidden = diff <= AMOUNT_WARNING_THRESHOLD;
  return diff > AMOUNT_WARNING_THRESHOLD;
}

function message(role, html) {
  const node = document.createElement("article");
  node.className = `message ${role}`;
  node.innerHTML = html;
  chatLog.appendChild(node);
  chatLog.scrollTop = chatLog.scrollHeight;
  return node;
}

function assistant(html) {
  return message("assistant", html);
}

function user(text) {
  return message("user", text.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]));
}

function isThai(text) {
  return /[\u0E00-\u0E7F]/.test(text);
}

function answerPolicy(text) {
  const normalized = text.toLowerCase();
  const found = policySnippets.find((item) => item.keys.some((key) => normalized.includes(key.toLowerCase())));
  if (!found) {
    assistant(`
      <div class="card-response">
        <strong>I cannot determine this from the approved sample policy content.</strong>
        <span>Please contact Finance or the policy owner for confirmation.</span>
        <span class="citation">Sample policy retrieval found no supporting section.</span>
        <span class="mock-note">Final approval still depends on approver and Finance review.</span>
      </div>
    `);
    addAudit("Unsupported policy question refused", text);
    return;
  }

  state.policyAnswers += 1;
  policyCount.textContent = state.policyAnswers;
  assistant(`
    <div class="card-response">
      <strong>Policy answer</strong>
      <span>${isThai(text) ? found.answerTh : found.answer}</span>
      <span class="citation">${found.citation}</span>
      <span class="mock-note">Prototype uses sample policy content. Final approval depends on approver and Finance review.</span>
    </div>
  `);
  addAudit("Policy answer generated", `${found.citation}; question: ${text}`);
}

function showClaim(id) {
  const claimId = (id.match(/ERS-\d{4}/i) || ["ERS-1042"])[0].toUpperCase();
  const claim = claims[claimId];
  if (!claim) {
    assistant(`<strong>Claim not found</strong><br />This prototype only shows seeded claims for Narin Wong: ${Object.keys(claims).join(", ")}.`);
    addAudit("Claim lookup refused", `Unavailable or unauthorized claim: ${claimId}`);
    return;
  }

  assistant(`
    <div class="card-response">
      <strong>Claim status</strong>
      <div class="claim-table">
        <div><span>Claim ID</span><b>${claim.id}</b></div>
        <div><span>Status</span><b>${claim.status}</b></div>
        <div><span>Current approver</span><b>${claim.approver}</b></div>
        <div><span>Last action</span><b>${claim.lastAction}</b></div>
        <div><span>Pending action</span><b>${claim.pending}</b></div>
      </div>
      <span class="mock-note">Mock data only. No production ERS lookup occurred.</span>
      ${claim.canResend ? '<button class="copy-button" type="button" data-resend="' + claim.id + '">Confirm mock resend</button>' : ""}
    </div>
  `);
  addAudit("Claim status viewed", `${claim.id} shown from seeded prototype data.`);
}

function startSupportFlow(category = "upload") {
  state.supportSession = {
    category,
    steps: supportFlows[category],
    description: "",
  };
  renderSupportFlow();
  addAudit("Troubleshooting started", `Category: ${category}`);
}

function renderSupportFlow() {
  const session = state.supportSession;
  const labels = {
    upload: "Receipt upload failure",
    login: "Login or session issue",
    slow: "Slow page or timeout",
    format: "File format or file size",
  };

  assistant(`
    <div class="card-response">
      <strong>Guided troubleshooting</strong>
      <label>Issue category
        <select data-support-category>
          ${Object.keys(supportFlows).map((key) => `<option value="${key}" ${key === session.category ? "selected" : ""}>${labels[key]}</option>`).join("")}
        </select>
      </label>
      <div class="checklist">
        ${session.steps.map((step, index) => `<label><input type="checkbox" data-step="${index}" />${step}</label>`).join("")}
      </div>
      <label>What happened?
        <textarea data-support-description rows="3" placeholder="Add the error text or behavior you saw."></textarea>
      </label>
      <button class="copy-button" type="button" data-escalate>Generate copyable escalation summary</button>
      <span class="mock-note">Prototype only. No IT ticket will be created.</span>
    </div>
  `);
}

function createEscalationSummary(button) {
  const card = button.closest(".card-response");
  const category = card.querySelector("[data-support-category]").value;
  const attempted = [...card.querySelectorAll("[data-step]:checked")].map((box) => state.supportSession.steps[Number(box.dataset.step)]);
  const description = card.querySelector("[data-support-description]").value || "No additional user description provided.";
  if (attempted.length < state.supportSession.steps.length) {
    assistant("<strong>Please acknowledge each troubleshooting step before escalation.</strong><br />This mirrors the MVP guardrail for reducing low-value tickets.");
    return;
  }

  const summary = [
    "ERSSmartBuddy escalation summary",
    `Category: ${category}`,
    `User: Narin Wong, Product Operations`,
    `Description: ${description}`,
    `Attempted steps: ${attempted.join(" | ")}`,
    `Timestamp: ${new Date().toISOString()}`,
    "Environment: Mock ERS workspace, desktop browser, prototype session",
    "Ticket status: Not created in prototype",
  ].join("\n");

  navigator.clipboard?.writeText(summary).catch(() => {});
  assistant(`
    <div class="card-response">
      <strong>Escalation summary copied</strong>
      <textarea rows="8" readonly>${summary}</textarea>
      <span class="mock-note">No real IT ticket was created.</span>
    </div>
  `);
  addAudit("Escalation summary generated", `Category: ${category}; no ticket created.`);
}

function handleIntent(intent) {
  if (intent === "receipt") {
    assistant("Use the receipt panel to upload or choose a sample receipt. I will extract a draft, show confidence, and require manual confirmation before anything is treated as ready for review.");
  }
  if (intent === "policy") {
    assistant('Try asking: "Can I reimburse client dinner?", "What is the hotel limit for domestic travel?", or "เบิกแท็กซี่ไม่มีใบกำกับภาษีได้ไหม"');
  }
  if (intent === "claim") {
    showClaim("ERS-1042");
  }
  if (intent === "support") {
    startSupportFlow("upload");
  }
}

function routeChat(text) {
  const normalized = text.toLowerCase();
  if (/(claim|status|ers-\d{4}|สถานะ)/i.test(text)) {
    showClaim(text);
    return;
  }
  if (/(issue|problem|error|upload|login|slow|timeout|support|ปัญหา|อัปโหลด|ล็อกอิน)/i.test(text)) {
    const category = normalized.includes("login") || text.includes("ล็อกอิน") ? "login" : normalized.includes("slow") || normalized.includes("timeout") ? "slow" : normalized.includes("format") || normalized.includes("size") ? "format" : "upload";
    startSupportFlow(category);
    return;
  }
  answerPolicy(text);
}

document.querySelectorAll(".sample-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".sample-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.currentSample = button.dataset.sample;
    setFormValues(samples[state.currentSample]);
    addAudit("Sample receipt selected", `${samples[state.currentSample].merchant}; confidence ${samples[state.currentSample].confidence}%.`);
  });
});

document.querySelector("#extractButton").addEventListener("click", () => {
  const sample = samples[state.currentSample];
  setFormValues(sample);
  addAudit("Receipt extraction run", `${sample.merchant}; extracted ${formatMoney(sample.amount, sample.currency)}.`);
  assistant(`Draft extracted for ${sample.merchant}. Confidence is ${sample.confidence}%. Please review the editable fields before confirming.`);
});

document.querySelector("#receiptUpload").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setFormValues(samples.normal);
  addAudit("Receipt uploaded", `${file.name}; prototype used deterministic sample extraction fallback.`);
  assistant(`I received ${file.name}. This prototype used sample OCR fallback and created an editable draft. No receipt binary was stored in this static demo.`);
});

form.amount.addEventListener("input", checkAmountWarning);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const flagged = checkAmountWarning();
  draftCount.textContent = Number(draftCount.textContent) + 1;
  addAudit("Draft confirmed", `${form.merchant.value}; ${formatMoney(form.amount.value, form.currency.value)}; ${flagged ? "Finance review flag added." : "No amount anomaly."}`);
  assistant(`
    <div class="card-response">
      <strong>Draft confirmed inside ERSSmartBuddy</strong>
      <span>${form.merchant.value}, ${formatMoney(form.amount.value, form.currency.value)}, ${form.category.value}</span>
      <span class="mock-note">Prototype only. This did not submit a claim into production ERS.</span>
    </div>
  `);
});

document.querySelector("#buddyLauncher").addEventListener("click", () => {
  assistantPanel.classList.add("open");
  document.querySelector("#buddyLauncher").setAttribute("aria-expanded", "true");
});

document.querySelector("#closeAssistant").addEventListener("click", () => {
  assistantPanel.classList.remove("open");
  document.querySelector("#buddyLauncher").setAttribute("aria-expanded", "false");
});

document.querySelectorAll("[data-intent]").forEach((button) => {
  button.addEventListener("click", () => handleIntent(button.dataset.intent));
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatText.value.trim();
  if (!text) return;
  user(text);
  chatText.value = "";
  routeChat(text);
});

chatLog.addEventListener("click", (event) => {
  const resendButton = event.target.closest("[data-resend]");
  const escalateButton = event.target.closest("[data-escalate]");
  if (resendButton) {
    addAudit("Mock notification resend confirmed", `${resendButton.dataset.resend} approver reminder; no real notification sent.`);
    assistant(`<strong>Mock resend completed</strong><br />A prototype reminder was logged for ${resendButton.dataset.resend}. No real approver notification was sent.`);
  }
  if (escalateButton) {
    createEscalationSummary(escalateButton);
  }
});

chatLog.addEventListener("change", (event) => {
  const select = event.target.closest("[data-support-category]");
  if (!select) return;
  state.supportSession.category = select.value;
  state.supportSession.steps = supportFlows[select.value];
});

setFormValues(samples.normal);
addAudit("Prototype session started", "Seeded employee context loaded with mock claims, sample policy snippets, and local audit preview.");
assistant(`
  <div class="card-response">
    <strong>Hello, I am ERSSmartBuddy.</strong>
    <span>I can help draft receipt claims, answer cited sample policy questions, check seeded claim status, and guide ERS troubleshooting.</span>
    <span class="mock-note">Prototype only: no real claim submission, notification, or IT ticket creation.</span>
  </div>
`);
