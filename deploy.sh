#!/bin/bash

# ==============================================
# Bar Raiser AI 一键部署脚本
# ==============================================

set -e

echo "=============================================="
echo "🚀 Bar Raiser AI 部署脚本"
echo "=============================================="
echo ""

# 配置参数
PROJECT_DIR=$(pwd)
DATA_DIR="$PROJECT_DIR/data"
ENV_FILE="$PROJECT_DIR/.env"
DOCKER_IMAGE="bar-raiser-ai"
DOCKER_CONTAINER="bar-raiser-ai"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 输出函数
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. 检查环境
print_info "检查部署环境..."

# 检查 Docker
if command -v docker &> /dev/null; then
    print_info "✓ Docker 已安装"
    USE_DOCKER=true
else
    print_warning "Docker 未找到，将使用直接部署方式"
    USE_DOCKER=false
fi

# 2. 拉取最新代码
print_info "拉取最新代码..."
if [ -d ".git" ]; then
    git pull origin main
    print_info "✓ 代码已更新"
else
    print_warning "不是 git 仓库，跳过拉取"
fi

# 3. 检查环境配置
if [ ! -f "$ENV_FILE" ]; then
    print_warning ".env 文件不存在"
    if [ -f ".env.production" ]; then
        print_info "使用 .env.production 作为模板"
        cp .env.production .env
        print_warning "⚠️  请编辑 .env 文件，替换 your-domain.com 为你的实际域名！"
        echo ""
        echo "编辑完成后重新运行此脚本，或按 Ctrl+C 退出"
        read -p "按回车键继续（将使用当前配置）..."
    elif [ -f ".env.example" ]; then
        cp .env.example .env
        print_warning "⚠️  请编辑 .env 文件，填入你的配置！"
        echo ""
        echo "编辑完成后重新运行此脚本，或按 Ctrl+C 退出"
        read -p "按回车键继续（将使用当前配置）..."
    else
        print_error "无法找到配置文件模板！"
        exit 1
    fi
else
    print_info "✓ .env 文件已存在"
fi

# 4. 创建数据目录
print_info "创建数据目录..."
mkdir -p "$DATA_DIR"
print_info "✓ 数据目录已准备"

# 5. 安装依赖和构建
print_info "安装依赖并构建前端..."
npm install
npm run build
print_info "✓ 构建完成"

# 6. 部署
echo ""
print_info "开始部署..."

if [ "$USE_DOCKER" = true ]; then
    echo ""
    print_info "使用 Docker 部署..."
    
    # 停止并删除旧容器
    if [ "$(docker ps -q -f name=$DOCKER_CONTAINER)" ]; then
        print_info "停止旧容器..."
        docker stop $DOCKER_CONTAINER
        docker rm $DOCKER_CONTAINER
    fi
    
    # 构建新镜像
    print_info "构建 Docker 镜像..."
    docker build -t $DOCKER_IMAGE .
    
    # 启动新容器
    print_info "启动新容器..."
    docker run -d \
        -p 3000:3000 \
        -v "$DATA_DIR:/app/data" \
        -v "$ENV_FILE:/app/.env" \
        --name $DOCKER_CONTAINER \
        --restart unless-stopped \
        $DOCKER_IMAGE
    
    print_info "✓ Docker 容器已启动"
    echo ""
    print_info "查看容器状态:"
    docker ps --filter name=$DOCKER_CONTAINER
    echo ""
    print_info "查看日志:"
    echo "  docker logs -f $DOCKER_CONTAINER"
    
else
    echo ""
    print_info "使用直接部署方式..."
    
    # 检查是否安装了 PM2
    if command -v pm2 &> /dev/null; then
        print_info "使用 PM2 启动服务..."
        pm2 delete $DOCKER_CONTAINER 2>/dev/null || true
        pm2 start npm --name $DOCKER_CONTAINER -- start
        pm2 save
        print_info "✓ PM2 服务已启动"
        echo ""
        print_info "查看服务状态:"
        pm2 status
        echo ""
        print_info "查看日志:"
        echo "  pm2 logs $DOCKER_CONTAINER"
    else
        print_warning "PM2 未找到，直接启动服务（不推荐用于生产环境）"
        npm start
    fi
fi

echo ""
echo "=============================================="
print_info "🎉 部署完成！"
echo "=============================================="
echo ""
print_info "服务访问地址："
grep "FRONTEND_URL" "$ENV_FILE" || true
echo ""
print_info "下一步："
echo "1. 配置 Nginx 或其他反向代理（如果需要）"
echo "2. 配置 HTTPS 证书（推荐使用 Let's Encrypt）"
echo "3. 配置防火墙规则，只开放必要端口"
echo ""
print_info "需要帮助请查看 DEPLOYMENT.md 文件"
