# zen-tab-grid

给 **Zen 浏览器**的左侧标签栏补上三项原生没有的能力：**多列网格**、**普通滚轮横向翻页**、**冻结标签变灰**。

面向 Zen 1.22.x / Windows。全部改动都是可逆的，不含任何联网上报。

## Zen 原生是什么样，我们加了什么

| | Zen 原生 | 装了本项目 |
| --- | --- | --- |
| 标签排布 | 单列，从上往下堆 | **多列网格**：先填满一列再开新列，行数随侧栏高度自动算 |
| 标签多了怎么办 | 只能上下滚 | 超出容量时**横向排列**，滚轮**直接左右翻页** |
| 滚轮手感 | 纵向滚（在标签栏上滚的是整条列表） | 一格滚轮 = 固定像素位移，**零动画、1:1 跟手**，可量化调节 |
| 被冻结（卸载出内存）的标签 | **外观和正常标签一模一样**，看不出来 | **明显变灰**，可选加 ❄ 标记 |
| 安装方式 | — | 一个 bat，自动定位安装目录与配置目录 |

### 1. 多列网格

Zen 1.22 把标签放进了每个工作区自己的容器里，官方 CSS 针对的旧结构已经失效，所以网上流传的"userChrome.css 多列标签"方案在 1.22 上基本都不生效。本项目按实际运行时结构重写，并处理了两个 Zen 特有的坑（见下面"原理"）。

列数、行高、间距、行数全部可调；默认 `auto-fill` 让网格按侧栏高度自动铺满，**纵向不留空白**。

### 2. 普通滚轮 = 横向翻页

不需要按 Shift，也不需要触控板横扫：鼠标放在标签上滚，就是左右翻页。

这一项**必须靠一小段浏览器内 JS** 才能实现（原因见"原理"第 4 条），所以安装器会给 Zen 的 `omni.ja` 追加一个极小的加载器。不想改二进制就用 `-NoPatch` 安装，网格和变灰照常生效，只少这一项。

### 3. 冻结标签变灰

**注意：本项目不负责"冻结"这个动作** —— 标签被卸载出内存由 Firefox 自身的自动冻结、会话恢复，或你自装的冻结类扩展完成。本项目解决的是它**看不见**的问题。

原生情况下，一个已经被卸载（不占内存）的标签和一个活跃标签长得完全一样，你无法判断点下去要不要重新加载。装好后：未加载的标签整体变灰，点回去立刻恢复。

## 安装

**下载 `zen-tab-grid.exe`，双击运行，选 1。** 它会自动定位 Zen 安装目录和你真正在用的配置目录 → 装好 CSS/JS → 需要写 `Program Files` 时自己弹 UAC 提权 → 备份 `omni.ja` 后再打补丁。全程不用填路径、不用解压、不用装任何依赖。

然后**完全退出 Zen（菜单 → 退出）再打开**即生效。

| 菜单项 | 作用 |
| --- | --- |
| 1 完整安装 | 三项功能全开（会请求管理员权限） |
| 2 仅装样式 | 免管理员；有网格 + 冻结变灰，滚轮仍是上下滚 |
| 3 检查并更新 | 从仓库拉最新 CSS/JS 重装，并自检补丁是否被 Zen 更新冲掉 |
| 4 卸载补丁 | 还原 `omni.ja.bak` |

命令行也能用：`zen-tab-grid.exe --install | --style-only | --update | --uninstall | --status`

**SmartScreen 拦你怎么办**（未签名 exe 的常见情况）：点弹窗里的「更多信息」→「仍要运行」。不想用 exe 的话，仓库里的 `install.bat`（右键 → 以管理员身份运行）效果完全一样；exe 的源码就在 `src\Program.cs`，想自己编译跑 `src\build.cmd` 即可（只用 Windows 自带的 csc.exe，无第三方依赖）。

> Zen 会在 `profiles.ini` 里留一个带 `Default=1` 的空壳配置目录，按"默认标记"找会装错地方 —— 安装器改用 `[Install<hash>]` 里的真实路径，并以 `prefs.js` 的写入时间兜底。


## 配置

改 `<配置目录>\chrome\userChrome.css` 顶部，重启 Zen 生效：

