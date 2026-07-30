# CHANGELOG

Todos los cambios notables del proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

---

## [Entrega 3] — Producto Final Escalado

### Nuevos módulos y funcionalidades

#### Gestión de Accesos

- **RF-38** — Movimiento de alumno entre comisiones o clínicas: el administrador puede mover un alumno de una subsección restringida a otra, transfiriendo sus planillas activas de trabajos prácticos al nuevo acceso y conservando sus notas históricas.
- **RF-39** — Aviso de cambio de comisión: el sistema muestra un aviso al administrador cuando un alumno ha sido movido de una comisión a otra, indicando el cambio realizado mediante indicadores visuales en el panel de gestión de accesos.
- **RF-40** — Aviso de múltiples inscripciones: el sistema muestra un aviso al administrador cuando un alumno está inscripto en más de una comisión dentro de la misma sección, indicando cuáles son. El administrador puede otorgar o revocar permisos multi-comisión de forma granular.

#### Gestión de Notificaciones

- **RF-41** — Implementación de notificaciones push: el sistema envía notificaciones automáticas a los usuarios (alumnos, profesores y administradores) ante eventos relevantes: nuevas notas cargadas, vencimiento de entregas, retroalimentación docente o cambios en inscripciones.

#### Gestión de Cronograma

- **RF-42** — Carga de información al cronograma: el administrador puede ingresar eventos en un cronograma académico (ateneos, parciales) con título, descripción, fecha, módulo asociado y comisión destino.
- **RF-43** — Modificación de información del cronograma: el administrador puede editar eventos (ateneos, parciales) previamente cargados, actualizando título, fecha, descripción o tipo de actividad.
- **RF-44** — Eliminación de información del cronograma: el administrador puede eliminar eventos (ateneos, parciales) del cronograma académico con confirmación previa.
- **RF-45** — Filtrado de eventos en el cronograma: los usuarios pueden filtrar los eventos por tipo (entrega, ateneo, parcial) mediante una barra de filtros tipo pill, y por mes a través de una barra deslizable de meses, mostrando solo los resultados que cumplan los criterios seleccionados. Los alumnos ven únicamente los eventos de las comisiones a las que están inscriptos.

#### Gestión de Perfiles

- **RF-46** — Edición de perfil de usuario: cualquier usuario (alumno, profesor, administrador) puede editar su información personal básica: nombre y teléfono. Los alumnos también pueden cargar su legajo y DNI (con confirmación doble), los cuales quedan bloqueados después de la primera carga. Todos los usuarios pueden cambiar su contraseña.

---

### Nuevas User Stories

| ID    | Descripción                                                                  |
| ----- | ---------------------------------------------------------------------------- |
| US-11 | Creación, edición y eliminación de eventos del cronograma (administrador) |
| US-12 | Edición de perfil personal y cambio de contraseña (todos los roles)            |
| US-13 | Gestión de comisiones y movimientos de alumnos entre accesos (administrador)    |
| US-14 |   Consulta de cronograma académico con filtros (todos los roles)          |
| US-15 | Recepción de notificaciones push sobre eventos académicos (todos los roles)  |

---

### Nuevas reglas de negocio

- Un alumno no puede auto-cambiarse de comisión: debe solicitar el cambio a un profesor o administrador.
- El permiso multi-comisión solo puede ser otorgado o revocado por un administrador o profesor.
- Al mover a un alumno de comisión, sus planillas activas de trabajos prácticos se transfieren al nuevo acceso.
- Las notas históricas del alumno se conservan al moverlo de comisión y son consultables desde el nuevo contexto.
- El legajo y DNI del alumno se bloquean después de la primera carga y no pueden modificarse posteriormente.
- El legajo y DNI requieren confirmación doble (escribirlos dos veces) antes de guardarse.
- Los eventos del cronograma pueden ser globales (visibles a todos los alumnos) o segmentados por comisión (visibles solo a los alumnos inscriptos en esa comisión).
- El filtro de eventos por mes solo muestra los meses que contienen al menos un evento.
- Un alumno solo puede ver eventos del cronograma correspondientes a sus comisiones inscriptas.
- El estado "Ausente" en notas no impide la visualización del evento en el cronograma.
- Las entregas con fecha vencida se identifican visualmente en el cronograma mediante el badge "Entrega".

---

### Validaciones y manejo de excepciones agregadas

**Gestión de Accesos:**

