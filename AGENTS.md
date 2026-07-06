# PS Generator Bridge Service - AI Agent 导航图

> 渐进式披露入口。先读此图，再按任务类型跳转到对应深度文档。

## 项目一句话

PS Generator Bridge Service 是一个 Photoshop Generator monorepo：`generator` 插件运行在 Photoshop
内置 Node runtime 中并拥有 WebSocket server；`sdk` 是同构客户端，也是协议契约的真相源。

---

## 按任务快速导航

| 你的任务                        | 先去这里                                                | 说明                                                                 |
| ------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| **了解整体术语与边界**          | `CONTEXT.md`                                            | Ubiquitous language，先统一 server / plugin / module / protocol 等词 |
| **改协议或新增能力**            | `packages/sdk/src/protocol/`                            | `ProtocolMethods` 是服务能力的 source of truth                       |
| **改 Photoshop Generator host** | `packages/generator/` + `packages/generator/TESTING.md` | Generator 插件、Fastify/WebSocket server、模块、插件加载与测试边界   |
| **改 SDK client**               | `packages/sdk/`                                         | 保持 browser-safe / Node-free；不要把 server 类型泄漏进 SDK root     |
| **改 CLI / smoke harness**      | `packages/cli/`                                         | Windows Photoshop + `generator-core` smoke 工具                      |
| **写公开文档**                  | `docs/` + package README                                | GitHub 与 GitHub Pages 的公共文档来源                                |
| **查包导出边界**                | `docs/reference/package-exports.md`                     | SDK root、SDK plugin subpath、generator CJS 入口的公开面             |

---

## 30 秒项目速览

- **包管理器**：`pnpm` workspace。
- **核心命令**：`pnpm build`、`pnpm typecheck`、`pnpm test`。
- **真实 PS 运行准备**：`pnpm setup` 会 clone Adobe `generator-core` 到 `./generator-core`。
- **协议真相源**：新增服务能力先改 `packages/sdk/src/protocol/`，再实现 generator server。
- **SDK root 约束**：`@ps-generator-bridge/sdk` 必须保持 browser-safe，不引入 Node/server/Fastify/COS SDK 类型或 runtime。
- **插件开发面**：外部子插件使用 `@ps-generator-bridge/sdk/plugin`。
- **测试策略**：TypeScript unit tests 通过 seam 注入（`FakeGenerator`、`FakeTransport`），不需要真实 Photoshop。

---

## 包结构地图

```
├── packages/
│   ├── sdk/         @ps-generator-bridge/sdk，同构客户端 + 协议契约
│   ├── generator/   @ps-generator-bridge/generator，Photoshop Generator 插件 + WS 服务
│   └── cli/         @ps-generator-bridge/cli，Windows PS + generator-core smoke harness
├── docs/            公开 VitePress 文档
├── CONTEXT.md       术语表 / ubiquitous language
├── generator-core/  本地 clone 的 Adobe generator-core（gitignored）
└── notes/           本地私有开发笔记（gitignored，默认不要读取）
```

---

## 关键约定速查（不可违背）

1. **Protocol 是 source of truth**：新增 server capability 必须先建模到 `packages/sdk/src/protocol/` 的 `ProtocolMethods`，再实现 server。
2. **SDK root 保持 Node-free / browser-safe**：不要把 Fastify、`ws`、COS SDK、generator-core、server concrete types 泄漏到 `packages/sdk` root。
3. **`@ps-generator-bridge/sdk/plugin` 是插件作者入口**：`BasePlugin`、decorators、plugin authoring runtime、plugin-only helpers 都从这里导出。
4. **跨 bundle handshake 不能乱改**：`Symbol.for("ps-generator-bridge.*")` keys 是外部插件互操作契约，改名会破坏跨 bundle 行为。
5. **generator 只 type-only 依赖 SDK 协议契约**：运行时代码可以经 tsup alias 内联 SDK source，但不要制造发布后 runtime 循环依赖。
6. **Config vs env 分层**：secrets 和部署旋钮走 `PS_BRIDGE_*` env vars；结构化运行参数（如 `port`、`pluginsDir`）走 `PluginConfig`，env 只做 override。
7. **测试不依赖真实 Photoshop**：unit tests 使用 `FakeGenerator`、`FakeTransport` 和注入 seam；真实 Photoshop 只属于 smoke harness 范围。
8. **不要默认读取 `notes/`**：`notes/` 是本地私有知识库，除非用户明确要求，否则 agent 不得读取或依赖。

---

## Logger 规范

Logger 只从 `@ps-generator-bridge/sdk/plugin` 使用。模块内统一顶层创建 `log`：

```ts
import { useLogger } from "@ps-generator-bridge/sdk/plugin";

const log = useLogger("selection");

log.warn("selection event registration failed", error);
```

不要混用 `logger`、`console.*`、`this.plugin.logger`。name 用短小稳定的领域名，如 `selection`、`image`、`plugin-loader`。

---

## 文档边界

- `docs/` 是 GitHub 和 GitHub Pages 的公共文档来源。
- `notes/` 是本地私有开发知识库，gitignored；默认不要读，也不要作为公共文档依据。
- 公共文档必须基于 repository source、tests、package README、公开 docs 和用户提供的需求，而不是私有 notes。

---

## 包速查

| Package              | npm                              | Role                                                                       |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `packages/sdk`       | `@ps-generator-bridge/sdk`       | Isomorphic client + protocol contract。零 PS/Node coupling，browser-safe。 |
| `packages/generator` | `@ps-generator-bridge/generator` | In-PS Generator plugin + WebSocket service，由 `generator-core` 加载。     |
| `packages/cli`       | `@ps-generator-bridge/cli`       | 命令行工具，包括 Windows PS + `generator-core` smoke harness。             |

---

## 常用命令

```bash
pnpm install
pnpm setup
pnpm build
pnpm typecheck
pnpm test
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

---

## 深度文档

- `docs/README.md` - 公共文档入口。
- `CONTEXT.md` - 术语表 / ubiquitous language。
- `packages/generator/TESTING.md` - generator unit test 范围与边界。
- `docs/reference/package-exports.md` - package exports 与 public API 边界。
