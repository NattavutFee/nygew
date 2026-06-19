const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SGPT_HOST = process.env.SGPT_HOST;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ROOT = __dirname;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        reject(Object.assign(new Error("Receipt file is larger than 8 MB."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipartFile(buffer, contentType) {
  const boundaryMatch = /boundary=(?:(?:"([^"]+)")|([^;]+))/i.exec(contentType || "");
  if (!boundaryMatch) {
    throw Object.assign(new Error("Missing multipart boundary."), { statusCode: 400 });
  }

  const boundary = Buffer.from("--" + (boundaryMatch[1] || boundaryMatch[2]));
  let cursor = buffer.indexOf(boundary);
  while (cursor !== -1) {
    const next = buffer.indexOf(boundary, cursor + boundary.length);
    if (next === -1) break;

    let part = buffer.subarray(cursor + boundary.length, next);
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === "\r\n") part = part.subarray(0, part.length - 2);

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const body = part.subarray(headerEnd + 4);
      const disposition = /content-disposition:\s*form-data;[^\r\n]*/i.exec(headers)?.[0] || "";
      const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
      const name = /name="([^"]+)"/i.exec(disposition)?.[1];
      const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "application/octet-stream";
      if (name === "receipt" && filename && body.length > 0) {
        return { filename, mimeType, data: body };
      }
    }

    cursor = next;
  }

  throw Object.assign(new Error("No receipt file was uploaded."), { statusCode: 400 });
}

function normalizeExtraction(raw) {
  const totalAmt = Number(raw.totalAmt || 0);
  const vatAmt = Number(raw.vatAmt || 0);
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score || 0))));
  return {
    merchantName: String(raw.merchantName || "").trim(),
    recieptCategory: String(raw.recieptCategory || "").trim(),
    totalAmt,
    vatAmt,
    score,
  };
}

async function extractReceiptWithSgpt(file) {

  const reqBody = {
        "model": "claude-sonnet-4-6",
        "temperature": 0.7,
        "max_tokens": 5000,
        // "output_config": {
        //     "format": "json_schema",
        //     "json_schema": {
        //       "type": "object",
        //       "additionalProperties": false,
        //       "properties": {
        //         "merchantName": { "type": "string", "description": "ชื่อร้านค้าบนใบเสร็จรับเงิน" },
        //         "recieptCategory": { "type": "string", "description": "ประเภทค่าใช้จ่าย เช่น ค่าอาหาร ค่าเดินทาง หรือค่าที่พัก" },
        //         "totalAmt": { "type": "number", "description": "ยอดเงินรวม VAT" },
        //         "vatAmt": { "type": "number", "description": "ยอด VAT" },
        //         "score": { "type": "number", "description": "ความมั่นใจ 0-100" },
        //       },
        //       "required": ["merchantName", "recieptCategory", "totalAmt", "vatAmt", "score"],
        //     }
        // },
        "system": "You extract receipt information. Return only JSON matching the schema. Use Thai category labels when appropriate. If a value is not visible, use an empty string for text or 0 for numbers, and reduce score.",
        "messages": [{
          "role": "user",
          "content": [
              {
                "type": "image",
                "source": {
                  "type": "base64",
                  "media_type": file.mimeType,
                  "data": file.data.toString("base64")
                },
              },
              {
                  "type": "text",
                  "text": "อ่านรูปใบเสร็จรับเงินนี้ และส่ง JSON fields: merchantName, recieptCategory, totalAmt, vatAmt, score. score อยู่ในช่วง 0-100."
              }
          ]
        }]
  };

  const response = await fetch(SGPT_HOST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.log("SGPT response error: ", body);
    const message = body?.error?.message || "SGPT receipt extraction failed.";
    throw Object.assign(new Error(message), { statusCode: response.status });
  }

  const content = body?.content?.[0]?.text;
  if (!content) {
    throw Object.assign(new Error("SGPT response did not include extraction JSON."), { statusCode: 502 });
  }
  const jsonResult = content.substring(content.indexOf("{"), content.lastIndexOf("}") + 1);

  return normalizeExtraction(JSON.parse(jsonResult));
}

