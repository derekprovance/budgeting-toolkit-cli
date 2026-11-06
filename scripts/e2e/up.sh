#!/usr/bin/env bash
# Start the ephemeral e2e Firefly III and bootstrap it: first user + API token.
#
# Writes (all gitignored, under .e2e/):
#   app-key     32-char Laravel APP_KEY, mounted into the container as a secret
#   env         FIREFLY_API_URL / FIREFLY_API_TOKEN for the CLI (mode 600)
#   state.json  {"port": <host port>, "url": "..."}
#
# Idempotent: rerunning against a running stack reuses the user, and reuses the
# token in .e2e/env when it still authenticates. It only ever talks to the
# containers of the btk-e2e compose project, on 127.0.0.1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.e2e.yml)
STATE_DIR="$ROOT/.e2e"
E2E_EMAIL='e2e@btk.invalid'

log() { printf '[e2e:up] %s\n' "$*" >&2; }
die() { printf '[e2e:up] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die 'docker is not installed'
command -v curl >/dev/null || die 'curl is not installed'

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

# Keep an existing APP_KEY: a running container already holds it.
if [[ ! -s "$STATE_DIR/app-key" ]]; then
    log 'generating APP_KEY'
    (umask 077 && openssl rand -hex 16 | tr -d '\n' > "$STATE_DIR/app-key")
fi
[[ "$(wc -c < "$STATE_DIR/app-key" | tr -d ' ')" == 32 ]] || die '.e2e/app-key must be exactly 32 characters'

log 'starting btk-e2e stack'
"${COMPOSE[@]}" up -d --wait

binding="$("${COMPOSE[@]}" port firefly 8080)"
host="${binding%:*}"
port="${binding##*:}"
[[ "$host" == 127.0.0.1 ]] || die "firefly is bound to '$host', expected 127.0.0.1"
[[ "$port" =~ ^[0-9]+$ ]] || die "could not resolve firefly port from '$binding'"
# The CLI appends /api itself (src/cli.ts: BASE = url + '/api').
url="http://127.0.0.1:$port"
log "firefly at $url"

api() { # api <token> <path>
    curl -fsS --max-time 10 \
        -H "Authorization: Bearer $1" \
        -H 'Accept: application/vnd.api+json' \
        "$url/api$2"
}

# Reuse the existing token if it still authenticates as the e2e user.
token=''
if [[ -s "$STATE_DIR/env" ]]; then
    existing="$(sed -n 's/^FIREFLY_API_TOKEN=//p' "$STATE_DIR/env")"
    if [[ -n "$existing" ]] && api "$existing" /v1/about/user 2>/dev/null | grep -q "\"email\":\"$E2E_EMAIL\""; then
        log 'reusing token from .e2e/env'
        token="$existing"
    fi
fi

if [[ -z "$token" ]]; then
    log 'creating user and personal access token'
    bootstrap_out="$("${COMPOSE[@]}" exec -T -e E2E_EMAIL="$E2E_EMAIL" firefly php 2>/dev/null <<'PHP'
<?php
// Runs inside the Firefly container, piped to `php` on stdin. Idempotent.
chdir('/var/www/html');
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use FireflyIII\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

$email = getenv('E2E_EMAIL');
$user  = User::where('email', $email)->first();
if (null === $user) {
    if (User::count() > 0) {
        fwrite(STDERR, "refusing: database already has users, none of them {$email}\n");
        exit(3);
    }
    // system:create-first-user refuses unless app.env is "testing". Flip it for
    // this process only, so the web container keeps running as APP_ENV=local.
    config(['app.env' => 'testing']);
    $rc = Artisan::call('system:create-first-user', ['email' => $email]);
    config(['app.env' => 'local']);
    if (0 !== $rc) {
        fwrite(STDERR, 'system:create-first-user failed: ' . Artisan::output());
        exit(4);
    }
    $user = User::where('email', $email)->firstOrFail();
}

// Passport needs a personal access client before createToken() works; a fresh
// install has none.
$hasPersonal = DB::table('oauth_clients')
    ->where('revoked', false)
    ->where('grant_types', 'like', '%personal_access%')
    ->exists();
if (!$hasPersonal) {
    $rc = Artisan::call('passport:client', [
        '--personal' => true, '--name' => 'btk-e2e personal', '--provider' => 'users', '--no-interaction' => true,
    ]);
    if (0 !== $rc) {
        fwrite(STDERR, 'passport:client failed: ' . Artisan::output());
        exit(5);
    }
}

// Firefly logs to stdout, so compute first and print on a marked line.
$token = $user->createToken('btk-e2e')->accessToken;
echo PHP_EOL, 'BTK_E2E_TOKEN=', $token, PHP_EOL;
PHP
)" || die 'bootstrap inside the firefly container failed (rerun without 2>/dev/null to see why)'
    token="$(printf '%s\n' "$bootstrap_out" | sed -n 's/^BTK_E2E_TOKEN=//p' | tail -1)"
    [[ -n "$token" ]] || die 'bootstrap produced no token'
fi

# Write via temp file + rename so a partial file never exists.
(
    umask 077
    printf 'FIREFLY_API_URL=%s\nFIREFLY_API_TOKEN=%s\n' "$url" "$token" > "$STATE_DIR/env.tmp"
    mv "$STATE_DIR/env.tmp" "$STATE_DIR/env"
)
chmod 600 "$STATE_DIR/env"
printf '{\n  "port": %s,\n  "url": "%s"\n}\n' "$port" "$url" > "$STATE_DIR/state.json"

about="$(api "$token" /v1/about/user)" || die 'smoke check /api/v1/about/user failed'
grep -q "\"email\":\"$E2E_EMAIL\"" <<<"$about" || die "token does not belong to $E2E_EMAIL: $about"
log "ready: $url as $E2E_EMAIL (credentials in .e2e/env)"
