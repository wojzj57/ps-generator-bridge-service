import type { DefaultTheme } from "vitepress";

export const enNav: DefaultTheme.NavItem[] = [
  { text: "Guide", link: "/getting-started/install" },
  { text: "SDK", link: "/sdk/connection" },
  { text: "Plugins", link: "/plugins/authoring" },
  { text: "Reference", link: "/reference/protocol" },
];

export const zhNav: DefaultTheme.NavItem[] = [
  { text: "指南", link: "/zh/getting-started/install" },
  { text: "SDK", link: "/zh/sdk/connection" },
  { text: "插件", link: "/zh/plugins/authoring" },
  { text: "参考", link: "/zh/reference/protocol" },
];

export const enSidebar: DefaultTheme.Sidebar = [
  {
    text: "Getting Started",
    items: [
      { text: "Install", link: "/getting-started/install" },
      { text: "Run Generator", link: "/getting-started/run-generator" },
      { text: "Connect SDK", link: "/getting-started/connect-sdk" },
    ],
  },
  {
    text: "SDK",
    items: [
      { text: "Connection", link: "/sdk/connection" },
      { text: "Events", link: "/sdk/events" },
      { text: "Modules", link: "/sdk/modules" },
      { text: "Errors", link: "/sdk/errors" },
    ],
  },
  {
    text: "Plugins",
    items: [
      { text: "Authoring", link: "/plugins/authoring" },
      { text: "Events", link: "/plugins/events" },
      { text: "JSX", link: "/plugins/jsx" },
      { text: "API Routes", link: "/plugins/api-routes" },
    ],
  },
  {
    text: "Generator",
    items: [
      { text: "Configuration", link: "/generator/configuration" },
      { text: "Photoshop Setup", link: "/generator/photoshop-setup" },
      { text: "Troubleshooting", link: "/generator/troubleshooting" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "Protocol", link: "/reference/protocol" },
      { text: "Built-In Capabilities", link: "/reference/built-in-capabilities" },
      { text: "Environment", link: "/reference/environment" },
      { text: "Package Exports", link: "/reference/package-exports" },
    ],
  },
];

export const zhSidebar: DefaultTheme.Sidebar = [
  {
    text: "开始使用",
    items: [
      { text: "安装", link: "/zh/getting-started/install" },
      { text: "运行 Generator", link: "/zh/getting-started/run-generator" },
      { text: "连接 SDK", link: "/zh/getting-started/connect-sdk" },
    ],
  },
  {
    text: "SDK",
    items: [
      { text: "Connection", link: "/zh/sdk/connection" },
      { text: "事件", link: "/zh/sdk/events" },
      { text: "模块", link: "/zh/sdk/modules" },
      { text: "错误", link: "/zh/sdk/errors" },
    ],
  },
  {
    text: "插件",
    items: [
      { text: "插件开发", link: "/zh/plugins/authoring" },
      { text: "插件事件", link: "/zh/plugins/events" },
      { text: "JSX", link: "/zh/plugins/jsx" },
      { text: "API 路由", link: "/zh/plugins/api-routes" },
    ],
  },
  {
    text: "Generator",
    items: [
      { text: "配置", link: "/zh/generator/configuration" },
      { text: "Photoshop 设置", link: "/zh/generator/photoshop-setup" },
      { text: "故障排查", link: "/zh/generator/troubleshooting" },
    ],
  },
  {
    text: "参考",
    items: [
      { text: "协议", link: "/zh/reference/protocol" },
      { text: "内置能力", link: "/zh/reference/built-in-capabilities" },
      { text: "环境变量", link: "/zh/reference/environment" },
      { text: "包导出", link: "/zh/reference/package-exports" },
    ],
  },
];
