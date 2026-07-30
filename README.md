# Desarrollo de Aplicaciones Móviles 2026 - Grupo 8

Repositorio correspondiente al proyecto **ODB-CVG**, una aplicación móvil desarrollada para la cátedra Operatoria Dental B de la Facultad de Odontología de la Universidad Nacional de La Plata (UNLP).

**ODB-CVG** centraliza la gestión académica de la cátedra, resolviendo la dispersión de información al proporcionar a docentes y alumnos un acceso rápido, organizado y seguro a los materiales de estudio, gestión de trabajos prácticos, entregas, calificaciones y cronograma general.

El proyecto fue desarrollado utilizando React Native + Expo y evolucionó a lo largo de tres entregas, incorporando progresivamente nuevas funcionalidades hasta completar el producto final.

## Integrantes del Grupo

| Apellido   | Nombre          | Legajo |
|------------|-----------------|--------|
| Amado      | Lautaro Agustín | 33146  |
| Bassilion  | Brisa           | 33143  |
| Bucchino   | Ulises Mateo    | 33326  |
| Caceres    | Juan Cruz       | 33168  |
| La Gioiosa | Bernardita      | 33289  |

---

## Organización del Repositorio y Ejecución

El código fuente de la aplicación se encuentra dentro de la carpeta raíz `/odb-cvg`. Este archivo funciona como punto de entrada general del repositorio, mientras que las instrucciones técnicas específicas residen dentro de la carpeta del proyecto.

Para ejecutar la aplicación, ingresá a la carpeta del proyecto:

```bash
cd odb-cvg
```

Luego, seguí las instrucciones detalladas en su respectivo `README.md` técnico (`/odb-cvg/README.md`). Allí se indican los pasos necesarios para instalar dependencias y levantar el entorno de desarrollo.

---

## Flujo de Trabajo y Estrategia de Ramas

Durante todo el ciclo lectivo y en cada una de las tres entregas, se mantuvo la siguiente organización de trabajo:

- Cada integrante desarrolló sus cambios en una rama individual.
- Los cambios fueron integrados progresivamente mediante pull requests en la rama `dev`.
- La rama `dev` fue utilizada como entorno de integración y prueba.
- Una vez validado el funcionamiento de cada etapa, se creó una rama específica (`entrega-1`, `entrega-2`, `entrega-3`) para congelar el estado correspondiente a evaluar.

---

# Producto Final (Entrega 3)

La versión final del proyecto integra todas las funcionalidades desarrolladas durante las tres etapas del proyecto, incluyendo la gestión de usuarios, contenidos académicos, planillas de trabajos prácticos, calificaciones, entregas de trabajos teóricos, cronograma, notificaciones, perfiles de usuario y administración de accesos por comisiones.

El producto final consolida la evolución del proyecto desarrollada a lo largo de las tres entregas (Entrega 1, Entrega 2 y Entrega 3), incorporando todas las funcionalidades planificadas durante el cursado.

---

## Rama de entrega

La versión final del proyecto se encuentra en la rama:

`entrega-3`

Esta rama fue creada a partir de la rama `dev`, donde se integraron y probaron los cambios desarrollados por los integrantes del grupo durante esta etapa.

---

## Funcionalidades incorporadas

**La versión final del proyecto incorpora los siguientes módulos funcionales:**

- Gestión de usuarios y autenticación.
- Gestión de módulos, secciones y contenido.
- Gestión de planillas de trabajos prácticos.
- Gestión de calificaciones.
- Gestión de entregas de trabajos teóricos.
- Gestión de accesos mediante códigos.
- Cronograma académico.
- Sistema de notificaciones.
- Gestión del perfil del usuario.

---

## Tag de entrega

La versión correspondiente a esta entrega se identifica con el siguiente tag:

`e3`

Este tag permite ubicar el commit exacto asociado a la versión final del proyecto.

---

### Documentación de la entrega
La documentación técnica final, el documento de alcance definitivo, el diseño UX/UI actualizado y el video demo se encuentran en el **Google Drive compartido** del grupo, según lo solicitado por la cátedra.

Dentro del repositorio, la evidencia relacionada con el uso de IA se ubica en:
`/ia/entrega-3/`
*(Esta carpeta contiene el archivo `.md` con las conversaciones acumuladas E1 + E2 + E3 y el índice de temas consultados).*

---

# Entrega 2 — Escalado Funcional

Esta entrega expande el MVP de la Entrega 1 con nuevos módulos: gestión de calificaciones y planillas de trabajos prácticos, sistema de entregas de trabajos teóricos y gestión de accesos por comisiones y clínicas.

---

## Rama de entrega

La versión entregable de la Entrega 2 se encuentra en la rama:

`entrega-2`

Esta rama fue creada a partir de la rama `dev`, donde se integraron y probaron los cambios desarrollados por los integrantes del grupo durante esta etapa.

---

## Cambios respecto a la Entrega 1

El historial de cambios entre entregas se encuentra documentado en:

`CHANGELOG.md`

---

## Documentación de la entrega

La documentación solicitada por la guía fue organizada y entregada en los espacios correspondientes indicados por la cátedra.

La Entrega 2 incluye:

- Documento de alcance actualizado (changelog de RF, reglas de negocio y validaciones).
- Diseño UX/UI actualizado en Figma (nuevas pantallas con estados y consideraciones de accesibilidad).
- Documentación técnica (autenticación/autorización, API/backend, decisiones de refactoring).
- Video demo de la aplicación.
- Archivo `.md` con las conversaciones IA utilizadas durante el desarrollo (acumulado E1 + E2).
- Índice de temas consultados.
- Código fuente funcional actualizado.

---

## Ubicación de documentación y demo

La documentación técnica, el documento de alcance, el diseño UX/UI y el video demo se encuentran en el Google Drive compartido del grupo, según lo solicitado por la guía de entrega.

Dentro del repositorio, la evidencia relacionada con el uso de IA se encuentra en:

`/ia/entrega-2/`

Esa carpeta contiene el archivo `.md` acumulado (E1 + E2) y el índice de temas consultados durante el desarrollo de la Entrega 2.

---

## Tag de entrega

La versión correspondiente a esta entrega se identifica con el siguiente tag:

`e2`

Este tag permite ubicar el commit exacto asociado a la versión final de la Entrega 2.

---

# Entrega 1 — MVP Básico

Esta rama contiene la versión final de la **Entrega 1**, cuyo objetivo fue desarrollar un MVP básico funcional de la aplicación, junto con la documentación, diseño, evidencia de uso de IA y video demo solicitados por la guía de trabajo.

---

## Rama de entrega

La versión entregable de la Entrega 1 se encuentra en la rama:

`entrega-1`

Esta rama fue creada a partir de la rama `dev`, donde previamente se integraron y probaron los cambios desarrollados por los integrantes del grupo.

---

## Documentación de la entrega

La Entrega 1 incluye:

- Documento de alcance.
- Diseño UX/UI.
- Documentación técnica.
- Video demo de la aplicación.
- Registro de uso de IA.
- Archivo `.md` con las conversaciones utilizadas durante el desarrollo.
- Índice de temas consultados.
- Código fuente funcional de la aplicación.

La documentación técnica, el documento de alcance, el diseño UX/UI y el video demo se encuentran en el Google Drive compartido del grupo.

Dentro del repositorio, la evidencia relacionada con el uso de IA se encuentra en:

`/ia/entrega-1/`

---

## Tag de entrega

`e1`