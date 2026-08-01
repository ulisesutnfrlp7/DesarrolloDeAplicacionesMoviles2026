# **Skills de Claude utilizadas**

Durante el desarrollo de la Entrega 4 no se utilizaron Claude Skills específicas.
Las herramientas de IA utilizadas fueron:

* ChatGPT

* Codex

* Copilot

* Gemini

* Claude

---

# **Índice de conversaciones con la IA**

## Q&A Sesión 1

* **Línea 6** — Panorama completo del estado actual de la aplicación
* **Línea 125** — Contexto del sistema de planillas de trabajos prácticos y estructura de pantallas
* **Línea 482** — Generar prompt para implementar la funcionalidad de Cronograma
* **Línea 548** — Implementar pestaña "Cronograma" con eventos de entregas, ateneos y parciales
* **Línea 586** — Planificación previa antes de implementar el Cronograma
* **Línea 1008** — Qué acciones manuales quedan pendientes (deploy de reglas e índices)
* **Línea 1077** — Firebase CLI no encontrado: cómo hacerlo desde la consola web
* **Línea 1145** — Error de índice COLLECTION_GROUP al cargar entregas en el Cronograma
* **Línea 1172** — Planear 2 nuevas funcionalidades: barra de tipos y barra de meses
* **Línea 1321** — Bug: campo de módulo/comisión no se limpia al borrar y volver a guardar
* **Línea 1354** — Generar prompt para convertir campos de texto en selectores con módulo y comisión
* **Línea 1531** — Error de SyntaxError en `ModalEventoCronograma` (código duplicado)
* **Línea 1591** — Corregir el código duplicado sin gastar tokens innecesarios
* **Línea 1653** — Implementar selectores de módulo y comisión con año dinámico

---

## Q&A Sesión 2

* **Línea 1773** — Agregar gestión de perfil de usuario en la navbar (validación de legajo y DNI)
* **Línea 2171** — Error con AES en el archivo `crypto` al cifrar el DNI
* **Línea 2238** — DNI cifrado funciona, pero mostrar un dato visible al alumno en su perfil
* **Línea 2759** — Legajo no debe repetirse entre cuentas y DNI no debería poder modificarse
* **Línea 3000** — Incluir logo de la cátedra en los PDFs y Excels exportados
* **Línea 3270** — Agregar seguridad al login/registro y opción de recupero de contraseña

---

## Q&A Sesión 3

* **Línea 3604** — Implementar sistema completo de notificaciones internas y push (Expo, Firebase, React Native)
* **Línea 4623** — Error preexistente revelado al deployar las reglas de Firestore
* **Línea 4833** — Fallo en el deploy de Firestore
* **Línea 4930** — Corregir error del cronograma y auditoría completa de reglas e índices de Firestore
* **Línea 5140** — Reemplazar Cloud Functions por Cloudflare Workers para notificaciones
* **Línea 6056** — Corrección final de seguridad, confiabilidad y escalabilidad antes de deployar el Worker
* **Línea 6263** — Cerrar bordes: reglas cerradas, reintentos, validación de tokens
* **Línea 6593** — Error al abrir el detalle de una notificación interna (job completado pero falla al navegar)
* **Línea 6841** — Corregir dos problemas detectados al probar el sistema de notificaciones
* **Línea 7184** — Mejorar pantalla de detalle de notificaciones y corregir navegación
* **Línea 7650** — Corregir varios problemas en el sistema de notificaciones y cronograma
* **Línea 8092** — Corregir definitivamente la demora de notificaciones y recordatorios que no se envían
* **Línea 8702** — Error repetido al iniciar Expo (warning en consola)
* **Línea 8893** — Revisión integral y auditoría completa del sistema de notificaciones
* **Línea 9790** — Caso de contenido en módulos sin comisiones sigue fallando
* **Línea 10158** — Reemplazar procesamiento asíncrono de `notification_jobs` por Cloudflare Queues
* **Línea 11082** — Corregir dos problemas con Cloudflare Queues y agregar notificaciones al editar items
* **Línea 11689** — Inconsistencia entre entrega de notificaciones y estado de los jobs
* **Línea 11983** — Corregir únicamente el problema de finalización y recuperación de jobs
* **Línea 12583** — Notificaciones llegan pero jobs no terminan en el primer procesamiento
* **Línea 12792** — Trabajar en dos etapas separadas sin mezclar cambios
* **Línea 13319** — Corregir tres casos de notificaciones que no funcionan
* **Línea 13719** — Corregir cuatro aspectos relacionados con entregas y notificaciones
* **Línea 14768** — Corregir únicamente dos problemas pendientes
* **Línea 15305** — Corregir únicamente tres puntos pendientes
* **Línea 15696** — Corregir dos problemas de notificaciones de calificaciones de entregas
* **Línea 16099** — Corregir el código local con máxima precisión
* **Línea 16516** — Corregir únicamente dos cosas puntuales (sistema ya funciona)
* **Línea 17060** — Corregir error de render en el layout de tabs
* **Línea 17162** — Corregir que las entregas no aparecen en el cronograma del alumno
* **Línea 17646** — Corregir registro del Expo Push Token en Android
* **Línea 17977** — Corregir por qué el Worker no encuentra los Expo Push Tokens ya registrados
* **Línea 18369** — Corregir envío push que falla por exceder límite de subrequests de Cloudflare Workers Free
* **Línea 19025** — Corregir presentación y entrega inmediata de push en Android
* **Línea 19360** — Corregir navegación al tocar una notificación push
* **Línea 19786** — Diagnosticar por qué tocar una push sigue abriendo Home en lugar de la pantalla correcta
* **Línea 20113** — Corregir bloqueo infinito en el arranque de la app
* **Línea 20369** — Cerrar la mejora de navegación push y priorizar estabilidad
* **Línea 20569** — Ocultar configuración de notificaciones push en el Perfil para roles admin y profesor