#!/bin/bash
# Our Space - 一键推送到 GitHub 脚本
# 使用前请确保：
# 1. 已安装 Git (https://git-scm.com/downloads)
# 2. 已注册 GitHub 账号 (https://github.com/signup)
# 3. 已登录 GitHub (运行: gh auth login 或在浏览器登录)

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo ""
echo "========================================="
echo "  Our Space - 推送到 GitHub"
echo "========================================="
echo ""

# Check if GitHub CLI is available
if command -v gh &>/dev/null; then
  echo "[1/3] 使用 GitHub CLI 创建仓库..."
  
  # Check if already authenticated
  if gh auth status &>/dev/null 2>&1; then
    echo "  已登录 GitHub"
    REPO_NAME="our-space"
    echo "  创建仓库: $REPO_NAME ..."
    gh repo create "$REPO_NAME" --public --source=. --push
    echo ""
    echo "  仓库创建成功！"
    echo ""
    # Get the repo URL
    REPO_URL=$(gh repo view --json url -q '.url' 2>/dev/null || echo "")
    if [ -n "$REPO_URL" ]; then
      echo "  GitHub: $REPO_URL"
    fi
  else
    echo "  未登录 GitHub，请先运行: gh auth login"
    exit 1
  fi

else
  # Manual approach
  echo "未检测到 GitHub CLI，使用手动方式..."
  echo ""
  echo "请按以下步骤操作："
  echo ""
  echo "  第一步：在 GitHub 上创建仓库"
  echo "    1. 打开 https://github.com/new"
  echo "    2. 仓库名填: our-space"
  echo "    3. 选择 Public"
  echo "    4. 不要勾选 'Add a README'"
  echo "    5. 点 Create repository"
  echo ""
  echo "  第二步：记下你的 GitHub 用户名"
  echo "    例如: your-username"
  echo ""
  read -p "  输入你的 GitHub 用户名: " GH_USER
  
  if [ -z "$GH_USER" ]; then
    echo "  用户名不能为空"
    exit 1
  fi

  REPO_URL="https://github.com/${GH_USER}/our-space.git"
  echo ""
  echo "[2/3] 添加远程仓库..."
  git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
  
  echo "[3/3] 推送代码..."
  git push -u origin main
  
  echo ""
  echo "  推送成功！"
  echo "  GitHub: https://github.com/${GH_USER}/our-space"
fi

echo ""
echo "========================================="
echo "  下一步：部署到 Render"
echo "========================================="
echo ""
echo "1. 打开 https://render.com 并注册（可用 GitHub 账号登录）"
echo "2. 点 New + -> Web Service"
echo "3. 连接你的 GitHub 仓库 our-space"
echo "4. 配置（会自动识别 render.yaml）："
echo "   - Root Directory: （留空，用默认）"
echo "   - Build Command: cd backend && npm install"
echo "   - Start Command: cd backend && node server.js"
echo "5. 点 Create Web Service"
echo "6. 等待 2-3 分钟部署完成"
echo "7. 获得 https://our-space-xxxx.onrender.com 链接"
echo ""
echo "完成后把链接发给对方即可！"
echo ""
