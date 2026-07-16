---
layout: home

hero:
  name: PS Generator Bridge
  text: 通过类型化 WebSocket 使用 Photoshop Generator
  tagline: 在 Photoshop 内运行 Generator 插件，用同构 SDK 连接，并通过插件端点扩展私有 API。
  actions:
    - theme: brand
      text: 开始使用
      link: /zh/getting-started/install
    - theme: alt
      text: SDK 连接
      link: /zh/sdk/connection

features:
  - title: 类型化 SDK
    details: 从浏览器或 Node 运行时连接服务，调用内置方法，订阅服务端事件，并复用同一个协议类型包。
  - title: Photoshop Generator 宿主
    details: generator 包运行在 Adobe generator-core 内，提供 HTTP 健康检查、插件发现和 WebSocket 协议端点。
  - title: 插件开发
    details: 外部插件使用同步 initializer、可选 BasePlugin helper、@ws、@api、作用域 JSX、内置模块和基于订阅的事件门面。
---
