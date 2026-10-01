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

    /* 原生标签组（文件夹）在网格里：tab-group 本身是 display:contents，网格项目其实是它的
     * 「标题行」+「子标签容器」两块，所以 span 要写在容器上（写在组上被忽略，实测踩过）。 */
    for (const g of document.querySelectorAll(".zen-workspace-normal-tabs-section > tab-group")) {
      const n = (g.tabs || []).filter(t => t.visible !== false).length;
      const cont = g.querySelector(":scope > .tab-group-container");
      if (!cont) continue;
      const want = "span " + Math.max(1, g.collapsed ? 1 : n);
      if (cont.style.gridRow !== want) cont.style.gridRow = want;
    }
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

/* ---- 一键整理成文件夹 ----
 * 两个入口都放在标签右键菜单里：
 *   按网站   —— 同一个 eTLD+1 有 ≥2 个标签就收进一个文件夹（确定性，永远能用）
 *   AI 整理  —— 标题+网址分词后做 Jaccard 相似度聚类（同站额外加权），本地算，不联网
 * 没用 Zen 自带的 SmartTabGrouping：它走 embeddingsGeneratorFactory.forGeneral()，
 * 要先把 HuggingFace 上的嵌入模型下载到本地（国内基本连不上），失败时按钮就是一直转圈。
 * 读取范围包含已经在文件夹里的标签（先解组再重组），所以重复点会按新规则重排。 */
