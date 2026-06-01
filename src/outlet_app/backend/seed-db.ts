import { Database } from "bun:sqlite";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CsvRow = Record<string, string>;

type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");
const goldDir = resolve(repoRoot, "data/gold");
const dbDir = resolve(repoRoot, "src/outlet_app/db");
const dbPath = resolve(dbDir, "outlet_data.sqlite");

const datasets = [
  { name: "fih_budget_allocations", file: "fih_budget_allocations.csv" },
  { name: "fih_explanations", file: "fih_explanations.csv" },
  { name: "fih_predictions", file: "fih_predictions.csv" },
];

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text: string): ParsedCsv {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xfeff) {
    headerLine = headerLine.slice(1);
  }

  const headers = parseCsvLine(headerLine).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });

    return row;
  });

  return { headers, rows };
}

function escapeIdent(value: string) {
  return value.replace(/"/g, '""');
}

async function loadCsv(fileName: string): Promise<ParsedCsv> {
  const csv = await readFile(resolve(goldDir, fileName), "utf8");
  return parseCsv(csv);
}

function createTable(db: Database, table: string, headers: string[]) {
  const columns = headers.map((header) => `"${escapeIdent(header)}" TEXT`).join(", ");
  db.exec(`DROP TABLE IF EXISTS "${table}"`);
  db.exec(`CREATE TABLE "${table}" (${columns})`);

  if (headers.includes("Outlet_ID")) {
    db.exec(`CREATE INDEX "${table}_outlet_id" ON "${table}" ("Outlet_ID")`);
  }
}

function insertRows(db: Database, table: string, headers: string[], rows: CsvRow[]) {
  if (headers.length === 0) return;

  const columns = headers.map((header) => `"${escapeIdent(header)}"`).join(", ");
  const placeholders = headers.map(() => "?").join(", ");
  const statement = db.prepare(
    `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
  );

  const insertBatch = db.transaction((batch: CsvRow[]) => {
    for (const row of batch) {
      const values = headers.map((header) => {
        const value = row[header];
        return value === "" ? null : value;
      });
      statement.run(values);
    }
  });

  insertBatch(rows);
}

async function main() {
  await mkdir(dbDir, { recursive: true });

  const db = new Database(dbPath);
  try {
    for (const dataset of datasets) {
      const { headers, rows } = await loadCsv(dataset.file);
      createTable(db, dataset.name, headers);
      insertRows(db, dataset.name, headers, rows);
      console.log(`${dataset.name}: ${rows.length} rows`);
    }
  } finally {
    db.close();
  }

  console.log(`SQLite database written to ${dbPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
