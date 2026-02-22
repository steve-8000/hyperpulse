#!/usr/bin/env bash
set -euo pipefail

DOMAIN="clab.one"
EMAIL="${1:-admin@clab.one}"

mkdir -p deploy/letsencrypt deploy/certbot-www

docker compose -f docker-compose.nginx.yml down nginx 2>/dev/null || true

docker run --rm \
  -p 80:80 \
  -v "$(pwd)/deploy/letsencrypt:/etc/letsencrypt" \
  -v "$(pwd)/deploy/certbot-www:/var/www/certbot" \
  certbot/certbot:latest certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  -d "${DOMAIN}" \
  -d "www.${DOMAIN}"

docker compose -f docker-compose.nginx.yml up -d nginx
