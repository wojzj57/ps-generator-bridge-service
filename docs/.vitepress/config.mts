import { defineConfig } from "vitepress";
import { enNav, enSidebar, zhNav, zhSidebar } from "./sidebar.mjs";

export default defineConfig({
  title: "PS Generator Bridge",
  description: "Photoshop Generator bridge service and SDK documentation",
  base: "/ps-generator-bridge-service/",
  cleanUrls: true,
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      title: "PS Generator Bridge",
      description: "Photoshop Generator bridge service and SDK documentation",
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      title: "PS Generator Bridge",
      description: "Photoshop Generator Bridge 中文文档",
      link: "/zh/",
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        outline: {
          label: "本页内容",
        },
        docFooter: {
          prev: "上一页",
          next: "下一页",
        },
        darkModeSwitchLabel: "外观",
        lightModeSwitchTitle: "切换到浅色模式",
        darkModeSwitchTitle: "切换到深色模式",
        sidebarMenuLabel: "菜单",
        returnToTopLabel: "返回顶部",
      },
    },
  },
  themeConfig: {
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/wojzj57/ps-generator-bridge-service" },
    ],
  },
});
