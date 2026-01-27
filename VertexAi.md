
⏺ 在 GCP 控制台创建服务账号

  步骤 1：进入 GCP 控制台

  访问 https://console.cloud.google.com/

  步骤 2：创建或选择项目

  1. 点击顶部的项目选择器
  2. 创建新项目或选择已有项目

  步骤 3：启用 Vertex AI API

  1. 进入 APIs & Services > Library
  2. 搜索 "Vertex AI API"
  3. 点击 Enable 启用

  步骤 4：创建服务账号

  1. 进入 IAM & Admin > Service Accounts
    - 直接链接：https://console.cloud.google.com/iam-admin/serviceaccounts
  2. 点击 + CREATE SERVICE ACCOUNT
  3. 填写信息：
    - Service account name: vertex-ai-client（自定义名称）
    - Service account ID: 自动生成
    - 点击 CREATE AND CONTINUE
  4. 授予角色（重要）：
    - 点击 Select a role
    - 搜索并添加：Vertex AI User (roles/aiplatform.user)
    - 点击 CONTINUE
  5. 点击 DONE

  步骤 5：创建并下载密钥

  1. 在服务账号列表中，点击刚创建的账号
  2. 进入 KEYS 标签页
  3. 点击 ADD KEY > Create new key
  4. 选择 JSON 格式
  5. 点击 CREATE
  6. 浏览器会自动下载 JSON 密钥文件

  步骤 6：导入到系统

  下载的 JSON 文件内容类似：

  {
    "type": "service_account",
    "project_id": "your-project-id",
    "private_key_id": "abc123...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "vertex-ai-client@your-project-id.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }

  然后导入：

  # 将 JSON 文件内容作为 keyJson 参数
  curl -X POST 'http://localhost:13004/api/vertex/credentials/import' \
    -H 'Content-Type: application/json' \
    -d '{
      "name": "my-gcp-account",
      "region": "us-central1",
      "keyJson": <粘贴整个 JSON 文件内容>
    }'

  注意事项

  1. 计费：需要在 GCP 项目中启用计费账户
  2. 配额：Vertex AI 有使用配额限制，可在 IAM & Admin > Quotas 查看
  3. 区域：不同区域支持的模型可能不同，推荐使用 us-central1
  4. 安全：JSON 密钥文件包含私钥，请妥善保管，不要泄露