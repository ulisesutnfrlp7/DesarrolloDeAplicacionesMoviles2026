# Notificaciones de OpB Virtual

## Arquitectura encontrada

La app usa Expo SDK 54, Expo Router 6, React Native 0.81, TypeScript y Firebase JS SDK. La navegacion principal esta en `app/(tabs)` y las pantallas academicas viven en rutas como `modulos/[id]`, `secciones/[id]`, `subsecciones/[id]`, `entregas/[id]`, `secciones/mis-notas` y `secciones/planilla-detalle`.

Firestore existente:

- `usuarios/{userId}` con `rol` (`alumno`, `profesor`, `admin`) y datos de perfil.
- `inscripciones` con `alumnoId`, `moduloId`, `seccionId`, `subseccionPath`.
- `modulos/{moduloId}/secciones/{seccionId}/.../items/{itemId}` para contenidos y espacios de entrega.
- `.../items/{itemId}/entregas_alumnos/{entregaId}` para entregas de alumnos.
- `notas/{notaId}` para examenes.
- `planillas_tp/{planillaId}` y `vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}`.
- `eventos_cronograma/{eventoId}` para parciales y ateneos.

## Modelo agregado

Notificaciones internas:

`usuarios/{userId}/notifications/{notificationId}`

`notificationId` no usa la `deduplicationKey` cruda. Se genera como `notif_sha256_<hash SHA-256 hex de 64 caracteres>` a partir de la `deduplicationKey`, para evitar `/` u otros caracteres que Firestore interprete como segmentos de ruta. La `deduplicationKey` completa se conserva como campo del documento para auditoria e idempotencia.

Campos:

- `type`: tipo centralizado en `types/notifications.ts`.
- `title`, `body`.
- `createdAt`, `readAt`, `isRead`.
- `target`: destino estructurado (`content`, `grade`, `tp_sheet`, `delivery`, `schedule_event`).
- `sourceId`, `courseId`.
- `deduplicationKey`.
- `pushStatus`.

Tokens push:

`usuarios/{userId}/pushTokens/{tokenId}`

Campos:

- `token`, `platform`, `enabled`.
- `createdAt`, `updatedAt`.
- `appVersion`.

Preferencia push:

`usuarios/{userId}/notificationPreferences/push`

Campo principal: `enabled`. Si esta en `false`, no se envian push, pero las notificaciones internas se siguen creando.

Recordatorios:

`eventos_cronograma/{eventoId}.notificationSchedule`

```ts
{
  enabled: boolean,
  version: number,
  reminders: [{ id, amount, unit, offsetMinutes }],
  nextNotificationAt: Timestamp | null,
  processed: Record<string, boolean>
}
```

La zona horaria operativa del scheduler es `America/Argentina/Buenos_Aires`.

## Cliente

- `app/(tabs)/_layout.tsx`: agrega pestaña `Notificaciones` y badge de no leidas (`1..99`, `99+`).
- `app/(tabs)/notificaciones.tsx`: lista ultimos 14 dias, estados de carga/vacio/error, marcar una o todas como leidas.
- `app/notificaciones/[id].tsx`: detalle y boton contextual para navegar al recurso.
- `services/notificationNavigation.ts`: una unica funcion para abrir destinos desde notificaciones internas o push.
- `services/pushNotificationRouting.ts`: escucha taps de push con app abierta, en segundo plano o cerrada.
- `hooks/usePushNotifications.ts`: permisos, canal Android, registro de ExpoPushToken y preferencia.
- `app/(tabs)/perfil.tsx`: switch para activar/desactivar push del dispositivo.
- `components/ui/ModalEventoCronograma.tsx`: UI de recordatorios libres.
- `app/items/form.tsx`: UI de recordatorios libres para fechas limite de espacios de entrega.

## Cloudflare Worker

Las Firebase Cloud Functions quedaron reemplazadas por `cloudflare-worker/` para poder mantener el proyecto Firebase en Spark. La carpeta `functions/` permanece en el repositorio como referencia historica, pero no debe desplegarse. `firebase.json` ya no incluye bloque `functions`.

Arquitectura:

