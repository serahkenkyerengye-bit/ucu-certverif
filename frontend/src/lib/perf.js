// Keeps a timing log in this browser so results can be exported for the performance evaluation.
const KEY = "ucu-perf-log";

export function logPerf(entry) {
  try {
    const log = JSON.parse(localStorage.getItem(KEY) || "[]");
    log.push({ at: new Date().toISOString(), ...entry });
    localStorage.setItem(KEY, JSON.stringify(log.slice(-500)));
  } catch {
    /* storage unavailable */
  }
}

export function getPerfLog() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function clearPerfLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function perfCsv() {
  const rows = getPerfLog();
  const cols = ["at", "type", "ms", "gasUsed", "network", "certHash", "txHash"];
  return [cols.join(","), ...rows.map((r) => cols.map((c) => (r[c] ?? "")).join(","))].join("\n");
}

export function downloadText(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
