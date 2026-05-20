# AGENTS.md

## 项目开发原则

你是一个资深前端工程师，不允许把主要代码集中写在单个大文件中。  
所有开发必须遵循前端工程化、组件化、模块化、可维护的原则。

## 代码结构要求

开发新功能时，必须优先使用以下结构：

src/
  components/        # 通用 UI 组件
    /custom-component # 自定义组件
      index.jsx       # 组件jsx
      index.css       # 组件样式
  features/          # 按业务功能划分模块
  hooks/             # 可复用 React hooks
  services/          # API 请求、外部服务封装
  stores/            # 状态管理
  types/             # TypeScript 类型
  utils/             # 工具函数
  constants/         # 常量
  styles/            # 全局样式或主题

业务功能必须优先放入 `src/features/<featureName>/` 下，例如：

src/features/debate/
  components/
  hooks/
  services/
  types.ts
  constants.ts
  index.ts

## 文件拆分规则

- 单个组件文件尽量不超过 200 行。
- 单个页面文件只负责组合模块，不写复杂业务逻辑。
- 状态逻辑必须抽到 hook 或 store 中。
- API 请求必须放到 services 中。
- 类型定义必须放到 types.ts 或独立类型文件中。
- 常量、枚举、配置项必须放到 constants.ts。
- 复杂函数必须放到 utils 中。
- 不允许在 App.tsx、main.tsx、page.tsx 中堆业务代码。
- 组件和样式必须一一对应，不允许所有样式在一个文件中。

## React / 前端开发规则

- 页面组件只做布局和组合。
- 展示组件只负责 UI，不直接处理复杂业务。
- 容器组件负责数据流、状态和事件分发。
- 重复 UI 必须抽成组件。
- 重复逻辑必须抽成 hook。
- JSX 中不要写大段条件逻辑，应抽成函数或子组件。
- 不要为了省事把所有 state 都写在顶层组件里。
- Props 必须有清晰类型。
- 组件命名必须语义化，例如 DebateStage、PlayerSeat、JudgePanel。

## 修改代码前必须先做

1. 先阅读当前目录结构。
2. 判断已有模块应该复用还是扩展。
3. 先说明本次会新增/修改哪些文件。
4. 再开始写代码。
5. 修改完成后检查是否存在单文件过大、职责混乱、重复代码。

## 严格禁止

- 禁止把完整功能全部写进一个文件。
- 禁止把所有样式全部写进一个文件。
- 禁止在一个组件里同时写 UI、状态、请求、复杂计算、样式配置。
- 禁止为了快速完成而牺牲结构。
- 禁止重复造组件。
- 禁止在没有理解现有结构前直接大改。
- 禁止引入不必要的复杂依赖。

## 输出要求

每次完成任务后，必须说明：

- 新增了哪些文件
- 修改了哪些文件
- 每个文件的职责是什么
- 是否有可继续拆分的地方