- La app crea un `notification_job` mediante `POST /jobs` al Worker despues de guardar correctamente la entidad academica.
- El Worker verifica el Firebase ID Token con JWKS oficiales y lee `usuarios/{uid}` para validar rol real.
- El Worker valida permisos de cursada releyendo la seccion/subseccion real. Admin puede todo; profesor solo si la seccion/subseccion habilita la funcionalidad correspondiente.
- El Worker usa Firestore REST con credenciales de servicio guardadas como secretos de Cloudflare.
- El Worker re-lee la entidad original (`items`, `entregas_alumnos`, `planillas_tp`) o confirma el lote real de `notas` por `notificationBatchId`, y reconstruye destinatarios.
- Primero crea `usuarios/{userId}/notifications/{notificationId}` y luego intenta Expo Push.
- `POST /jobs` crea o reutiliza el job, lo deja en `pending`, publica `{ jobId, reason }` en Cloudflare Queues y responde rapido. Ya no procesa el fan-out con `ctx.waitUntil`.
- El Queue Consumer toma el `jobId`, adquiere un lease atomico, re-lee Firestore, resuelve destinatarios, crea las notificaciones internas, intenta Expo Push y marca el job como `completed`, `pending` o `failed`.
- El Cron Trigger corre cada 5 minutos solo para recordatorios, recuperacion de jobs `pending`/`failed`, jobs `processing` con lease vencido y jobs con `queue_publish_failed`. No procesa directamente el fan-out de notificaciones inmediatas.

Endpoints:

- `GET /health`
- `POST /jobs`
- `POST /jobs/process` solo admin; reencola jobs pendientes, fallidos o con lease vencido y devuelve un resumen seguro
- `POST /schedules/process` solo admin para ejecutar manualmente la deteccion del Cron, encolar jobs de recordatorio y obtener un resumen seguro con `jobsEnqueued`
- `GET /diagnostics/jobs/{jobId}` solo admin; devuelve estado, intentos, metricas internas/push y codigo diagnostico seguro
- `POST /jobs/{jobId}/retry` solo admin; vuelve un job a `pending`, libera lease y conserva idempotencia
- `POST /schedules/diagnose` solo admin; recibe `{ eventId }` y devuelve alcance, `nextNotificationAt`, offsets pendientes y cantidad de destinatarios

