#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3003";
const DOCS_DIR =
  process.env.DOCS_DIR ||
  path.resolve(__dirname, "../test-docs");
const PROVIDER = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
const OUTPUT_CSV =
  process.env.OUTPUT_CSV ||
  path.resolve(__dirname, "ab-results.csv");

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

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getRequiredFilledCount(parsedJson) {
  const keys = [
    parsedJson?.supplier?.inn,
    parsedJson?.customer?.inn,
    parsedJson?.contract_number,
    parsedJson?.contract_date,
    parsedJson?.contract_sum
  ];
  return keys.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;
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

  let body;
  const raw = await response.text();
  try {
    body = JSON.parse(raw);
  } catch {
    body = { raw };
  }

  return { ok: response.ok, status: response.status, body, latencySec };
}

async function main() {
  const entries = fs
    .readdirSync(DOCS_DIR)
    .filter((name) => supportedExtensions.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "ru"));

  if (entries.length === 0) {
    console.error(`No supported documents in: ${DOCS_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_CSV)) {
    fs.writeFileSync(
      OUTPUT_CSV,
      "doc_id,doc_name,provider,json_valid,required_filled_count,required_total,required_fill_rate,accuracy_score,latency_sec,error,notes\n",
      "utf8"
    );
  }

  const requiredTotal = 5;
  const rows = [];

  for (let i = 0; i < entries.length; i += 1) {
    const docName = entries[i];
    const docPath = path.join(DOCS_DIR, docName);
    console.log(`[${PROVIDER}] (${i + 1}/${entries.length}) ${docName}`);

    try {
      const { ok, status, body, latencySec } = await postParseFile(docPath);
      const parsedJson = body?.parsedJson;
      const jsonValid = ok && parsedJson && typeof parsedJson === "object" ? 1 : 0;
      const requiredFilledCount = jsonValid ? getRequiredFilledCount(parsedJson) : 0;
      const requiredFillRate =
        requiredTotal > 0 ? requiredFilledCount / requiredTotal : 0;
      const accuracyScore = requiredFillRate;
      const error = ok ? "" : body?.error || `HTTP ${status}`;
      const notes = ok ? "" : "parse-file failed";

      rows.push([
        i + 1,
        docName,
        PROVIDER,
        jsonValid,
        requiredFilledCount,
        requiredTotal,
        requiredFillRate.toFixed(2),
        accuracyScore.toFixed(2),
        latencySec.toFixed(3),
        error,
        notes
      ]);
    } catch (err) {
      rows.push([
        i + 1,
        docName,
        PROVIDER,
        0,
        0,
        requiredTotal,
        "0.00",
        "0.00",
        "0.000",
        err instanceof Error ? err.message : String(err),
        "request exception"
      ]);
    }
  }

  const lines = rows
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  fs.appendFileSync(OUTPUT_CSV, `${lines}\n`, "utf8");
  console.log(`Done. Appended ${rows.length} rows to ${OUTPUT_CSV}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
