# dsh-work-buddy

DSH Web GUI 右下角的像素小人悬浮窗：闲时摸鱼、有活在干时思考／敲代码、回合结束撒花，并记录累计完成数与当日完成数。

## 四个状态

| 状态 | 小人 | 触发条件（读取页面上已有的语义信号） |
| --- | --- | --- |
| 摸鱼中 | 手枕着头，脚边一条鱼，头顶飘 z | 页面上没有运行中的工具、也没有流式输出 |
| 思考中 | 一手托腮，右上角冒出思考气泡 | `[data-streaming]` 存在（token 正在流式输出） |
| 写代码 | 面前一台笔记本，双手在键盘上交替 | `[data-tool][data-state="running"]` 存在（工具调用在飞） |
| 完成！撒花 | 双臂举起，满屏彩纸 | 从忙碌回到空闲（忙够 0.9 秒才算一次） |

计数存在浏览器 `localStorage` 的 `dsh-work-buddy/stats/v1`：`{ total, days: { "YYYY-MM-DD": n } }`。
点小人展开面板可以看到累计完成、当日完成和最近 7 天的小柱状图，面板里可以重置计数。

## 为什么状态检测不会轻易坏掉

小人不去碰 React 内部状态，只读聊天界面已经公开在 DOM 上的两个语义信号
（`data-tool` / `data-state` / `data-streaming`）。上游改样式类名不影响它；
属性契约变了才需要跟着改，改法只有 `lib/client.js` 里的 `probe()` 一个函数。

## 结构

- `lib/index.js` —— host 半区，故意留空（小人纯粹是浏览器端的东西）。
- `lib/client.js` —— 浏览器半区，手写的 `window.__ModuleLoader__.load({...})` 工厂，无构建步骤、无第三方依赖。
- `cordis.patch.yml` —— 往 profile 里插一行插件。

## 安装

```sh
dsh plugin --profile web add link:D:\Agent_project\dsh\plugins\dsh-work-buddy
```

然后重启 `dsh web`。装完右下角就会出现小人。

## 卸载

```sh
dsh plugin --profile web remove dsh-work-buddy
```