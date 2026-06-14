const OCR_THRESHOLD = 80;
const AMOUNT_WARNING_THRESHOLD = 0.1;

const receiptPresets = {
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


const state = {
  currentPreset: "normal",
  originalAmount: receiptPresets.normal.amount,
  audit: [],
};

const form = document.querySelector("#draftForm");
const confidenceBadge = document.querySelector("#confidenceBadge");
const amountWarning = document.querySelector("#amountWarning");
const auditList = document.querySelector("#auditList");
const auditCount = document.querySelector("#auditCount");
const draftCount = document.querySelector("#draftCount");
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

function setFormValues(receipt) {
  form.merchant.value = receipt.merchant;
  form.date.value = receipt.date;
  form.amount.value = receipt.amount;
  form.currency.value = receipt.currency;
  form.tax.value = receipt.tax;
  form.category.value = receipt.category;
  state.originalAmount = receipt.amount;
  renderConfidence(receipt.confidence);
  renderReceipt(receipt);
  checkAmountWarning();
}

function renderReceipt(receipt) {
  const [store, type, line, vat, total] = receipt.visual;
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

function handleIntent(intent) {
  if (intent === "receipt") {
    assistant("Use the receipt panel to upload or choose a saved receipt. I will extract a draft, show confidence, and require manual confirmation before anything is treated as ready for review.");
  }
}

function respondToReceiptChat(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("extract") || normalized.includes("upload") || normalized.includes("receipt") || text.includes("ใบเสร็จ")) {
    assistant("Use the receipt panel to upload or choose a saved receipt. I can create an editable draft and show confidence or amount warnings.");
    return;
  }
  assistant("ERSSmartBuddy is focused on receipt draft assistance. Use the receipt panel to upload, extract, edit, and confirm a draft expense item.");
}

document.querySelectorAll(".receipt-choice-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".receipt-choice-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.currentPreset = button.dataset.preset;
    setFormValues(receiptPresets[state.currentPreset]);
    addAudit("Receipt option selected", `${receiptPresets[state.currentPreset].merchant}; confidence ${receiptPresets[state.currentPreset].confidence}%.`);
  });
});

document.querySelector("#extractButton").addEventListener("click", () => {
  const receipt = receiptPresets[state.currentPreset];
  setFormValues(receipt);
  addAudit("Receipt extraction run", `${receipt.merchant}; extracted ${formatMoney(receipt.amount, receipt.currency)}.`);
  assistant(`Draft extracted for ${receipt.merchant}. Confidence is ${receipt.confidence}%. Please review the editable fields before confirming.`);
});

document.querySelector("#receiptUpload").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setFormValues(receiptPresets.normal);
  addAudit("Receipt uploaded", `${file.name}; OCR extraction completed.`);
  assistant(`I received ${file.name}. OCR extraction completed and created an editable draft for review.`);
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
      <span class="action-note">Expense draft saved for review.</span>
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
  respondToReceiptChat(text);
});

setFormValues(receiptPresets.normal);
addAudit("Session started", "Employee context loaded with receipt options and audit trail.");
assistant(`
  <div class="card-response">
    <strong>Hello, I am ERSSmartBuddy.</strong>
    <span>I can help draft receipt expenses from uploaded or saved receipts.</span>
    <span class="action-note">Expense draft actions require employee confirmation.</span>
  </div>
`);
