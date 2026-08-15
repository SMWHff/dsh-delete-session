# dsh-delete-session

**Delete a session from the DSH Web GUI** — DeepSeek Harness (dsh) Web 模式的主机 + 客户端插件。

在会话列表每行右侧的省略号菜单（重命名 / 分叉会话 / 归档会话）末尾追加一行
**「删除会话」**：点击后弹出产品级风险确认对话框（`RiskConfirmation`，
勾选「我了解此操作不可恢复」后方可确认），随后彻底删除该会话——包括
磁盘上的会话日志目录（`sessions/<project>/<sessionId>/`）与工作区记录中的
会话登记；成功 / 失败均有 Toast 反馈。

## 删除行为

1. **运行中拒绝**：该会话的 agent 正在运行时拒绝删除（提示等待完成）。
2. **空闲存活实例**：先 `flush` 把缓冲事件落盘，再 detach；detach 发布的
   `session/disposed` 由 host API proxy 转发为 `host/session-removed`，
   已打开的客户端列表自动移除该会话。
3. **持久日志**：通过 `sessionPersistence.findLog` 定位日志文件，整目录移除。
4. **工作区登记**：从所有引用了该会话的工作区记录中 detach（触发
   `host/workspace-changed` 帧）。
5. **客户端收尾**：刷新会话基线；若删除的是当前打开会话，清空选择回到空态。

## 工作原理

- **主机端**：按 dsh-open-in-vscode 同款模式注册严格 Typert Remote
  （`deleteSession/delete`），主机 Gateway 无需 `@Remote` 标记表即可解析调用。
- **客户端**：当前构建的会话行菜单没有原生 slot，因此按 legacy 适配器模式
  注入：识别会话行省略号按钮（aria-label 模板匹配），在 portal 菜单弹出时
  用 MutationObserver 把删除行挂进菜单。会话身份解析优先级：当前选中行 →
  显示标题唯一匹配；解析失败则不注入（宁缺毋滥）。确认对话框由独立 React
  root 渲染（`RiskConfirmation` + `Toast`，均来自 dsh-client-ui-primitives）。

## 安装

```sh
pnpm dsh plugin --profile web add file:/path/to/dsh-delete-session
```

或手动：把包链接进 profile 的 node_modules，并在 profile manifest 登记：

```json
"dependencies": { "dsh-delete-session": "file:/path/to/dsh-delete-session" },
"dsh": { "profile": { "bundles": [..., "dsh-delete-session"] } }
```

bundle 层增删需重启 web 表面，并刷新页面让浏览器拿到新的
`window.__DSH_BOOT__` 图。

## 构建

```sh
npm install     # esbuild（一次性）
npm run build   # 产出 lib/index.js（host ESM）与 lib/client.js（浏览器 bundle）
```

## 文件结构

```
dsh-delete-session/
├── package.json        # dsh.bundle + dsh.client 声明
├── cordis.patch.yml    # bundle 层：insert 一行挂载本插件
├── dsh.plugin.json
├── build.mjs           # esbuild 构建脚本
├── tsconfig.json
├── src/
│   ├── index.ts        # host half：注册 Typert manifest
│   ├── contract.ts     # 共享 wire 契约（zod codec）
│   ├── typert.ts       # TYPERT_MANIFEST
│   ├── runtime.ts      # DeleteSessionRuntime：分层删除逻辑
│   └── client/
│       ├── index.ts    # browser half：remote 挂载 + 菜单注入
│       ├── remote.ts   # client Remote contribution
│       ├── locales.ts  # zh/en 字典
│       └── session-menu.ts  # 会话菜单 DOM 适配器
└── lib/                # 构建产物
```

## 兼容性

依赖运行时会话列表快照（`displayTitle` / `blank` / `current`）、workspace
locale 的 `actions.session.aria` / `menu.archiveSession` 模板，以及会话行
`[role="treeitem"]` 的 `aria-selected` 标记。官方后续版本若调整这些契约，
更新 `src/client/session-menu.ts` 顶部的识别逻辑即可。
