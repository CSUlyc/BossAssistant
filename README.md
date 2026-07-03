<div align=”center”>

# BossAssistant

**BOSS 直聘求职助手：职位筛选、半自动沟通、投递记录与本地回复草稿生成。**

让高频、重复、容易漏记的求职动作变得可控、可追踪、可暂停。

[![Chrome MV3](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=222)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![MIT License](https://img.shields.io/badge/License-MIT-22A06B?style=flat-square)](./LICENSE)

</div>

---

## 为什么做这个项目

在集中求职时，很多时间并不是花在判断岗位是否合适，而是花在重复点击、复制自我介绍、记录投递状态、整理 HR 回复上。BossAssistant 是一个 Chrome 扩展，把这些机械动作放进页面内的控制台里完成：你配置规则，它帮你扫描、筛选、记录、生成草稿；最终是否投递、是否发送，仍由你掌控。

> 适合学习、个人求职效率提升、Chrome Extension / React / TypeScript 项目展示。

## 功能亮点

| 能力 | 说明 |
| --- | --- |
| 职位扫描 | 自动识别 BOSS 职位列表页岗位卡片，提取职位、公司、城市、薪资、HR 活跃状态 |
| 条件筛选 | 支持关键词、城市、HR 活跃时间组合过滤，并展示跳过原因 |
| 半自动沟通 | 依次打开岗位详情，点击”立即沟通”，发送预设自我介绍 |
| 每日上限 | 每日新增投递限制在 `1-150`，到达上限自动停止 |
| 防重复 | 基于岗位详情链接 / 职位特征生成去重 key，自动跳过已沟通岗位 |
| 投递记录 | 本地保存新投递、已沟通、失败等记录，支持日期筛选、CSV 导出、自动刷新 |
| 运行控制 | 页面内控制面板支持开始、暂停、继续、停止，日志实时可见 |
| BOSS 弹窗处理 | 自动确认”今天已与 120 位 BOSS 沟通，还剩 30 次”等平台提醒弹窗 |
| 回复助手 | 聊天页识别 HR 消息，按问题类型生成回复草稿，可复制或填入输入框 |
| 本地优先 | 配置、投递记录、回复草稿均在本地处理，不上传简历或聊天内容 |
| 北京时间 | 日期筛选、投递统计、导出时间统一使用 `Asia/Shanghai` |

## 当前支持页面

| 页面 | URL | 能力 |
| --- | --- | --- |
| 职位列表页 | `https://www.zhipin.com/web/geek/jobs` | 岗位扫描、筛选、半自动沟通、投递记录 |
| 沟通聊天页 | `https://www.zhipin.com/web/geek/chat` | HR 消息识别、回复草稿生成、复制 / 填入 |

## 预览

| 界面 | 看点 |
| --- | --- |
| 设置中心 | 自我介绍、关键词、城市、HR 活跃、每日上限、简历资料、回复风格 |
| 投递控制台 | 运行状态、处理数、新投递数、跳过数、失败数、岗位结果、操作日志 |
| 投递记录 | 日期筛选、自动刷新、新投递 / 已沟通统计、CSV 导出 |
| 回复助手 | HR 问题、问题类型、参考简历资料、回复草稿、复制 / 填入 |

> 截图可放到 `docs/images/` 目录并在上方表格中引用。

## 快速开始

### 环境要求

- Node.js 18+
- Chrome 120+
- 已登录的 BOSS 直聘账号

### 安装依赖

```bash
npm install
```

### 构建扩展

Windows PowerShell 推荐使用：

```bash
npm.cmd run build
```

其他 shell 可使用：

```bash
npm run build
```

构建产物位于 `dist/`。

### 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启右上角”开发者模式”
3. 点击”加载已解压的扩展程序”
4. 选择项目根目录下的 `dist/`
5. 打开 BOSS 直聘职位列表页或聊天页开始使用

## 使用指南

### 1. 配置求职规则

进入扩展的”选项”页，配置：

- 自我介绍：每行一句，沟通时按句发送
- 职位关键词：如 `前端,React,Vue`
- 目标城市：如 `北京,上海,深圳,杭州`
- HR 活跃时间：在线 / 3 天内 / 7 天内 / 不限
- 每日投递上限：自动限制在 `1-150`
- 简历资料：用于回复助手匹配事实
- 回复风格：专业稳重 / 自然亲和 / 简洁直接

### 2. 半自动投递

1. 打开 BOSS 职位列表页
2. 页面右侧出现 BossAssistant 控制台
3. 点击”开始”
4. 观察岗位结果与操作日志
5. 必要时点击”暂停””继续”或”停止”

投递过程会自动处理：

- 已沟通岗位补记为”已沟通”并跳过
- 新投递才计入每日新增投递数量
- 失败岗位记录原因并继续处理后续岗位
- BOSS 120 次提醒弹窗自动确认后继续

### 3. 查看投递记录

设置页切换到”投递记录”标签：

- 按日期筛选
- 查看新投递 / 已沟通数量
- 设置自动刷新间隔：关闭、5 秒、10 秒、30 秒、60 秒
- 手动刷新
- 导出 CSV
- 删除单条记录或清空记录

### 4. 生成回复草稿

1. 打开 BOSS 沟通聊天页
2. 控制台切换为回复助手
3. 自动识别当前对话中的 HR 消息
4. 生成回复草稿
5. 选择”复制”或”填入”
6. 用户确认无误后手动发送

回复助手会识别常见问题类型：

- 薪资期望
- 到岗时间
- 面试安排
- 实习周期
- 工作时间
- 求职状态
- 岗位意向
- 地点意向
- 学历专业
- 作品资料
- 项目经验
- 技术能力
- 自我介绍
- 通用问题

## 项目结构

```text
BossAssistant/
├── public/
│   └── manifest.json              # Chrome Extension MV3 清单
├── src/
│   ├── background/
│   │   └── index.ts               # Service Worker：消息路由与状态缓存
│   ├── content/
│   │   ├── index.ts               # Content Script：页面注入、投递流程、回复助手
│   │   ├── deliveryView.ts        # 控制台岗位结果视图
│   │   ├── dom.ts                 # DOM 工具函数
│   │   └── selectors.ts           # BOSS 页面选择器与按钮文本
│   ├── options/
│   │   ├── Options.tsx            # 设置页与投递记录页
│   │   ├── main.tsx               # Options 入口
│   │   └── styles.css             # Options 样式
│   ├── popup/
│   │   ├── Popup.tsx              # 扩展弹窗
│   │   ├── main.tsx               # Popup 入口
│   │   └── styles.css             # Popup 样式
│   └── shared/
│       ├── aiReply.ts             # 回复草稿生成与 HR 问题分类
│       ├── applications.ts        # 投递记录、去重、CSV 导出
│       ├── config.ts              # 配置模型、默认值、校验
│       ├── jobs.ts                # 岗位扫描与筛选
│       ├── messages.ts            # 扩展消息类型
│       ├── page.ts                # BOSS 页面识别
│       ├── storage.ts             # chrome.storage.local 封装
│       ├── task.ts                # 任务状态与日志
│       └── time.ts                # 北京时间工具
├── dist/                          # 构建产物，加载扩展时选择此目录
├── popup.html                     # Popup HTML 入口
├── options.html                   # Options HTML 入口
├── vite.config.ts                 # Vite 配置
├── tsconfig.json                  # TypeScript 配置
└── package.json
```

## 架构设计

```text
┌──────────────────┐      ┌────────────────────┐      ┌──────────────────┐
│ Popup            │      │ Background SW       │      │ Options          │
│ React UI         │◀────▶│ Message Router      │◀────▶│ React UI         │
└──────────────────┘      └─────────┬──────────┘      └──────────────────┘
                                    │
                                    │ chrome.tabs.sendMessage
                                    ▼
                         ┌────────────────────┐
                         │ Content Script      │
                         │ Shadow DOM Panel    │
                         ├────────────────────┤
                         │ Job Scanner         │
                         │ Delivery Runner     │
                         │ Reply Assistant     │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ chrome.storage.local│
                         │ Config / Records    │
                         └────────────────────┘
```

### 构建管线

```text
React Popup / Options ── Vite ──> dist/assets/*.js
Content Script ─────── esbuild ─> dist/assets/content.js  (IIFE)
Background SW ──────── esbuild ─> dist/assets/background.js (ESM)
```

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 扩展标准 | Chrome Extension Manifest V3 |
| UI | React 19 |
| 语言 | TypeScript 5.8 |
| 构建 | Vite 7 + esbuild |
| 图标 | lucide-react |
| 存储 | chrome.storage.local |
| 目标浏览器 | Chrome 120+ |

## 设计原则

- **用户可控**：支持暂停、继续、停止；回复草稿不会自动发送
- **本地优先**：配置、记录、简历资料都保存在浏览器本地
- **尊重平台边界**：不绕过登录、验证码、风控、付费权限或平台限制
- **可解释**：岗位跳过原因、投递结果、失败原因和日志都可见
- **低耦合**：扫描、记录、回复、配置、时间工具拆分在 shared 模块中

## 开发命令

```bash
# 安装依赖
npm install

# 本地开发 UI
npm run dev

# 类型检查 + 构建扩展
npm.cmd run build
```

## Roadmap

- [x] Chrome Extension MV3 基础工程
- [x] 设置页：自我介绍、关键词、城市、HR 活跃、每日上限
- [x] 职位扫描与筛选
- [x] 半自动沟通与任务控制
- [x] 投递记录、防重复、CSV 导出
- [x] 北京时间统计与记录筛选
- [x] BOSS 120 次提醒弹窗自动确认
- [x] 投递记录自动刷新
- [x] 本地回复草稿与 HR 问题分类
- [ ] 增加截图与 GIF 演示
- [ ] 增加单元测试与选择器回归测试
- [ ] 投递数据可视化看板
- [ ] 更细粒度的岗位匹配评分
- [ ] 可选接入 LLM API 提升回复质量
- [ ] 多招聘平台适配

## FAQ

### 这个项目会自动发送 AI 回复吗？

不会。回复助手只生成草稿，用户可以复制或填入输入框，最终发送需要用户手动确认。

### 简历资料和聊天内容会上传吗？

不会。当前回复草稿为本地规则生成，配置和记录保存在 `chrome.storage.local`。

### 为什么投递记录可能大于 BOSS 当天新增投递数？

记录页区分”新投递”和”已沟通”。页面上已经沟通过的岗位会补记为”已沟通”，但不会计入每日新增投递额度。

### BOSS 页面改版后还能用吗？

扩展依赖页面 DOM 选择器。平台改版可能导致扫描或按钮识别失效，需要同步更新选择器。

### 可以直接发布到 Chrome Web Store 吗？

当前更适合作为个人工具和学习项目。公开发布前建议补充隐私政策、许可证、测试覆盖和更严格的合规审查。

## 安全与合规声明

BossAssistant 是辅助工具，不提供也不鼓励任何绕过平台规则的能力：

- 不绕过登录、验证码、风控、频率限制或付费权限
- 不伪装浏览器环境或隐藏自动化痕迹
- 不批量抓取与求职无关的数据
- 不自动发送回复草稿
- 不上传简历、聊天内容或投递记录到外部服务

请确保你的使用方式符合 BOSS 直聘服务条款、当地法律法规和目标平台规则。

## 贡献

欢迎提交 Issue 和 Pull Request：

1. Fork 本仓库
2. 创建分支：`feat/your-feature`
3. 提交修改：`git commit -m “feat: add your feature”`
4. 推送分支并创建 Pull Request

建议 PR 描述包含：问题背景、实现思路、测试方式、截图或录屏。

## 致谢

这个项目诞生于真实求职场景中的重复劳动：筛选岗位、记录状态、整理回复。希望它也能给正在认真找工作的你一点点帮助。

## License

本项目使用 [MIT License](./LICENSE)。Copyright (c) 2026 CSUlyc。