async function extractReceiptWithGemini(file) {
  if (!file.mimeType.startsWith("image/")) {
    throw Object.assign(new Error("Please upload a receipt image file such as JPG or PNG."), { statusCode: 415 });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You extract receipt information. Return only JSON matching the schema. Use Thai category labels when appropriate. If a value is not visible, use an empty string for text or 0 for numbers, and reduce score." }],
        },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: file.mimeType, data: file.data.toString("base64") } },
            { text: "อ่านรูปใบเสร็จรับเงินนี้ และส่ง JSON fields: merchantName, recieptCategory, totalAmt, vatAmt, score. score อยู่ในช่วง 0-100." },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              merchantName: { type: "string", description: "ชื่อร้านค้าบนใบเสร็จรับเงิน" },
              recieptCategory: { type: "string", description: "ประเภทค่าใช้จ่าย เช่น ค่าอาหาร ค่าเดินทาง หรือค่าที่พัก" },
              totalAmt: { type: "number", description: "ยอดเงินรวม VAT" },
              vatAmt: { type: "number", description: "ยอด VAT" },
              score: { type: "number", description: "ความมั่นใจ 0-100" },
            },
            required: ["merchantName", "recieptCategory", "totalAmt", "vatAmt", "score"],
          },
        },
      }),
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || "Gemini receipt extraction failed.";
    throw Object.assign(new Error(message), { statusCode: response.status });
  }

  const content = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw Object.assign(new Error("Gemini response did not include extraction JSON."), { statusCode: 502 });
  }

  return normalizeExtraction(JSON.parse(content));
}

async function extractReceiptWithOpenAI(file) {
  if (!file.mimeType.startsWith("image/")) {
    throw Object.assign(new Error("Please upload a receipt image file such as JPG or PNG."), { statusCode: 415 });
  }

  const imageUrl = "data:" + file.mimeType + ";base64," + file.data.toString("base64");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "receipt_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              merchantName: { type: "string", description: "ชื่อร้านค้าบนใบเสร็จรับเงิน" },
              recieptCategory: { type: "string", description: "ประเภทค่าใช้จ่าย เช่น ค่าอาหาร ค่าเดินทาง หรือค่าที่พัก" },
              totalAmt: { type: "number", description: "ยอดเงินรวม VAT" },
              vatAmt: { type: "number", description: "ยอด VAT" },
              score: { type: "number", description: "ความมั่นใจ 0-100" },
            },
            required: ["merchantName", "recieptCategory", "totalAmt", "vatAmt", "score"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You extract receipt information. Return only JSON matching the schema. Use Thai category labels when appropriate. If a value is not visible, use an empty string for text or 0 for numbers, and reduce score.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "อ่านรูปใบเสร็จรับเงินนี้ และส่ง JSON fields: merchantName, recieptCategory, totalAmt, vatAmt, score. score อยู่ในช่วง 0-100.",
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || "OpenAI receipt extraction failed.";
    throw Object.assign(new Error(message), { statusCode: response.status });
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw Object.assign(new Error("OpenAI response did not include extraction JSON."), { statusCode: 502 });
  }

  return normalizeExtraction(JSON.parse(content));
}


async function extractReceipt(file) {
  if (!file.mimeType.startsWith("image/")) {
    throw Object.assign(new Error("Please upload a receipt image file such as JPG or PNG."), { statusCode: 415 });
  }

  if(SGPT_HOST) {
    return await extractReceiptWithSgpt(file);
  }
  if(GEMINI_API_KEY) {
    return await extractReceiptWithGemini(file);
  }
  if(OPENAI_API_KEY){
    return await extractReceiptWithOpenAI(file);
  }
  
   if (!OPENAI_API_KEY && !SGPT_HOST) {
    // throw Object.assign(new Error("OPENAI_API_KEY is not configured on the server."), { statusCode: 500 });
    return normalizeExtraction({
      merchantName: "ร้านอาหารอร่อย",
      recieptCategory: "ค่าอาหาร",
      totalAmt: 500.0,
      vatAmt: 35.0,
      score: 85,
    });
  }

}

async function chatWithBot(text) {
  const reqBody = {
        "model": "claude-sonnet-4-6",
        "temperature": 0.7,
        "max_tokens": 5000,
        "system": "Answer only extract E-Reciept process only",
        "messages": [{
          "content": "- "+text,
          "role": "user"
        }]
  };

  console.log("JSON.stringify(reqBody) - "+JSON.stringify(reqBody))

  const response = await fetch(SGPT_HOST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.log("SGPT response error: ", body);
    const message = body?.error?.message || "SGPT chat failed.";
    throw Object.assign(new Error(message), { statusCode: response.status });
  }

  const content = body?.content?.[0]?.text;
  if (!content) {
    throw Object.assign(new Error("SGPT response did not include extraction JSON."), { statusCode: 502 });
  }
  return {"content": content};
}

async function handleReceiptExtract(req, res) {
  try {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw Object.assign(new Error("Request must be multipart/form-data."), { statusCode: 400 });
    }
    const body = await getRequestBody(req);
    const file = parseMultipartFile(body, contentType);
    const extraction = await extractReceipt(file);
    sendJson(res, 200, extraction);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Receipt extraction failed." });
  }
}

async function handleChat(req, res) {
  try {
    const contentType = req.headers["content-type"] || "";
    const body = await getRequestBody(req);
    const extraction = await chatWithBot(body.text);
    sendJson(res, 200, extraction);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Receipt extraction failed." });
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/receipt/extract") {
    handleReceiptExtract(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405, { Allow: "GET, HEAD, POST" });
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log("ERSSmartBuddy running at http://localhost:" + PORT);
});
