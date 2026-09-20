# 发布到插件市场

结论先说：**上架 = 在 awesome-dsh-plugin 开一个 PR，只加一个 YAML 文件。** 插件市场（dsh-market）不自己收录，
它每次打开都去 `https://awesome-dsh-plugin.com/plugins.json` 拉列表；那个列表由
[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 生成。

所以你需要三样东西：一个公开 GitHub 仓库、一天的等待（CI 检查仓库年龄）、一个 PR。

---

## 第 0 步：把 `AMC-tp` 换成你的 GitHub 用户名

出现在三处：

- `package.json` → `repository.url` / `homepage` / `bugs.url`
- `LICENSE` → 版权行
- `submission.yml` → `url` 和 `name`

一条命令全换掉：

```powershell
cd D:\Agent_project\dsh\plugins\dsh-work-buddy
$owner = '你的GitHub用户名'
Get-ChildItem package.json,LICENSE,submission.yml | ForEach-Object {
  (Get-Content $_ -Raw).Replace('AMC-tp', $owner) | Set-Content $_ -NoNewline -Encoding utf8
}
```

## 第 1 步：推上 GitHub

```powershell
cd D:\Agent_project\dsh\plugins\dsh-work-buddy
git init -b main
git add .
git commit -m "dsh-work-buddy 1.0.0: pixel desk buddy overlay for the DSH Web GUI"
git remote add origin https://github.com/AMC-tp/dsh-work-buddy.git
git push -u origin main
```

推完在仓库页面上加一个 topic：**`dsh-plugin`**（收录硬性要求）。

## 第 2 步（推荐）：发到 npm

不是必须的 —— 本插件没有构建步骤，`lib/` 已经预构建好并提交进仓库，所以从 GitHub 源码装也能直接用。
但发了 npm 安装更快、体验更好。包名 `dsh-work-buddy` 目前**在 npm 上没人占**。

```powershell
npm publish
```

`package.json` 里已经没有 `private: true`，`files` 限定只发这 6 个文件：

```
LICENSE  README.md  cordis.patch.yml  lib/client.js  lib/index.js  package.json
```

## 第 3 步：等仓库满 1 天，再开 PR

CI 会检查仓库**创建满 1 天**。刚建好就提会被自动打回 —— 这不是评价插件，只是过滤「PR 前几分钟才建仓」。
等一天，顺便把功能再打磨打磨。

然后：

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`
2. 新建 `data/plugins/AMC-tp__dsh-work-buddy.yml`，内容就是本目录的 `submission.yml`
3. 开 PR，**只动你这一条**（README 是脚本生成的，别手改）
4. 合并后网站自动重建，通常一天内市场里就能搜到

## 收录规则对照表（本插件已满足）

| 要求 | 本插件 |
| --- | --- |
| `package.json` 声明 `dsh.bundle` | ✅ `{"bundle":{"patch":"./cordis.patch.yml"}}` |
| 仓库根有 `cordis.patch.yml` | ✅ 插入了 `dsh-work-buddy` 一行 |
| 真实可用的代码 | ✅ 手写 15 KB 浏览器端插件，无占位 |
| 仓库带 `dsh-plugin` topic | ⚠️ 需要你加 |
| 仓库创建满 1 天 | ⚠️ 需要等 |
| 描述属实、无营销词 | ✅ 描述里的四个状态与两个计数都能在 `lib/client.js` 里数出来 |
| 分类贴合 | ✅ `fun` |
| 官方 `@deepseek-ai/*` 用 `peerDependencies` | ✅ 本插件**没有**任何 peer 依赖，绕开了那个「预发布范围静默不匹配」的坑 |

## 想先自己看到效果，不等 PR 合并

直接按源码装（走 GitHub，不需要 npm、不需要市场）：

```powershell
dsh plugin --profile web add github:AMC-tp/dsh-work-buddy
```

想在自己市场里预览那一行长什么样，可以让 dsh 指向你自己的镜像：

```powershell
$env:DSHM_REGISTRY_URL = 'http://127.0.0.1:8080/plugins.json'
dsh web
```

镜像只要提供同样形状的 `plugins.json`（顶层 `{name,url,source,updated,count,categories,plugins}`，
`plugins` 里每条含 `name/owner/url/category/description{en,zh}/npm/version/install`）。用
`python -m http.server 8080` 在放着该文件的目录里起个静态服务就行。

## 常见被拒原因（避开）

- **只声明了 `dsh.client`、没声明 `dsh.bundle`** —— 这是最常见的打回原因。本插件两个都有。
- 描述夸大：写「10 个工具」就得真有 10 个工具。本插件描述只说了四态 + 两个计数。
- 描述里出现 `: `（冒号加空格）会破坏 YAML —— 本插件的英文描述已用单引号包住。
- 一个 PR 最多 3 条。