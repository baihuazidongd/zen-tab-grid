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

/* ---- 网格里的拖拽落点 ----
 * Zen 用「沿单轴的区间二分搜索」决定拖到哪个标签旁边（drag-and-drop.js 的 getOverlappedElement）。
 * 两列网格里 screenY 不再随标签序号单调，实测：指针停在第二列的 20/22/24 号标签上，
 * 算出来的落点却是 0/1/3，指示线永远画在第一列 —— 于是看起来「只能拖到第一列」。
 * Zen 自己留了条捷径：dragover 命中的元素如果带 .zen-drop-target，就直接拿它当落点，
 * 前/后半区由指针在该标签内的纵向位置决定 —— 列优先网格恰好就是这个轴。
 * 实测补上这个类之后 20→20、22→22、24→24，指示线自动移到第二列，不需要重写整套拖拽。 */
(() => {
  if (window.__zenGridDropTarget) return;
  window.__zenGridDropTarget = true;

  const DROP = "zen-drop-target";

  function gridColumnCount(s) {
    const v = getComputedStyle(s).gridTemplateColumns;
    if (!v || v === "none") return 1;
    return v.split(/\s+/).filter(Boolean).length;
  }

  function sync() {
    if (!window.gBrowser) return;
    const inGrid = new Set();
    for (const s of document.querySelectorAll(".zen-workspace-normal-tabs-section")) {
      if (gridColumnCount(s) < 2) continue;             // 单列时原生算法本来就是对的，别多事
      for (const t of s.querySelectorAll(":scope > tab")) {
        if (t.pinned || t.hasAttribute("zen-essential") || t.group) continue;  // 固定/组内标签走原生（文件夹落点语义不变）
        t.classList.add(DROP);
        inGrid.add(t);
      }
    }
    for (const t of gBrowser.tabs) if (!inGrid.has(t)) t.classList.remove(DROP);
  }

  function init() {
    if (!window.gBrowser || !gBrowser.tabContainer) {
      setTimeout(init, 200);
      return;
    }
    const tc = gBrowser.tabContainer;
    ["TabOpen", "TabClose", "TabMove", "SSTabRestored"].forEach((ev) => tc.addEventListener(ev, sync));
    new MutationObserver(sync).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["group", "pinned", "zen-essential", "hidden"]
    });
    setInterval(sync, 1000);
    sync();
  }
  init();
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
