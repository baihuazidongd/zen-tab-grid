"use strict";

const hasAPI = typeof browser !== "undefined" && !!browser.storage && !!browser.runtime;
const $ = id => document.getElementById(id);

function setMsg(text) { $("msg").textContent = text; }

async function send(msg) {
  if (!hasAPI) throw new Error("预览模式：请在浏览器中运行");
  return browser.runtime.sendMessage(msg);
}

async function refreshStats() {
  if (!hasAPI) { $("stats").textContent = "预览模式：未连接浏览器后台"; return; }
  try {
    const s = await send({ type: "stats" });
    $("stats").textContent = `共 ${s.total} 个标签页 · 已冻结 ${s.frozen} 个`;
  } catch (e) { /* 后台尚未就绪时静默 */ }
}

async function loadSettingsUI() {
  const defaults = { autoEnabled: true, thresholdSeconds: 60 };
  const s = hasAPI ? await browser.storage.local.get(defaults) : defaults;
  $("auto").checked = !!s.autoEnabled;
  $("secs").value = s.thresholdSeconds;
}

function bindAction(id, type, doneText) {
  $(id).addEventListener("click", async () => {
    try {
      const r = await send({ type });
      const n = r && typeof r.count === "number" ? `（${r.count}）` : "";
      setMsg(doneText + n);
      refreshStats();
    } catch (e) { setMsg("执行失败：" + e.message); }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bindAction("organize", "organize", "整理完成");
  bindAction("dedupe", "dedupe", "已关闭重复标签页");
  bindAction("freezeNow", "freezeNow", "已冻结不活跃标签页");

  await loadSettingsUI();
  refreshStats();

  $("auto").addEventListener("change", async () => {
    if (!hasAPI) return;
    await browser.storage.local.set({ autoEnabled: $("auto").checked });
    setMsg($("auto").checked ? "已开启自动冻结" : "已关闭自动冻结");
  });

  $("secs").addEventListener("change", async () => {
    if (!hasAPI) return;
    let v = parseInt($("secs").value, 10);
    if (!Number.isFinite(v)) v = 60;
    v = Math.min(86400, Math.max(5, v));
    $("secs").value = v;
    await browser.storage.local.set({ thresholdSeconds: v });
    setMsg(`阈值已设为 ${v} 秒`);
  });

  $("openOptions").addEventListener("click", async () => {
    if (!hasAPI) return;
    await browser.runtime.openOptionsPage();
    window.close();
  });
});
