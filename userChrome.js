/* Zen 标签栏：普通滚轮 = 横向连续滚动
   由 omni.ja 里的一行加载器从配置目录读入本文件；改这里不用重打补丁。 */
(() => {
  if (window.__zenWheelHScroll) return;
  window.__zenWheelHScroll = true;

  const PX_PER_LINE = 16;   // 一格滚轮 ≈ 48px（3 行）；想更慢就调小，更快就调大

  function stripSection(el) {
    let s = null;
    try { s = el && el.closest ? el.closest(".zen-workspace-normal-tabs-section") : null; } catch (e) {}
    if (!s) return null;                                   // 光标不在标签区内：一律不接管
    return s.scrollWidth > s.clientWidth + 1 ? s : null;   // 没有横向可滚内容也不接管
  }

  addEventListener(
    "wheel",
    (e) => {
      if (e.shiftKey) return;                       // Shift+滚轮本来就是横向，别抢
      if (e.deltaX !== 0) return;                   // 触控板横扫同理
      if (!e.deltaY) return;
      const s = stripSection(e.target);
      if (!s) return;

      let px;
      if (e.deltaMode === e.DOM_DELTA_LINE) px = e.deltaY * PX_PER_LINE;
      else if (e.deltaMode === e.DOM_DELTA_PAGE) px = e.deltaY * s.clientWidth;
      else px = e.deltaY;

      e.preventDefault();                           // 拦掉原生纵向滚动
      s.scrollLeft += px;                           // 直接赋值：零动画，滚多少走多少
    },
    { capture: true, passive: false }
  );
})();

/* ---- 冻结标签的可视化 ----
   Firefox 只在强制卸载时才打 discarded 属性，而扩展走的 tabs.discard() 不传 force，
   所以这里自己识别「不在内存里」的标签（browser 未连上文档 = 已卸载），
   打上 tb-frozen 供 userChrome.css 变灰。 */
(() => {
  if (window.__zenFrozenMark) return;
  window.__zenFrozenMark = true;

  function mark() {
    if (!window.gBrowser) return;
    for (const tab of gBrowser.tabs) {
      const b = tab.linkedBrowser;
      const unloaded = !b || !b.isConnected || tab.hasAttribute("discarded");
      tab.toggleAttribute("tb-frozen", !!unloaded && !tab.selected);
    }
  }

  // 加载器跑在 browser-main.js 末尾，那时 gBrowser 还没建好，等它就绪再挂监听
  function init() {
    if (!window.gBrowser || !gBrowser.tabContainer) {
      setTimeout(init, 200);
      return;
    }
    const tc = gBrowser.tabContainer;
    ["TabSelect", "TabAttrModified", "SSTabRestoring", "SSTabRestored", "TabClose", "TabOpen"].forEach((ev) =>
      tc.addEventListener(ev, mark)
    );
    setInterval(mark, 1000);
    mark();
  }
  init();
})();