- Se valida que el alumno destino no esté ya inscripto en la comisión de destino antes de moverlo.
- Se rechaza el movimiento si el alumno tiene planillas activas que no pueden transferirse.
- Se verifica que el administrador tenga permisos suficientes antes de otorgar multi-comisión.
- Al regenerar un código de acceso, se revocan todas las inscripciones existentes de ese acceso.
- Se muestra advertencia visual cuando un alumno tiene múltiples inscripciones activas en la misma sección.

**Cronograma:**

- La fecha del evento no puede ser anterior a la fecha actual al crearlo.
- Se requiere título y tipo de evento antes de guardar.
- Los eventos de tipo "entrega" no son editables ni eliminables desde el cronograma (se gestionan desde la sección correspondiente).
- Los eventos segmentados por comisión se filtran en el cliente según las inscripciones del alumno.
- Al eliminar un evento se solicita confirmación explícita.

**Perfil:**

- Se valida que el legajo no esté vacío antes de guardar.
- Se valida que la confirmación del legajo coincida exactamente con el valor ingresado.
- Se valida que la confirmación del DNI coincida exactamente con el valor ingresado (si se proporcionó DNI).
- No se permite guardar cambios en el nombre si el campo queda vacío.
- El cambio de contraseña requiere la contraseña actual antes de permitir la actualización.

---

### Eliminado

_(No se eliminaron funcionalidades en esta entrega.)_

---

## [Entrega 2] — Escalado Funcional

### Nuevos módulos y funcionalidades

#### Gestión de Calificaciones

- **RF-20** — Gestión de planillas de trabajos prácticos: el administrador y el profesor pueden crear y gestionar planillas individuales (diarias o finales) por alumno, con campos de fecha, trabajos realizados, notas, docente interviniente y observaciones internas.
- **RF-21** — Configuración de planillas base: el administrador puede crear, modificar y eliminar planillas base reutilizables con nombre, tipo, columnas, filas y campos iniciales predefinidos.
- **RF-22** — Carga de notas de trabajos prácticos: el profesor o administrador puede cargar notas de trabajos prácticos dentro de la planilla del alumno correspondiente.
- **RF-23** — Carga de notas de exámenes: el profesor y el administrador pueden cargar notas de exámenes para alumnos inscriptos en la subsección (comisión) correspondiente.
- **RF-24** — Modificación y eliminación de notas de exámenes: solo el administrador puede modificar o eliminar tandas de notas ya cargadas.
- **RF-25** — Registro de ausentes: se puede registrar el estado "Ausente" como alternativa a una nota numérica; los ausentes quedan excluidos del cálculo de promedio.
- **RF-26** — Consulta de notas por alumno: los alumnos pueden consultar únicamente sus propias notas (exámenes y trabajos prácticos), sin acceso a calificaciones de otros estudiantes.
- **RF-27** — Exportación de notas y planillas: el administrador y el profesor pueden exportar notas y planillas de trabajos prácticos en formato PDF o Excel.

#### Gestión de Entregas de Trabajos Teóricos

- **RF-28** — Creación de espacio de entrega: el administrador y el profesor pueden crear un espacio de entrega con título, descripción y fecha límite.
- **RF-29** — Modificación de espacio de entrega: el administrador y el profesor pueden modificar un espacio de entrega existente.
- **RF-30** — Eliminación de espacio de entrega: el administrador y el profesor pueden eliminar un espacio de entrega, con restricciones cuando ya existan entregas asociadas.
- **RF-31** — Subida de entregas: los alumnos pueden subir archivos dentro de un espacio de entrega habilitado.
- **RF-32** — Entrega fuera de término: el sistema permite entregas luego de la fecha límite, identificándolas visualmente como "entregada tarde".
- **RF-33** — Modificación de entrega: los alumnos pueden modificar su entrega antes de la fecha límite; posterior a ella, no se permite la modificación.
- **RF-34** — Calificación de entrega: el profesor puede calificar el trabajo teórico entregado y agregar comentarios de retroalimentación.

#### Gestión de Accesos

- **RF-35** — Restricción de secciones y subsecciones: el administrador puede configurar códigos de acceso en secciones principales y subsecciones (comisiones, clínicas).
- **RF-36** — Gestión de alumnos por acceso: el administrador puede visualizar, asignar, quitar o mover alumnos entre accesos restringidos.
- **RF-37** — Filtrado de alumnos por contexto de inscripción: al cargar notas o planillas, el sistema lista únicamente los alumnos inscriptos en el contexto correspondiente.
- **RF-38** — Movimiento de alumno entre comisiones o clínicas: el administrador puede mover un alumno de una subsección a otra, transfiriendo sus planillas activas y conservando su historial de notas.

