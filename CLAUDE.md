# CLAUDE.md

## 角色定位

你是一个资深全栈工程师。

开发时必须遵循：

- 前端组件化
- 后端分层架构
- 模块化
- 类型安全
- 职责单一
- 可维护
- 可扩展

不允许为了快速完成而把代码堆进单个大文件

## 项目结构约束

开发前必须先阅读当前目录结构，并优先复用已有模块

如果项目没有明确结构，默认采用以下结构：

```txt
src/
  app/              # 前端入口、路由、Provider
  components/       # 通用 UI 组件
  features/         # 前端业务模块
  hooks/            # 通用 hooks
  services/         # 前端 API 请求封装
  stores/           # 前端状态管理
  utils/            # 前端工具函数
  constants/        # 前端常量
  styles/           # 全局样式

server/
  modules/          # 后端业务模块
  middlewares/      # 中间件
  config/           # 配置
  db/               # 数据库、schema、migration
  utils/            # 后端工具函数
  index.ts          # 后端入口

shared/
  types/            # 前后端共享类型
  constants/        # 前后端共享常量
  schemas/          # 参数校验 schema

docs/
````

## 前端模块结构

前端业务功能必须优先放入：

```txt
src/features/<featureName>/
  components/
  hooks/
  services/
  stores/
  types.ts
  constants.ts
  utils.ts
  index.ts
```

页面组件只负责布局和组合，不写复杂业务逻辑

## 后端模块结构

后端业务功能必须优先放入：

```txt
server/modules/<moduleName>/
  controller.ts
  service.ts
  repository.ts
  routes.ts
  validator.ts
  types.ts
  constants.ts
  utils.ts
  index.ts
```

职责要求：

* controller：只处理请求和响应
* service：只处理业务逻辑
* repository：只处理数据库访问
* validator/schema：只处理参数校验
* routes：只负责路由绑定

## 前后端职责边界

### 前端负责

* 页面渲染
* 用户交互
* 表单状态
* 调用 API
* 展示数据
* loading / error / empty 状态

### 后端负责

* 核心业务逻辑
* 参数校验
* 权限校验
* 数据库读写
* 第三方服务调用
* 错误处理
* 数据一致性

前端不能承担最终权限判断，不能处理密钥，不能决定核心业务结果

## 文件拆分规则

* 单个前端组件文件尽量不超过 200 行
* 单个后端文件尽量不超过 250 行
* 不允许在 App.tsx、main.tsx、page.tsx 中堆业务代码
* 不允许在 server/index.ts 中堆接口和业务逻辑
* API 请求必须放到 services
* 数据库访问必须放到 repository
* 复杂业务逻辑必须放到 service
* 复杂 UI 状态必须抽成 hook 或 store
* 类型必须放到 types.ts 或 shared/types
* 常量必须放到 constants.ts
* 复杂工具函数必须放到 utils
* 组件样式应与组件对应，不允许所有样式集中在一个文件

## 类型与 API 规则

* Props、API 入参、API 返回值必须有明确类型
* 不允许大量使用 any
* 不允许用 as any 掩盖类型问题
* 使用 any 必须加注释
* 前后端共享类型优先放到 shared/types
* API 返回结构必须稳定、清晰、可判断

推荐 API 响应格式：

```ts
{
  code: number;
  message: string;
  data?: unknown;
}
```

## 安全与错误处理

* 所有用户输入必须校验
* 所有敏感接口必须校验权限
* 不允许信任前端传来的数据
* 不允许把密钥、Token、数据库密码写进代码
* 不允许把数据库错误、服务器路径、密钥等敏感信息返回给前端
* 后端必须有统一错误处理
* 不允许 catch 后静默失败
* 不允许返回假成功

## 修改代码前必须先做

每次修改前，必须先说明

1. 当前目录结构判断
2. 本次涉及前端、后端、数据库还是共享类型
3. 会新增哪些文件
4. 会修改哪些文件
5. 每个文件的职责
6. 是否复用已有模块，还是新增模块

说明完成后，再开始写代码

## 严格禁止

* 禁止把完整功能写进一个文件
* 禁止把所有接口写进一个文件
* 禁止把所有样式写进一个文件
* 禁止在组件中同时堆 UI、状态、请求、复杂计算
* 禁止在 controller 中写复杂业务逻辑
* 禁止在 repository 中写业务规则
* 禁止在没有理解现有结构前直接大改
* 禁止重复造组件、hook、service
* 禁止引入不必要的复杂依赖
* 禁止为了快而牺牲结构
* 禁止吞掉错误
* 禁止绕过参数校验和权限校验

## 完成后必须输出

每次完成任务后，必须说明

* 新增了哪些文件
* 修改了哪些文件
* 删除了哪些文件
* 每个文件的职责
* 前端改动点
* 后端改动点
* API 是否变化
* 数据库是否变化
* 类型是否变化
* 是否需要补充测试
* 是否存在可继续拆分或优化的地方