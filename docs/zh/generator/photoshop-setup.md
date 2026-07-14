# Photoshop 设置

真实 Photoshop 运行使用 Adobe `generator-core`。仓库 setup 脚本会在 CLI 共用的用户级缓存中准备 core 和 npm 上最新的 generator runtime。

```bash
pnpm setup
```

## Photoshop 要求

- 已安装 Photoshop。
- 已启用 Generator。
- 已启用 Remote Connections。
- CLI 统一缓存中已有可用的已发布 generator runtime。

## 安装到 Photoshop

普通用户不需要 clone 本仓库，可以直接把已发布的 generator runtime 安装到本机 Photoshop：

```bash
pnpm dlx @ps-generator-bridge/cli setup-photoshop
```

运行前必须完全关闭 Photoshop。该命令会从 Windows 注册表发现已安装版本，让用户选择要配置的版本，并把插件安装到 `<Photoshop install dir>\Plug-ins\Generator\generator-bridge`。随后解析当前用户已有的 `MachinePrefs.psp`，启用 Generator 和远程连接，并配置远程连接密码。命令只修改 `generatorEnabled`、`srvE` 和 `srvK`，通过临时文件原子替换且不创建备份。如果设置文件尚不存在，runtime 仍会完成安装；请启动一次 Photoshop，完全退出后使用相同密码参数或环境变量重新运行命令。

更新已管理 runtime 时会保留 `.env`、日志、插件及其他用户文件；替换不受管理的目标目录需要交互确认或传入 `--yes`。设置完成后需要重启 Photoshop。

CLI 与 runtime 独立版本。`setup` 和 `setup-photoshop` 每次执行都会解析 npm 的 `latest` runtime，并与 `run`、`dev` 共用用户级 runtime 缓存；有效缓存可在离线时回退使用。`--runtime-version <version-or-tag>` 可固定或回退版本。Adobe `generator-core` 单独缓存，只会在 `setup-core --update` 或 `run`/`dev --update-core` 时更新。

## 配置指定的偏好文件

已知 `MachinePrefs.psp` 路径时，可以使用独立设置命令：

```bash
ps-generator-bridge setup-generator-settings --pref "C:\path\to\MachinePrefs.psp"
ps-generator-bridge setup-generator-settings -pref "C:\path\to\MachinePrefs.psp" --password custom12
```

该命令不会发现 Photoshop、访问注册表或安装 runtime。Photoshop 必须完全关闭。路径必须指向已存在的普通文件，文件名必须是不区分大小写的 `MachinePrefs.psp`，并且不能是符号链接。命令一次修改 `generatorEnabled`、`srvE` 和 `srvK`，不会修改 `srvN`、插入缺失字段或创建备份。

`setup-photoshop`、`setup-generator-settings`、`run` 和 `dev` 依次使用 `--password`、`PS_GENERATOR_REMOTE_PASSWORD` 和默认值 `password`。密码必须包含 6–128 个可见、非空白 Unicode 字符，不能包含控制字符，也不能以 `--` 开头。CLI 不会输出密码，但 `generator-core` 会通过本机进程参数 `-P` 接收密码。

## 本地开发流程

```bash
pnpm install
pnpm setup
pnpm --filter @ps-generator-bridge/generator build
```

本地 package 构建用于类型检查和单元测试。CLI `run` / `dev` 会从统一缓存加载所选的已发布 runtime，而不会加载 workspace 构建。该 runtime 通过 CommonJS `main.js` 入口加载；导出的 `init(generator, config)` 会构造 `PsBridgeHost`、注册菜单项、加载插件、注册模块、初始化 JSX polyfill，并启动服务。

## 冒烟测试工具

在 Windows 上使用 `@ps-generator-bridge/cli` 验证真实 Photoshop 启动路径：

```bash
ps-generator-bridge setup-core
ps-generator-bridge run --plugin ./my-plugin
```

该工具会等待 `/health`，检查 `/plugins`，并执行一次 SDK `getServerInfo` 调用。可在插件项目中使用 `--plugin-cwd`，或用 `--plugins-dir` 直接传入插件集合。CLI 每次运行都会检查 npm `latest`；`--runtime-version` 可固定版本或 tag。
