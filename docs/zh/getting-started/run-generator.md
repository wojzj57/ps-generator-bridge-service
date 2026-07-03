# 运行 Generator

`@ps-generator-bridge/generator` 由 Adobe `generator-core` 加载。它会注册 Photoshop 菜单项，启动本地 Fastify HTTP/WebSocket 服务，加载可选插件，并注册内置协议方法。

## 设置 generator-core

在仓库中执行：

```bash
pnpm setup
pnpm --filter @ps-generator-bridge/generator build
```

`pnpm setup` 会准备 `./generator-core`。generator 包通过 CommonJS `main.js` 入口被 generator-core 加载。

## 运行时默认值

- Host：`127.0.0.1`
- 端口：`7700`
- Root WebSocket 端点：`ws://127.0.0.1:7700/ws`
- 插件 WebSocket 端点：`ws://127.0.0.1:7700/ws/{pluginId}`

## 健康检查

服务运行后：

```bash
curl http://127.0.0.1:7700/health
```

期望响应：

```json
{ "status": "ok" }
```

## 插件发现

```bash
curl http://127.0.0.1:7700/plugins
```

响应形状：

```json
{ "plugins": [{ "id": "paint" }] }
```

## 配置

嵌入 generator 时，结构化运行参数通过 `PluginConfig` 传入。部署覆盖项和密钥使用环境变量。

参见 [配置](../generator/configuration.md) 和 [环境变量](../reference/environment.md)。
