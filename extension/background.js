"use strict";

/*
 * 标签页管家 — 后台脚本
 * - 自动冻结：超过设定时间（默认 60 秒）未使用的标签页会被 tabs.discard() 卸载出内存，
 *   标签仍留在标签栏上，点击时自动重新加载。
 * - 向弹窗 / 设置页 / 右键菜单提供：整理（排序）、去重、立即冻结、统计。
 */

const DEFAULTS = {
  autoEnabled: true,       // 自动冻结总开关
  thresholdSeconds: 60,    // 超过该秒数未使用则冻结
  excludePinned: true,     // 固定的标签页不冻结
  excludeAudible: true,    // 正在播放声音的标签页不冻结
  whitelist: ""            // 每行一个域名，匹配的网站永不冻结
};

let settings = { ...DEFAULTS };
const lastActive = new Map(); // tabId -> 最后一次被使用的时刻（epoch ms）

function clampThreshold(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return DEFAULTS.thresholdSeconds;
  return Math.min(86400, Math.max(5, n));
}

async function loadSettings() {
  const s = await browser.storage.local.get(DEFAULTS);
  s.thresholdSeconds = clampThreshold(s.thresholdSeconds);
  settings = s;
}

function whitelistRules() {
  return String(settings.whitelist || "")
    .split(/[\n,;]+/)
    .map(s => s.trim().toLowerCase().replace(/^\*?\./, ""))
    .filter(Boolean);
}

function isWhitelisted(url) {
  const rules = whitelistRules();
  if (!rules.length || !url) return false;
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
  return rules.some(d => host === d || host.endsWith("." + d));
}

function markNow(tabIds) {
  const now = Date.now();
  for (const id of tabIds) lastActive.set(id, now);
}

function isProtected(tab) {
  if (settings.excludePinned && tab.pinned) return true;
  if (settings.excludeAudible && tab.audible) return true;
  return false;
}

/* 冻结所有“不活跃”的标签页。
 * 只豁免：当前聚焦窗口的激活标签页、已冻结的、固定/有声（可选）、白名单。
 * minIdleMs = 0 表示“立即冻结”（弹窗/右键菜单按钮），否则按设置的阈值。 */
async function freezeEligible(minIdleMs) {
  const now = Date.now();
  const focused = await browser.tabs.query({ lastFocusedWindow: true, active: true });
  const protectedIds = new Set(focused.map(t => t.id));
  const tabs = await browser.tabs.query({});
  let count = 0;
  for (const t of tabs) {
    if (t.discarded || protectedIds.has(t.id)) continue;
    if (isProtected(t) || isWhitelisted(t.url)) continue;
    const last = lastActive.has(t.id) ? lastActive.get(t.id) : now;
    if (now - last >= minIdleMs) {
      try { await browser.tabs.discard(t.id); count++; } catch (e) { /* 页面可能有未保存状态，下个周期再试 */ }
    }
  }
  return count;
}

async function tick() {
  try {
    if (!settings.autoEnabled) return;
    // 当前聚焦窗口的激活标签页视为“正在使用”，持续刷新时间戳
    const focused = await browser.tabs.query({ lastFocusedWindow: true, active: true });
    markNow(focused.map(t => t.id));
    await freezeEligible(clampThreshold(settings.thresholdSeconds) * 1000);
  } catch (e) { /* 忽略单次周期错误 */ }
}

/* ---- 整理：每个窗口内，固定标签页排在最前，其余按 域名 > 标题 > 网址 排序 ---- */

function sortKey(tab) {
  let host = "";
  try {
    const u = new URL(tab.url);
    if (u.protocol === "http:" || u.protocol === "https:") host = u.hostname;
  } catch (e) { /* 非 http(s) 页面按标题排 */ }
  return [host || "\uFFFF" + (tab.title || ""), (tab.title || "").toLowerCase(), tab.url || ""];
}

function compareTabs(a, b) {
  const [ha, ta] = sortKey(a);
  const [hb, tb] = sortKey(b);
  return ha.localeCompare(hb) || ta.localeCompare(tb) || (a.url || "").localeCompare(b.url || "");
}

