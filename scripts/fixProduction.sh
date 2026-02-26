#!/bin/bash

# Production Fix Script - ApnaSchool
# This script fixes CORS and authentication issues
# Run this ON THE PRODUCTION SERVER

echo "=========================================="
echo "   ApnaSchool Production Fix Script"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Creating .env file..."
    touch .env
fi

echo -e "${YELLOW}Step 1: Backing up current .env...${NC}"
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ Backup created${NC}"
echo ""

echo -e "${YELLOW}Step 2: Updating .env file...${NC}"

cat > .env << 'EOF'
MONGO_URI=mongodb+srv://apnaschool:467441ABc@apnaschool.4f8fbj7.mongodb.net/apnaschool?retryWrites=true&w=majority&appName=ApnaSchool
JWT_SECRET=3KUYUXgzln/hIGlap9OIglfGRy5ukRA+gIXX4fZy14kAx9TIH5m4X/0iSz+b/QQgtqyEokCkEuuQclHwWOsYeA==
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://www.apnaschooledu.com
SESSION_SECRET=CdCZr1565RK20NqOw9DsSr3wQ/G2si10/ZKkCITuV+tqnXXqBzX6YLJOPkNDDu7dmLe8evf4BHIuQt7RrTRGUQ==
MAX_FILE_SIZE=10
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
EMAIL_SERVICE=gmail
EMAIL_USER=apnaschooledu@gmail.com
EMAIL_PASSWORD=cxhvkmlvjslsyyau
CLOUDINARY_CLOUD_NAME=doedfkz64
CLOUDINARY_API_KEY=835384422835552
CLOUDINARY_API_SECRET=OMfGw0whneWqeD5DUcPCMv9tubc
CLOUDINARY_URL=cloudinary://835384422835552:OMfGw0whneWqeD5DUcPCMv9tubc@doedfkz64
EOF

echo -e "${GREEN}✓ .env file updated${NC}"
echo ""

echo -e "${YELLOW}Step 3: Verifying critical variables...${NC}"
source .env

if [ -z "$FRONTEND_URL" ]; then
    echo -e "${RED}❌ FRONTEND_URL not set!${NC}"
    exit 1
else
    echo -e "${GREEN}✓ FRONTEND_URL: $FRONTEND_URL${NC}"
fi

if [ -z "$JWT_SECRET" ]; then
    echo -e "${RED}❌ JWT_SECRET not set!${NC}"
    exit 1
else
    echo -e "${GREEN}✓ JWT_SECRET: [HIDDEN]${NC}"
fi

if [ -z "$MONGO_URI" ]; then
    echo -e "${RED}❌ MONGO_URI not set!${NC}"
    exit 1
else
    echo -e "${GREEN}✓ MONGO_URI: [HIDDEN]${NC}"
fi

echo ""

echo -e "${YELLOW}Step 4: Installing dependencies...${NC}"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}node_modules not found, running npm install...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    # Check if cloudinary is installed
    if [ ! -d "node_modules/cloudinary" ]; then
        echo -e "${YELLOW}Missing cloudinary package, running npm install...${NC}"
        npm install
        echo -e "${GREEN}✓ Dependencies installed${NC}"
    else
        echo -e "${GREEN}✓ Dependencies already installed${NC}"
    fi
fi

echo ""

echo -e "${YELLOW}Step 5: Restarting backend with PM2...${NC}"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 not found!${NC}"
    echo "Install PM2: npm install -g pm2"
    exit 1
fi

# Restart with updated env
pm2 restart all --update-env

echo -e "${GREEN}✓ Backend restarted${NC}"
echo ""

echo -e "${YELLOW}Step 6: Testing health endpoint...${NC}"
sleep 2

HEALTH_RESPONSE=$(curl -s http://localhost:5000/api/health)

if [[ $HEALTH_RESPONSE == *"ok"* ]]; then
    echo -e "${GREEN}✓ Health check passed!${NC}"
    echo "Response: $HEALTH_RESPONSE"
else
    echo -e "${RED}❌ Health check failed!${NC}"
    echo "Response: $HEALTH_RESPONSE"
    echo ""
    echo "Check logs with: pm2 logs"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Production fix completed successfully!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Clear browser cache (Ctrl+Shift+R)"
echo "2. Clear localStorage in browser console"
echo "3. Try logging in again"
echo ""
echo "Monitor logs: pm2 logs backend"
echo "View status: pm2 status"
echo ""
