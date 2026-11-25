#!/usr/bin/env bash
# Provision a fresh, isolated EXM fixture without resetting existing containers.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

exm_fixture_file=.dev.vars.integrated
if [[ $# -gt 0 ]]; then exm_fixture_file=$1; fi
case "$exm_fixture_file" in .dev.vars*|/tmp/*) ;; *) printf 'Use an ignored .dev.vars file or /tmp.\n' >&2; exit 1;; esac
exm_fixture_network=exm-integrated-fixture
exm_fixture_pg=exm-integrated-fixture-pg
exm_fixture_auth=exm-integrated-fixture-auth
exm_fixture_rest=exm-integrated-fixture-rest

if [[ -e "$exm_fixture_file" ]]; then
  printf 'Fixture bindings exist already. Preserve them and reuse the test stack.\n' >&2
  exit 1
fi
for exm_container in "$exm_fixture_pg" "$exm_fixture_auth" "$exm_fixture_rest"; do
  if docker container inspect "$exm_container" >/dev/null 2>&1; then
    printf 'A local fixture container exists already. Preserve it and reuse its bindings.\n' >&2
    exit 1
  fi
done

node --input-type=module - "$exm_fixture_pg" <<'JS' > "$exm_fixture_file"
import { createHmac, randomBytes } from 'node:crypto';
const hex = bytes => randomBytes(bytes).toString('hex');
const secret = hex(32);
function jwt(role) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const prefix = encode({ alg: 'HS256', typ: 'JWT' }) + '.' +
    encode({ role, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
  return prefix + '.' + createHmac('sha256', secret).update(prefix).digest('base64url');
}
console.log('EXM_LOCAL_DB_PASSWORD=' + hex(24));
console.log('EXM_LOCAL_JWT_SECRET=' + secret);
console.log('EXM_PREVIEW_DB_CONTAINER=' + process.argv[2]);
console.log('EXM_PREVIEW_DB_NAME=exm_fixture');
console.log('EXM_MEMBER_AUTH_URL=http://127.0.0.1:55531');
console.log('EXM_MEMBER_DATA_URL=http://127.0.0.1:55532');
console.log('EXM_MEMBER_ANON_KEY=' + jwt('anon'));
console.log('EXM_MEMBER_SERVICE_ROLE_KEY=' + jwt('service_role'));
console.log('EXM_MEMBER_PEPPER=' + hex(32));
console.log('EXM_PREVIEW_PASSWORD=' + hex(24));
console.log('EXM_PREVIEW_CONSOLE=1');
console.log('EXM_MEMBER_PREVIEW_SIGNUP=fixture');
JS

set -a
# shellcheck source=/dev/null
source "$exm_fixture_file"
set +a
docker network inspect "$exm_fixture_network" >/dev/null 2>&1 || docker network create "$exm_fixture_network" >/dev/null
docker run --name "$exm_fixture_pg" --network "$exm_fixture_network" -d \
  -e POSTGRES_DB=exm_fixture -e POSTGRES_PASSWORD="$EXM_LOCAL_DB_PASSWORD" postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$exm_fixture_pg" pg_isready -U postgres -d exm_fixture -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$exm_fixture_pg" psql -U postgres -d exm_fixture -v ON_ERROR_STOP=1 -q -c \
  'create schema auth; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;'

exm_fixture_db_url="postgres://postgres:$EXM_LOCAL_DB_PASSWORD@$exm_fixture_pg:5432/exm_fixture"
docker run --name "$exm_fixture_auth" --network "$exm_fixture_network" -p 127.0.0.1:55531:9999 -d \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:55531 \
  -e GOTRUE_DB_DRIVER=postgres -e "GOTRUE_DB_DATABASE_URL=$exm_fixture_db_url?search_path=auth,public" \
  -e GOTRUE_DB_NAMESPACE=auth -e DB_NAMESPACE=auth -e GOTRUE_SITE_URL=http://localhost:8788 \
  -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
  -e GOTRUE_JWT_SECRET="$EXM_LOCAL_JWT_SECRET" -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  public.ecr.aws/supabase/gotrue:v2.188.1 >/dev/null
for _ in $(seq 1 30); do
  if curl --noproxy 127.0.0.1 -fsS --max-time 2 "$EXM_MEMBER_AUTH_URL/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl --noproxy 127.0.0.1 -fsS --max-time 5 "$EXM_MEMBER_AUTH_URL/health" >/dev/null
for exm_migration in supabase/migrations/*.sql; do
  docker exec -i "$exm_fixture_pg" psql -U postgres -d exm_fixture -v ON_ERROR_STOP=1 -q < "$exm_migration"
done

docker run --name "$exm_fixture_rest" --network "$exm_fixture_network" -p 127.0.0.1:55532:3000 -d \
  -e PGRST_DB_URI="$exm_fixture_db_url" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$EXM_LOCAL_JWT_SECRET" \
  postgrest/postgrest:v14.3 >/dev/null
for _ in $(seq 1 30); do
  if curl --noproxy 127.0.0.1 -fsS --max-time 2 "$EXM_MEMBER_DATA_URL/" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl --noproxy 127.0.0.1 -fsS --max-time 5 "$EXM_MEMBER_DATA_URL/" >/dev/null
node tools/seed-preview.mjs