```css
:root {
  --uc-grid-rows: auto-fill;  /* 一列几行。auto-fill=按侧栏高度自动铺满；也可写数字如 8 */
  --uc-grid-columns: 2;       /* 每排几列 */
  --uc-tab-h: 36px;           /* 单个标签高度 */
  --uc-grid-gap: 4px;         /* 标签间距 */
}
```

改滚轮步长：`<配置目录>\chrome\userChrome.js`

```js
const PX_PER_LINE = 16;   // 一格滚轮 ≈ 48px；调小更细腻，调大更快
```

改变灰程度 / 加 ❄：`userChrome.css` 末尾的 `opacity` 数字，以及那段注释掉的 `::after`。

## 更新与卸载

- **更新**：双击 exe 选 3（或右键 `update.bat`）。从本仓库拉最新文件并重装 CSS/JS；同时会自检 `omni.ja` 补丁是否还在（Zen 自动更新会把它冲掉），缺失时提示你重装补丁。
- **卸载**：双击 exe 选 4（或右键 `uninstall.bat` → 管理员运行），还原安装前的 `omni.ja` 备份。要彻底回到原状，再删掉配置目录下的 `chrome\userChrome.css`、`chrome\userChrome.js`，以及 `user.js` 里本项目追加的那两行。


## 它会改动你机器上的什么

| 位置 | 改动 | 撤销 |
| --- | --- | --- |
| `<配置目录>\chrome\userChrome.css` | 新增 | 删除文件 |
| `<配置目录>\chrome\userChrome.js` | 新增 | 删除文件 |
| `<配置目录>\user.js` | 追加一行开关（不打开则 userChrome.css 完全不加载） | 删掉那两行 |
| `<安装目录>\browser\omni.ja` | 在 `browser-main.js` 末尾追加十几行加载器；原文件先备份为 `omni.ja.bak` | `uninstall.bat` |

## 原理（为什么原生 CSS 做不到这些）

1. **Zen 1.22 把工作区标签搬走了。** 标签的实际父级是 `zen-workspace` 内部的 `.zen-workspace-normal-tabs-section`，不再是官方 CSS 针对的 `#tabbrowser-arrowscrollbox`。
2. **userChrome.css 不能用 `::part()` 穿透 shadow DOM**（Firefox 禁止用户级样式表穿透），所以任何要改 arrowscrollbox 内部滚动的方案都不可行。本项目全部基于 light DOM。
3. **空网格也会占位。** `grid-template-rows: repeat(8, 36px)` 的 8 条显式轨道即使格子里没内容也会实体化高度。所以固定标签区不做网格化，普通标签区加 `:has(> .tabbrowser-tab)` 守卫 —— 否则顶部会凭空出现一大片空白。
4. **普通滚轮无法用 CSS 变成横向。** 浏览器按物理方向派发滚轮增量，纵向增量只会去找纵向可滚容器；而 Zen 的模组系统是纯 CSS（`ZenMods.mjs` 只有 Stylesheet service），扩展也进不了 `browser.xhtml`。所以用 `omni.ja` 里的加载器 + `loadSubScript` 读配置目录的 JS，把滚轮增量直接写成 `scrollLeft +=`（不经任何动画，所以跟手）。
5. **冻结标签原本没有任何可样式化的标记。** Firefox 只在**强制**卸载时才打 `discarded` 属性（`if (aForceDiscard) tab.toggleAttribute("discarded", true)`），而扩展 API `tabs.discard()` 走的是不传 force 的路径 —— 冻结确实成功了（`<browser>` 元素被销毁、内存释放），但标签上不留痕迹。本项目自己识别"browser 未连上文档"的标签并打 `tb-frozen`。

## 已知限制

- **Zen 自动更新会覆盖 `omni.ja`**，表现为"滚轮又变成上下滚"。重跑 `install.bat` 即可（幂等，只补那一处，不会把 omni.ja 的其它内容回退）。
- 标签**拖拽排序**在网格下按网格位置落点，跨列拖拽偶尔要两次。
- 「新建标签页」按钮本身是标签区的子元素，会占掉第一个格子。
- 会话恢复后还没点开过的标签也会显示为灰 —— 它们本来就不在内存里，属正常。
- 只在 Windows 上测试过（Zen 1.22.3b / Win11）；macOS/Linux 的路径定位需要另写。

## 版本

- **v1.0.0** 多列网格 + 滚轮横向翻页 + 冻结标签变灰
