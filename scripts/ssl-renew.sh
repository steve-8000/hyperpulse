#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.nginx.yml run --rm certbot renew \
  --webroot \
  -w /var/www/certbot

docker compose -f docker-compose.nginx.yml exec nginx nginx -s reload
