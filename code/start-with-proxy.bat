@echo off
chcp 65001 >nul
REM Kiro API Server 启动脚本（带代理）
REM 用法: start-with-proxy.bat [proxy_url]
REM 示例: start-with-proxy.bat http://127.0.0.1:7890

setlocal

REM 默认代理地址
set DEFAULT_PROXY=http://127.0.0.1:7890

REM 使用传入的代理地址或默认值
if "%~1"=="" (
    set PROXY_URL=%DEFAULT_PROXY%
) else (
    set PROXY_URL=%~1
)

echo ==========================================
echo   Kiro API Server 启动脚本
echo ==========================================
echo.
echo 代理地址: %PROXY_URL%
echo.

REM 设置代理环境变量
set WARP_DEBUG=false
set HTTP_PROXY=%PROXY_URL%
set HTTPS_PROXY=%PROXY_URL%
set http_proxy=%PROXY_URL%
set https_proxy=%PROXY_URL%

REM 可选：设置不走代理的地址
set NO_PROXY=localhost,127.0.0.1,::1
set no_proxy=localhost,127.0.0.1,::1

echo 已设置环境变量:
echo   HTTP_PROXY=%HTTP_PROXY%
echo   HTTPS_PROXY=%HTTPS_PROXY%
echo   NO_PROXY=%NO_PROXY%
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

echo 启动服务器...
echo.

REM 启动服务器
node src/server.js

endlocal
