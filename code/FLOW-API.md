# Flow API 使用文档

> **提示**: Flow API 使用 Playwright 自动获取 reCAPTCHA token，首次使用需要安装：`npm install playwright && npx playwright install chromium`

Flow API 提供 OpenAI 兼容的接口，用于调用 Google Labs 的图片和视频生成服务（Imagen、Gemini、Veo）。

## 目录

- [快速开始](#快速开始)
- [API 端点](#api-端点)
- [支持的模型](#支持的模型)
- [Token 管理](#token-管理)
- [使用示例](#使用示例)

---

## 快速开始

### 1. 获取 Session Token (ST)

1. 访问 [Google Labs Flow](https://labs.google/fx)
2. 登录 Google 账号
3. 打开浏览器开发者工具 (F12)
4. 在 Application > Cookies 中找到 `__Secure-next-auth.session-token`
5. 复制该 Cookie 的值，即为 ST

### 2. 添加 Token

通过 Web 管理界面或 API 添加 Token：

```bash
curl -X POST 'http://localhost:13004/api/flow/tokens' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -d '{
    "st": "YOUR_SESSION_TOKEN",
    "remark": "我的账号",
    "imageEnabled": true,
    "videoEnabled": true
  }'
```

### 3. 调用生成 API

```bash
curl -X POST 'http://localhost:13004/flow/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gemini-3.0-pro-image-landscape",
    "messages": [
      {"role": "user", "content": "一只可爱的猫咪在阳光下睡觉"}
    ]
  }'
```

---

## API 端点

### OpenAI 兼容接口

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/flow/v1/models` | 获取支持的模型列表 |
| POST | `/flow/v1/chat/completions` | 生成图片/视频 |

### Token 管理接口

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/flow/tokens` | 获取所有 Token |
| GET | `/api/flow/tokens/:id` | 获取单个 Token |
| POST | `/api/flow/tokens` | 添加新 Token |
| POST | `/api/flow/tokens/batch` | 批量添加 Token |
| PUT | `/api/flow/tokens/:id` | 更新 Token |
| DELETE | `/api/flow/tokens/:id` | 删除 Token |
| POST | `/api/w/tokens/:id/enable` | 启用 Token |
| POST | `/api/flow/tokens/:id/disable` | 禁用 Token |
| POST | `/api/flow/tokens/:id/refresh-credits` | 刷新余额 |
| POST | `/api/flow/tokens/batch-refresh-credits` | 批量刷新余额 |

---

## 支持的模型

### 图片生成模型

| 模型 ID | 描述 | 比例 |
|---------|------|------|
| `gemini-2.5-flash-image-landscape` | Gemini 2.5 Flash 图片生成 | 横版 16:9 |
| `gemini-2.5-flash-image-portrait` | Gemini 2.5 Flash 图片生成 | 竖版 9:16 |
| `gemini-3.0-pro-image-landscape` | Gemini 3.0 Pro 图片生成 | 横版 16:9 |
| `gemini-3.0-pro-image-portrait` | Gemini 3.0 Pro 图片生成 | 竖版 9:16 |
| `g-pro-image-square` | Gemini 3.0 Pro 图片生成 | 方形 1:1 |
| `imagen-4.0-generate-preview-landscape` | Imagen 4.0 图片生成 | 横版 16:9 |
| `imagen-4.0-generate-preview-portrait` | Imagen 4.0 图片生成 | 竖版 9:16 |

### 文生视频模型 (T2V)

| 模型 ID | 描述 | 比例 |
|---------|------|------|
| `veo_3_1_t2v_fast_landscape` | Veo 3.1 快速文生视频 | 横版 16:9 |
| `veo_3_1_t2v_fast_portrait` | Veo 3.1 快速文生视频 | 竖版 9:16 |
| `veo_2_0_t2v_landscape` | Veo 2.0 文生视频 | 横版 16:9 |
| `veo_2_0_t2v_portrait` | Veo 2.0 文生视频 | 竖版 9:16 |

### 图生视频模型 (I2V) - 首尾帧

| 模型 ID | 描述 | 图片数量 |
|---------|------|----------|
| `veo_3_1_i2v_s_fast_fl` | Veo 3.1 首尾帧生成 (横版) | 1-2 张 |
| `veo_3_1_i2v_s_fast_portrait_fl` | Veo 3.1 首尾帧生成 (竖版) | 1-2 张 |

### 多图参考视频模型 (R2V)

| 模型 ID | 描述 | 图片数量 |
|---------|------|----------|
| `veo_3_1_r2v_fast` | Veo 3.1 多图参考生成 (横版) | 0-N 张 |
| `veo_3_1_r2v_fast_portrait` | Veo 3.1 多图参考生成 (竖版) | 0-N 张 |

---

## Token 管理

### 添加单个 Token

```bash
curl -X POST 'http://localhost:13004/api/flow/tokens' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -d '{
    "st": "SESSION_TOKEN_VALUE",
    "remark": "备注信息",
    "imageEnabled": true,
    "videoEnabled": true
  }'
```

### 批量添加 Token

```bash
curl -X POST 'http://localhost:13004/api/flow/tokens/batch' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -d '{
    "stList": [
      "SESSION_TOKEN_1",
      "SESSION_TOKEN_2",
      "SESSION_TOKEN_3"
    ],
    "imageEnabled": true,
    "videoEnabl  }'
```

### 刷新余额

```bash
# 单个 Token
curl -X POST 'http://localhost:13004/api/flow/tokens/1/refresh-credits' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'

# 批量刷新
curl -X POST 'http://localhost:13004/api/flow/tokens/batch-refresh-credits' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

### 启用/禁用 Token

```bash
# 禁用
curl -X POST 'http://localhost:13004/api/flow/tokens/1/disable' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'

# 启用
curl -X POST 'http://localhost:13004/api/flow/tokens/1/enable' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

---

## 使用示例

### 1. 文生图

```bash
curl -X POST 'http://localhost:13004/flow/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gemini-3.0-pro-image-landscape",
    "messages": [
      {
        "role": "user",
        "content": "一只橘猫躺在窗台上晒太阳，阳光透过窗户洒在它身上"
      }
    ],
    "stream": false
  }'
```

### 2. 图生图（带参考图）

```bash
curl -X POST 'http://localhost:13004/flow/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gemini-3.0-pro-image-landscape",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "将这张图片转换为水彩画风格"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
            }
          }
        ]
      }
    ]
  }'
```

### 3. 文生视频

```bash
curl -X POST 'http://localhost:13004/flow/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "veo_3_1_t2v_fast_landscape",
    "messages": [
      {
        "role": "user",
        "content": "一只蝴蝶在花丛中飞舞，阳光明媚"
      }
    ],
    "stream": true
  }'
```

### 4. 首尾帧生成视频

```bash
curl -X POST 'http://localhost:13004/flow/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "veo_3_1_i2v_s_fast_fl",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "平滑过渡动画"
          },
          {
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64,FIRST_FRAME_BASE64"}
          },
          {
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64,LAST_FRAME_BASE64"}
          }
        ]
      }
    ],
    "stream": true
  }'
```

### 5. 流式响应处理 (JavaScript)

```javascript
const response = await fetch('http://localhost:13004/flow/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'veo_3_1_t2v_fast_landscape',
    messages: [{ role: 'user', content: '日落时分的海滩' }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        console.log('生成完成');
        break;
      }
      const parsed = JSON.parse(data);
      const content = parsed.choices[0]?.delta?.content ||
                      parsed.choices[0]?.delta?.reasoning_content;
      if (content) {
        console.log(content);
      }
    }
  }
}
```

### 6. Python 调用示例

```python
import requests

# 文生图
response = requests.post(
    'http://localhost:13004/flow/v1/chat/completions',
    json={
        'model': 'gemini-3.0-pro-image-landscape',
        'messages': [
            {'role': 'user', 'content': '一只可爱的柴犬'}
        ]
    }
)

result = response.json()
image_url = result['choices'][0]['message']['content']
print(f'生成的图片: {image_url}')
```

---

## 响应格式

### 非流式响应

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "flow2api",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "![Generated Image](https://...)"
      },
      "finish_reason": "stop"
    }
  ]
}
```

### 流式响应

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"reasoning_content":"初始化生成环境...\n"}}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"reasoning_content":"正在生成图片...\n"}}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"![Generated Image](https://...)"},"finish_reason":"stop"}]}

data: [DONE]
```

### 错误响应

```json
{
  "error": {
    "message": "错误信息",
    "type": "invalid_request_error",
    "code": "generation_failed"
  }
}
```

---

## 注意事项

1. **Playwright 依赖**: 首次使用需安装 `npm install playwright && npx playwright install chromium`
2. **非 Headless 模式**: reCAPTCHA 获取需要启动真实浏览器窗口（非 Docker 环境）
3. **Token 有效期**: Session Token 有效期有限，失效后需要重新获取
4. **余额限制**: Google Labs 账号有每日使用限制，请合理使用
5. **图片格式**: 支持 JPEG、PNG、WebP、GIF 格式的图片输入
6. **视频生成时间**: 视频生成通常需要 1-5 分钟，建议使用流式响应查看进度

### Playwright 安装

```bash
# 安装 Playwright
npm install playwright

# 安装 Chromium 浏览器
npx playwright install chromium
```

> **注意**: Docker 环境下无法使用 Playwright 有头浏览器模式，需要配置第三方打码服务（如 2Captcha、CapSolver 等）。

---

## 数据库表结构

Flow Token 存储在 `flow_tokens` 表中：

| 字段 | 类型 | 描述 |
|------|------|------|
| id | INTEGER | 主键 |
| email | TEXT | 账号邮箱 |
| st | TEXT | Session Token |
| at | TEXT | Access Token |
| at_expires_at | DATETIME | AT 过期时间 |
| credits | INTEGER | 余额 |
| is_active | BOOLEAN | 是否启用 |
| image_enabled | BOOLEAN | 是否允许图片生成 |
| video_enabled | BOOLEAN | 是否允许视频生成 |
| current_project_id | TEXT | 当前项目 ID |
| current_project_name | TEXT | 当前项目名称 |
| use_count | INTEGER | 使用次数 |
| error_count | INTEGER | 错误次数 |
| last_used_at | DATETIME | 最后使用时间 |
| remark | TEXT | 备注 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
