@echo off
chcp 65001 >nul
echo ==========================================
echo   大金台球赛事管理系统 - GitHub Pages 部署脚本
echo ==========================================
echo.

set REPO_NAME=billiards-tournament
set GITHUB_USER=xianshengsong391-svg

echo 步骤1: 在GitHub创建仓库...
echo 请访问: https://github.com/new
echo 仓库名填写: %REPO_NAME%
echo 选择 Public
echo 不要勾选 README 或 .gitignore
echo.
pause

echo.
echo 步骤2: 连接远程仓库...
git remote remove origin 2>nul
git remote add origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git

echo.
echo 步骤3: 推送到GitHub...
git branch -M main
git push -u origin main

echo.
echo 步骤4: 启用GitHub Pages...
echo 请访问: https://github.com/%GITHUB_USER%/%REPO_NAME%/settings/pages
echo Source 选择 "Deploy from a branch"
echo Branch 选择 "main" / "/ (root)"
echo 点击 Save
echo.
pause

echo.
echo ==========================================
echo 部署完成!
echo 网站地址: https://%GITHUB_USER%.github.io/%REPO_NAME%/
echo ==========================================
pause
