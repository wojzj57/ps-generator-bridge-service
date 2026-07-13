# `@ps-generator-bridge/cli`

PS Generator Bridge 的命令行工具。CLI 可以安装最小 Photoshop Generator 运行时，在 Windows 上配置本机 Photoshop，也可以运行 Windows-only 的 `generator-core` 冒烟验证工具。

Online documentation:

- English: https://wojzj57.github.io/ps-generator-bridge-service/generator/photoshop-setup
- Chinese: https://wojzj57.github.io/ps-generator-bridge-service/zh/generator/photoshop-setup

## 安装

可以不把 CLI 安装到项目里，直接运行已发布的 CLI：

```bash
pnpm dlx @ps-generator-bridge/cli setup
pnpm dlx @ps-generator-bridge/cli setup-photoshop
```

本地开发时再安装为 dev dependency：

```bash
npm install -D @ps-generator-bridge/cli
```

在本 monorepo 中开发：

```bash
pnpm --filter @ps-generator-bridge/cli build
pnpm --filter @ps-generator-bridge/cli typecheck
```

## 环境要求

- Node.js >=18
- `setup-photoshop`、`setup-generator-settings`、`run`、`dev` 需要 Windows。
- `setup` 和 `setup-photoshop` 需要可用的 npm，用于安装 generator 运行时依赖。
- `run` 和 `dev` 需要 Photoshop 已经运行，且已启用 Generator 和 Remote Connections；还需要 Git/npm 用于安装 Adobe `generator-core`。

## 命令

```bash
ps-generator-bridge setup [--dir <dir>]
ps-generator-bridge setup-photoshop [--version <year>] [--yes] [--password <value>]
ps-generator-bridge setup-generator-settings (--pref <path> | -pref <path>) [--password <value>]
ps-generator-bridge setup-core [--update]
ps-generator-bridge run (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge dev (--plugin <dir> | --plugins-dir <dir>) [--expect-plugin <id>] [--port <number>] [--timeout <ms>] [--update-core] [--password <value>]
ps-generator-bridge clean
```

### `setup`

默认把最小 generator runtime 安装到 `./generator-bridge`。可以用 `--dir` 指定其他位置。

```bash
ps-generator-bridge setup --dir D:\Tools\generator-bridge
```

安装后的 runtime 包含 `dist`、`jsx`、`node_modules`、`main.js`、`.env.example`、`CHANGELOG.md`、`package.json`、`README.md` 和 `README_zh.md`。

对本 CLI 已安装的 runtime 再次执行 `setup` 时，只会替换安装器管理的文件，并保留包内 `.env`、`logs/`、`plugins/` 及其他用户文件。对于非空且不属于已管理 runtime 的目录，`setup` 不会执行覆盖。

### `setup-photoshop`

从 Windows 注册表查找已安装的 Photoshop，让用户选择要配置的版本，把 generator runtime 安装到该 Photoshop 的插件目录，并原位修改当前用户已有的 `MachinePrefs.psp`。运行命令前必须完全关闭 Photoshop。

```bash
ps-generator-bridge setup-photoshop
ps-generator-bridge setup-photoshop --version 2025 --yes
ps-generator-bridge setup-photoshop --version 2025 --password custom12
```

插件安装位置：

```text
<Photoshop install dir>\Plug-ins\Generator\generator-bridge
```

更新本 CLI 已安装的 runtime 时，会保留包内 `.env`、`logs/`、`plugins/` 及其他用户文件。如果目标 `generator-bridge` 目录包含不受本 CLI 管理的文件，命令会先询问是否替换；`--yes` 表示无需询问即可授权替换。

命令会解析 `MachinePrefs.psp`，只修改 `generatorEnabled`、`srvE` 和 `srvK`：启用 Generator、启用远程连接，并设置本 CLI 连接 Adobe `generator-core` 时使用的远程连接密码。文件会先在内存中完成校验，再通过临时文件原子替换，不创建备份。如果 Photoshop 从未创建设置文件，runtime 仍会完成安装；请启动一次 Photoshop，完全退出后使用相同密码参数或环境变量重新执行。CLI 不会复制整份偏好模板覆盖用户设置。

