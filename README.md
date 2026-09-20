# dsh-work-buddy

DSH Web GUI 右下角的高密度像素小人 —— 同时是一本**产出账本**。
闲时摸鱼、干活时思考／敲代码、等你做选择时举手发文号、回合结束撒花，并把**完成数、Token 消耗、估算费用**记成账，按今日 / 本周 / 本月 / 年度汇总。

## 五个状态

| 状态 | 小人 | 触发条件（只读页面已公开的语义信号） |
| --- | --- | --- |
| 摸鱼中 | 手枕着头，脚边一条鱼，头顶飘 z | 没有运行中的工具、也没有流式输出 |
| 思考中 | 一手托腮，右上角冒思考气泡 | `[data-streaming]` 存在 |
| 写代码 | 面前一台笔记本，双手在键盘上交替 | `[data-tool][data-state="running"]` 存在 |
| 等你选择 | 双臂举起 + 粉色问号气泡（闪烁） | `ctx.uiSession.pendingInteractions` 非空 |
| 完成！撒花 | 双臂举起，满屏彩纸 | 从忙碌回到空闲（忙够 0.9 秒才算一次） |

鼠标移上去显示当前状态文字；点小人展开账本。

## 账本

点击后面板第一行是**今日**的三项：

```
完成 12      Token 3.42M      费用 $1.07
```

Token 数字很大，所以以**百万（M）**为单位显示。第二行是**本周**同样的三项，点「展开 本月 / 年度」再多出两行和计价模型选择。

- **完成数**：由状态机自己数（`MIN_BUSY_MS` 防抖，回到空闲连续 3 个采样才记账）。
- **Token**：来自会话的持久化计费投影
  `binding.session.projections.faceOf('tokenUsage')`，四个桶
  `uncachedInputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `outputTokens`。
  我们记录的是**增量**：每个会话记住上次读到的值，只把新增部分记进当天的账，所以同一天跨会话切换也不会重复计。
- **费用**：按官方 DeepSeek 价目表（USD / 百万 token）估算，含高峰/非高峰两档：

  | 模型 | 非高峰 (input / cacheRead / output) | 高峰 |
  | --- | --- | --- |
  | `deepseek-v4-flash` | 0.22 / 0.007 / 0.66 | 0.44 / 0.014 / 1.32 |
  | `deepseek-v4-pro` | 0.66 / 0.022 / 1.98 | 1.32 / 0.044 / 3.96 |

  高峰窗口是 Asia/Shanghai 周一至周五 09:00–12:00 与 14:00–18:00。

  ⚠️ **这是估算，不是账单。** 计价档位取的是「增量落账那一刻」的时间，而不是每次请求自己的时间戳——投影只带 turn/step，不带时间。持续工作时两者几乎一致，但批量补账会有偏差。要精确对账请用 `@ychris12138/dsh-usage-stats`。

所有数据存在浏览器 `localStorage` 的 `dsh-work-buddy/ledger/v2`，卸载插件不删账本；面板里的「清零」只清账本、保留结算基线。

## 结构

- `lib/index.js` —— host 半区，故意留空（这是纯浏览器端插件，但 loader 需要一行才能挂载）。
- `lib/client.js` —— 浏览器半区，手写的 `window.__ModuleLoader__.load({...})` 工厂，**无构建步骤、无第三方依赖**，只 `get` 官方客户端服务，不 `require` 任何外部模块。
- `cordis.patch.yml` —— 往 profile 里插一行插件。

## 安装

```sh
dsh plugin --profile web add github:AMC-tp/dsh-work-buddy
```

或本地目录：

```powershell
dsh plugin --profile web add link:D:\path\to\dsh-work-buddy
```

装完重启 `dsh web`。

## 卸载

```sh
dsh plugin --profile web remove dsh-work-buddy
```