Variables/secrets necesarios:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL` como secreto
- `FIREBASE_PRIVATE_KEY` como secreto
- `EXPO_ACCESS_TOKEN` opcional como secreto
- `MAX_JOB_ATTEMPTS`
- En la app: `EXPO_PUBLIC_NOTIFICATION_WORKER_URL`

La cuenta de servicio debe tener permisos minimos de Firestore/Datastore User sobre el proyecto. No usar roles Owner ni Editor.

## Cloudflare Queues

Queue principal:

`odb-notification-jobs`

Binding:

`NOTIFICATION_QUEUE`

Mensaje:

```ts
{
  jobId: string;
  reason: "created" | "retry" | "recovery";
}
```

El mensaje no contiene payload academico, destinatarios, notas ni tokens. El consumidor siempre re-lee `notification_jobs/{jobId}` y la entidad original desde Firestore.

Configuracion preparada en `cloudflare-worker/wrangler.toml`:

- Productor: `NOTIFICATION_QUEUE`.
- Consumer: `max_batch_size = 5`, `max_batch_timeout = 2`, `max_retries = 8`, `max_concurrency = 2`.
- Cron: `*/5 * * * *`.
- Observabilidad habilitada.

Dead Letter Queue queda documentada como mejora opcional; no se exige crearla para la primera prueba.

## notification_jobs

Coleccion raiz:

`notification_jobs/{jobId}`

`jobId` se genera como `job_sha256_<hash SHA-256 hex de 64 caracteres>` a partir de la clave de deduplicacion validada por servidor. No se usan `sourcePath`, `deduplicationKey` ni texto enviado por cliente como ID directo de documento.

Campos:

- `type`, `sourceId`, `sourcePath`
- `courseId`, `sectionId`, `targetUserId`
- `payload` minimo
- `status`: `pending`, `processing`, `completed`, `failed`
- `attempts`, `createdAt`, `updatedAt`, `nextAttemptAt`
- `lockedAt`, `lockedBy`, `leaseId`, `leaseExpiresAt`
- `internalCreatedAt`, `pushLastAttemptAt`
- `processedAt`, `lastError`
- `deduplicationKey`, `createdBy`
- `recipientsResolved`, `notificationsCreated`, `notificationsAlreadyExisted`
- `pushTokensFound`, `pushMessagesAccepted`, `pushMessagesFailed`
- `completedAt`, `processingDurationMs`, `diagnosticCode`, `diagnosticContext`

El cliente no puede crear, actualizar ni eliminar jobs directamente en Firestore. La app solo llama `POST /jobs` con Firebase ID Token. El Worker procesa con credenciales de servidor via REST.

Campos de Queue/consumer:

- `queuedAt`, `lastQueueReason`, `queuePublishAttempts`, `queueLastError`
- `consumerStartedAt`, `consumerFinishedAt`
- `payload.cursor` para continuaciones paginadas

Semantica de finalizacion:

- `completed` requiere destinatarios resueltos y al menos una notificacion interna creada o ya existente.
- Si `recipientsResolved === 0`, el job queda `pending` o `failed` con `diagnosticCode: "no_recipients_resolved"`.
- Si hay destinatarios pero no se crea ni existe ninguna interna, queda `pending` o `failed` con `diagnosticCode: "no_internal_notifications_created"`.
- La ausencia de tokens push no impide `completed`.
- Un fallo de Expo no borra ni duplica la notificacion interna.
- Las cargas paginadas incompletas vuelven a `pending` con cursor, lease limpio, `nextAttemptAt` cercano y el mismo job se reencola en Queue. No esperan al Cron.

Rutas permitidas por tipo:

- `new_content` y `delivery_space_created`: `modulos/{moduloId}/secciones/{seccionId}/(.../subsecciones/{id})/items/{itemId}`.
- `submission_grade` y `resubmission_requested`: ruta de item + `entregas_alumnos/{entregaId}`.
- `tp_sheet_created` y `tp_sheet_updated`: `planillas_tp/{planillaId}`.
- `exam_grade`: `modulos/{moduloId}/secciones/{seccionId}/notas_lotes/{batchId}`.

Para notas por lote, cada documento de `notas` guarda `notificationBatchId`. El Worker consulta siempre Firestore por `moduloId`, `seccionId`, `nombreExamen`, `notificationBatchId` y, si corresponde, `subseccionPath`.

La deduplicacion se deriva de datos validados por servidor:

- contenidos/entregas: ruta real + fecha de creacion/actualizacion.
- entrega calificada/reentrega: ruta real + fecha de entrega/actualizacion.
- notas: batch real + fecha de carga de cada nota.
- planilla creada: ruta + fecha de creacion.
- planilla actualizada: usa `fechaActualizacion`, `updatedAt`, `version` o `changeId` real cuando existe; si no existe, aplica una ventana coalescida breve de 30 segundos. El job queda `pending` con `nextAttemptAt` futuro; no queda en `processing` durante la espera.
- recordatorios: evento/item + version del schedule + offset del recordatorio + alumno.

Los eventos de cronograma usan alcance logico:

- `global`: sin modulo especifico, visible/notificable a todos los alumnos activos.
- `course`: modulo especifico y sin comision, visible/notificable a alumnos de cualquier comision de ese modulo.
- `commission`: modulo y comision especifica, visible/notificable solo a esa comision.

El Worker resuelve el contexto academico desde la ruta real con `resolveAcademicContextFromPath`. Recorre modulo, seccion y todas las subsecciones ancestrales. Solo completa `commissionTitle` cuando detecta una comision real por dato estructurado (`esComision`, `tipo: "comision"`) o por compatibilidad con nombres que comienzan con "Comision". Una subseccion restringida que no es comision se muestra como seccion/espacio academico. Si la ruta pertenece a un espacio como "Notas Parciales", "Ateneos 2026" o "Edicion 2026", se guarda como `displayContextLabel/displayContextTitle` y no se inventa una comision.

La audiencia de contenidos y espacios de entrega se resuelve con `resolveNotificationAudienceFromPath`:

- Recorre la seccion raiz y todas las subsecciones ancestrales hasta el recurso.
- Si encuentra seccion/subseccion restringida, usa la restriccion mas cercana al recurso y notifica solo a alumnos inscriptos/autorizados en ese espacio. Una comision es solo un caso de espacio restringido.
- Si no encuentra ninguna restriccion, notifica a todos los usuarios activos con rol `alumno`, sin limitar por modulo, seccion ni comision.
- Los diagnosticos distinguen `no_active_students`, `no_students_in_restricted_scope` e `invalid_academic_path`.

El detalle de notificaciones renderiza solamente filas relevantes por tipo. Las filas tienen IDs internos estables (`module`, `commission`, `event-date`, `deadline-date`, etc.) para evitar keys duplicadas.

## Matriz de cobertura

| Tipo | Contexto | Destinatarios | Interna | Push intentada | Estado |
| --- | --- | --- | --- | --- | --- |
| new_content | seccion raiz | alumnos inscriptos/acceso del modulo | si | segun tokens/preferencia | completed solo con interna |
| new_content | subseccion simple | alumnos del modulo, filtrando subseccion si aplica | si | segun tokens/preferencia | diagnosticado si cero |
| new_content | comision | alumnos de esa comision | si | segun tokens/preferencia | completed solo con interna |
| new_content | hija de comision | alumnos de la comision ancestral | si | segun tokens/preferencia | completed solo con interna |
| new_content | modulo sin comisiones | todos los alumnos activos si la ruta no tiene restricciones | si | segun tokens/preferencia | diagnosticado si cero |
| exam_grade | lote/individual | alumno real por `alumnoUid` o `alumnoId` legacy | si | segun tokens/preferencia | paginado con cursor |
| submission_grade | entrega | alumno duenio de la entrega | si | segun tokens/preferencia | completed solo con interna |
| tp_sheet_created | planilla | alumno de la planilla | si | segun tokens/preferencia | completed solo con interna |
| tp_sheet_updated | planilla | alumno de la planilla | si | segun tokens/preferencia | coalescing maximo 30 s |
| delivery_space_created | seccion/subseccion/comision | mismos criterios que contenido | si | segun tokens/preferencia | completed solo con interna |
| resubmission_requested | entrega | alumno duenio de la entrega | si | segun tokens/preferencia | completed solo con interna |
| schedule_reminder evento | global | alumnos activos | se crea desde Queue | segun tokens/preferencia | Cron crea job y Queue procesa fan-out |
| schedule_reminder evento | curso completo | alumnos del modulo en cualquier comision/seccion | se crea desde Queue | segun tokens/preferencia | no adelanta futuros |
| schedule_reminder evento | comision | alumnos de esa comision | se crea desde Queue | segun tokens/preferencia | no consume si cero destinatarios |
| schedule_reminder entrega | entrega con deadline | alumnos del contexto academico de la entrega | se crea desde Queue | segun tokens/preferencia | ventana `now - 8 min` a `now`; Cron encola job |

## Auditoria de datos

Se agrega `cloudflare-worker/scripts/audit-notification-data.ts` como herramienta de solo lectura. No se ejecuta automaticamente ni modifica datos. Resume:

- modulos encontrados;
- formatos de inscripciones;
- eventos por `scope`;
- schedules invalidos;
- jobs `completed` sin notificaciones;
- jobs `processing` con lease vencido.

Ejecutarla solo con credenciales locales y entorno controlado, por ejemplo compilando/ejecutando con una herramienta TypeScript local. No imprime nombres de alumnos, tokens, notas ni datos sensibles.

Las notificaciones antiguas creadas con IDs que contienen `/` o claves crudas no deben abrirse desde la app. La pantalla muestra "Esta notificacion ya no se encuentra disponible". Esos documentos malformados deben eliminarse o regenerarse con el Worker corregido.

## Firebase Functions obsoletas

La carpeta `functions/` queda obsoleta por ahora. No ejecutar despliegues de Firebase Functions para notificaciones.

Cuando Cloudflare quede probado en produccion, se puede retirar `functions/` en un cambio separado.

## Flujos que crean jobs

La app crea jobs solo despues de guardar correctamente la entidad academica:

- `app/items/form.tsx`: publicacion de contenidos y espacios de entrega.
- `app/secciones/notas.tsx`: carga o reemplazo de notas de examen en un job por lote.
- `hooks/useEntregasAlumnos.ts`: calificacion de entrega y solicitud de reentrega.
- `app/secciones/planillas.tsx`: creacion de planilla de TP.
- `app/secciones/planilla-detalle.tsx`: cambios relevantes de estructura o titulo de planilla.

La logica compartida vive en `services/notificationJobs.ts`. Si falla el Worker, la carga academica queda guardada y se informa un aviso controlado en consola sin datos sensibles.

## Seguridad e indices

`firestore.rules` agrega:

- Lectura de notificaciones solo por el usuario dueño.
- Update limitado a `isRead` y `readAt`.
- Alumnos sin permiso para crear notificaciones academicas ni modificar payload/pushStatus.
- `notification_jobs` solo lectura para admin/profesor; escritura directa bloqueada para todos los clientes.
- Tokens y preferencias solo para el usuario dueño.

`firebase.indexes.json` agrega indices para:

- `notifications.isRead + createdAt`.
- `eventos_cronograma.notificationSchedule.enabled + notificationSchedule.nextNotificationAt`.
- `items.tipo + notificationSchedule.enabled + notificationSchedule.nextNotificationAt`.
- `items.tipo + fechaLimite`.
- `notas.seccionId + nombreExamen + subseccionPath`.
- `notas.seccionId + alumnoUid`.
- `notas.moduloId + seccionId + nombreExamen + notificationBatchId`.
- `notas.moduloId + seccionId + nombreExamen + notificationBatchId + subseccionPath`.
- `notification_jobs.status + nextAttemptAt`.
- `notification_jobs.status + leaseExpiresAt`.

Tambien conserva `fieldOverrides` existentes/necesarios para consultas de collection group, incluido `items.tipo` con alcance `COLLECTION_GROUP`.

## Configuracion push para development build

No usar Expo Go para push remotas.

1. Instalar dependencias:

```bash
npm install
```

2. Completar `app.json` o migrar a `app.config.ts` con valores reales:

- `expo.extra.eas.projectId`
- `expo.android.package`
- `expo.ios.bundleIdentifier`

No inventar estos valores ni subir credenciales reales.

3. Configurar credenciales:

- Android: FCM/APNs via EAS segun corresponda.
- iOS: Apple Developer, APNs key/certificados y provisioning.

4. Crear development build:

```bash
npx eas build --profile development --platform android
npx eas build --profile development --platform ios
```

5. Instalar en dispositivo/emulador compatible y ejecutar:

```bash
npx expo start --dev-client
```

6. En Perfil, activar push. La app obtiene el `ExpoPushToken` y lo guarda en `usuarios/{uid}/pushTokens`.

7. Probar push manual con Expo Push Tool usando el token. Payload recomendado:

```json
{
  "to": "ExponentPushToken[xxxx]",
  "title": "Prueba OpB Virtual",
  "body": "Abrir recurso de prueba",
  "data": {
    "target": "{\"kind\":\"schedule_event\",\"eventId\":\"demo\",\"eventType\":\"parcial\"}"
  }
}
```

Probar con app abierta, en segundo plano y cerrada.

## Probar Cloudflare Worker localmente

Instalar dependencias del Worker:

```bash
cd cloudflare-worker
npm install
npm run build
npm test
```

Crear `cloudflare-worker/.dev.vars` local, sin subirlo al repositorio, a partir de `.dev.vars.example`.

Ejecutar localmente:

```bash
npm run dev
```

En la app, configurar:

```bash
EXPO_PUBLIC_NOTIFICATION_WORKER_URL="http://127.0.0.1:8787"
```

## Despliegue manual

Firestore:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Cloudflare Worker:

```bash
cd cloudflare-worker
npx wrangler queues create odb-notification-jobs
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put EXPO_ACCESS_TOKEN
npx wrangler deploy
```

Si Cloudflare solicita activar Queues en el dashboard, hacerlo antes del deploy. `EXPO_ACCESS_TOKEN` es opcional; omitir ese secreto si no se usa.

No desplegar Firebase Functions para notificaciones.

## Produccion

Antes de Play Store/App Store:

- Confirmar `projectId`, package y bundle identifier.
- Configurar credenciales reales de Android/iOS en EAS/Firebase.
- Revisar cuotas de Cloudflare Workers, Firestore REST y Expo Push Service.
- Ejecutar pruebas en dispositivos reales.
- Monitorear tokens invalidos y errores de Expo Push Service.
- Revisar logs con:

```bash
cd cloudflare-worker
npx wrangler tail opb-virtual-notifications --format pretty
```

## Limitaciones y decisiones

- Las push nunca se envian desde el cliente.
- El texto visible de push evita notas numericas o datos sensibles.
- La idempotencia usa un hash SHA-256 estable de la `deduplicationKey` como ID de documento de notificacion.
- Las fechas limite de entrega usan `items.fechaLimite` y se consultan mediante `collectionGroup("items")`.
- El scheduler consulta solo eventos con `notificationSchedule.nextNotificationAt` en ventana.
- El scheduler usa una ventana acotada desde `now - 8 minutos` hasta `now`, sin adelantar avisos futuros. Esta tolerancia cubre retrasos razonables del Cron de 5 minutos.
- Los jobs `processing` usan lease atomico con `leaseId` y precondicion `updateTime`; se recuperan cuando `leaseExpiresAt` vence.
- Las consultas de jobs, destinatarios, tokens, notas y recordatorios se procesan por paginas/lotes controlados.
- Las notificaciones inmediatas ya no dependen de `ctx.waitUntil` ni de esperar al Cron. Si publicar en Queue falla, el job queda `pending` con `diagnosticCode: "queue_publish_failed"` para recuperacion posterior.
- La carpeta `functions/` queda obsoleta y se mantiene para retirarla en un cambio separado cuando Cloudflare este verificado.
