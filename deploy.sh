#!/bin/bash
# Deploy NOVATerra to production
# Usage: ./deploy.sh
cd "$(dirname "$0")/app" && npx vercel --prod