async function sortWindow(windowId) {
  const tabs = await browser.tabs.query({ windowId });
  const pinned = tabs.filter(t => t.pinned).sort(compareTabs);
  const normal = tabs.filter(t => !t.pinned).sort(compareTabs);
  let index = 0;
  for (const t of pinned) { await browser.tabs.move(t.id, { windowId, index: index++ }); }
  for (const t of normal) { await browser.tabs.move(t.id, { windowId, index: index++ }); }
  return tabs.length;
}

async function sortAll() {
  const wins = await browser.windows.getAll({});
  let count = 0;
  for (const w of wins) count += await sortWindow(w.id);
  return count;
}

/* ---- 去重：相同网址只保留最近使用的一个 ---- */

function normalizeUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol === "http:" || url.protocol === "https:") {
      url.hash = "";
      let s = url.href;
      while (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
      return s;
    }
    return u;
  } catch (e) { return null; }
}

async function dedupeAll() {
  const tabs = await browser.tabs.query({});
  const groups = new Map();
  for (const t of tabs) {
    const key = normalizeUrl(t.url);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const toClose = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) =>
      ((b.active ? 1 : 0) - (a.active ? 1 : 0)) ||
      ((lastActive.get(b.id) || 0) - (lastActive.get(a.id) || 0)));
    for (const t of arr.slice(1)) toClose.push(t.id);
  }
  if (toClose.length) await browser.tabs.remove(toClose);
  return toClose.length;
}

async function getStats() {
  const tabs = await browser.tabs.query({});
  return { total: tabs.length, frozen: tabs.filter(t => t.discarded).length };
}

/* ---- 事件监听 ---- */

browser.tabs.onActivated.addListener(info => {
  const now = Date.now();
  lastActive.set(info.tabId, now);
  if (typeof info.previousTabId === "number") lastActive.set(info.previousTabId, now);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") lastActive.set(tabId, Date.now());
});

browser.tabs.onRemoved.addListener(tabId => lastActive.delete(tabId));

browser.tabs.onReplaced.addListener((addedId, removedId) => {
  lastActive.set(addedId, lastActive.has(removedId) ? lastActive.get(removedId) : Date.now());
  lastActive.delete(removedId);
});

browser.windows.onFocusChanged.addListener(windowId => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  browser.tabs.query({ windowId, active: true })
    .then(active => markNow(active.map(t => t.id)))
    .catch(() => {});
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    settings[key] = key === "thresholdSeconds" ? clampThreshold(change.newValue) : change.newValue;
  }
});

browser.runtime.onMessage.addListener(msg => {
  if (!msg || typeof msg.type !== "string") return;
  switch (msg.type) {
    case "stats": return getStats();
    case "organize": return sortAll().then(count => ({ count }));
    case "dedupe": return dedupeAll().then(count => ({ count }));
    case "freezeNow": return freezeEligible(0).then(count => ({ count }));
  }
});

/* ---- 右键标签页菜单 ---- */

try {
  browser.menus.create({ id: "tb-freeze", title: "❄ 冻结此标签页", contexts: ["tab"] });
  browser.menus.create({ id: "tb-sep", type: "separator", contexts: ["tab"] });
  browser.menus.create({ id: "tb-organize", title: "✨ 整理所有标签页", contexts: ["tab"] });
  browser.menus.create({ id: "tb-dedupe", title: "🧹 关闭重复标签页", contexts: ["tab"] });
  browser.menus.create({ id: "tb-freeze-all", title: "❄ 冻结所有不活跃标签页", contexts: ["tab"] });
} catch (e) { /* 菜单注册失败不影响主功能 */ }

browser.menus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case "tb-freeze":
      if (tab && !tab.discarded) { try { await browser.tabs.discard(tab.id); } catch (e) {} }
      break;
    case "tb-organize": await sortAll(); break;
    case "tb-dedupe": await dedupeAll(); break;
    case "tb-freeze-all": await freezeEligible(0); break;
  }
});

/* ---- 启动 ---- */

(async () => {
  await loadSettings();
  const tabs = await browser.tabs.query({});
  markNow(tabs.map(t => t.id));
  setTimeout(tick, 3000);
})();

setInterval(tick, 10 * 1000);
