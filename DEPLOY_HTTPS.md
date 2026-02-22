# clab.one Nginx + Let's Encrypt (Docker)

## 1) DNS
- Point `clab.one` A/AAAA record to this server public IP.
- Point `www.clab.one` CNAME (or A/AAAA) to same target.

## 2) Open ports
- Allow inbound `80/tcp` and `443/tcp` on server firewall/security group.

## 3) Issue first certificate
```bash
chmod +x scripts/ssl-issue.sh scripts/ssl-renew.sh
./scripts/ssl-issue.sh your-email@your-domain.com
```

## 4) Start/stop Nginx
```bash
docker compose -f docker-compose.nginx.yml up -d nginx snapshot-worker
docker compose -f docker-compose.nginx.yml down
```

## 5) Renew certificate
```bash
./scripts/ssl-renew.sh
```

## 6) Snapshot auto-update without cron
- `snapshot-worker` runs inside Docker and updates rotating protocol snapshots every 5 minutes.
- Tune interval/batch in `docker-compose.nginx.yml` via:
  - `SNAPSHOT_INTERVAL_SECONDS` (default `300`)
  - `SNAPSHOT_BATCH_SIZE` (default `1`)
