# PS Generator Bridge Service

一个 Photoshop Generator 库的 monorepo：`server` 跑在 Photoshop 内置的 Node 运行时里、对外提供能力；`sdk` 是给外部用户（浏览器 / Node ≥ 18）的客户端。本文件是**术语表**（ubiquitous language），只定义本项目特有的概念，不含实现细节。

## Language

**Generator（生成器）**:
运行在 Photoshop CC 内置 Node.js 运行时（v18.13）里的扩展，经 KVLR 协议与 PS 通信，能拿原始像素、后台异步处理。本仓库的 `@ps-generator-bridge/generator` 即一个 Generator 插件。
_Avoid_: PS 插件（含混 CEP/UXP）、扩展

**generator-core**:
Adobe 官方 Node 库（仓库内 vendored 于 `generator-core/`），经 `app.js -f <folder>` 加载 Generator 插件并代理其与 PS 的通信。它用 CommonJS `require()` 加载插件，因此**插件入口必须是 CJS**。
_Avoid_: core

**server（服务包）**:
工作区包 `@ps-generator-bridge/generator`。一个被 generator-core 加载的 Generator 插件，同时**自拥一个 WebSocket 服务器**，把自身能力以 [Protocol](#) 暴露给外部 [sdk](#) 客户端。它对 PS 的一切交互都经由注入的 [PsGenerator](#) 对象。
_Avoid_: plugin（太泛）、backend、daemon

**sdk（客户端 SDK）**:
工作区包 `@ps-generator-bridge/sdk`。给**外部用户**用的纯 TS 客户端，同构支持浏览器与 Node ≥ 18，经 WebSocket 连上 [server](#) 调用其能力。它是**协议契约的真身所在**（server 反过来依赖它），且零 PS 依赖、浏览器安全。
_Avoid_: client（指代具体那个 `PsBridgeClient` 类时可用，但勿用它指代整个包）、api

**发布单元（published package）**:
本仓库中会发布到 npm 的 workspace 包。目前发布单元是 `@ps-generator-bridge/sdk`、`@ps-generator-bridge/generator`、`@ps-generator-bridge/testkit`；根包 `ps-generator-bridge-service` 只作为 monorepo 编排入口，不是发布单元。
_Avoid_: 把根包称为 npm 包、把 workspace 包和仓库混用

**Release Pipeline（发布流水线）**:
从已合并的 Git 提交中推导版本变更，更新发布单元版本，构建产物，并把发布单元发布到 npm 的流程。它管理的是“仓库如何产生 npm 版本”，不是运行时 [server](#) 的能力。
_Avoid_: deploy（本项目发布到 npm，不部署服务）、build script（只是流水线中的一个步骤）
**Protocol（协议）**:
sdk 与 server 之间的消息契约。涵盖**两类方向相反的消息**——[Request](#)（客户端发起、要应答）与 [Event](#)（server 单向推送）——的消息类型、payload schema、错误码。是双方唯一的公共契约，**定义在 sdk 包内**，server type-only 依赖它。
_Avoid_: API、schema（太泛）、message format

**Request（请求 / RPC）**:
客户端经 [Connection](#) 的 `invoke` 发起的一次调用：带一个**请求 id**、指定 `method` 与 params，server 处理后回 result 或 error。**一来一回**，请求 id 用于关联响应。
_Avoid_: event（event 专指 server 单向推送，无应答）、command、message（太泛）

**Event（事件 / 推送）**:
server **主动单向**推给客户端的消息（连接建立时的 `connected`、未来 PS 状态变化等），无请求 id、无应答。[sdk](#) 可**订阅**某类 event。
_Avoid_: notification（统一用 Event）、Request（有应答的才是 Request）、PS 的 generatorMenuChanged 等裸事件名（那是 generator-core ↔ PS 层，不是本协议的 Event）

**clientId（客户端连接 id）**:
标识一个**逻辑客户端连接**的稳定身份，**跨重连保持**——客户端首次连上由 server 在 `connected` 中回传、[Connection](#) 记住它，重连时经 `?id=` 回传，server 据此认出同一客户端。server 用它**登记每个客户端**并将 [Event](#) 定向推送。
_Avoid_: 与**请求 id**（关联单次 [Request](#) 的 `id`）混用、sessionId（本项目无独立 session 概念）、socketId（绑物理 socket，clientId 是逻辑身份）

**Transport（传输层）**:
sdk 侧对「如何把**一条连接**的字节送达 server」的抽象接口（`ready` / `send` / `onMessage` / `close`）。**单连接、无重连**——构造即对应一条 WebSocket。客户端代码不直接用它，由 [Connection](#) 持有。默认实现用全局 `WebSocket`；Node 18–21（无全局 WebSocket）或测试场景由调用方注入自己的实现（如 `ws` / `FakeTransport`）。
_Avoid_: 把它当 [Connection](#) 的同义词（Connection 是其上层、带重连与身份的有状态门面）、socket、channel

**Connection（连接 / SDK 主门面）**:
sdk 侧**有状态的主入口**，取代早期 [PsBridgeClient](#)。`new` 后经一个 [Transport](#) 工厂连上 server，负责：跨断线**重连**、记忆并回传 [clientId](#)、强类型 `invoke<M>` 的 [Request](#) 关联（pending + 超时）、订阅 [Event](#)。分层上 Transport 管「一条连接的字节收发」，Connection 管「跨重连的身份、调用与订阅」。
_Avoid_: [Transport](#)（更底层的单连接接缝）、PsBridgeClient（已被 Connection 取代 / 吸收）、socket、session

**Registry（注册中心 / 装配接缝）**:
server 侧收口「[modules](#) ↔ server 装配」的对象。持有 WS [Request](#) 的 method handler 表、待装配的 HTTP 路由、可推送的 [Event](#) 类型。modules 经它（或 `@api`/`@ws` 装饰器）注册自身能力；[startServer](#) 在 `listen` 前据它把 HTTP 路由灌进 fastify、把 WS 分发绑到 method 表。约束：**HTTP 路由仅启动期可注册**（fastify 限制），WS method 与 Event `emit` 可运行时。
_Avoid_: Router（太泛，且易与 fastify 内部路由混淆）、container（不是 DI 容器）、bus

**ClientStore（在线客户端表）**:
server 侧记录**当前在线**的 [clientId](#) → 客户端连接（socket、connectedAt、订阅集）的表。与 [Registry](#) **正交**：Registry 装配「server 能做什么」，ClientStore 跟踪「此刻谁连着」。握手后登记、socket 关闭时移除；同 clientId 重连由**新连接接管**（关旧 socket、替换 entry、保留订阅）。server 据它对 [Event](#) 做定向 `emit(clientId, …)` 与全员 `broadcast(…)`。
_Avoid_: [Registry](#)（那是装配接缝）、pool、session store、connection registry

**modules（功能模块）**:
`packages/generator/src/modules/` 下实现**实际能力**的单元——操作 PS、取数据等。每个 module 经注入的 [PsGenerator](#) 触达 PS，并经 [Registry](#) / 装饰器把自身暴露为 [Request](#) 方法或 HTTP 路由。Service 化之后模块**不再有自己的对外 WS 出口**，退化为纯进程内能力，由 [Service](#) 经 [ServicePlugin](#) 调用；模块的 `@ws` 方法仍挂在全局 [Registry](#)，作为 [Service](#) 连接上 dispatch 的 fallback 层。
_Avoid_: plugin（[server](#) 整体才是 generator-core 的 plugin）、service（太泛）、handler（handler 是 module 注册出去的那个回调，不是 module 本身）

**Service（服务）**:
跑在 [server](#) 进程内的**编排层 + 对外连接单元**，由外部开发者以独立包形式开发、`export default` 一个继承 [BaseService](#) 的类。每个 Service 拥有**自己的 WS 客户端集**与端点 `/ws/{ServiceId}`，经 `@ws`/`@api` 装饰器暴露**仅作用于本 Service 作用域**的 [Request](#) 方法与 HTTP 路由；向下经 [ServicePlugin](#) 调用 [modules](#)。Service 不再内置在本仓库（SidePaint 等迁出），由 plugin 启动期扫描 `/services/**/index.js` 加载。
_Avoid_: [server](#)（那是 generator-core 的 plugin 整体）、module（模块是更下的能力层）、endpoint（指 `/ws/{ServiceId}` 那个端点时用 service endpoint，勿用它指代 Service 整体）

**BaseService（服务基类）**:
[Service](#) 的抽象基类，导出自 `@ps-generator-bridge/sdk/service`。构造接收 `(id: string, plugin: ServicePlugin)`——`id` 由加载器从类的 `static id` 读取后传入，`plugin` 是 [ServicePlugin](#) 抽象接口而非具体 `PsBridgePlugin`。提供 `broadcast(type, data)` / `send(clientId, type, data)`，仅向**本 Service 自己的**在线客户端推 [Event](#)。
_Avoid_: BaseModule（模块基类，不相交类型）、Service class（指被 export 的那个类时用 Service）

**ServiceId（服务 id）**:
一个 [Service](#) 的稳定 URL 身份，由类上的 `static id` 声明（跨文件夹改名保持稳定），须匹配 `[A-Za-z0-9_-]+` 且全局唯一。决定 WS 端点 `/ws/{ServiceId}` 与 HTTP 路由前缀 `/{ServiceId}/{path}`。重复或非法在启动期响亮失败。
_Avoid_: [clientId](#)（那是客户端连接身份，不是 Service 身份）、文件夹名（id 来自 `static id`，不来自目录名）

**ServicePlugin（服务插件契约）**:
导出自 `@ps-generator-bridge/sdk/service` 的**抽象接口**，是传给 [BaseService](#) 构造的 `plugin` 参数类型。只暴露 [Service](#) 真正需要的东西：`jsx`（抽象 JsxRunner）与各 [module](#) 访问器（`layerModule` / `documentModule` / `actionModule` 作抽象接口）。server 的 `PsBridgePlugin` 实现 `ServicePlugin`。它让 Service 开发者只依赖 SDK、只碰纯接口，不接触 PS/fasty 具体类型，依赖箭头保持 server → sdk、service → sdk 无环。
_Avoid_: PsBridgePlugin（那是 server 内的具体实现，Service 侧只认 ServicePlugin 接口）、PsGenerator（那是模块触达 PS 的注入对象，不是给 Service 的门面）

**per-service dispatch（按服务分发）**:
`/ws/{ServiceId}` 连接上的 [Request](#) 分发规则：先查**本 Service 的 scoped 方法表**，未命中再 fallback 到**全局 [Registry](#)（[modules](#) + builtins）**。`@ws` 名仍由开发者手写完整 `Domain:action` 名、原样注册，**不注入 ServiceId 前缀**；作用域化靠 dispatch 顺序，不靠命名空间拼装。撞名时 scoped 覆盖全局。
_Avoid_: 命名空间自动注入（明确不采用，与 ADR 0009 取舍一致）

**服务发现（service discovery）**:
server-level HTTP `GET /services`，列出已加载 [Service](#) 的 [ServiceId](#) + 元数据；`getServerInfo` 返回顺带携带该列表。它不是 [Service](#)、不违反"不内置 Service"，用于补上"无客户端根 `/ws`"后客户端获知可用 Service 的能力。
_Avoid_: 根 `/ws`（面向客户端的根 WS 端点已不存在）

**CosService（对象存储服务）**:
[server](#) 进程内的**可选**上传单元，把内存字节或本地文件传到腾讯云 COS、返回一条可直接当图片地址用的 URL。**由环境变量开关**：关键凭据字段齐全才在启动期实例化，否则 `plugin.cos` 为 `undefined`（未启用）。[modules](#) 与外部 plugin 都经 `plugin.cos` 访问；外部只见 SDK 侧窄接口 [CosServiceApi](#)，COS SDK 的具体类型不漏进 [sdk](#)。它决定 [WsImageResult](#) 的 `data` 走 http URL 还是退回 base64。
_Avoid_: 上传管理器、storage（太泛）、把它当对外 [Service](#)（它无 `/ws/{ServiceId}` 端点，是内部能力）

**CosServiceApi（COS 窄契约）**:
generator contract 里给 plugin 看的 [CosService](#) 最小切片，SDK 经 `contract.ts` type-only 再导出，挂在 [PluginHost](#) 的 `cos?` 上。只暴露 `uploadObject(data, name?)` 与 `uploadFile(dir, name?)`，参数用 `Uint8Array`/路径而非 `Buffer`/COS SDK 类型，保 [sdk](#) 零 Node 依赖。同 [ImageModuleApi](#) 的处理同构。
_Avoid_: CosService 具体类（plugin 侧只认接口）、COS（指腾讯云产品本身时可用，勿指代本接口）

**WsImageResult（image 模块对外结果）**:
image 模块 `@ws` 包装方法的返回结构：`{ data, bounds, width, height }`。`data` 是一条**开箱即用的图片字符串**——`data:image/png;base64,...` 或 `https://...`（[CosService](#) 启用时），client 靠开头 `data`/`http` 区分，无独立判别字段。与内部 `ImageResult`（持 `buffer: Uint8Array`）相对：内部方法产 `buffer`，`@ws` 包装经 `toWsResult` 转成 `data`。
_Avoid_: ImageResult（那是内部带 buffer 的结构）、base64（只是 data 的一种取值）

**PsGenerator（注入式 generator 契约）**:
server 用到的 generator-core `Generator` API 的最小切片（如 `addMenuItem` / `onPhotoshopEvent` / `alert` / `getPhotoshopVersion`），以索引签名兜底其余。server 对 PS 的全部交互都过这一个注入对象，因此它也是测试 mock 的契约。
_Avoid_: Generator（裸 `Generator` 指 Adobe 的实体类，`PsGenerator` 是我们的接口切片）

**JsxRunner（JSX 执行接缝）**:
server 侧挂在 [plugin](#) 上的具名接缝（`plugin.jsx`），把「按名字跑一段 [jsx](#)」收口成一处：负责 jsx 名 → 物理路径解析（指向随 bundle 落地的 jsx 目录）、params 注入、错误与返回归一，底层经注入的 [PsGenerator](#) 的 `evaluateJSXFile` 触达 PS。[modules](#) 与其它 server 内部 caller 都经它跑 jsx，外部 [sdk](#) 看不到它。它也是 jsx 路径解析逻辑的唯一所在与测试 mock 的靶点。
_Avoid_: 在各处直接调 `generator.evaluateJSXFile`（路径/错误约定会散落）、JsxManager、ScriptRunner

**jsx（脚本资源）**:
随 [server](#) 包发布的 ExtendScript 纯文本文件，运行在 PS 的 ScriptEngine 里（非插件的 Node 运行时），是 [modules](#) 触达 PS 经典 DOM/Action Manager 能力的实现细节。源置于 server 包的 `jsx/`、构建期拷入 `dist/jsx/`，运行时由 [JsxRunner](#) 按名定位；**不被 tsup 打包**、不经 [Protocol](#) 暴露。
_Avoid_: ExtendScript 文件（口语可用，代码与目录统一用 jsx）、script（太泛）

**getServerInfo**:
脚手架阶段唯一的协议消息：客户端请求 → server 返回 `{ name, version, psVersion }`（`psVersion` 经注入的 generator 从 PS 取，无 PS 时缺省）。它是贯穿 protocol → transport → handler → client 全部 seam 的最小垂直切片。
_Avoid_: ping、hello、handshake

**dev-server（独立开发服务器）**:
不连 PS 的本地启动入口：用 [FakeGenerator](#) 起一个 server 的 WebSocket 服务器，让 sdk 在无 Photoshop 的情况下也能跨进程联调。
_Avoid_: mock server、test server

**FakeGenerator / FakeTransport（录制式假件）**:
测试与 dev-server 用的注入替身。`FakeGenerator` 实现 `PsGenerator` 契约、录制 server 对 PS 的调用；`FakeTransport` 实现 `Transport` 契约、在不开真 socket 的前提下断言 sdk 的收发。
_Avoid_: stub、dummy、spy（特指录制式假件时用 Fake）
