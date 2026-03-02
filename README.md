# ali-platform-agent

淘宝/闲鱼/飞猪客服场景的本地化 AI 回复助手。

## 目录结构

- `plugin/`：Chrome 插件（高频客服侧边栏）
- `server/`：业务接口服务（可对接自部署大模型）

## 快速开始

1. 启动服务端（推荐）
   - 进入 `server/`
   - 安装依赖：`pip install -r requirements.txt`
   - 配置令牌：设置 `SERVICE_ACCESS_TOKEN`
   - 启动：`python app.py`

2. 加载插件
   - 打开 `chrome://extensions/`
   - 开启开发者模式
   - 点击“加载已解压的扩展程序”
   - 选择 `plugin/` 目录

3. 在插件设置页填写接口
   - 模型接口地址：`http://127.0.0.1:8787/reply`
   - 接口访问令牌：与服务端 `SERVICE_ACCESS_TOKEN` 保持一致

4. 没有店铺账号也可演示
   - 在侧边栏展开“本地测试模式（无店铺也可演示）”
   - 输入测试消息后点击“写入并生成”

## 文档

- [插件文档](plugin/README.md)
- [服务端文档](server/README.md)
