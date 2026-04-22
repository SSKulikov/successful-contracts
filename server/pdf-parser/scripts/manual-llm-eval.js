#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3003";
const DOCS_DIR =
  process.env.DOCS_DIR ||
  path.resolve(__dirname, "../test-docs");
const PROVIDER = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE || 6);
const OUTPUT_JSON =
  process.env.OUTPUT_JSON ||
  path.resolve(__dirname, "manual-eval-summary.json");

if (!["gigachat", "yagpt"].includes(PROVIDER)) {
  console.error("Set LLM_PROVIDER to gigachat or yagpt");
  process.exit(1);
}

const supportedExtensions = new Set([".pdf", ".doc", ".docx"]);
const mimeByExtension = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,;:()'"`«»\-_/\\]/g, "");
}

function digitsOnly(s) {
  return String(s ?? "").replace(/\D+/g, "");
}

function hasEvidence(rawText, value, fieldName) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const text = String(rawText ?? "");
  if (!text.trim()) return false;

  if (
    fieldName === "supplier.inn" ||
    fieldName === "customer.inn" ||
    fieldName === "contract_sum"
  ) {
    const probe = digitsOnly(value);
    if (!probe) return false;
    return digitsOnly(text).includes(probe);
  }

  return normalize(text).includes(normalize(value));
}

async function postParseFile(filePath) {
  const form = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = mimeByExtension[ext] || "application/octet-stream";
  form.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);

  const started = Date.now();
  const response = await fetch(`${API_BASE_URL}/api/parse-file`, {
    method: "POST",
    body: form
  });
  const latencySec = (Date.now() - started) / 1000;
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { raw };
  }

  return { ok: response.ok, status: response.status, latencySec, body };
}

function getTextFilePathFromResponse(respBody) {
  const uploadedName = respBody?.filename;
  if (!uploadedName) return null;
  const baseName = path.parse(uploadedName).name;
  return path.resolve(__dirname, `../storage/text/${baseName}.txt`);
}

async function main() {
  const allDocs = fs
    .readdirSync(DOCS_DIR)
    .filter((name) => supportedExtensions.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "ru"));

  const docs = allDocs.slice(0, Math.max(1, SAMPLE_SIZE));
  const rows = [];

  for (const [idx, docName] of docs.entries()) {
    const docPath = path.join(DOCS_DIR, docName);
    console.log(`[${PROVIDER}] (${idx + 1}/${docs.length}) ${docName}`);

    try {
      const result = await postParseFile(docPath);
      const parsedJson = result.body?.parsedJson;
      if (!result.ok || !parsedJson) {
        rows.push({
          provider: PROVIDER,
          docName,
          ok: false,
          error: result.body?.error || `HTTP ${result.status}`,
          latencySec: result.latencySec
        });
        continue;
      }

      const textFilePath = getTextFilePathFromResponse(result.body);
      const ocrText = textFilePath && fs.existsSync(textFilePath)
        ? fs.readFileSync(textFilePath, "utf8")
        : "";

      const fields = {
        "supplier.inn": parsedJson?.supplier?.inn ?? null,
        "customer.inn": parsedJson?.customer?.inn ?? null,
        contract_number: parsedJson?.contract_number ?? null,
        contract_date: parsedJson?.contract_date ?? null,
        contract_sum: parsedJson?.contract_sum ?? null
      };

      const evidence = {};
      for (const [fieldName, value] of Object.entries(fields)) {
        evidence[fieldName] = hasEvidence(ocrText, value, fieldName);
      }

      const checkedCount = Object.values(evidence).filter((v) => v !== null).length;
      const evidenceTrue = Object.values(evidence).filter((v) => v === true).length;
      const evidenceRate = checkedCount > 0 ? evidenceTrue / checkedCount : 0;

      rows.push({
        provider: PROVIDER,
        docName,
        ok: true,
        latencySec: result.latencySec,
        parsed: fields,
        evidence,
        checkedCount,
        evidenceTrue,
        evidenceRate
      });
    } catch (err) {
      rows.push({
        provider: PROVIDER,
        docName,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        latencySec: 0
      });
    }
  }

  const existing = fs.existsSync(OUTPUT_JSON)
    ? JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf8"))
    : {};
  existing[PROVIDER] = rows;
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(existing, null, 2), "utf8");

  const okRows = rows.filter((r) => r.ok);
  const evidenceRates = okRows.map((r) => r.evidenceRate);
  const avgEvidenceRate = evidenceRates.length
    ? evidenceRates.reduce((a, b) => a + b, 0) / evidenceRates.length
    : 0;
  const avgLatency = rows.length
    ? rows.reduce((a, b) => a + Number(b.latencySec || 0), 0) / rows.length
    : 0;
  const failures = rows.length - okRows.length;

  console.log(
    JSON.stringify(
      {
        provider: PROVIDER,
        sampleSize: rows.length,
        failures,
        avgLatencySec: Number(avgLatency.toFixed(3)),
        avgEvidenceRate: Number(avgEvidenceRate.toFixed(3)),
        outputJson: OUTPUT_JSON
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
