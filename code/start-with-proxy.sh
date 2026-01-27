#!/bin/bash

# Kiro API Server 启动脚本（带代理）
# 用法: ./start-with-proxy.sh [proxy_url]
# 示例: ./start-with-proxy.sh http://127.0.0.1:7890

# 默认代理地址
DEFAULT_PROXY="http://127.0.0.1:7890"

# 使用传入的代理地址或默认值
PROXY_URL="${1:-$DEFAULT_PROXY}"

echo "=========================================="
echo "  Kiro API Server 启动脚本"
echo "=========================================="
echo ""
echo "代理地址: $PROXY_URL"
echo ""

# 设置代理环境变量
export HTTP_PROXY="$PROXY_URL"
export HTTPS_PROXY="$PROXY_URL"
export http_proxy="$PROXY_URL"
export https_proxy="$PROXY_URL"

# 可选：设置不走代理的地址
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="localhost,127.0.0.1,::1"

echo "已设置环境变量:"
echo "  HTTP_PROXY=$HTTP_PROXY"
echo "  HTTPS_PROXY=$HTTPS_PROXY"
echo "  NO_PROXY=$NO_PROXY"
echo ""

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "启动服务器..."
echo ""

# 启动服务器
node src/server.js
