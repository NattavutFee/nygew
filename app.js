const OCR_THRESHOLD = 80;
const AMOUNT_WARNING_THRESHOLD = 0.1;

const state = {
  originalAmount: 0,
  audit: [],
  lastExtraction: null,
};

const form = document.querySelector("#draftForm");
const receiptUpload = document.querySelector("#receiptUpload");
const receiptVisual = document.querySelector("#receiptVisual");
const confidenceBadge = document.querySelector("#confidenceBadge");
const amountWarning = document.querySelector("#amountWarning");
const auditList = document.querySelector("#auditList");
const auditCount = document.querySelector("#auditCount");
const draftCount = document.querySelector("#draftCount");
const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const chatText = document.querySelector("#chatText");
const assistantPanel = document.querySelector("#assistantPanel");
const extractionJson = document.querySelector("#extractionJson");
const extractButton = document.querySelector("#extractButton");

function formatMoney(value, currency = "THB") {
  return `${currency} ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nowLabel() {
  return new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(text) {
  return String(text).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]);
}

function addAudit(title, detail) {
  state.audit.unshift({ title, detail, time: nowLabel() });
  renderAudit();
}

function renderAudit() {
  auditList.innerHTML = state.audit
    .map((event) => `<li><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)}</small><small>${event.time}</small></li>`)
    .join("");
  auditCount.textContent = state.audit.length;
}

function renderConfidence(confidence) {
  const score = Number(confidence || 0);
  const low = score < OCR_THRESHOLD;
  confidenceBadge.textContent = `Confidence ${score}%`;
  confidenceBadge.classList.toggle("low", low);
  if (low) {
    addAudit("Low OCR confidence", "Manual review required because confidence is below 80%.");
  }
}

function checkAmountWarning() {
  const edited = Number(form.amount.value || 0);
  if (!state.originalAmount) {
    amountWarning.hidden = true;
    return false;
  }
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
  return message("user", escapeHtml(text));
}

function setBusy(isBusy) {
  receiptUpload.disabled = isBusy;
  extractButton.disabled = isBusy;
  extractButton.textContent = isBusy ? "Extracting..." : "Run extraction";
  document.body.classList.toggle("is-busy", isBusy);
}

function resetDraft() {
  form.merchant.value = "";
  form.date.value = "";
  form.amount.value = "";
  form.currency.value = "THB";
  form.tax.value = "";
  form.category.value = "";
  state.originalAmount = 0;
  state.lastExtraction = null;
  confidenceBadge.textContent = "Confidence -";
  confidenceBadge.classList.remove("low");
  amountWarning.hidden = true;
  extractionJson.textContent = "Upload a receipt image to extract JSON data.";
}

function setCategoryValue(category) {
  const normalized = String(category || "").trim();
  if (!normalized) {
    form.category.value = "";
    return;
  }

  const existing = [...form.category.options].find((option) => option.value.toLowerCase() === normalized.toLowerCase());
  if (existing) {
    form.category.value = existing.value;
    return;
  }

  const option = new Option(normalized, normalized);
  form.category.add(option);
  form.category.value = normalized;
}

function applyExtraction(data) {
  state.lastExtraction = data;
  form.merchant.value = data.merchantName || "";
  setCategoryValue(data.recieptCategory || "");
  form.amount.value = Number(data.totalAmt || 0);
  form.tax.value = Number(data.vatAmt || 0);
  state.originalAmount = Number(data.totalAmt || 0);
  renderConfidence(data.score || 0);
  checkAmountWarning();
  extractionJson.textContent = JSON.stringify(data, null, 2);
}

function previewReceipt(file) {
  const previewUrl = URL.createObjectURL(file);
  receiptVisual.innerHTML = `<img class="receipt-image" src="${previewUrl}" alt="Uploaded receipt preview" />`;
}

async function extractReceipt(file) {
  const formData = new FormData();
  formData.append("receipt", file);

  const response = await fetch("/api/receipt/extract", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Receipt extraction failed.");
  }
  return payload;
}

async function chatWithBot(text) {
  console.log(text);
  const response = await fetch("/api/chat", {
    method: "POST",
    body: {"text": text},
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Chat with bot failed.");
  }
  return payload;
}

async function handleReceiptFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    assistant("Please upload a receipt image file such as JPG or PNG.");
    addAudit("Receipt upload rejected", `${file.name}; unsupported file type ${file.type || "unknown"}.`);
    return;
  }

  previewReceipt(file);
  resetDraft();
  setBusy(true);
  extractionJson.textContent = "Extracting receipt data...";
  addAudit("Receipt uploaded", `${file.name}; extraction started.`);

  try {
    const data = await extractReceipt(file);
    applyExtraction(data);
    addAudit("Receipt extraction completed", `${data.merchantName || "Unknown merchant"}; extracted ${formatMoney(data.totalAmt)}.`);
    assistant(`Receipt extracted for ${escapeHtml(data.merchantName || "the uploaded file")}. Confidence is ${Number(data.score || 0)}%. Please review the editable fields before confirming.`);
  } catch (error) {
    extractionJson.textContent = JSON.stringify({ error: error.message }, null, 2);
    addAudit("Receipt extraction failed", error.message);
    assistant(`<strong>Receipt extraction failed</strong><br />${escapeHtml(error.message)}`);
  } finally {
    setBusy(false);
  }
}

function handleIntent(intent) {
  if (intent === "receipt") {
    assistant("Use Choose File to upload a receipt image. I will extract JSON with merchant, category, total amount, VAT, and confidence score, then fill the draft form for review.");
  }
}


async function respondToReceiptChat(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("extract") || normalized.includes("upload") || normalized.includes("receipt") || text.includes("ใบเสร็จ")) {
    assistant("Upload a receipt image with Choose File. The extraction API will return JSON and populate the editable draft fields.");
    return;
  }

  try {
    const data = await chatWithBot(text);
    assistant( data.content );
  } catch (error) {
    extractionJson.textContent = JSON.stringify({ error: error.message }, null, 2);
    assistant(`<strong>Chat with bot failed</strong><br />${escapeHtml(error.message)}`);
  } finally {
    setBusy(false);
  }
}


receiptUpload.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  handleReceiptFile(file);
});

extractButton.addEventListener("click", () => {
  const file = receiptUpload.files?.[0];
  if (!file) {
    assistant("Choose a receipt image first, then run extraction.");
    return;
  }
  handleReceiptFile(file);
});

form.amount.addEventListener("input", checkAmountWarning);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const flagged = checkAmountWarning();
  draftCount.textContent = Number(draftCount.textContent) + 1;
  addAudit("Draft confirmed", `${form.merchant.value || "Unknown merchant"}; ${formatMoney(form.amount.value, form.currency.value)}; ${flagged ? "Finance review flag added." : "No amount anomaly."}`);
  assistant(`
    <div class="card-response">
      <strong>Draft confirmed inside ERSSmartBuddy</strong>
      <span>${escapeHtml(form.merchant.value || "Unknown merchant")}, ${formatMoney(form.amount.value, form.currency.value)}, ${escapeHtml(form.category.value || "Uncategorized")}</span>
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

resetDraft();
addAudit("Session started", "Employee context loaded with receipt extraction API and audit trail.");
assistant(`
  <div class="card-response">
    <strong>Hello, I am ERSSmartBuddy.</strong>
    <span>Upload a receipt image and I will extract draft expense data for review.</span>
    <span class="action-note">Expense draft actions require employee confirmation.</span>
  </div>
`);
