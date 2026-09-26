/**
 * Lightweight Android UI driver via adb + uiautomator dump.
 * Extends the existing e2e/ harness for real-device Customer App interaction.
 * Does not replace Playwright API specs — used alongside them for UI POV.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ARTIFACTS = path.join(ROOT, "test-results", "mobile-artifacts");
const PACKAGE = process.env.ANDROID_PACKAGE || "com.selorg.com";
const SERIAL = process.env.ANDROID_SERIAL || "emulator-5554";

fs.mkdirSync(ARTIFACTS, { recursive: true });

function adb(args, opts = {}) {
  const bin = process.env.ADB_PATH || "adb";
  const full = ["-s", SERIAL, ...args];
  try {
    return execFileSync(bin, full, {
      encoding: "utf8",
      timeout: opts.timeout ?? 60_000,
      maxBuffer: 20 * 1024 * 1024,
      ...opts,
    });
  } catch (err) {
    const msg = err?.stderr || err?.stdout || err?.message || String(err);
    const e = new Error(`adb ${full.join(" ")} failed: ${msg}`);
    e.cause = err;
    throw e;
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function prepareDeviceForUiAutomation() {
  // Animations frequently cause "could not get idle state" uiautomator dump failures.
  for (const [k, v] of [
    ["window_animation_scale", "0"],
    ["transition_animation_scale", "0"],
    ["animator_duration_scale", "0"],
  ]) {
    try {
      adb(["shell", "settings", "put", "global", k, v]);
    } catch {
      /* ignore */
    }
  }
}

export function grantRuntimePermissions() {
  const perms = [
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.CAMERA",
    "android.permission.READ_MEDIA_IMAGES",
  ];
  for (const p of perms) {
    try {
      adb(["shell", "pm", "grant", PACKAGE, p]);
    } catch {
      /* older API levels / missing perms */
    }
  }
}

export function ensureReversePorts() {
  for (const port of [3333, 8081]) {
    try {
      adb(["reverse", `tcp:${port}`, `tcp:${port}`]);
    } catch {
      /* ignore */
    }
  }
  try {
    adb(["shell", "settings", "put", "global", "debug_http_host", "localhost:8081"]);
  } catch {
    /* ignore */
  }
}

export function launchApp(clearData = false) {
  if (clearData) {
    try {
      adb(["shell", "pm", "clear", PACKAGE]);
    } catch {
      /* ignore */
    }
    // Re-apply Metro host after clear (some images reset related settings)
    try {
      adb(["shell", "settings", "put", "global", "debug_http_host", "localhost:8081"]);
    } catch {
      /* ignore */
    }
  }
  adb([
    "shell",
    "am",
    "start",
    "-n",
    `${PACKAGE}/.MainActivity`,
    "-a",
    "android.intent.action.MAIN",
    "-c",
    "android.intent.category.LAUNCHER",
  ]);
}

export function forceStop() {
  try {
    adb(["shell", "am", "force-stop", PACKAGE]);
  } catch {
    /* ignore */
  }
}

export function pressBack() {
  adb(["shell", "input", "keyevent", "4"]);
}

export function pressHome() {
  adb(["shell", "input", "keyevent", "3"]);
}

export function hideKeyboard() {
  try {
    adb(["shell", "input", "keyevent", "111"]); // KEYCODE_ESCAPE
  } catch {
    /* ignore */
  }
  try {
    // KEYCODE_BACK is dangerous on auth screens — use hide soft input instead
    adb(["shell", "cmd", "input", "keyevent", "KEYCODE_ESCAPE"]);
  } catch {
    /* ignore */
  }
  // Do NOT press BACK (keycode 4) — on EnterMobile/OTP it pops the navigation stack.
}

