# Photoshop 设置

真实 Photoshop 运行使用 Adobe `generator-core`。仓库 setup 脚本会把它克隆到本地 gitignored 目录。

```bash
pnpm setup
```

## Photoshop 要求

- 已安装 Photoshop。
- 已启用 Generator。
- 已启用 Remote Connections。
- 通过 generator-core 加载前，generator 包需要先完成构建。

## 安装到 Photoshop

普通用户不需要 clone 本仓库，可以直接把已发布的 generator runtime 安装到本机 Photoshop：

```bash
pnpm dlx @ps-generator-bridge/cli setup-photoshop
```

运行前必须完全关闭 Photoshop。该命令会从 Windows 注册表发现已安装版本，让用户选择要配置的版本，并把插件安装到 `<Photoshop install dir>\Plug-ins\Generator\generator-bridge`。随后解析当前用户已有的 `MachinePrefs.psp`，启用 Generator 和远程连接，并配置远程连接密码。命令只修改 `generatorEnabled`、`srvE` 和 `srvK`，通过临时文件原子替换且不创建备份。如果设置文件尚不存在，runtime 仍会完成安装；请启动一次 Photoshop，完全退出后使用相同密码参数或环境变量重新运行命令。

更新已管理 runtime 时会保留 `.env`、日志、插件及其他用户文件；替换不受管理的目标目录需要交互确认或传入 `--yes`。设置完成后需要重启 Photoshop。

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

generator 包通过 CommonJS `main.js` 入口加载。导出的 `init(generator, config)` 会构造 `PsBridgeHost`、注册菜单项、加载插件、注册模块、初始化 JSX polyfill，并启动服务。

## 冒烟测试工具

在 Windows 上使用 `@ps-generator-bridge/cli` 验证真实 Photoshop 启动路径：

```bash
ps-generator-bridge setup-core
ps-generator-bridge run --plugin ./my-plugin --expect-plugin myPlugin
```

该工具会等待 `/health`，检查 `/plugins`，并执行一次 SDK `getServerInfo` 调用。
