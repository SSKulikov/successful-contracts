// scripts/llm-ab-report.js
// Usage: node scripts/llm-ab-report.js ./ab-results.csv

const fs = require("fs");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/llm-ab-report.js <path-to-csv>");
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, "utf8").trim();
if (!raw) {
  console.error("CSV file is empty");
  process.exit(1);
}

const lines = raw.split(/\r?\n/);
const headers = lines[0].split(",").map((h) => h.trim());

const idx = (name) => {
  const i = headers.indexOf(name);
  if (i === -1) {
    throw new Error(`Missing required column: ${name}`);
  }
  return i;
};

const iProvider = idx("provider");
const iJsonValid = idx("json_valid");
const iFillRate = idx("required_fill_rate");
const iAccuracy = idx("accuracy_score");
const iLatency = idx("latency_sec");
const iError = idx("error");

const groups = new Map();

for (let r = 1; r < lines.length; r++) {
  if (!lines[r].trim()) continue;
  const row = lines[r].split(","); // если появятся запятые в notes/error — лучше перейти на csv-parse
  const provider = (row[iProvider] || "").trim().toLowerCase();
  if (!provider) continue;

  if (!groups.has(provider)) {
    groups.set(provider, {
      n: 0,
      jsonValidSum: 0,
      fillRateSum: 0,
      accuracySum: 0,
      latencies: [],
      errors: 0,
    });
  }

  const g = groups.get(provider);
  const jsonValid = Number(row[iJsonValid] || 0);
  const fillRate = Number(row[iFillRate] || 0);
  const accuracy = Number(row[iAccuracy] || 0);
  const latency = Number(row[iLatency] || 0);
  const error = (row[iError] || "").trim();

  g.n += 1;
  g.jsonValidSum += Number.isFinite(jsonValid) ? jsonValid : 0;
  g.fillRateSum += Number.isFinite(fillRate) ? fillRate : 0;
  g.accuracySum += Number.isFinite(accuracy) ? accuracy : 0;
  if (Number.isFinite(latency) && latency > 0) g.latencies.push(latency);
  if (error) g.errors += 1;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function round(n, d = 4) {
  return Number.isFinite(n) ? Number(n.toFixed(d)) : 0;
}

console.log("=== LLM A/B Report ===");
for (const [provider, g] of groups.entries()) {
  g.latencies.sort((a, b) => a - b);

  const successRate = g.n ? g.jsonValidSum / g.n : 0;
  const avgFillRate = g.n ? g.fillRateSum / g.n : 0;
  const avgAccuracy = g.n ? g.accuracySum / g.n : 0;
  const p50 = percentile(g.latencies, 50);
  const p95 = percentile(g.latencies, 95);

  console.log(`\nProvider: ${provider}`);
  console.log(`Rows: ${g.n}`);
  console.log(`JSON valid rate: ${round(successRate * 100, 2)}%`);
  console.log(`Avg required_fill_rate: ${round(avgFillRate, 4)}`);
  console.log(`Avg accuracy_score: ${round(avgAccuracy, 4)}`);
  console.log(`Latency p50: ${round(p50, 3)} sec`);
  console.log(`Latency p95: ${round(p95, 3)} sec`);
  console.log(`Errors: ${g.errors}`);
}