export function tap(x, y) {
  adb(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
}

export function swipe(x1, y1, x2, y2, durationMs = 400) {
  adb([
    "shell",
    "input",
    "swipe",
    String(Math.round(x1)),
    String(Math.round(y1)),
    String(Math.round(x2)),
    String(Math.round(y2)),
    String(durationMs),
  ]);
}

export function typeText(text) {
  // Escape spaces for `input text`
  const escaped = String(text).replace(/([\\'"&<>|])/g, "\\$1").replace(/ /g, "%s");
  adb(["shell", "input", "text", escaped]);
}

/** Prefer clipboard paste — more reliable with RN controlled TextInputs than `input text`. */
export function pasteText(text) {
  const value = String(text ?? "");
  try {
    // Host-side clipboard → device (works on modern adb)
    adb(["shell", "cmd", "clipboard", "set-text", value]);
  } catch {
    try {
      adb(["shell", "am", "broadcast", "-a", "clipper.set", "-e", "text", value]);
    } catch {
      /* fall through to keyevents below */
    }
  }
  adb(["shell", "input", "keyevent", "279"]); // KEYCODE_PASTE
}

export function typeDigits(text) {
  const map = {
    "0": "7",
    "1": "8",
    "2": "9",
    "3": "10",
    "4": "11",
    "5": "12",
    "6": "13",
    "7": "14",
    "8": "15",
    "9": "16",
  };
  for (const ch of String(text)) {
    const code = map[ch];
    if (code) adb(["shell", "input", "keyevent", code]);
  }
}

export function clearFocusedField() {
  // Select-all + delete (works on many Android EditTexts)
  adb(["shell", "input", "keyevent", "KEYCODE_MOVE_END"]);
  for (let i = 0; i < 24; i++) adb(["shell", "input", "keyevent", "67"]); // DEL
}

function parseBounds(bounds) {
  const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(bounds || "");
  if (!m) return null;
  const x1 = +m[1],
    y1 = +m[2],
    x2 = +m[3],
    y2 = +m[4];
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 };
}

function parseNodes(xml) {
  const nodes = [];
  const re =
    /<node\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const get = (name) => {
      const am = new RegExp(`${name}="([^"]*)"`).exec(attrs);
      return am ? am[1].replace(/&#10;/g, "\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"') : "";
    };
    const bounds = parseBounds(get("bounds"));
    if (!bounds) continue;
    nodes.push({
      text: get("text"),
      desc: get("content-desc"),
      cls: get("class"),
      resourceId: get("resource-id"),
      clickable: get("clickable") === "true",
      enabled: get("enabled") === "true",
      focused: get("focused") === "true",
      checkable: get("checkable") === "true",
      checked: get("checked") === "true",
      password: get("password") === "true",
      hint: get("hint"),
      package: get("package"),
      bounds,
    });
  }
  return nodes;
}

export function dumpUi(label = "dump") {
  const remotes = ["/sdcard/uidump-e2e.xml", "/sdcard/window_dump.xml"];
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      // Prefer dumping to stdout when available (avoids stale files).
      try {
        const out = adb(["exec-out", "uiautomator", "dump", "/dev/tty"], { timeout: 20_000 });
        if (out && out.includes("<hierarchy")) {
          const xml = out.slice(out.indexOf("<?xml"));
          const local = path.join(ARTIFACTS, `${stamp()}-${safe(label)}.xml`);
          fs.writeFileSync(local, xml, "utf8");
          return { xml, nodes: parseNodes(xml), path: local };
        }
      } catch {
        /* fall through to file dump */
      }

      const remote = remotes[attempt % remotes.length];
      try {
        adb(["shell", "rm", "-f", remote]);
      } catch {
        /* ignore */
      }
      adb(["shell", "uiautomator", "dump", remote]);
      const xml = adb(["shell", "cat", remote]);
      if (!xml || !xml.includes("<hierarchy") || xml.length < 80) {
        throw new Error("empty or invalid uiautomator dump");
      }
      const local = path.join(ARTIFACTS, `${stamp()}-${safe(label)}.xml`);
      fs.writeFileSync(local, xml, "utf8");
      return { xml, nodes: parseNodes(xml), path: local };
    } catch (err) {
      lastErr = err;
      sleepSync(800 + attempt * 400);
    }
  }
  throw lastErr || new Error("uiautomator dump failed");
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function screenshot(label = "shot") {
  const local = path.join(ARTIFACTS, `${stamp()}-${safe(label)}.png`);
  const remote = "/sdcard/e2e-shot.png";
  adb(["shell", "screencap", "-p", remote]);
  adb(["pull", remote, local]);
  return local;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
function safe(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

export function findNodes(nodes, predicate) {
  return nodes.filter(predicate);
}

export function findByText(nodes, text, { exact = true, partial = false } = {}) {
  const t = String(text);
  return nodes.filter((n) => {
    const hay = `${n.text || ""}${n.desc ? `\n${n.desc}` : ""}`;
    if (exact && (n.text === t || n.desc === t)) return true;
    if (partial || !exact) {
      return hay.toLowerCase().includes(t.toLowerCase());
    }
    return false;
  });
}

export function findByTestId(nodes, testId) {
  const id = String(testId);
  return nodes.filter(
    (n) =>
      n.resourceId === id ||
      n.resourceId?.endsWith(`/${id}`) ||
      n.resourceId?.endsWith(`:id/${id}`) ||
      n.desc === id,
  );
}

export async function tapTestId(testId, { timeoutMs = 20000, afterMs = 500 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = dumpUi(`wait-id-${testId}`);
    const hits = findByTestId(last.nodes, testId);
    if (hits.length) {
      tap(hits[0].bounds.cx, hits[0].bounds.cy);
      await sleep(afterMs);
      return hits[0];
    }
    await sleep(600);
  }
  screenshot(`fail-testid-${testId}`);
  throw new Error(`Timeout waiting for testID "${testId}". Last dump: ${last?.path}`);
}

export async function typeIntoTestId(testId, text, { clear = true, verify = true } = {}) {
  const expected = String(text ?? "");
  const isDigits = /^\d+$/.test(expected);

  async function focusedType(strategy) {
    await tapTestId(testId, { afterMs: 350 });
    // Second tap helps RN TextInput take IME focus on emulator
    try {
      const d = dumpUi(`refocus-${testId}`);
      const hit = findByTestId(d.nodes, testId)[0];
      if (hit) tap(hit.bounds.cx, hit.bounds.cy);
    } catch {
      /* */
    }
    await sleep(250);
    if (clear) clearFocusedField();
    if (strategy === "digits") typeDigits(expected);
    else if (strategy === "paste") pasteText(expected);
    else typeText(expected);
    await sleep(400);
    const dump = dumpUi(`typed-${strategy}-${testId}`);
    const hits = findByTestId(dump.nodes, testId);
    return hits[0]?.text || "";
  }

  let current = "";
  // Prefer digit keyevents / input text. Avoid host clipboard paste — it can inject
  // unrelated Windows clipboard contents into RN fields on emulator.
  const strategies = isDigits ? ["digits", "text"] : ["text"];
  for (const strategy of strategies) {
    try {
      current = await focusedType(strategy);
    } catch {
      continue;
    }
    const digitsOk =
      isDigits && String(current).replace(/\D/g, "").endsWith(expected);
    if (digitsOk || String(current).includes(expected)) break;
  }

  if (verify) {
    const digitsOk =
      isDigits && String(current).replace(/\D/g, "").endsWith(expected);
    if (!digitsOk && !String(current).includes(expected)) {
      screenshot(`fail-type-${testId}`);
      throw new Error(
        `Failed to type into "${testId}": expected "${expected}", got "${current}"`,
      );
    }
  }
  await sleep(200);
}

export function findEditTexts(nodes) {
  return nodes.filter((n) => /EditText|TextInput/i.test(n.cls) || n.hint);
}

export async function waitForTestId(testId, { timeoutMs = 20000, pollMs = 600, dismiss = true } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = dumpUi(`wait-id-${testId}`);
    if (dismiss) {
      await dismissPermissionDialogs(last.nodes);
    }
    const hits = findByTestId(last.nodes, testId);
    if (hits.length) return { ...last, hits };
    // Fallback: content-desc / text match for older RN builds without resource-id mapping
    const byDesc = findByText(last.nodes, testId, { exact: true });
    if (byDesc.length) return { ...last, hits: byDesc };
    await sleep(pollMs);
  }
  screenshot(`fail-testid-${testId}`);
  throw new Error(`Timeout waiting for testID "${testId}". Last dump: ${last?.path}`);
}

/** Tap common system permission / RN debugger dialogs. Safe no-op if none present. */
export async function dismissPermissionDialogs(nodes) {
  if (!nodes) {
    try {
      nodes = dumpUi("dlg-scan").nodes;
    } catch {
      return false;
    }
  }
  const prefer = [
    "Don't Show Again",
    "Don’t Show Again",
    "While using the app",
    "Only this time",
    "Allow",
    "OK",
    "RELOAD",
    "Close",
    "No thanks",
    "Got it",
  ];
  // Prefer dismissing known system tutorial titles first
  const cancelFirst = findByText(nodes, "Try out your stylus", { exact: false, partial: true });
  if (cancelFirst.length) {
    const cancelBtn = findByText(nodes, "Cancel", { exact: true });
    if (cancelBtn.length) {
      const t = cancelBtn[0];
      tap(t.bounds.cx, t.bounds.cy);
      await sleep(700);
      return true;
    }
  }
  for (const lab of prefer) {
    const hits = findByText(nodes, lab, { exact: false, partial: true }).filter(
      (h) => !/don.?t allow/i.test(`${h.text}${h.desc}`),
    );
    if (!hits.length) continue;
    // Prefer the largest / lowest button for permission sheets
    const t = hits.sort((a, b) => b.bounds.cy - a.bounds.cy || b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h)[0];
    tap(t.bounds.cx, t.bounds.cy);
    await sleep(700);
    return true;
  }
  return false;
}

export async function waitForText(text, { timeoutMs = 20000, exact = false, pollMs = 700, dismiss = true } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = dumpUi(`wait-${text}`);
    if (dismiss) {
      await dismissPermissionDialogs(last.nodes);
      // Re-dump if we dismissed something
    }
    const hits = findByText(last.nodes, text, { exact, partial: !exact });
    if (hits.length) return { ...last, hits };
    await sleep(pollMs);
  }
  screenshot(`fail-wait-${text}`);
  throw new Error(`Timeout waiting for text "${text}" after ${timeoutMs}ms. Last dump: ${last?.path}`);
}

export async function tapText(text, opts = {}) {
  const { exact = false, index = 0, timeoutMs = 20000 } = opts;
  const { hits } = await waitForText(text, { exact, timeoutMs });
  const target = hits[index] || hits[0];
  // Prefer clickable ancestor-ish: if node not clickable, still tap center
  tap(target.bounds.cx, target.bounds.cy);
  await sleep(opts.afterMs ?? 500);
  return target;
}

export async function tapDesc(desc, opts = {}) {
  return tapText(desc, { ...opts, exact: true });
}

export function visibleTexts(nodes) {
  return [...new Set(nodes.map((n) => n.text || n.desc).filter(Boolean))];
}

export function packageInstalled() {
  const out = adb(["shell", "pm", "list", "packages", PACKAGE]);
  return out.includes(PACKAGE);
}

export function getLogcatSlice(msBack = 15000) {
  try {
    // dump recent and filter for ReactNativeJS / OkHttp / selorg
    const out = adb(["logcat", "-d", "-t", "200"], { timeout: 15_000 });
    return out
      .split(/\r?\n/)
      .filter((l) => /ReactNativeJS|OkHttp|selorg|ERROR|Exception|FATAL/i.test(l))
      .slice(-120)
      .join("\n");
  } catch {
    return "";
  }
}

export function clearLogcat() {
  try {
    adb(["logcat", "-c"]);
  } catch {
    /* ignore */
  }
}

export { ARTIFACTS, PACKAGE, SERIAL, ROOT };
