# Zen 标签页网格 + 滚轮横向翻页（zen-tab-grid）

把 Zen 浏览器左侧标签栏变成**多列网格**：标签先自上而下填满一列，满了自动开新列；滚轮在标签栏上**直接左右翻页**（不再是上下滚）；并且**已冻结（不在内存里）的标签会明显变灰**。

在 **Zen Browser 1.22.3b / Windows 11** 上实测。

## 安装

1. **完全退出 Zen**（菜单 → 退出，不是关窗口）
2. 右键 `install.bat` → **以管理员身份运行**
3. 重新打开 Zen

安装器会自动定位你的 Zen 安装目录和配置目录（读 `profiles.ini`），不需要填任何路径。

不想改二进制的话用 `powershell -File install.ps1 -NoPatch` —— 网格布局和冻结变灰照常生效，只有"普通滚轮左右翻"会失效（那一项需要加载器）。

## 它会改你机器上的什么

| 位置 | 改动 | 撤销方式 |
| --- | --- | --- |
| `<配置目录>\chrome\userChrome.css` | 新增（网格 + 变灰样式） | 删除该文件 |
| `<配置目录>\chrome\userChrome.js` | 新增（滚轮 + 冻结标记） | 删除该文件 |
| `<配置目录>\user.js` | 追加一行开关（否则 userChrome.css 不加载） | 删掉那两行 |
| `<安装目录>\browser\omni.ja` | 在 `browser-main.js` 末尾追加十几行加载器；原文件先备份为 `omni.ja.bak` | 右键 `uninstall.bat` → 管理员运行 |

不含任何联网上报，运行期只读本地文件。

## 调参数

改 `<配置目录>\chrome\userChrome.css` 顶部，重启 Zen 生效：

```css
:root {
  --uc-grid-rows: auto-fill;  /* 一列几行。auto-fill=按侧栏高度自动铺满；也可写数字如 8 */
  --uc-grid-columns: 2;       /* 每排几列 */
  --uc-tab-h: 36px;           /* 单个标签高度 */
  --uc-grid-gap: 4px;         /* 标签间距 */
}
```

改滚轮手感：`<配置目录>\chrome\userChrome.js` 里

```js
const PX_PER_LINE = 16;   // 一格滚轮 ≈ 48px；调小更细腻，调大更快
```

改变灰程度：`userChrome.css` 末尾的 `opacity` 数字（想加 ❄ 标记就取消那段注释）。

## 更新

右键 `update.bat`。它会从本仓库拉最新文件并重装 CSS/JS；如果检测到 Zen 刚自动更新过（二进制补丁被覆盖），会提示你再跑一次 `install.bat`（那步需要管理员）。

## 原理（为什么普通 CSS 做不到，以及为什么之前一堆方案失效）

1. **Zen 1.22 的工作区机制把标签搬走了。** 官方 CSS 针对的 `#tabbrowser-arrowscrollbox` 已经不是标签的父级；标签实际在 `zen-workspace` 内部的 `.zen-workspace-normal-tabs-section` 里。网上针对旧结构写的 userChrome.css 全部无效。
2. **userChrome.css 不能用 `::part()` 穿透 shadow DOM**（Firefox 禁止用户级样式表穿透），所以任何要改 arrowscrollbox 内部滚动的方案都不可行。本方案完全基于 light DOM。
3. **空网格也会占位。** `grid-template-rows: repeat(8, 36px)` 的 8 条显式轨道即使格子里没东西也会实体化。所以固定标签区不做网格化，普通标签区也加了 `:has(> .tabbrowser-tab)` 守卫，否则顶部会出现一大片空白。
4. **普通滚轮无法用 CSS 变成横向。** 浏览器按物理方向派发滚轮增量，纵向增量只会找纵向可滚容器；而 Zen 的模组系统是纯 CSS（`ZenMods.mjs` 只有 Stylesheet service），扩展也进不了 `browser.xhtml`。所以这里给 `omni.ja` 加了一个极小加载器，让 Zen 启动时用 `loadSubScript` 读配置目录里的 `userChrome.js`，由它把滚轮增量直接写成 `scrollLeft +=`（零动画，所以跟手）。
5. **冻结的标签原本没有任何可视标记。** Firefox 只在**强制**卸载时才打 `discarded` 属性（`if (aForceDiscard) tab.toggleAttribute("discarded", true)`），而扩展的 `tabs.discard()` 走的是不传 force 的路径 —— 冻结其实成功了（`<browser>` 元素确实被销毁），但标签上没有任何属性可挂样式。现在由 `userChrome.js` 自己识别"browser 未连上文档"的标签并打 `tb-frozen`。

## 已知限制

- **Zen 自动更新会覆盖 `omni.ja`**，表现为"滚轮又变成上下滚"。重跑 `install.bat` 即可（幂等，只补那一处，不会把 omni.ja 别的内容回退）。
- 标签**拖拽排序**在网格下按网格位置落点，跨列拖拽偶尔要两次。
- 「新建标签页」按钮本身是标签区的子元素，会占掉第一个格子。
- 会话恢复后还没点开过的标签也会显示为灰 —— 它们本来就不在内存里，属正常。
- 需要 `browser.tabs.discard()` 能正常工作的环境（Zen 1.22.x 实测可以）。

## 版本

- 1.0.0 首发：网格布局 + 滚轮横向翻页 + 冻结可视化
