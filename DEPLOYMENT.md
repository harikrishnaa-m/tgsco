# Deployment

The API runs as a single Docker container on the Hostzop VM (`103.94.27.225`)
and is served at `https://tgscobackend.qmarkdesk.com`.

```text
push to main ──► GitHub Actions: lint + test ──► build image ──► push to GHCR
                                                                   │
            server: docker compose pull && up -d  ◄──── SSH ───────┘

internet ──► host nginx :443 (TLS) ──► 127.0.0.1:5050 ──► container :5000
```

- **Server credentials** are GitHub repository secrets.
- **Application secrets** exist only on the server in `/opt/tgsco-backend/.env`.
- The container is isolated from other projects on the VM: its own Compose
  project (`tgsco-backend`), its own network, published only on
  `127.0.0.1:5050`, a 1 GB memory cap, and rotated logs. Deploys only prune
  images labelled `com.qmarkdesk.app=tgsco-backend`.
- MongoDB is Atlas, so there is no database container.

| File                                           | Purpose                                                   |
| ---------------------------------------------- | --------------------------------------------------------- |
| `Dockerfile`                                   | Production image (Node 22 Alpine, non-root, health check) |
| `.github/workflows/deploy.yml`                 | CI/CD: test on PRs and pushes, build + deploy on `main`   |
| `deploy/docker-compose.yml`                    | Server stack; CI copies it to `/opt/tgsco-backend`        |
| `deploy/remote-deploy.sh`                      | Runs on the server over SSH: pull, restart, wait, prune   |
| `deploy/nginx/tgscobackend.qmarkdesk.com.conf` | Host nginx reverse-proxy site                             |

## One-time setup

### 1. DNS

Create an `A` record for `tgscobackend.qmarkdesk.com` pointing to
`103.94.27.225`.

### 2. Check what is already on the server

```bash
docker --version && docker compose version   # Compose v2 plugin is required
sudo ss -ltnp '( sport = :80 or sport = :443 or sport = :5050 )'
```

- **Port 5050** must be free. If it is taken, change it in both
  `deploy/docker-compose.yml` and the nginx site file.
- **Ports 80/443** decide how the domain is published:
  - **Host nginx owns them** (or nothing does): follow step 3.
  - **The other project's container owns them** (for example an nginx,
    Traefik, or Caddy container): skip step 3. Give that proxy access to this
    stack with `docker network connect tgsco-backend_default <proxy-container>`
    after the first deploy, then route the domain to `http://tgsco-backend:5000`
    in that proxy's config. Redo the network connect if the proxy container is
    ever recreated, or add the network to that project's compose file as an
    external network.

### 3. Reverse proxy and HTTPS (host nginx)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx   # skip if already installed
sudo cp tgscobackend.qmarkdesk.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/tgscobackend.qmarkdesk.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tgscobackend.qmarkdesk.com --redirect
```

Copy the site file from `deploy/nginx/` in this repository. Certbot adds the
TLS block and renews the certificate automatically. It only edits this site,
so the other project's sites are untouched.

### 4. Deploy user and SSH key

Generate a key pair used only by GitHub Actions (on any machine):

```bash
ssh-keygen -t ed25519 -C "github-actions-tgsco" -f tgsco_deploy -N ""
```

On the server, authorize the public key for the deploy user. That user must be
able to run `docker` (root, or a member of the `docker` group) and write to
`/opt/tgsco-backend`:

```bash
sudo mkdir -p /opt/tgsco-backend
sudo chown <deploy-user>: /opt/tgsco-backend
# append tgsco_deploy.pub to ~<deploy-user>/.ssh/authorized_keys
```

### 5. Application secrets on the server

Create `/opt/tgsco-backend/.env` and restrict it to the deploy user:

```bash
cd /opt/tgsco-backend
nano .env
chmod 600 .env
```

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.typywei.mongodb.net/tgsco
CORS_ORIGIN=https://<frontend-domain>,https://<admin-domain>
LOG_LEVEL=info
DEFAULT_ADMIN_EMAIL=<admin email>
DEFAULT_ADMIN_PASSWORD=<strong password>
ACCESS_TOKEN_SECRET=<output of: openssl rand -hex 32>
ACCESS_TOKEN_EXPIRES_IN=24h
REFRESH_TOKEN_TTL_DAYS=30
DO_SPACES_ENDPOINT=https://blr1.digitaloceanspaces.com
DO_SPACES_REGION=blr1
DO_SPACES_BUCKET=<bucket>
DO_SPACES_KEY=<key>
DO_SPACES_SECRET=<secret>
DO_SPACES_CDN_URL=
```

`NODE_ENV` and `PORT` are set by the compose file and do not belong here.
Docker Compose expands `$` in this file, so wrap any value containing `$` in
single quotes (`KEY='pa$$word'`).

### 6. MongoDB Atlas

In Atlas **Network Access**, add `103.94.27.225` to the IP access list.

### 7. GitHub repository secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret            | Value                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SSH_HOST`        | `103.94.27.225`                                                                                                              |
| `SSH_USER`        | The deploy user from step 4                                                                                                  |
| `SSH_PRIVATE_KEY` | Full contents of the private key file `tgsco_deploy`                                                                         |
| `SSH_PORT`        | Optional; defaults to `22`                                                                                                   |
| `SSH_KNOWN_HOSTS` | Recommended: output of `ssh-keyscan 103.94.27.225` from a trusted machine. Without it, the host key is scanned on every run. |

The workflow pulls the private image with its own short-lived `GITHUB_TOKEN`
and logs out after each deploy, so the server keeps no registry credentials.

### 8. First deploy

Push to `main`, or open **Actions → CI/CD → Run workflow**. The deploy job
fails if the container is not healthy within 120 seconds or if
`https://tgscobackend.qmarkdesk.com/api/v1/health` does not respond, so
finish steps 1–7 first.

## Operations

All commands run in `/opt/tgsco-backend` on the server.

| Task                   | Command                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| Status                 | `docker compose ps`                                                              |
| Logs                   | `docker compose logs -f --tail 200`                                              |
| Apply a changed `.env` | `docker compose up -d --force-recreate`                                          |
| Restart                | `docker compose restart`                                                         |
| Roll back              | **Actions → CI/CD → Run workflow** with `image_tag` set to an earlier commit SHA |

Every `main` build is tagged in GHCR with its commit SHA, so any earlier build
can be redeployed without rebuilding.
