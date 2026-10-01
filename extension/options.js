"use strict";

const hasAPI = typeof browser !== "undefined" && !!browser.storage;
const $ = id => document.getElementById(id);

const DEFAULTS = {
  autoEnabled: true,
  thresholdSeconds: 60,
  excludePinned: true,
  excludeAudible: true,
  whitelist: ""
};

async function loadUI() {
  const s = hasAPI ? await browser.storage.local.get(DEFAULTS) : { ...DEFAULTS };
  $("autoEnabled").checked = !!s.autoEnabled;
  $("thresholdSeconds").value = s.thresholdSeconds;
  $("excludePinned").checked = !!s.excludePinned;
  $("excludeAudible").checked = !!s.excludeAudible;
  $("whitelist").value = s.whitelist || "";
}

async function collectUI() {
  let v = parseInt($("thresholdSeconds").value, 10);
  if (!Number.isFinite(v)) v = DEFAULTS.thresholdSeconds;
  v = Math.min(86400, Math.max(5, v));
  $("thresholdSeconds").value = v;
  return {
    autoEnabled: $("autoEnabled").checked,
    thresholdSeconds: v,
    excludePinned: $("excludePinned").checked,
    excludeAudible: $("excludeAudible").checked,
    whitelist: $("whitelist").value
  };
}

function flash(text) {
  const el = $("saved");
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 2500);
}

document.addEventListener("DOMContentLoaded", () => {
  loadUI();

  $("save").addEventListener("click", async () => {
    const v = await collectUI();
    if (hasAPI) await browser.storage.local.set(v);
    flash("已保存 ✓");
  });

  $("reset").addEventListener("click", async () => {
    if (hasAPI) await browser.storage.local.set({ ...DEFAULTS });
    await loadUI();
    flash("已恢复默认设置");
  });

  $("freezeNow").addEventListener("click", async () => {
    if (!hasAPI) return;
    try {
      const r = await browser.runtime.sendMessage({ type: "freezeNow" });
      flash(`已冻结 ${r.count} 个不活跃标签页`);
    } catch (e) { flash("执行失败：" + e.message); }
  });
});
