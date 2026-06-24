# **Skills de Claude utilizadas**

Durante el desarrollo de la Entrega 2 no se utilizaron Claude Skills específicas.
Las herramientas de IA utilizadas fueron:

* ChatGPT

* Codex

* Copilot

* Gemini

* Claude

---

# **Índice de conversaciones con la IA**

## Q&A Sesión 1

* **Línea 6** — Agregar modals de confirmación al calificar / editar una entrega
* **Línea 2451** — Análisis del proyecto existente: secciones, roles y código de acceso
* **Línea 3115** — Nuevas modificaciones: subir archivos al crear entregas, fecha opcional, y campo de reentrega
* **Línea 3801** — Corrección: regenerar código de `app/entregas/[id].tsx` limpio (typo anterior rompió el formato)
* **Línea 4589** — Correcciones varias: lógica de reentrega, permisos y flujos del alumno
* **Línea 4744** — Permitir entrega fuera de fecha con aviso visible al profesor

---

## Q&A Sesión 2

* **Línea 4985** — Generar prompt para implementar 2 funcionalidades: cargar notas de exámenes y exportar a PDF/Excel
* **Línea 5424** — Implementar exportación a PDF y Excel (XLSX) de las listas de notas

---

## Q&A Sesión 3

* **Línea 5774** — Error en Administración > Cursadas: `Missing or insufficient permissions` (collectionGroup)
* **Línea 5884** — Análisis previo: propuesta para integrar "Planillas de trabajos prácticos"
* **Línea 6312** — Implementar primer cambio real de Planillas de trabajos prácticos
* **Línea 6540** — Implementar la base de datos real para Planillas (tipos, hooks, reglas Firestore)
* **Línea 6872** — Conectar Planillas a la UI para poder probarla desde la app
* **Línea 7062** — Continuar con el desarrollo de Planillas de trabajos prácticos
* **Línea 7360** — Corregir y mejorar Planillas de trabajos prácticos
* **Línea 7707** — Seguir mejorando Planillas: exportación, vistas y detalle/editor
* **Línea 8095** — Implementar gestión de "Planillas base"
* **Línea 8598** — Corregir gestión de Planillas base
* **Línea 8910** — Modificar la funcionalidad existente de notas de exámenes
* **Línea 9223** — Corregir detalles de notas de exámenes
* **Línea 9505** — Corregir dos detalles finales de la funcionalidad de notas
* **Línea 9741** — Modificar la funcionalidad de restricciones con código de acceso
* **Línea 10237** — Corregir error al abrir el panel de Admin > Accesos
* **Línea 10355** — Corregir y mejorar la lógica de accesos restringidos en subsecciones
* **Línea 10720** — Implementar funcionalidad para mover a un alumno entre comisiones/subsecciones restringidas
* **Línea 11086** — Corregir problema visual de codificación de caracteres en el modal "Mover alumno"
* **Línea 11167** — Corregir dos problemas visuales/UX antes de cerrar el PR

---

## Q&A Sesión 4

* **Línea 11362** — Generar modal de alerta para eliminar alumno de una cursada (Admin > Cursadas)
* **Línea 11448** — Permitir al admin seleccionar varios alumnos para eliminar o asignar
* **Línea 11574** — Reemplazar checkbox por tilde al presionar el botón `+` (selección visual)
* **Línea 11718** — Corrección de la función `handleRevocarInscripcion`
* **Línea 11884** — Corregir que los alumnos asignados en una comisión no queden marcados al abrir otra