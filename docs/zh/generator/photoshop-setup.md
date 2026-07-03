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
