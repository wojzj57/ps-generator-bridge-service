# `@ps-generator-bridge/cli`

用于安装 Photoshop Generator runtime、配置 Windows Photoshop，并运行真实 Photoshop + `generator-core` 冒烟验证的命令行工具。

在线文档：

- English: https://wojzj57.github.io/ps-generator-bridge-service/generator/photoshop-setup
- 中文：https://wojzj57.github.io/ps-generator-bridge-service/zh/generator/photoshop-setup

## 环境要求

- Node.js >=18
- `setup-photoshop`、`setup-generator-settings`、`run`、`dev` 需要 Windows
- 首次安装和后续更新 generator runtime 需要 npm；完整缓存支持离线回退
- 首次创建或显式更新 `generator-core` 缓存需要 Git 和 npm
- `run` 和 `dev` 需要 Photoshop 已运行，并启用 Generator 与 Remote Connections

## 命令

```text
ps-generator-bridge setup [--dir <dir>] [--runtime-version <version-or-tag>]
ps-generator-bridge setup-photoshop [--version <year>] [--yes] [--password <value>] [--runtime-version <version-or-tag>]
ps-generator-bridge setup-generator-settings (--pref <path> | -pref <path>) [--password <value>]
ps-generator-bridge setup-core [--update]
ps-generator-bridge run (--plugin <dir> | --plugin-cwd | --plugins-dir <dir>) [--runtime-version <version-or-tag>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge dev (--plugin <dir> | --plugin-cwd | --plugins-dir <dir>) [--runtime-version <version-or-tag>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge clean
```

所有使用共享缓存的命令都会串行执行。已有命令占用缓存时，新命令会报告其 PID 和命令；已终止进程留下的锁会自动回收。

## 统一缓存

已发布 CLI 与仓库的 `pnpm setup` 共用一份用户级缓存：

| 平台    | 根目录                                                         |
| ------- | -------------------------------------------------------------- |
| Windows | `%LOCALAPPDATA%\ps-generator-bridge`                           |
| macOS   | `~/Library/Caches/ps-generator-bridge`                         |
| Linux   | `$XDG_CACHE_HOME/ps-generator-bridge`，未设置时使用 `~/.cache` |

目录结构：

```text
ps-generator-bridge/
├── generator-core/
├── generator-runtime/
│   └── node_modules/@ps-generator-bridge/generator/
└── plugins/
```

旧的 `<workspace-root>/generator-core` 会被忽略，CLI 不会自动移动或删除它。

### Runtime 版本

CLI 与 generator runtime 独立版本。`setup`、`setup-photoshop`、`run`、`dev` 每次执行都会查询 npm 的 `latest` dist-tag；只有解析出的版本发生变化时才更新共享 runtime。新版本先在临时目录安装和校验，成功后才替换当前缓存。有效 runtime 必须是独立的 Windows x64 包，不能包含未解析的 runtime 依赖，并且必须带有完整的包内私有 sharp vendor payload；旧式依赖型缓存会被拒绝。

npm 不可用时，命令会警告并使用完整的已有缓存；首次安装且无缓存时失败。更新失败会保留上一版。可用 `--runtime-version <version-or-tag>` 固定或回退版本；显式指定的版本不会被其他缓存版本替代。

### `generator-core`

`setup-core` 在统一目录创建 core checkout。只有 `.git`、`app.js`、`package.json` 和 `node_modules` 都存在时才会完全离线复用。`--update` 会拉取并重新安装；`run` / `dev` 使用 `--update-core` 执行相同行为。

启动前会校验 runtime 的 `generator-core-version` 范围。不兼容时停止启动并提示使用 `--update-core`，不会静默更新 core。

## 安装 Runtime

`setup` 默认把所选 runtime 安装到 `./generator-bridge`，可用 `--dir` 指定其他目录：

```powershell
ps-generator-bridge setup --dir D:\Tools\generator-bridge
ps-generator-bridge setup --dir D:\Tools\generator-bridge --runtime-version 0.6.0
```

再次安装时只替换安装器管理的文件，保留 `.env`、`logs/`、`plugins/` 和其他用户文件；不会覆盖非空且不受管理的目录。

`setup-photoshop` 会发现已安装的 Photoshop，把 runtime 安装到 `<Photoshop install dir>\Plug-ins\Generator\generator-bridge`，并修改当前用户已有的 `MachinePrefs.psp`。运行前必须关闭 Photoshop；替换不受管理的目标需要交互确认或 `--yes`。

```powershell
ps-generator-bridge setup-photoshop --version 2025 --yes
ps-generator-bridge setup-photoshop --version 2025 --runtime-version latest
```

`setup-generator-settings` 只修改显式指定且已存在的设置文件中的 `generatorEnabled`、`srvE`、`srvK`，不会发现 Photoshop 或安装 runtime。

## Remote Connections 密码

`setup-photoshop`、`setup-generator-settings`、`run`、`dev` 按以下顺序取值：

1. `--password <value>`
2. `PS_GENERATOR_REMOTE_PASSWORD`
3. `password`

密码必须包含 6–128 个可见、非空白 Unicode 字符，不能含控制字符，也不能以 `--` 开头。CLI 不记录密码，但 `generator-core` 会通过本机进程参数 `-P` 接收密码。

## Run 与 Dev

`run` 启动 `generator-core`，验证健康检查和插件发现，执行 SDK `getServerInfo` 冒烟调用，打印结果后退出。`dev` 执行相同检查并保持进程运行，直到手动中断。

插件来源必须三选一：

- `--plugin <dir>`：把单个插件包链接进受管理快照
- `--plugin-cwd`：等价于 `--plugin <当前工作目录>`
- `--plugins-dir <dir>`：直接传入现有插件集合目录，不修改其内容

Windows 的单插件来源使用目录 junction。快照在启动时重建，正常退出时删除链接；所有权标记防止 CLI 清理人工目录。禁止把受管理快照目录自身或其子目录作为插件来源。

```powershell
ps-generator-bridge run --plugin .\my-plugin --password custom12
Set-Location .\my-plugin
ps-generator-bridge dev --plugin-cwd --port 7700
ps-generator-bridge dev --plugins-dir D:\plugins --runtime-version 0.6.0
```

Harness 会校验宿主至少加载了所选来源和 `PS_BRIDGE_PLUGINS` 中已知的不同候选数量；
允许宿主额外加载其他已配置插件。旧的 `--expect-plugin` 参数已移除。

## Clean

`clean` 删除整个 CLI 管理的缓存根目录，包括 core、runtime、插件快照和遗留安装临时文件。其他共享缓存命令运行时会拒绝清理，也不会触碰旧 workspace checkout。

该包不暴露可 import 的公共 API。冒烟工具用于验证真实 Photoshop 启动链路，不是完整的 Photoshop 工作流自动化框架。
