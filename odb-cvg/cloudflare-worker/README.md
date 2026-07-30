# OpB Virtual Notifications Worker

Worker HTTP + Cloudflare Queues + Cron que reemplaza a Firebase Cloud Functions para notificaciones academicas.

## Arquitectura

Flujo inmediato:

```text
App -> POST /jobs -> notification_jobs/{jobId} pending -> NOTIFICATION_QUEUE -> Queue Consumer -> completed/pending/failed
```

`POST /jobs` no procesa el job con `ctx.waitUntil`. Solo autentica, valida permisos, crea o reutiliza el job y publica un mensaje minimo:

```json
{ "jobId": "...", "reason": "created" }
```

El consumer relee Firestore, adquiere lease, crea notificaciones internas, intenta Expo Push y actualiza metricas. El mensaje de Queue nunca incluye destinatarios, notas, tokens ni payload academico completo.

## Endpoints

- `GET /health`
- `POST /jobs`
- `POST /jobs/process` solo admin; reencola jobs pendientes, fallidos o con lease vencido
- `POST /jobs/{jobId}/retry` solo admin; limpia estado recuperable y vuelve a encolar
- `GET /diagnostics/jobs/{jobId}` solo admin; devuelve diagnostico seguro
- `POST /schedules/process` solo admin; ejecuta manualmente deteccion de recordatorios y encola jobs
- `POST /schedules/diagnose` solo admin; diagnostica un evento sin datos sensibles

`POST /jobs` requiere:

```http
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json
```

El Worker verifica el token contra JWKS oficiales de Firebase Secure Token, valida `issuer`, `audience`, expiracion y UID. Luego lee `usuarios/{uid}` en Firestore para comprobar el rol real y valida permisos de cursada releyendo la seccion/subseccion real. El cliente no puede escribir `notification_jobs` directamente en Firestore.

## Queue

`wrangler.toml` configura:

```toml
[[queues.producers]]
binding = "NOTIFICATION_QUEUE"
queue = "odb-notification-jobs"

[[queues.consumers]]
queue = "odb-notification-jobs"
max_batch_size = 5
max_batch_timeout = 2
max_retries = 8
max_concurrency = 2
```

El consumer:

- hace `ack` si el job completo, fallo definitivamente, ya estaba completed o no existe;
- hace `retry` si el job sigue `pending`, tiene `nextAttemptAt` futuro o hay un error temporal;
- procesa mensajes del lote de forma aislada para que uno fallido no bloquee a los demas.

Si una pagina grande no termina en una ejecucion, el job queda `pending` con cursor y se vuelve a encolar. No espera al Cron.

## Cron

`wrangler.toml` configura:

```toml
[triggers]
crons = ["*/5 * * * *"]
```

El Cron:

- reencola `notification_jobs` pendientes o fallidos con backoff;
- reencola `notification_jobs` en `processing` con lease vencido;
- reencola jobs con `diagnosticCode: queue_publish_failed`;
- `eventos_cronograma.notificationSchedule.nextNotificationAt`.
- `items` tipo `entrega` con `notificationSchedule.nextNotificationAt`.

La ventana de recordatorios es `now - 8 minutos` hasta `now`. No adelanta avisos futuros y no depende de que el Cron corra exactamente en el minuto configurado. Para cada recordatorio vencido, el Cron crea/reutiliza un job `schedule_reminder` y lo publica en `NOTIFICATION_QUEUE`; el fan-out lo hace el consumer.

Los jobs usan `lockedAt`, `lockedBy`, `leaseId` y `leaseExpiresAt`. La adquisicion del lease usa precondicion `updateTime` de Firestore cuando esta disponible. Si el Worker se interrumpe, el Cron recupera el job cuando vence el lease y lo vuelve a encolar.

## Variables y secretos

Variables:

- `FIREBASE_PROJECT_ID`
- `MAX_JOB_ATTEMPTS`

Secretos:

- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `EXPO_ACCESS_TOKEN` opcional

La cuenta de servicio debe tener permisos minimos para Firestore/Datastore User sobre el proyecto. No usar Owner ni Editor.

No guardar `.dev.vars` real ni claves privadas.

## Local

```bash
cd cloudflare-worker
npm install
npm run build
npm test
npx wrangler dev
```

Para probar Queues localmente, usar Wrangler con el binding configurado en `wrangler.toml`. No guardar `.dev.vars` real en el repositorio.

## Deploy manual

```bash
cd cloudflare-worker
npx wrangler queues create odb-notification-jobs
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put EXPO_ACCESS_TOKEN
npx wrangler deploy
```

`EXPO_ACCESS_TOKEN` es opcional. Si Cloudflare pide habilitar Queues en el dashboard, hacerlo manualmente antes de desplegar. Una Dead Letter Queue puede agregarse despues si se quiere separar mensajes agotados.

Logs:

```bash
cd cloudflare-worker
npx wrangler tail opb-virtual-notifications --format pretty
```

No ejecutar deploy desde Codex.