---

### Nuevas User Stories

| ID    | Descripción                                                         |
| ----- | ------------------------------------------------------------------- |
| US-06 | Gestión de planillas de trabajos prácticos (profesor/administrador) |
| US-07 | Consulta de planillas de trabajos prácticos (alumno)                |
| US-08 | Consulta de notas de exámenes (alumno)                              |
| US-09 | Creación de espacio de entrega (profesor)                           |
| US-10 | Subida de entregas de trabajos (alumno)                             |

---

### Nuevas reglas de negocio

- Un alumno solo tiene permisos de lectura sobre sus propias calificaciones.
- Solo el administrador puede modificar o eliminar notas de exámenes ya cargadas.
- Las notas deben estar comprendidas en la escala 1–10.
- El estado "Ausente" no se considera en el cálculo del promedio.
- Solo el administrador puede crear, modificar o eliminar planillas base.
- Las notas no son visibles para el alumno hasta que el docente las publique explícitamente.
- Las columnas marcadas como privadas (ej. "Observaciones") solo son visibles para profesores y administradores.
- Al mover a un alumno de comisión o clínica, sus planillas activas se transfieren al nuevo acceso; sus notas históricas se conservan y son consultables por el alumno desde el nuevo contexto.
- Un alumno puede modificar su entrega siempre que sea antes de la fecha límite y no haya sido calificada aún.
- La eliminación de un espacio de entrega con trabajos cargados requiere confirmación previa.
- El profesor no puede mover alumnos entre accesos ni administrar códigos de acceso.

---

### Validaciones y manejo de excepciones agregadas

**Calificaciones:**

- Se rechazan caracteres no numéricos en celdas de calificación.
- Se valida que la nota esté dentro de la escala permitida (1–10); se rechazan valores negativos o superiores al máximo.
- Se evita la carga de notas duplicadas para la misma instancia evaluativa dentro del mismo contexto.
- El listado de alumnos se filtra por sección, comisión o clínica correspondiente al cargar notas.

**Planillas:**

- Una planilla debe tener nombre antes de ser creada.
- Una planilla individual debe estar asociada a un alumno inscripto.
- El profesor no puede modificar ni eliminar planillas base.
- Las columnas privadas quedan ocultas para el alumno.
- Las planillas activas se transfieren al mover a un alumno de comisión.

**Entregas:**

- La fecha límite no puede ser anterior a la fecha de apertura del espacio.
- El espacio de entrega debe tener título antes de guardarse.
- Se rechaza la subida de archivos que superen el peso máximo permitido (50 MB).
- Se advierte o bloquea la eliminación de un espacio que ya contiene entregas.

---

### Eliminado

- **RF-26 a RF-28 (E1 proyectados) — Gestión de Ateneos**: los requerimientos de Ateneos planificados para esta entrega fueron eliminados. La funcionalidad quedó resuelta con el sistema general de carga de contenido implementado en la Entrega 1 (subida de texto, imágenes, archivos y enlaces externos dentro de las secciones existentes). No fue necesario desarrollar funcionalidades adicionales para este módulo.

---

### Pendiente (proyectado para Entrega 3)

- **RF-39** — Implementación de notificaciones push.
- **RF-40** — Carga de información al cronograma.
- **RF-41** — Modificación de información del cronograma.
- **RF-42** — Eliminación de información del cronograma.

_(No hay funcionalidades pendientes. Arriba se deja constancia del registro, pero todos esos requerimientos proyectados fueron implementados en la Entrega 3.)_

---

## [Entrega 1] — MVP Básico

### Funcionalidades implementadas

**Gestión de Usuarios:** RF-01 al RF-08 (crear cuenta, inicio de sesión, recuperación de contraseña, agregar/modificar/eliminar usuario, asignar rol, cerrar sesión).

**Gestión de Módulos:** RF-09 al RF-11 (crear, modificar y eliminar módulos principales de información).

**Gestión de Material:** RF-12 al RF-17 (crear, modificar y eliminar secciones de información; cargar, modificar y eliminar material).

**Gestión de Niveles:** RF-18 y RF-19 (acceso a nivel mediante código; actualización anual de accesos).
