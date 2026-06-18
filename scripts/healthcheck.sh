#!/bin/bash

API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ "$API" != "200" ]; then
  echo "[$(date)] Backend DOWN! HTTP: $API" >> /var/log/guven-health.log
  pm2 restart guven-backend
fi