### `setup-generator-settings`

只修改显式指定的 `MachinePrefs.psp`，不会发现 Photoshop、读取注册表或安装 generator runtime。运行前必须完全关闭 Photoshop。目标必须已经存在、必须是普通文件而不是符号链接，并且文件名必须是不区分大小写的 `MachinePrefs.psp`。

```bash
ps-generator-bridge setup-generator-settings --pref "C:\Users\me\AppData\Roaming\Adobe\Adobe Photoshop 2025\Adobe Photoshop 2025 Settings\MachinePrefs.psp"
ps-generator-bridge setup-generator-settings -pref "C:\settings\MachinePrefs.psp" --password custom12
```

该命令会原子地一次修改 `generatorEnabled`、`srvE` 和 `srvK`。它不会修改 `srvN`、插入缺失字段或创建备份。文件已经配置正确时，命令以成功状态退出且不写入。

### 远程连接密码

`setup-photoshop`、`setup-generator-settings`、`run` 和 `dev` 按以下顺序解析密码：

1. `--password <value>`
2. `PS_GENERATOR_REMOTE_PASSWORD`
3. `password`

密码必须包含 6–128 个可见、非空白 Unicode 字符，不能包含控制字符，也不能以 `--` 开头。CLI 不会记录密码；Adobe `generator-core` 通过进程参数 `-P` 接收密码，因此本机进程检查工具仍可能看到它。

### `setup-core`

克隆或更新 Adobe `generator-core`，并在该目录中执行 `npm install`。如果
`node_modules` 已存在则跳过安装；传入 `--update` 会拉取最新代码并强制重新安装。

在 pnpm workspace 内运行时，`generator-core` 存放在：

```text
<workspace-root>/generator-core
```

不在 pnpm workspace 内运行时，回退到稳定的用户缓存目录：

- Windows：`%LOCALAPPDATA%\ps-generator-bridge\generator-core`
- macOS：`~/Library/Caches/ps-generator-bridge/generator-core`
- Linux：`$XDG_CACHE_HOME/ps-generator-bridge/generator-core`（未设置时使用 `~/.cache`）

### `run`

启动 `generator-core`，等待 `GET /health`，校验 `GET /plugins`，执行 SDK `getServerInfo` 冒烟调用，打印结果后退出。

```bash
ps-generator-bridge run --plugin ./my-plugin --expect-plugin myPlugin --password custom12
```

### `dev`

启动相同的 harness，但保持 `generator-core` 运行直到手动中断。

```bash
$env:PS_GENERATOR_REMOTE_PASSWORD="custom12"
ps-generator-bridge dev --plugins-dir ./plugins --port 7700
```

### `clean`

删除用户缓存目录中的 `generator-core` clone。在 pnpm workspace 内运行时不会删除
由 `pnpm setup` 管理的 workspace 副本。

```bash
ps-generator-bridge clean
```

## 插件输入

必须且只能使用其中一种：

- `--plugin <dir>`：单个插件包目录
- `--plugins-dir <dir>`：直接子目录均为插件包的目录

`--expect-plugin <id>` 可以重复传入。如果 `/plugins` 中缺少任何期望 id，harness 会失败。

## Harness 验证内容

1. Photoshop 正在运行。
2. `generator-core` 已安装并能启动。
3. generator 包能被 `generator-core` 加载。
4. bridge 服务进入 healthy 状态。
5. 已加载插件数量与候选插件目录数量一致。
6. 期望插件 id 均存在。
7. SDK 能通过 WebSocket 连接并调用 `getServerInfo`。

## 限制

该 CLI 不暴露可 import 的公共 API。当前冒烟验证工具不是完整集成测试框架，不会驱动 Photoshop 文档，也不会断言插件自己的 UI 或业务流程。确定性逻辑应使用 package 单元测试；该 CLI 用于验证真实 Photoshop 启动链路。