(() => {
  if (window.__zenOrganize) return;
  window.__zenOrganize = true;

  const COLORS = ["blue", "green", "orange", "purple", "yellow", "teal", "pink", "red"];
  const SIM_THRESHOLD = 0.28;      // 越低越激进：0.28 ≈ 两个标题共享 1/3 的词
  const MAX_CLUSTER = 12;
  const STOP = new Set(("www com org net cn gov edu io co me the for and with page home index new tab site web app https http " +
    "of a an to in on 首页 网站 页面 官方 管理").split(/\s+/));

  function urlOf(t) { try { return t.linkedBrowser.currentURI.spec; } catch (e) { return t.label || ""; } }

  function hostOf(u) {
    try {
      const x = new URL(u);
      if (!/^https?:$/.test(x.protocol)) return null;
      const h = x.hostname.toLowerCase().replace(/^www\./, "");
      const p = h.split(".");
      return p.length > 2 ? p.slice(-2).join(".") : h;
    } catch (e) { return null; }
  }

  // 所有窗口都算进来：pinned 与 Zen 的空占位标签除外
  function candidates(win) {
    return [...win.gBrowser.tabs].filter(t => !t.pinned && !t.hasAttribute("zen-empty-tab") && t.visible !== false);
  }

  function tokensOf(s) {
    const out = new Set();
    const low = String(s).toLowerCase();
    for (const w of low.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 2 && !STOP.has(w)) out.add(w);
    // 中日韩没有空格分词：按相邻两字组合作为词
    for (const run of low.match(/[\u3400-\u9fff]{2,}/g) || []) {
      for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
    }
    return out;
  }

  /* 解散一组：必须逐标签 gBrowser.ungroupTab(t)。
   * tab-group.ungroupTabs() 在这个 Zen 里是空操作 —— 它遍历 this.tabsAndSplitViews，
   * 而实测那个数组是空的（g.tabs 有 12 个，tabsAndSplitViews 长度 0），
   * 调完不报错但什么都没发生。逐标签解组后空组会被自动移除（实测 groupNodes 归 0）。 */
  function dissolveGroups(win, tabs) {
    const touched = new Set();
    for (const t of tabs) if (t.group) touched.add(t.group);
    for (const g of touched) {
      for (const t of [...(g.tabs || [])]) { try { win.gBrowser.ungroupTab(t); } catch (e) {} }
    }
  }

  function makeGroup(win, tabs, label, color) {
    dissolveGroups(win, tabs);
    try {
      return win.gBrowser.addTabGroup(tabs, { label, color, insertBefore: tabs[0] });
    } catch (e) {
      console.error("addTabGroup failed:", e);
      return null;
    }
  }

  const history = [];

  function applyClusters(win, clusters) {
    clusters.sort((a, b) => [...win.gBrowser.tabs].indexOf(a.tabs[0]) - [...win.gBrowser.tabs].indexOf(b.tabs[0]));
    const made = [];
    for (const c of clusters) {
      const g = makeGroup(win, c.tabs, c.label, COLORS[made.length % COLORS.length]);
      if (g) made.push(g);
    }
    if (made.length) history.push({ win, groups: made });
    return made.length;
  }

  function bySite(win) {
    const byHost = new Map();
    for (const t of candidates(win)) {
      const h = hostOf(urlOf(t));
      if (!h) continue;
      if (!byHost.has(h)) byHost.set(h, []);
      byHost.get(h).push(t);
    }
    const clusters = [];
    for (const [h, tabs] of byHost) if (tabs.length >= 2) clusters.push({ tabs, label: h });
    return applyClusters(win, clusters);
  }

  function nameCluster(arr) {
    const freq = new Map();
    const hosts = new Map();
    for (const it of arr) {
      for (const w of it.words) freq.set(w, (freq.get(w) || 0) + 1);
      if (it.host) hosts.set(it.host, (hosts.get(it.host) || 0) + 1);
    }
    const need = Math.max(2, Math.ceil(arr.length / 2));
    const shared = [...freq.entries()].filter(e => e[1] >= need).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    if (shared.length) return shared[0][0];
    const hs = [...hosts.entries()].sort((a, b) => b[1] - a[1]);
    if (hs.length) return hs[0][0];
    return "整理 " + arr.length;
  }

  function bySimilarity(win) {
    const items = candidates(win).map(t => {
      const host = hostOf(urlOf(t));
      return { tab: t, host, words: tokensOf(t.label || "") };
    });

    /* 出现在六成以上标签里的词没有区分度（"邮箱""免费""test" 之类），先丢掉。
     * 第一版没丢：12 个测试标签因为都带 .test 域名，被串联成了一个巨型文件夹。 */
    const freq = new Map();
    for (const it of items) for (const w of it.words) freq.set(w, (freq.get(w) || 0) + 1);
    const ceiling = Math.max(2, Math.ceil(items.length * 0.6));
    for (const it of items) for (const w of [...it.words]) if (freq.get(w) >= ceiling) it.words.delete(w);

    function sim(a, b) {
      if (a.host && a.host === b.host) return 1;
      if (!a.words.size || !b.words.size) return 0;
      let inter = 0;
      for (const w of a.words) if (b.words.has(w)) inter++;
      return inter / (a.words.size + b.words.size - inter);
    }

    /* 完全链接：两簇之间「任意一对」都要够像才合并。
     * 用并查集的单链接会把 A-B、B-C 传递成 A/B/C 一坨（实测 12 个标签并成 1 个）。 */
    let clusters = items.map(it => [it]);
    for (;;) {
      let best = null, bestScore = SIM_THRESHOLD;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          if (clusters[i].length + clusters[j].length > MAX_CLUSTER) continue;
          let min = 1;
          for (const a of clusters[i]) {
            for (const b of clusters[j]) {
              const s = sim(a, b);
              if (s < min) min = s;
              if (min < bestScore) break;
            }
            if (min < bestScore) break;
          }
          if (min >= bestScore) { bestScore = min; best = [i, j]; }
        }
      }
      if (!best) break;
      clusters[best[0]] = clusters[best[0]].concat(clusters[best[1]]);
      clusters.splice(best[1], 1);
    }

    const out = [];
    for (const arr of clusters) {
      if (arr.length < 2) continue;
      out.push({ tabs: arr.map(x => x.tab), label: nameCluster(arr) });
    }
    return applyClusters(win, out);
  }

  function undo() {
    const last = history.pop();
    if (!last) return 0;
    let n = 0;
    for (const g of last.groups) {
      const tabs = [...(g.tabs || [])];
      n += tabs.length;
      for (const t of tabs) { try { last.win.gBrowser.ungroupTab(t); } catch (e) {} }
    }
    return n;
  }

  function flash(win, text) {
    let t = win.document.getElementById("uc-toast");
    if (!t) {
      t = win.document.createXULElement("hbox");
      t.id = "uc-toast";
      (win.document.getElementById("browser") || win.document.documentElement).appendChild(t);
    }
    t.textContent = text;
    t.setAttribute("showing", "true");
    clearTimeout(t._ucTimer);
    t._ucTimer = setTimeout(() => t.removeAttribute("showing"), 2800);
  }

  function addMenu(win) {
    const menu = win.document.getElementById("tabContextMenu");
    if (!menu || win.document.getElementById("uc-menu-site")) return;
    const sep = win.document.createXULElement("menuseparator");
    menu.appendChild(sep);
    const mk = (id, label, run) => {
      const it = win.document.createXULElement("menuitem");
      it.id = id;
      it.label = label;
      it.addEventListener("command", () => flash(win, run()));
      menu.appendChild(it);
    };
    mk("uc-menu-site", "🗂 按网站整理成文件夹", () => "已整理出 " + bySite(win) + " 个文件夹");
    mk("uc-menu-ai", "✨ AI 整理（本地相似度）", () => "已整理出 " + bySimilarity(win) + " 个文件夹");
    mk("uc-menu-undo", "↩️ 撤销这次整理", () => "已打散 " + undo() + " 个标签的分组");
  }

  window.ucOrganize = { bySite, bySimilarity, undo, tokensOf, hostOf };

  function init() {
    if (!window.gBrowser) { setTimeout(init, 200); return; }
    addMenu(window);
  }
  init();
})();
