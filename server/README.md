# 服务端（Business API）

该目录提供插件配套的业务接口服务，插件会把买家消息、场景、语气等业务字段发到本服务，再由本服务转调大模型。

## 目录说明

- `app.py`：FastAPI 服务入口
- `requirements.txt`：Python 依赖
- `.env.example`：环境变量示例

## 接口约定

- `POST /reply`
  - 入参（JSON）：
    - `message`：买家消息
    - `scene`：场景
    - `tone`：语气
    - `localReply`：插件本地模板
    - `instruction`：额外指令
  - 请求头（鉴权）：
    - `X-Assistant-Token`：接口访问令牌（必填）
  - 出参（JSON）：
    - `reply`：建议回复文本
    - `source`：`model` 或 `rule`
    - `meta`：诊断信息（`reason`、`model`、`latencyMs`）

- `GET /health`
  - 健康检查与配置状态

## 快速启动

1. 安装依赖

```bash
pip install -r requirements.txt
```

2. 配置环境变量（可复制 `.env.example`）

必填建议：
- `LLM_BASE_URL`：模型 API 的 base_url（示例 `http://127.0.0.1:11434/v1`）
- `LLM_MODEL`：默认模型名（示例 `Qwen3-VL-8B-Instruct`）
- `LLM_API_KEY`：如模型服务需要鉴权则填写
- `SERVICE_ACCESS_TOKEN`：业务接口访问令牌（插件需一致）

鉴权开关：
- `SERVICE_REQUIRE_TOKEN=true`：默认开启，未携带正确令牌会返回 `401`

3. 启动服务

```bash
python app.py
```

默认监听：`http://127.0.0.1:8787`

## 插件配置建议

在插件设置页填写：
- 模型接口地址：`http://127.0.0.1:8787/reply`
- 接口访问令牌：与 `SERVICE_ACCESS_TOKEN` 保持一致
