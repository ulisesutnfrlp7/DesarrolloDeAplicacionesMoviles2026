---
---
# Q&A de la sesión 1 
---

dame un panorama completo de todo lo que tiene la aplicación.

# Panorama Completo de la Aplicación **ODB-CVG** (Odonto B - CVG)

## 🧭 ¿Qué es?

**ODB-CVG** es una aplicación móvil desarrollada con **Expo / React Native** (Android + iOS + Web) para la **Facultad de Odontología de la UNLP**. Funciona como un **gestor de cátedra** para la materia "Odonto B" del ciclo lectivo 2026. Está construida con **Firebase** (Auth + Firestore + Storage) como backend, y utiliza **Cloudinary** para almacenamiento de archivos multimedia.

---

## 🏗️ Arquitectura General

```
Expo Router (file-based routing)
  ↓
Firebase Auth → Login/Autenticación
Firestore DB → Módulos → Secciones → Subsecciones → Items + Entregas + Notas + Planillas
Cloudinary → Archivos multimedia (PDFs, imágenes, videos)
```

---

## 👥 Roles de Usuario

| Rol | Descripción |
|-----|-------------|
| **Admin** | Acceso total. Crea/edita/elimina módulos, secciones, subsecciones, items. Gestiona usuarios. Puede reordenar módulos. |
| **Profesor** | Puede cargar notas, ver planillas, revisar entregas de alumnos. Creación limitada de items. |
| **Alumno** | Visualiza contenido, se inscribe a comisiones con código, realiza entregas, ve sus notas y planillas (vista alumno). |

---

## 📂 Estructura de Datos (Firestore)

### Colecciones principales:

```
modulos/{moduloId}
  └── secciones/{seccionId}
        └── subsecciones/{subseccionId} (anidación recursiva)
              └── items/{itemId}
                    └── entregas_alumnos/{entregaId}

usuarios/{userId}
legajos_index/{legajo}
inscripciones/{inscripcionId}
notas/{notaId}
planillas_tp/{planillaId}
  └── filas/{filaId}
  └── vistas_alumno/{alumnoId}
planillas_base_tp/{baseId}
vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}
permisos_multi_comision/{permisoId}
```

---

## 🧩 Módulos (Home Screen)

- **Home** (`app/(tabs)/home.tsx`): Pantalla principal con grilla de módulos.
  - Header con logo, nombre de la facultad, badge de rol y botón de cierre de sesión.
  - Los **admin** ven un FAB para crear módulos y botón para gestionar usuarios.
  - **Reordenamiento**: los admin pueden activar un modo de ordenamiento drag-style (subir/bajar) y persisten el orden.
  - **ModuloCard**: componente visual para cada módulo con icono, título y descripción corta.
  - Modal de confirmación al eliminar un módulo (elimina en cascada sus secciones).

---

## 📖 Secciones y Subsecciones

- **Secciones**: Agrupaciones dentro de un módulo. Tienen flags de configuración:
  - `esRestringida` / `codigoAcceso`: acceso protegido por código
  - `permiteCargaProfesor`: si los profesores pueden agregar contenido
  - `permiteNotas`: si la sección permite carga de notas
  - `permitePlanillas`: si la sección permite planillas de TP

- **Subsecciones**: Anidación infinita (recursiva usando `parentPath`). Comparten los mismos flags de permisos. El path se construye concatenando IDs separados por `/`.

- **Items**: El contenido real dentro de una sección/subsección. Tipos:
  | Tipo | Descripción |
  |------|-------------|
  | `texto` | Texto enriquecido (Markdown) |
  | `pdf` | Archivo PDF |
  | `imagen` | Imagen |
  | `documento` | Documento genérico |
  | `video` | Video |
  | `enlace` | Link externo |
  | `entrega` | Trabajo práctico entregable |

---

## 📝 Sistema de Entregas

- El docente crea un item tipo **"entrega"** con:
  - Descripción, fecha límite (`fechaLimite`), archivo de consigna opcional
- El **alumno** realiza una entrega (texto, PDF, imagen, documento o video)
  - Se almacena en `items/{itemId}/entregas_alumnos/{entregaId}`
  - Usa **Cloudinary** para subir archivos
- El **profesor/admin** revisa y califica:
  - Asigna nota numérica, retroalimentación, marca "requiere reentrega"
  - La reentrega del alumno resetea la nota a pendiente

---

## 📊 Sistema de Notas

- Colección plana `notas/{notaId}` con ID compuesto: `{seccionId}_{alumnoId}_{nombreExamen}`
- Permite crear múltiples exámenes por sección (no es una sola nota)
- Valores soportados: **número** o **"Ausente"**
- Funciones principales:
  - `useNotasPorSeccion`: escucha en tiempo real notas de una sección+examen
  - `guardarNotas`: upsert batch
  - `reemplazarNotasPorExamen`: borra y recarga
  - `eliminarNotasPorExamen`: borra todas las notas de un examen

---

## 📋 Sistema de Planillas de TP

Sistema completo de planillas para seguimiento de trabajos prácticos:

### Tipos de Planilla
| Tipo | Descripción |
|------|-------------|
| **Diaria** | Registro sesión por sesión (fecha, tema, notas, observaciones) |
| **Resumen** | Planilla final/resumen del alumno |

### Plantillas predefinidas (4)
1. **OP1/OP2 diaria** - Columnas: Fecha, Tema, Nota teoría, Nota TP, Observaciones
2. **OP1/OP2 final** - Columnas: Trabajo/Parcialito, Fechas, Nota Final TP, Nota Final Parcialito, Docente, Observaciones
3. **OP3-OP6 diaria** - Columnas: Fecha, Trabajo realizado, Pieza, Nota, Docente, Observaciones
4. **OP3-OP6 final** - Columnas: Trabajo, Fechas, Pieza, Nota final, Docente, Observaciones

### Funcionalidades clave:
- **Planillas Base**: plantillas reutilizables almacenadas en `planillas_base_tp`
- **Vista Alumno**: vista filtrada (solo columnas `visibleAlumno=true`) accesible por el alumno
  - Se genera automáticamente en dos ubicaciones: dentro de la planilla y en `vistas_planillas_alumnos/{alumnoId}/planillas/`
- **Transferencia entre subsecciones**: mueve planillas de un contexto a otro, resolviendo paths por títulos
- **Exportación**: componentes `ExportarNotas` y `ExportarPlanilla` para exportar datos

---

## 🔐 Autenticación y Seguridad

### Firebase Auth con persistencia AsyncStorage
- Pantallas: `login.tsx`, `registro.tsx`, `recuperar.tsx`
- En `index.tsx`: `onAuthStateChanged` redirige a home o login

### Firestore Rules (por roles)
- **Lectura**: cualquier usuario autenticado puede leer
- **Escritura admin**: módulos, secciones, subsecciones, items (update/delete), planillas base
- **Profesor**: puede crear items (con su UID), cargar notas, crear/editar planillas
- **Alumno**: solo puede crear/ver sus propias entregas, inscribirse con código de acceso, ver sus notas y vistas de planillas
- **Inscripciones**: validación de código de acceso (con soporte para subsecciones hasta 6 niveles de anidación)

---

## 🧰 Pantallas y Navegación

### Stack Navigator (layout.tsx)
1. **index** → Splash/redirección por auth
2. **login** / **registro** / **recuperar** → Auth
3. **(tabs)** → Tab Navigator con:
   - **home** → Módulos
   - **perfil** → Perfil de usuario
4. **modulos/[id]** → Detalle de módulo (secciones)
5. **modulos/form** → CRUD de módulos
6. **secciones/[id]** → Detalle de sección (subsecciones + items)
7. **secciones/form** → CRUD de secciones
8. **secciones/notas** → Gestión de notas
9. **secciones/mis-notas** → Vista alumno de notas
10. **secciones/planillas** → Gestión de planillas
11. **secciones/planillas-base** → Administración de plantillas
12. **secciones/planilla-base-detalle** → Detalle de plantilla
13. **secciones/mis-planillas** → Vista alumno de planillas
14. **secciones/planilla-detalle** → Detalle de planilla
15. **subsecciones/[id]** → Detalle de subsección
16. **subsecciones/form** → CRUD de subsecciones
17. **items/form** → CRUD de items
18. **entregas/[id]** → Detalle de entregas del item
19. **pantallasAdmin/userManagementScreen** → Admin: gestión de usuarios

---

## 🧪 Hooks Personalizados

| Hook | Función |
|------|---------|
| `useModulos` | CRUD + ordenamiento en tiempo real de módulos |
| `useSecciones` | CRUD de secciones por módulo |
| `useSubsecciones` | CRUD recursivo de subsecciones con `parentPath` |
| `useItems` | CRUD de items con eliminación de Cloudinary |
| `useNotas` | Gestión de notas (escucha, guardado batch, reemplazo, eliminación) |
| `usePlanillas` | Sistema completo de planillas: crear, editar, vistas alumno, transferencias |
| `useEntregasAlumnos` | Escucha y calificación de entregas (admin/profesor) |
| `useMiEntrega` | Entrega del alumno actual + envío/reentrega |
| `useUserRole` | Obtiene el rol del usuario autenticado |
| `useUserProfile` | Perfil del usuario |
| `useInscripciones` | Inscripciones a comisiones |
| `useThemeColor` / `useColorScheme` | Tema visual |

---

## 📦 Dependencias Principales

| Categoría | Librerías |
|-----------|-----------|
| **Framework** | Expo 54, React 19.1, React Native 0.81 |
| **Navegación** | Expo Router, React Navigation (stack + tabs) |
| **Backend** | Firebase (Auth, Firestore, Storage), Cloudinary |
| **UI** | Expo Vector Icons, react-native-markdown-display, expo-image |
| **Archivos** | expo-document-picker, expo-image-picker, expo-file-system, expo-sharing, expo-print |
| **Utilidades** | AsyncStorage, CryptoJS (firma Cloudinary), xlsx (exportación), DateTimePicker |
| **Animaciones** | react-native-reanimated, react-native-gesture-handler |

---

## 🌐 Integraciones Externas

- **Firebase**: Auth, Firestore (base de datos NoSQL en tiempo real), Storage (archivos legacy)
- **Cloudinary**: Almacenamiento y gestión de archivos multimedia (imágenes, PDFs, videos, documentos)
  - Se usa CryptoJS para firmar las requests de eliminación
- **Google Analytics** (Firebase Analytics): soportado pero condicional

---

## 📱 Configuración de Plataforma

- **iOS**: soporta tablets
- **Android**: edge-to-edge, barra de navegación sticky-immersive oculta, icono adaptive con múltiples resoluciones
- **Web**: output estático, español como idioma
- **Tema**: color primario `#0F4A32` (verde oscuro), fondo `#F5F5F5`, acentos en `#25B471`

---

## 🔄 Estado del Proyecto

Basado en los archivos `ia/entrega-2/IA.md` y `ia/entrega-3/IA.md` (abiertos en el editor), el proyecto está en su **tercera entrega** con un enfoque de desarrollo iterativo, probablemente como parte de un trabajo práctico universitario sobre desarrollo de aplicaciones móviles.

# Panorama Completo de la Aplicación **ODB-CVG** (Odonto B - CVG)

## 🧭 ¿Qué es?

**ODB-CVG** es una aplicación móvil desarrollada con **Expo / React Native** (Android + iOS + Web) para la **Facultad de Odontología de la UNLP**. Funciona como un **gestor de cátedra** para la materia "Odonto B" del ciclo lectivo 2026. Está construida con **Firebase** (Auth + Firestore + Storage) como backend, y utiliza **Cloudinary** para almacenamiento de archivos multimedia.

---

## 🏗️ Arquitectura General

```
Expo Router (file-based routing)
  ↓
Firebase Auth → Login/Autenticación
Firestore DB → Módulos → Secciones → Subsecciones → Items + Entregas + Notas + Planillas
Cloudinary → Archivos multimedia (PDFs, imágenes, videos)
```

---

## 👥 Roles de Usuario

| Rol | Descripción |
|-----|-------------|
| **Admin** | Acceso total. Crea/edita/elimina módulos, secciones, subsecciones, items. Gestiona usuarios. Puede reordenar módulos. |
| **Profesor** | Puede cargar notas, ver planillas, revisar entregas de alumnos. Creación limitada de items. |
| **Alumno** | Visualiza contenido, se inscribe a comisiones con código, realiza entregas, ve sus notas y planillas (vista alumno). |

---

## 📂 Estructura de Datos (Firestore)

### Colecciones principales:

```
modulos/{moduloId}
  └── secciones/{seccionId}
        └── subsecciones/{subseccionId} (anidación recursiva)
              └── items/{itemId}
                    └── entregas_alumnos/{entregaId}

usuarios/{userId}
legajos_index/{legajo}
inscripciones/{inscripcionId}
notas/{notaId}
planillas_tp/{planillaId}
  └── filas/{filaId}
  └── vistas_alumno/{alumnoId}
planillas_base_tp/{baseId}
vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}
permisos_multi_comision/{permisoId}
```

---

## 🧩 Módulos (Home Screen)

- **Home** (`app/(tabs)/home.tsx`): Pantalla principal con grilla de módulos.
  - Header con logo, nombre de la facultad, badge de rol y botón de cierre de sesión.
  - Los **admin** ven un FAB para crear módulos y botón para gestionar usuarios.
  - **Reordenamiento**: los admin pueden activar un modo de ordenamiento drag-style (subir/bajar) y persisten el orden.
  - **ModuloCard**: componente visual para cada módulo con icono, título y descripción corta.
  - Modal de confirmación al eliminar un módulo (elimina en cascada sus secciones).

---

## 📖 Secciones y Subsecciones

- **Secciones**: Agrupaciones dentro de un módulo. Tienen flags de configuración:
  - `esRestringida` / `codigoAcceso`: acceso protegido por código
  - `permiteCargaProfesor`: si los profesores pueden agregar contenido
  - `permiteNotas`: si la sección permite carga de notas
  - `permitePlanillas`: si la sección permite planillas de TP

- **Subsecciones**: Anidación infinita (recursiva usando `parentPath`). Comparten los mismos flags de permisos. El path se construye concatenando IDs separados por `/`.

- **Items**: El contenido real dentro de una sección/subsección. Tipos:
  | Tipo | Descripción |
  |------|-------------|
  | `texto` | Texto enriquecido (Markdown) |
  | `pdf` | Archivo PDF |
  | `imagen` | Imagen |
  | `documento` | Documento genérico |
  | `video` | Video |
  | `enlace` | Link externo |
  | `entrega` | Trabajo práctico entregable |

---

## 📝 Sistema de Entregas

- El docente crea un item tipo **"entrega"** con:
  - Descripción, fecha límite (`fechaLimite`), archivo de consigna opcional
- El **alumno** realiza una entrega (texto, PDF, imagen, documento o video)
  - Se almacena en `items/{itemId}/entregas_alumnos/{entregaId}`
  - Usa **Cloudinary** para subir archivos
- El **profesor/admin** revisa y califica:
  - Asigna nota numérica, retroalimentación, marca "requiere reentrega"
  - La reentrega del alumno resetea la nota a pendiente

---

## 📊 Sistema de Notas

- Colección plana `notas/{notaId}` con ID compuesto: `{seccionId}_{alumnoId}_{nombreExamen}`
- Permite crear múltiples exámenes por sección (no es una sola nota)
- Valores soportados: **número** o **"Ausente"**
- Funciones principales:
  - `useNotasPorSeccion`: escucha en tiempo real notas de una sección+examen
  - `guardarNotas`: upsert batch
  - `reemplazarNotasPorExamen`: borra y recarga
  - `eliminarNotasPorExamen`: borra todas las notas de un examen

---

## 📋 Sistema de Planillas de TP

Sistema completo de planillas para seguimiento de trabajos prácticos:

### Tipos de Planilla
| Tipo | Descripción |
|------|-------------|
| **Diaria** | Registro sesión por sesión (fecha, tema, notas, observaciones) |
| **Resumen** | Planilla final/resumen del alumno |

### Plantillas predefinidas (4)
1. **OP1/OP2 diaria** - Columnas: Fecha, Tema, Nota teoría, Nota TP, Observaciones
2. **OP1/OP2 final** - Columnas: Trabajo/Parcialito, Fechas, Nota Final TP, Nota Final Parcialito, Docente, Observaciones
3. **OP3-OP6 diaria** - Columnas: Fecha, Trabajo realizado, Pieza, Nota, Docente, Observaciones
4. **OP3-OP6 final** - Columnas: Trabajo, Fechas, Pieza, Nota final, Docente, Observaciones

### Funcionalidades clave:
- **Planillas Base**: plantillas reutilizables almacenadas en `planillas_base_tp`
- **Vista Alumno**: vista filtrada (solo columnas `visibleAlumno=true`) accesible por el alumno
  - Se genera automáticamente en dos ubicaciones: dentro de la planilla y en `vistas_planillas_alumnos/{alumnoId}/planillas/`
- **Transferencia entre subsecciones**: mueve planillas de un contexto a otro, resolviendo paths por títulos
- **Exportación**: componentes `ExportarNotas` y `ExportarPlanilla` para exportar datos

---

## 🔐 Autenticación y Seguridad

### Firebase Auth con persistencia AsyncStorage
- Pantallas: `login.tsx`, `registro.tsx`, `recuperar.tsx`
- En `index.tsx`: `onAuthStateChanged` redirige a home o login

### Firestore Rules (por roles)
- **Lectura**: cualquier usuario autenticado puede leer
- **Escritura admin**: módulos, secciones, subsecciones, items (update/delete), planillas base
- **Profesor**: puede crear items (con su UID), cargar notas, crear/editar planillas
- **Alumno**: solo puede crear/ver sus propias entregas, inscribirse con código de acceso, ver sus notas y vistas de planillas
- **Inscripciones**: validación de código de acceso (con soporte para subsecciones hasta 6 niveles de anidación)

---

## 🧰 Pantallas y Navegación

### Stack Navigator (layout.tsx)
1. **index** → Splash/redirección por auth
2. **login** / **registro** / **recuperar** → Auth
3. **(tabs)** → Tab Navigator con:
   - **home** → Módulos
   - **perfil** → Perfil de usuario
4. **modulos/[id]** → Detalle de módulo (secciones)
5. **modulos/form** → CRUD de módulos
6. **secciones/[id]** → Detalle de sección (subsecciones + items)
7. **secciones/form** → CRUD de secciones
8. **secciones/notas** → Gestión de notas
9. **secciones/mis-notas** → Vista alumno de notas
10. **secciones/planillas** → Gestión de planillas
11. **secciones/planillas-base** → Administración de plantillas
12. **secciones/planilla-base-detalle** → Detalle de plantilla
13. **secciones/mis-planillas** → Vista alumno de planillas
14. **secciones/planilla-detalle** → Detalle de planilla
15. **subsecciones/[id]** → Detalle de subsección
16. **subsecciones/form** → CRUD de subsecciones
17. **items/form** → CRUD de items
18. **entregas/[id]** → Detalle de entregas del item
19. **pantallasAdmin/userManagementScreen** → Admin: gestión de usuarios

---

## 🧪 Hooks Personalizados

| Hook | Función |
|------|---------|
| `useModulos` | CRUD + ordenamiento en tiempo real de módulos |
| `useSecciones` | CRUD de secciones por módulo |
| `useSubsecciones` | CRUD recursivo de subsecciones con `parentPath` |
| `useItems` | CRUD de items con eliminación de Cloudinary |
| `useNotas` | Gestión de notas (escucha, guardado batch, reemplazo, eliminación) |
| `usePlanillas` | Sistema completo de planillas: crear, editar, vistas alumno, transferencias |
| `useEntregasAlumnos` | Escucha y calificación de entregas (admin/profesor) |
| `useMiEntrega` | Entrega del alumno actual + envío/reentrega |
| `useUserRole` | Obtiene el rol del usuario autenticado |
| `useUserProfile` | Perfil del usuario |
| `useInscripciones` | Inscripciones a comisiones |
| `useThemeColor` / `useColorScheme` | Tema visual |

---

## 📦 Dependencias Principales

| Categoría | Librerías |
|-----------|-----------|
| **Framework** | Expo 54, React 19.1, React Native 0.81 |
| **Navegación** | Expo Router, React Navigation (stack + tabs) |
| **Backend** | Firebase (Auth, Firestore, Storage), Cloudinary |
| **UI** | Expo Vector Icons, react-native-markdown-display, expo-image |
| **Archivos** | expo-document-picker, expo-image-picker, expo-file-system, expo-sharing, expo-print |
| **Utilidades** | AsyncStorage, CryptoJS (firma Cloudinary), xlsx (exportación), DateTimePicker |
| **Animaciones** | react-native-reanimated, react-native-gesture-handler |

---

## 🌐 Integraciones Externas

- **Firebase**: Auth, Firestore (base de datos NoSQL en tiempo real), Storage (archivos legacy)
- **Cloudinary**: Almacenamiento y gestión de archivos multimedia (imágenes, PDFs, videos, documentos)
  - Se usa CryptoJS para firmar las requests de eliminación
- **Google Analytics** (Firebase Analytics): soportado pero condicional

---

## 📱 Configuración de Plataforma

- **iOS**: soporta tablets
- **Android**: edge-to-edge, barra de navegación sticky-immersive oculta, icono adaptive con múltiples resoluciones
- **Web**: output estático, español como idioma
- **Tema**: color primario `#0F4A32` (verde oscuro), fondo `#F5F5F5`, acentos en `#25B471`

---

## 🔄 Estado del Proyecto

Basado en los archivos `ia/entrega-2/IA.md` y `ia/entrega-3/IA.md` (abiertos en el editor), el proyecto está en su **tercera entrega** con un enfoque de desarrollo iterativo, probablemente como parte de un trabajo práctico universitario sobre desarrollo de aplicaciones móviles.

en base al contexto, necesito que me des un prompt para pedirle a una IA una nueva funcionalidad: tiene que ver con la implementación de un cronograma en la app. la idea es que "Cronograma", aparezca como un Bottom Navigation entre los botones de Inicio y Perfil. tendría que poder implementarse lo siguiente:

Trabajos que figuran como entregas en la misma aplicación (tienen fecha de entrega. Aparecerían automáticamente en el cronograma).
Ateneos (permitir al administrador cargar la fecha en el cronograma).
Parciales (permitir al administrador cargar la fecha en el cronograma).

Aquí tienes un prompt estructurado de forma experta para que se lo pases a cualquier IA. Está diseñado con el contexto técnico exacto de tu arquitectura (**Expo Router, Firestore, Firebase, Cloudinary**) para que la respuesta que recibas sea precisa, modular y directamente aplicable a la estructura actual de **ODB-CVG**.

---

### Prompt para la IA:

```markdown
Actúa como un desarrollador experto en React Native, Expo 54 y Firebase. Necesito implementar una nueva funcionalidad de "Cronograma" en nuestra aplicación móvil de gestión de cátedra (ODB-CVG). 

A continuación te detallo el contexto arquitectónico actual y los requerimientos específicos de la funcionalidad para que diseñes la solución (componentes, hooks, rutas y estructura de Firestore).

---

### 1. Contexto Tecnológico Actual
- **Framework:** Expo 54 (React Native 0.81), Expo Router (File-based routing).
- **Backend:** Firebase (Auth, Firestore en tiempo real).
- **Navegación:** Tab Navigator en `app/(tabs)/`.
- **Roles de Usuario:** Admin, Profesor, Alumno (disponibles mediante el hook `useUserRole`).

---

### 2. Requerimientos del Cronograma

#### A. Navegación e Interfaz (UI/UX)
- Agregar una nueva pestaña llamada **Cronograma** en el Bottom Navigation (`app/(tabs)/cronograma.tsx`), ubicada exactamente entre las pestañas de **Inicio** (Home) y **Perfil**.
- Utilizar el esquema de colores de la app: Primario `#0F4A32` (verde oscuro), Fondo `#F5F5F5`, Acento `#25B471`.
- La pantalla debe mostrar una vista de agenda/lista cronológica ordenada por fecha de los eventos del ciclo lectivo 2026.

#### B. Origen y Tipos de Datos (Eventos)
El cronograma debe consolidar e interactuar con tres tipos de eventos:
1. **Entregas (Automáticas):** Trabajos prácticos que ya existen como ítems tipo `entrega` en la subcolección `items/{itemId}` y que poseen un campo `fechaLimite`. Deben impactar automáticamente en el cronograma sin que el admin los duplique.
2. **Ateneos (Carga Manual):** Eventos teóricos/clínicos que el **Admin** debe poder crear, editar y eliminar.
3. **Parciales (Carga Manual):** Exámenes teóricos/prácticos que el **Admin** debe poder crear, editar y eliminar.

#### C. Permisos por Rol
- **Admin:** Tiene un botón flotante (FAB) o modal para crear/editar/eliminar "Ateneos" y "Parciales" (setear título, descripción, fecha/hora y sección/módulo asociado opcional).
- **Profesor:** Vista de lectura de todo el cronograma.
- **Alumno:** Vista de lectura personalizada (solo ve las entregas que corresponden a sus secciones/comisiones inscritas, además de todos los ateneos y parciales generales).

---

### 3. Qué necesito que generes:

1. **Diseño de Base de Datos (Firestore):** Propón la estructura de una nueva colección plana `cronograma_eventos` para los Ateneos y Parciales. Además, explica cómo realizar la consulta eficiente (o la combinación en el cliente) para traer estos eventos junto con las `entregas` existentes de la colección de items sin penalizar el rendimiento.
2. **Hook Personalizado (`useCronograma`):** Crea un hook que escuche en tiempo real tanto los eventos manuales como las entregas de los módulos a los que el usuario tiene acceso, ordenándolos por fecha de forma ascendente.
3. **Pantalla de la Pestaña (`app/(tabs)/cronograma.tsx`):** Código limpio y modular utilizando componentes nativos y `FlashList` o `FlatList` para renderizar los eventos con badges visuales diferenciados según el tipo (Entrega, Ateneo, Parcial).
4. **Modales de Gestión (Solo Admin):** El componente o lógica para que el administrador agregue/edite las fechas de Ateneos y Parciales.

Por favor, asegúrate de que el código sea compatible con React 19.1, use TypeScript y respete las convenciones de Expo Router.

```

---

### 💡 Un consejo técnico antes de que lo mandes:

Dado que tus `items` de tipo entrega están dispersos en una estructura subcoleccionable recursiva (`modulos -> secciones -> subsecciones -> items`), realizar un *Collection Group Query* en Firestore para traer todas las entregas en tiempo real puede ser costoso en lecturas.

Si la IA no lo nota, pídele en un segundo paso que optimice el hook utilizando un **índice** o haciendo que cuando un Admin cree un ítem tipo "entrega", mediante un *Cloud Function* o un *batch write*, se cree un "puntero/espejo" ligero en la colección `cronograma_eventos`. ¡Esto te ahorrará muchos dolores de cabeza con la facturación de Firebase!

Necesito implementar una nueva funcionalidad de "Cronograma" en nuestra aplicación móvil de gestión de cátedra (ODB-CVG).



### Requerimientos del Cronograma



#### A. Navegación e Interfaz (UI/UX)

- Agregar una nueva pestaña llamada **Cronograma** en el Bottom Navigation (`app/(tabs)/cronograma.tsx`), ubicada exactamente entre las pestañas de **Inicio** (Home) y **Perfil**.

- Utilizar el esquema de colores de la app: Primario `#0F4A32` (verde oscuro), Fondo `#F5F5F5`, Acento `#25B471`.

- La pantalla debe mostrar una vista de agenda/lista cronológica ordenada por fecha de los eventos del ciclo lectivo 2026.



#### B. Origen y Tipos de Datos (Eventos)

El cronograma debe consolidar e interactuar con tres tipos de eventos:

1. **Entregas (Automáticas):** Trabajos prácticos que ya existen como ítems tipo `entrega` en la subcolección `items/{itemId}` y que poseen un campo `fechaLimite`. Deben impactar automáticamente en el cronograma sin que el admin los duplique.

2. **Ateneos (Carga Manual):** Eventos teóricos/clínicos que el **Admin** debe poder crear, editar y eliminar.

3. **Parciales (Carga Manual):** Exámenes teóricos/prácticos que el **Admin** debe poder crear, editar y eliminar.



#### C. Permisos por Rol

- **Admin:** Tiene un botón flotante (FAB) o modal para crear/editar/eliminar "Ateneos" y "Parciales" (setear título, descripción, fecha/hora y sección/módulo asociado opcional).

- **Profesor:** Vista de lectura de todo el cronograma.

- **Alumno:** Vista de lectura personalizada (solo ve las entregas que corresponden a sus secciones/comisiones inscritas, además de todos los ateneos y parciales generales).

Primero, planeemos. No gastes tokens en vano.

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/_layout.tsx)

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/home.tsx#1-1), lines 1 to 60

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useItems.ts#1-1), lines 1 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useUserRole.ts)

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#1-1), lines 1 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/constants/theme.ts)

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useItems.ts#80-80), lines 80 to 100

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/package.json#1-1), lines 1 to 40

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#1-1), lines 1 to 60

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#60-60), lines 60 to 100

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalConfirmacion.tsx#1-1), lines 1 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useModulos.ts#1-1), lines 1 to 60

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firebase.indexes.json#1-1), lines 1 to 50

Tengo suficiente contexto. Voy a preguntar un par de cosas clave antes de finalizar el diseño. 

Analyzing your answers...

Perfecto, tengo todo lo necesario. Elaborando el plan completo. 

Created memory file [](file:///c%3A/Users/ulibu/AppData/Roaming/Code/User/workspaceStorage/d07a0f971e0990294b5d9477d9367baa/GitHub.copilot-chat/memory-tool/memories/ZDU4Y2E2MDUtM2I0Zi00MTRkLTllZmItMWQ3NDViZTg4MWQ1/plan.md)

## Plan: Feature Cronograma ODB-CVG

**TL;DR:** Agregar pestaña "Cronograma" con vista de agenda que consolida entregas automáticas (desde `items` con `fechaLimite`), ateneos y parciales manuales. Admin crea/edita/elimina eventos manuales; profesor ve todo; alumno ve vista filtrada por sus inscripciones. Nueva colección Firestore `eventos_cronograma` para los eventos manuales.

---

### Archivos a crear/modificar

**Crear:**
- `odb-cvg/hooks/useCronograma.ts`
- `odb-cvg/components/ui/ModalEventoCronograma.tsx`
- `odb-cvg/app/(tabs)/cronograma.tsx`

**Modificar:**
- _layout.tsx
- firestore.rules
- firebase.indexes.json

---

### Phase 1 — Firestore Setup

1. **firestore.rules**: agregar regla para colección `eventos_cronograma`
   - Admin: read/write; autenticados: solo read
2. **firebase.indexes.json**: agregar 2 índices:
   - `items.tipo` con scope `COLLECTION_GROUP` (necesario para `collectionGroup("items").where("tipo","==","entrega")`)
   - `eventos_cronograma` ordenado por `fecha ASC`

### Phase 2 — Hook `useCronograma` *(paralelo con Phase 3)*

3. **Crear `hooks/useCronograma.ts`** con tipo unificado `EventoCronograma`:

   | Campo | Descripción |
   |---|---|
   | `tipo` | `"entrega" \| "ateneo" \| "parcial"` |
   | `fecha` | `Date` (viene de `fechaLimite` en items o `fecha` en eventos) |
   | `moduloId?`, `seccionId?` | para contexto/navegación |

   - **Admin/Profesor**: `onSnapshot(eventos_cronograma)` + `collectionGroup("items").where("tipo","==","entrega")` → filtrar client-side `fechaLimite != null`
   - **Alumno**: `onSnapshot(eventos_cronograma)` + una query por inscripción al path exacto de `items` (reusar lógica de `getItemsCollection` de useItems.ts, a extraer en `utils/firestorePaths.ts`)
   - Merge final ordenado por fecha ASC
   - Expone: `crearEvento(data)`, `editarEvento(id, data)`, `eliminarEvento(id)`

### Phase 3 — Componente Modal *(paralelo con Phase 2)*

4. **Crear `components/ui/ModalEventoCronograma.tsx`**
   - Selector segmentado Ateneo / Parcial
   - Campos: título, descripción (opcional), fecha + hora via `DateTimePicker` (ya instalado), módulo/sección asociado (opcional, solo informativo)
   - Estilos siguiendo ModalConfirmacion.tsx (#0F4A32, borderRadius 12)

### Phase 4 — Pantalla *(depende de Phases 2 y 3)*

5. **Crear `app/(tabs)/cronograma.tsx`**
   - `SectionList` agrupado por fecha (encabezado `"DD/MM — día"`)
   - Badge por tipo: Entrega `#E8871E` (naranja), Ateneo `#25B471` (verde), Parcial `#C0392B` (rojo)
   - Admin: botones `pencil` / `trash` inline visibles **solo en ateneos/parciales**
   - FAB (solo admin) → abre `ModalEventoCronograma` en modo creación
   - `ModalConfirmacion` para confirmar borrado
   - Estados de loading y empty state

### Phase 5 — Navegación *(independiente, puede ir antes)*

6. **Modificar `app/(tabs)/_layout.tsx`**: insertar `<Tabs.Screen name="cronograma">` entre `home` y `perfil` con ícono `Ionicons "calendar-outline"`

---

### Verificación

1. `expo start` — sin errores TypeScript
2. Admin: FAB presente → crear evento → aparece ordenado en lista
3. Admin: editar/eliminar en ateneos/parciales funciona; entregas NO muestran esos botones
4. Profesor: sin FAB, sin botones CRUD, ve todo el cronograma
5. Alumno: ve solo entregas de sus secciones inscritas + todos los ateneos/parciales
6. `firebase deploy --only firestore:rules,firestore:indexes` — sin errores de reglas

---

### Consideraciones adicionales

1. **Extracción de `getItemsCollection`**: está actualmente encapsulada en useItems.ts. Recomendación: moverla a `utils/firestorePaths.ts` para reutilizar en el nuevo hook sin duplicar código.
2. **Títulos de módulo en entregas**: resolver el `moduloTitulo` requeriría un lookup extra por cada entrega. Alternativa más liviana: mostrar el path decodificado o simplemente el `moduloId`. A confirmar.
3. **Delay del índice**: el índice `COLLECTION_GROUP` en `items.tipo` puede tardar minutos en construirse al desplegarse por primera vez en Firebase.

---

¿Aprobás el plan o querés ajustar algo?

Created 6 todos

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useItems.ts)

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/home.tsx#60-60), lines 60 to 250

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firebase.indexes.json)

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ScreenHeader.tsx#1-1), lines 1 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#90-90), lines 90 to 130

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#80-80), lines 80 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#130-130), lines 130 to 130

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#80-80), lines 80 to 200

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#200-200), lines 200 to 280

Now let me check `ModalAlerta` props quickly before writing: 

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalAlerta.tsx#1-1), lines 1 to 60

I have all the context I need. Let me implement all phases now. 

Starting: *Create hook useCronograma.ts* (1/5)

Created [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useCronograma.ts)

Starting: *Create ModalEventoCronograma component* (2/5)

Created [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx)

Starting: *Create app/(tabs)/cronograma.tsx screen* (3/5)

Created [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx)

Starting: *Update _layout.tsx navigation* (4/5)

Now update the tab layout and Firestore config simultaneously: 

Replacing 22 lines with 58 lines in [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/_layout.tsx), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firebase.indexes.json)


```

```

```

```

```

```


Starting: *Update firestore.rules + indexes* (5/5)

Now let me verify there are no TypeScript errors: 

Checked [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useCronograma.ts), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/_layout.tsx), no problems found

Zero errors. Let me do a final sanity check on the modified Firestore files:   

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#30-30), lines 30 to 99

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firebase.indexes.json#1-1), lines 1 to 55

No matches found. Your search pattern might be excluded completely by either the search.exclude settings or .*ignore files.
If you believe that it should have results, you can check into the .*ignore files and the exclude setting (here are some excluded patterns for reference:[**/node_modules,**/bower_components,**/*.code-search]).
Then if you want to include those files you can call the tool again by setting "includeIgnoredFiles" to true.

Searched for text `eventos_cronograma` (`**/odb-cvg/firestore.rules`), 1 result

Completed: *Update firestore.rules + indexes* (5/5)

Todo en orden. Sin errores TypeScript. Resumen de lo implementado:

---

### Archivos creados

- hooks/useCronograma.ts — Hook que fusiona las tres fuentes de datos. Admin/profesor usa `collectionGroup("items")` para ver todas las entregas; alumno consulta solo las rutas de sus inscripciones. Escucha `eventos_cronograma` en tiempo real. Expone `crearEvento`, `editarEvento`, `eliminarEvento`.

- components/ui/ModalEventoCronograma.tsx — Bottom-sheet modal con selector segmentado Ateneo/Parcial, campos de título, descripción, fecha/hora (via `DateTimePicker`), módulo y comisión opcionales. Funciona tanto para crear como editar.

- app/(tabs)/cronograma.tsx/cronograma.tsx) — Pantalla principal con `SectionList` agrupado por fecha. Badges con colores por tipo (`#E8871E` entrega, `#25B471` ateneo, `#C0392B` parcial). Botones editar/eliminar inline solo para admin en ateneos/parciales. FAB solo para admin.

### Archivos modificados

- app/(tabs)/_layout.tsx/_layout.tsx) — Tab `cronograma` insertado entre Home y Perfil con ícono `calendar-outline`.

- firestore.rules — Regla `eventos_cronograma`: lectura para autenticados, escritura solo para admin.

- firebase.indexes.json — `fieldOverride` para `items.tipo` con scope `COLLECTION_GROUP` (necesario para el query del admin/profesor) y override para `eventos_cronograma.fecha`.

---

**Próximo paso recomendado:** `firebase deploy --only firestore:rules,firestore:indexes` para activar las reglas y construir el índice en producción. El índice `items.tipo` puede tardar unos minutos en construirse la primera vez.

Made changes.

Perfecto, tengo todo lo necesario. Elaborando el plan completo. 

Created memory file [](file:///c%3A/Users/ulibu/AppData/Roaming/Code/User/workspaceStorage/d07a0f971e0990294b5d9477d9367baa/GitHub.copilot-chat/memory-tool/memories/ZDU4Y2E2MDUtM2I0Zi00MTRkLTllZmItMWQ3NDViZTg4MWQ1/plan.md)

## Plan: Feature Cronograma ODB-CVG

**TL;DR:** Agregar pestaña "Cronograma" con vista de agenda que consolida entregas automáticas (desde `items` con `fechaLimite`), ateneos y parciales manuales. Admin crea/edita/elimina eventos manuales; profesor ve todo; alumno ve vista filtrada por sus inscripciones. Nueva colección Firestore `eventos_cronograma` para los eventos manuales.

---

### Archivos a crear/modificar

**Crear:**
- `odb-cvg/hooks/useCronograma.ts`
- `odb-cvg/components/ui/ModalEventoCronograma.tsx`
- `odb-cvg/app/(tabs)/cronograma.tsx`

**Modificar:**
- _layout.tsx
- firestore.rules
- firebase.indexes.json

---

### Phase 1 — Firestore Setup

1. **firestore.rules**: agregar regla para colección `eventos_cronograma`
   - Admin: read/write; autenticados: solo read
2. **firebase.indexes.json**: agregar 2 índices:
   - `items.tipo` con scope `COLLECTION_GROUP` (necesario para `collectionGroup("items").where("tipo","==","entrega")`)
   - `eventos_cronograma` ordenado por `fecha ASC`

### Phase 2 — Hook `useCronograma` *(paralelo con Phase 3)*

3. **Crear `hooks/useCronograma.ts`** con tipo unificado `EventoCronograma`:

   | Campo | Descripción |
   |---|---|
   | `tipo` | `"entrega" \| "ateneo" \| "parcial"` |
   | `fecha` | `Date` (viene de `fechaLimite` en items o `fecha` en eventos) |
   | `moduloId?`, `seccionId?` | para contexto/navegación |

   - **Admin/Profesor**: `onSnapshot(eventos_cronograma)` + `collectionGroup("items").where("tipo","==","entrega")` → filtrar client-side `fechaLimite != null`
   - **Alumno**: `onSnapshot(eventos_cronograma)` + una query por inscripción al path exacto de `items` (reusar lógica de `getItemsCollection` de useItems.ts, a extraer en `utils/firestorePaths.ts`)
   - Merge final ordenado por fecha ASC
   - Expone: `crearEvento(data)`, `editarEvento(id, data)`, `eliminarEvento(id)`

### Phase 3 — Componente Modal *(paralelo con Phase 2)*

4. **Crear `components/ui/ModalEventoCronograma.tsx`**
   - Selector segmentado Ateneo / Parcial
   - Campos: título, descripción (opcional), fecha + hora via `DateTimePicker` (ya instalado), módulo/sección asociado (opcional, solo informativo)
   - Estilos siguiendo ModalConfirmacion.tsx (#0F4A32, borderRadius 12)

### Phase 4 — Pantalla *(depende de Phases 2 y 3)*

5. **Crear `app/(tabs)/cronograma.tsx`**
   - `SectionList` agrupado por fecha (encabezado `"DD/MM — día"`)
   - Badge por tipo: Entrega `#E8871E` (naranja), Ateneo `#25B471` (verde), Parcial `#C0392B` (rojo)
   - Admin: botones `pencil` / `trash` inline visibles **solo en ateneos/parciales**
   - FAB (solo admin) → abre `ModalEventoCronograma` en modo creación
   - `ModalConfirmacion` para confirmar borrado
   - Estados de loading y empty state

### Phase 5 — Navegación *(independiente, puede ir antes)*

6. **Modificar `app/(tabs)/_layout.tsx`**: insertar `<Tabs.Screen name="cronograma">` entre `home` y `perfil` con ícono `Ionicons "calendar-outline"`

---

### Verificación

1. `expo start` — sin errores TypeScript
2. Admin: FAB presente → crear evento → aparece ordenado en lista
3. Admin: editar/eliminar en ateneos/parciales funciona; entregas NO muestran esos botones
4. Profesor: sin FAB, sin botones CRUD, ve todo el cronograma
5. Alumno: ve solo entregas de sus secciones inscritas + todos los ateneos/parciales
6. `firebase deploy --only firestore:rules,firestore:indexes` — sin errores de reglas

---

### Consideraciones adicionales

1. **Extracción de `getItemsCollection`**: está actualmente encapsulada en useItems.ts. Recomendación: moverla a `utils/firestorePaths.ts` para reutilizar en el nuevo hook sin duplicar código.
2. **Títulos de módulo en entregas**: resolver el `moduloTitulo` requeriría un lookup extra por cada entrega. Alternativa más liviana: mostrar el path decodificado o simplemente el `moduloId`. A confirmar.
3. **Delay del índice**: el índice `COLLECTION_GROUP` en `items.tipo` puede tardar minutos en construirse al desplegarse por primera vez en Firebase.

---

¿Aprobás el plan o querés ajustar algo?

Created 6 todos

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useItems.ts)

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/home.tsx#60-60), lines 60 to 250

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firebase.indexes.json)

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ScreenHeader.tsx#1-1), lines 1 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#90-90), lines 90 to 130

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#80-80), lines 80 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#130-130), lines 130 to 130

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#80-80), lines 80 to 200

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#200-200), lines 200 to 280

Now let me check `ModalAlerta` props quickly before writing: 

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalAlerta.tsx#1-1), lines 1 to 60

I have all the context I need. Let me implement all phases now. 

Starting: *Create hook useCronograma.ts* (1/5)

Created [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useCronograma.ts)

Starting: *Create ModalEventoCronograma component* (2/5)

Created [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx)

Starting: *Create app/(tabs)/cronograma.tsx screen* (3/5)

Created [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx)

Starting: *Update _layout.tsx navigation* (4/5)

Now update the tab layout and Firestore config simultaneously: 

Replacing 22 lines with 58 lines in [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/_layout.tsx), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firebase.indexes.json)


```

```

```

```

```

```


Starting: *Update firestore.rules + indexes* (5/5)

Now let me verify there are no TypeScript errors: 

Checked [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useCronograma.ts), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx), [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/_layout.tsx), no problems found

Zero errors. Let me do a final sanity check on the modified Firestore files:   

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules#30-30), lines 30 to 99

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firebase.indexes.json#1-1), lines 1 to 55

No matches found. Your search pattern might be excluded completely by either the search.exclude settings or .*ignore files.
If you believe that it should have results, you can check into the .*ignore files and the exclude setting (here are some excluded patterns for reference:[**/node_modules,**/bower_components,**/*.code-search]).
Then if you want to include those files you can call the tool again by setting "includeIgnoredFiles" to true.

Searched for text `eventos_cronograma` (`**/odb-cvg/firestore.rules`), 1 result

Completed: *Update firestore.rules + indexes* (5/5)

Todo en orden. Sin errores TypeScript. Resumen de lo implementado:

---

### Archivos creados

- hooks/useCronograma.ts — Hook que fusiona las tres fuentes de datos. Admin/profesor usa `collectionGroup("items")` para ver todas las entregas; alumno consulta solo las rutas de sus inscripciones. Escucha `eventos_cronograma` en tiempo real. Expone `crearEvento`, `editarEvento`, `eliminarEvento`.

- components/ui/ModalEventoCronograma.tsx — Bottom-sheet modal con selector segmentado Ateneo/Parcial, campos de título, descripción, fecha/hora (via `DateTimePicker`), módulo y comisión opcionales. Funciona tanto para crear como editar.

- app/(tabs)/cronograma.tsx/cronograma.tsx) — Pantalla principal con `SectionList` agrupado por fecha. Badges con colores por tipo (`#E8871E` entrega, `#25B471` ateneo, `#C0392B` parcial). Botones editar/eliminar inline solo para admin en ateneos/parciales. FAB solo para admin.

### Archivos modificados

- app/(tabs)/_layout.tsx/_layout.tsx) — Tab `cronograma` insertado entre Home y Perfil con ícono `calendar-outline`.

- firestore.rules — Regla `eventos_cronograma`: lectura para autenticados, escritura solo para admin.

- firebase.indexes.json — `fieldOverride` para `items.tipo` con scope `COLLECTION_GROUP` (necesario para el query del admin/profesor) y override para `eventos_cronograma.fecha`.

---

**Próximo paso recomendado:** `firebase deploy --only firestore:rules,firestore:indexes` para activar las reglas y construir el índice en producción. El índice `items.tipo` puede tardar unos minutos en construirse la primera vez.

Made changes.

ya está todo implementado. decime. qué necesito hacer yo manualmente?

Esto es lo que necesitás hacer manualmente (fuera de VS Code):

---

## 1. Desplegar las reglas e índices a Firebase

Abrí una terminal en `odb-cvg/` y ejecutá:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Esto:
- Activa la regla de la nueva colección `eventos_cronograma`
- Empieza a construir el índice `collectionGroup("items").where("tipo","==","entrega")` (puede tardar unos minutos la primera vez)

⚠️ **Importante**: hasta que ese índice no esté listo, el cronograma para admin/profesor va a fallar al cargar las entregas. Para alumnos (que usan las inscripciones) sí funciona de una.

---

## 2. Probar que la app compila

```bash
cd odb-cvg
npx expo start
```

Navegá a la pestaña **Cronograma** (tercer ícono). Si ves la pantalla sin errores, está todo bien.

---

## 3. Hacer pruebas rápidas

| Rol | Qué probar |
|-----|-----------|
| **Admin** | Crear un ateneo y un parcial desde el FAB → se ven en la lista. Editar y eliminar ateneo/parcial. Verificar que las entregas existentes aparecen pero NO tienen botones editar/eliminar. |
| **Alumno** | Ver que solo aparecen las entregas de las secciones a las que está inscrito. Los ateneos/parciales se ven igual. |
| **Profesor** | Sin FAB, sin botones CRUD, pero ve todo el cronograma. |

---

## 4. Si no se ven las entregas en admin/profesor

El índice `COLLECTION_GROUP` en `items.tipo` puede tardar varios minutos en construirse. Si después de un rato sigue sin aparecer, revisá en la consola de Firebase:

1. Ir a [Firebase Console](https://console.firebase.google.com/) > Firestore > Índices
2. Verificar que el índice compuesto esté en estado **"Habilitado"** (no "En construcción")
3. Si no aparece, podés crearlo manualmente con:
   - Colección: `items`
   - Scope: `Colección`
   - Campo: `tipo`, Ascendente
   - Scope2: `Colección`
   - Campo2: `fechaLimite`, Ascendente

---

Eso es todo. Sin migraciones de datos, sin cambios en otros archivos, sin modificar el backend.

ulibu@Trabajo MINGW64 ~/Desktop/DespuésLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg (Ulises-Bucchino)
$ firebase deploy --only firestore:rules,firestore:indexes
bash: firebase: command not found

ulibu@Trabajo MINGW64 ~/Desktop/DespuésLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg (Ulises-Bucchino)
$ ls
README.md  app.json  components/  constants/        expo-env.d.ts          firebase.json    hooks/  node_modules/      package.json  storage.rules  utils/
app/       assets/   config/      eslint.config.js  firebase.indexes.json  firestore.rules  ia/     package-lock.json  scripts/      tsconfig.json

qué paso? como alternativa no podría hacerlo desde la consola de firebase?

No hay problema, se puede hacer todo desde la consola web de Firebase sin necesidad de CLI. Te explico paso a paso:

---

## 1. Reglas de Firestore (desde la web)

1. Andá a [Firebase Console](https://console.firebase.google.com/)
2. Seleccioná tu proyecto
3. En el menú izquierdo: **Firestore Database** → pestaña **Reglas**
4. Reemplazá TODO el contenido del editor con el contenido de tu archivo local `firestore.rules`
5. Click en **Publicar**

Las reglas ya tienen la nueva línea para `eventos_cronograma`:
```
match /eventos_cronograma/{eventoId} {
  allow read: if request.auth != null;
  allow create, update, delete: if isAdmin();
}
```

---

## 2. Índice compuesto para entregas (desde la web)

1. En Firestore Database, andá a la pestaña **Índices**
2. Click en **Crear índice**
3. Completá:
   - **Colección**: `items`
   - **Scope**: `Colección` (collection group)
   - **Campo 1**: `tipo`, **Ascendente**
   - Click en **Añadir campo**
   - **Campo 2**: `fechaLimite`, **Ascendente**
4. Click en **Crear**

Esto es necesario para que el hook `useCronograma` pueda hacer `collectionGroup("items").where("tipo","==","entrega")`.

---

## 3. Índice simple para eventos_cronograma

1. En la misma solapa **Índices**, click en **Crear índice**
2. Completá:
   - **Colección**: `eventos_cronograma`
   - **Scope**: `Predeterminado`
   - **Campo 1**: `fecha`, **Ascendente**
3. Click en **Crear**

---

## 4. Probar que la app funciona

Una vez publicadas las reglas y creados los índices:

```bash
cd odb-cvg
npx expo start
```

Navegá a la pestaña Cronograma (tercer ícono, el del calendario).

---

**Resumen:** solo dos cositas desde la consola web:
1. Pegar las reglas de `firestore.rules` en la pestaña Reglas de Firestore y publicar.
2. Crear los dos índices.

Android Bundled 2870ms node_modules\expo-router\entry.js (1428 modules)
 ERROR  useCronograma fetchEntregas error: [FirebaseError: The query requires a COLLECTION_GROUP_ASC index for collection items and field tipo. You can create it here: https://console.firebase.google.com/v1/r/project/odb-cvg/firestore/indexes?create_exemption=Ckdwcm9qZWN0cy9vZGItY3ZnL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9pdGVtcy9maWVsZHMvdGlwbxACGggKBHRpcG8QAQ] FirebaseError: The query requires a COLLECTION_GROUP_ASC index for collection items and field tipo. You can create it here: https://console.firebase.google.com/v1/r/project/odb-cvg/firestore/indexes?create_exemption=Ckdwcm9qZWN0cy9vZGItY3ZnL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9pdGVtcy9maWVsZHMvdGlwbxACGggKBHRpcG8QAQ

Ese error es esperado. El índice `COLLECTION_GROUP` en `items.tipo` todavía no está creado en Firebase. Firebase te dio un link directo para crearlo automáticamente.

**Hacé click en este link** (es el mismo que aparece en el error):

[https://console.firebase.google.com/v1/r/project/odb-cvg/firestore/indexes?create_exemption=Ckdwcm9qZWN0cy9vZGItY3ZnL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9pdGVtcy9maWVsZHMvdGlwbxACGggKBHRpcG8QAQ](https://console.firebase.google.com/v1/r/project/odb-cvg/firestore/indexes?create_exemption=Ckdwcm9qZWN0cy9vZGItY3ZnL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9pdGVtcy9maWVsZHMvdGlwbxACGggKBHRpcG8QAQ)

Te va a llevar directo a la pantalla de creación del índice con los campos ya completados. Solo tenés que clickear **"Crear"**.

Además, necesitás crear **también** el índice para `eventos_cronograma`:

1. En [Firebase Console](https://console.firebase.google.com/) > Firestore > Índices
2. Click en **Crear índice**
3. Colección: `eventos_cronograma`
4. Scope: **Predeterminado**
5. Campo 1: `fecha`, Ascendente
6. Click en **Crear**

Y también **publicar las reglas**:
1. En Firestore > pestaña **Reglas**
2. Pegá el contenido de tu archivo `firestore.rules` (ya tiene la línea de `eventos_cronograma`)
3. Click en **Publicar**

Una vez que los dos índices estén en estado **"Habilitado"** (puede tardar 1-2 minutos), recargá la app y debería andar.

Pasamos a otra cosa. Planeemos 2 nuevas funcionalidades:

* Filtrado por [Todos, Entregas, Ateneos, Parciales] en Cronograma.

* Ir viendo el cronograma organizado por mes, es decir, tendría que estar ubicado entre debajo del botón + y de la Navbar (Inicio, Cronograma, Perfil), otra Barra que permita ir deslizando entre los distintos meses (Marzo, Abril, Mayo, etc) y ahí ir viendo los distintos eventos (Barra deslizable de meses).

Déjame ver el estado actual de los archivos editados antes de planear. 

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx#1-1), lines 1 to 280

Tengo el contexto claro. Ambas features son puramente de UI y estado local en cronograma.tsx. Armando el plan.  

Updated memory file [](file:///c%3A/Users/ulibu/AppData/Roaming/Code/User/workspaceStorage/d07a0f971e0990294b5d9477d9367baa/GitHub.copilot-chat/memory-tool/memories/ZDU4Y2E2MDUtM2I0Zi00MTRkLTllZmItMWQ3NDViZTg4MWQ1/plan.md)

Updated memory file [](file:///c%3A/Users/ulibu/AppData/Roaming/Code/User/workspaceStorage/d07a0f971e0990294b5d9477d9367baa/GitHub.copilot-chat/memory-tool/memories/ZDU4Y2E2MDUtM2I0Zi00MTRkLTllZmItMWQ3NDViZTg4MWQ1/plan.md)

## Plan: Filtro de tipo + Barra deslizable de meses

**TL;DR:** Ambas features son 100% client-side (estado local + derivación de datos). Un único archivo a modificar: cronograma.tsx. Sin nuevos hooks, sin Firestore.

---

### Layout final (top → bottom)
```
┌──────────────────────────────┐
│  Header "Cronograma 2026"    │  ← fijo
│  Filter bar (Todos|Entregas…)│  ← fijo, debajo del header
├──────────────────────────────┤
│                              │
│  SectionList  (flex: 1)      │  ← scrollable
│                              │
│                  [ + FAB ]   │  ← absolute, bottom elevado
├──────────────────────────────┤
│  Month bar  (Marzo|Abril…)   │  ← en flujo, fijo visual al fondo
└──────────────────────────────┘
         Tab bar (nativa)
```

---

### Feature A — Barra de filtro de tipo

**1.** Nuevo estado `filtroTipo: "todos" | "entrega" | "ateneo" | "parcial"` (default `"todos"`)

**2.** Derivar `eventosFiltrados`:
- `filtroTipo === "todos"` → todos los eventos del mes activo
- si no → `eventos.filter(e => e.tipo === filtroTipo)`, luego filtrar por mes

**3.** UI: `ScrollView horizontal` debajo del header
- Pills: "Todos", "Entregas", "Ateneos", "Parciales"
- Activo: bg `#0F4A32`, texto blanco
- Inactivo: bg blanco, borde `#0F4A32`, texto `#0F4A32`

---

### Feature B — Barra deslizable de meses

**4.** Derivar `mesesDisponibles` del array `eventos` completo (sin filtros), únicos `"YYYY-MM"`, ordenados cronológicamente → labels `"Marzo"`, `"Abril"`, etc.

**5.** Nuevo estado `mesActivo: string` — inicializa al mes actual si tiene eventos, o al primer mes disponible.
- Se actualiza con `useEffect` cuando `mesesDisponibles` carga por primera vez

**6.** Filtrado final: aplicar primero `filtroTipo`, luego `mesActivo`:
```
eventosFiltrados = eventos
  .filter(e => filtroTipo === "todos" || e.tipo === filtroTipo)
  .filter(e => toYYYYMM(e.fecha) === mesActivo)
```
→ pasa a `agruparPorFecha` para el `SectionList`

**7.** UI: `ScrollView horizontal` en flujo al fondo del container (antes del tab bar)
- Pill activo: bg `#0F4A32`, texto blanco; inactivo: bg `#F5F5F5`, texto gris
- Pill del mes activo tiene un punto/indicador debajo (dot indicator)
- `ref` en la `ScrollView` + `scrollTo` para auto-centrar el mes activo cuando cambia
- Altura fija del componente: ~56px

**8.** Ajustar FAB: `bottom: 72` (56 de la barra + 16 de margen) para que no tape la barra de meses

**9.** Empty state contextual: `"Sin [tipo] en [mes]"` (o `"Sin eventos en [mes]"` si filtroTipo es "todos")

---

### Archivos a modificar

- cronograma.tsx — único archivo

---

### Verificación

1. Tap "Entregas" → lista muestra solo entregas del mes activo
2. Deslizar mes → contenido de la lista cambia instantáneamente
3. Al cargar, el mes activo es el mes actual (julio 2026) o el primero con eventos
4. La barra de meses hace scroll automático para mostrar el mes seleccionado
5. FAB no superpone la barra de meses
6. Empty state muestra mensaje contextual cuando no hay eventos en la combinación filtro + mes

---

¿Aprobás el plan o querés ajustar algo (ej. el comportamiento del mes inicial, si la barra de tipos es horizontal scrollable o siempre visible, etc.)?

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx#1-1), lines 1 to 300

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx#300-300), lines 300 to 360

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx#360-360), lines 360 to 385

Created 1 todo

Replacing 70 lines with 276 lines in [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx)


```

```


Checked [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx), 1 problem found

Replacing 3 lines with 3 lines in [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx)


```

```


Checked [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx), no problems found

Completed: *Add filter bar + month bar to cronograma.tsx* (1/1)

Listo, sin errores. Resumen de los cambios en app/(tabs)/cronograma.tsx/cronograma.tsx):

**Feature A — Barra de filtro de tipo** (debajo del header):
- Estado `filtroTipo: "todos" | "entrega" | "ateneo" | "parcial"`
- `ScrollView` horizontal con 4 pills: "Todos", "Entregas", "Ateneos", "Parciales"
- Pill activo: fondo `#0F4A32` + texto blanco; inactivo: borde `#0F4A32` + texto verde

**Feature B — Barra deslizable de meses** (fija al fondo, encima del tab bar):
- `mesesDisponibles`: derivado de todos los eventos (sin filtro de tipo), únicos por `YYYY-MM`, ordenados cronológicamente → labels "Marzo", "Abril", etc.
- Estado `mesActivo`: se inicializa al mes actual (julio 2026) si tiene eventos, si no al primero disponible
- Auto-scroll de la barra al mes activo via `ScrollView ref + scrollTo` usando offsets medidos con `onLayout`
- Pill activo: fondo `#0F4A32` + punto indicador `#25B471` debajo
- FAB reposicionado a `bottom: 72` para no solapar la barra de meses

**Filtrado combinado:** `filtroTipo` y `mesActivo` se aplican en cadena vía `useMemo`. Empty state contextual: `"Sin ateneos en Agosto."` según la combinación activa.

Made changes.

me ocurre una cosa chiquitita: a veces, en un evento de cronograma, relleno el módulo y comisión opcional. Ahora bien, si me arrepiento y quiero borrar todo el contenido opcional en la edición, al guardar me sigue dejando el contenido viejo. Después anda todo perfecto. Solo eso. Queda el mismo contenido si yo lo quiero borrrar todo (Dejar en blanco).

El problema está claro. Buscando en el código...

**Causa raíz:** En `editarEvento` (hook `useCronograma.ts`, línea 258):
```ts
if (data.moduloTitulo !== undefined) updates.moduloTitulo = data.moduloTitulo;
```

Cuando el usuario **limpia** el campo y envía `""`, el modal lo convierte a `undefined` (línea 101 del modal: `moduloTitulo.trim() || undefined`). Cuando `editarEvento` recibe `undefined`, el `if (... !== undefined)` es `false`, así que **nunca se envía el campo a Firestore** y el valor viejo queda intacto.

**Solución:** Modificar la edición para que siempre se mande `""` en lugar de `undefined`, así Firestore sobreescribe el campo vacío.

Listo, el fix está aplicado. El problema era que `editarEvento` tenía esto:

```ts
if (data.moduloTitulo !== undefined) updates.moduloTitulo = data.moduloTitulo;
```

Cuando vos limpiabas el campo y guardabas, el modal convertía `""` a `undefined` (por el `|| undefined`), entonces el `if` nunca se cumplía y Firestore **nunca recibía** la instrucción de borrar el campo.

Ahora cambié esas tres líneas para que **siempre** se envíen a Firestore, incluso si están vacías:

```ts
updates.descripcion = data.descripcion ?? "";
updates.moduloTitulo = data.moduloTitulo ?? "";
updates.seccionTitulo = data.seccionTitulo ?? "";
```

**Para probarlo:** recargá la app (con Expo Go alcanza con cerrar y volver a abrir, o hacer swipe para recargar), editá un evento, borrá el contenido de Módulo y Comisión, guardá, y debería quedar vacío.

¿Probás si ahora funciona? Recargá la app, editá un evento, borrá Módulo y Comisión, guardá, y fijate si se limpian correctamente.

impecable: ahora, vamos con lo último: dame un prompt para pedirle a una IA que, ahora, el apartado de módulo y sección o comisión ya no es opcional: tiene que haber un desplegable de módulos (Operatoria Dental I a VI o "NINGUNO EN ESPECIAL") y, en base al módulo que se seleccione, tienen que aparecen las comisiones de las subsecciones de la sección Cursada - 2026 (en este caso). si módulo es "NINGUNO EN ESPECIAL", comisión será "NINGUNA EN ESPECIAL", por lo que a todos los alumnos de todas las comisiones y módulos les aparecería esa información. De lo contrario, a los alumnos les tiene que aparecer solo la información de ateneos y parciales (lo de las entregas ya está resuelto) correspondientes a las comisiones que están inscriptos.

---
### 🔒 REQUERIMIENTO: ASIGNACIÓN DE MÓDULOS Y COMISIONES A EVENTOS MANUALES (VISTA ADMIN / ALUMNO)

Necesito modificar el formulario de creación/edición de **Ateneos y Parciales** (eventos manuales gestionados por el Admin) y la lógica de visualización del alumno en el cronograma para que dejen de ser opcionales y pasen a estar estrictamente segmentados.

#### 1. Panel del Administrador (Formulario de Carga)
- **Desplegable 1 (Módulos):** Debe permitir seleccionar entre los módulos de la materia (ej. Operatoria Dental I a VI) o la opción `"NINGUNO EN ESPECIAL"`.
- **Desplegable 2 (Comisiones - Condicional):** - Si el módulo seleccionado es `"NINGUNO EN ESPECIAL"`, este desplegable se setea automáticamente en `"NINGUNA EN ESPECIAL"` y queda deshabilitado.
  - Si se selecciona un módulo específico (ej. Operatoria Dental III), este desplegable debe cargar dinámicamente las comisiones disponibles. Estas comisiones corresponden a las **subsecciones de la sección "Cursada - 2026"** del módulo seleccionado.
- **Persistencia:** Al guardar el evento en la colección `eventos_cronograma`, se deben almacenar obligatoriamente los campos `moduloId` y `comisionSubseccionId` (o sus respectivos equivalentes en string si es "NINGUNO/A").

#### 2. Lógica de Filtrado y Visibilidad para el Alumno
El hook `useCronograma` debe filtrar los Ateneos y Parciales que el alumno tiene permitido ver en su interfaz según sus inscripciones activas (usando el hook `useInscripciones` o la colección `inscripciones`):

- **Eventos Globales:** Si un evento tiene módulo `"NINGUNO EN ESPECIAL"` y comisión `"NINGUNA EN ESPECIAL"`, se le muestra **a todos los alumnos** de la app sin distinción.
- **Eventos Segmentados:** Si el evento pertenece a un módulo y comisión específicos, **solo se le muestra al alumno si está inscrito en esa comisión/subsección exacta**. 
*(Nota: Las entregas automáticas quedan fuera de esta regla porque ya vienen filtradas nativamente por su contexto de sección/subsección).*

#### 3. Qué necesito que generes:
1. La actualización de la interfaz del formulario con los dos desplegables (`Select` o `Picker` de React Native) con la lógica condicional en base al estado del primer selector.
2. La actualización del hook de filtrado para que cruce los datos de `eventos_cronograma` con las inscripciones del alumno actual en el frontend antes de renderizar la lista.
---

Planeemos.



### 🔒 REQUERIMIENTO: ASIGNACIÓN DE MÓDULOS Y COMISIONES A EVENTOS MANUALES (VISTA ADMIN / ALUMNO)



Necesito modificar el formulario de creación/edición de **Ateneos y Parciales** (eventos manuales gestionados por el Admin) y la lógica de visualización del alumno en el cronograma para que dejen de ser opcionales y pasen a estar estrictamente segmentados.



#### 1. Panel del Administrador (Formulario de Carga)

- **Desplegable 1 (Módulos):** Debe permitir seleccionar entre los módulos de la materia (Operatoria Dental I a VI) o la opción `"NINGUNO EN ESPECIAL"`.

- **Desplegable 2 (Comisiones - Condicional):** - Si el módulo seleccionado es `"NINGUNO EN ESPECIAL"`, este desplegable se setea automáticamente en `"NINGUNA EN ESPECIAL"` y queda deshabilitado.

  - Si se selecciona un módulo específico (EJ. Operatoria Dental I), este desplegable debe cargar dinámicamente las comisiones disponibles. Estas comisiones corresponden a las **subsecciones de la sección "Cursada - 2026"** del módulo seleccionado.

- **Persistencia:** Al guardar el evento en la colección `eventos_cronograma`, se deben almacenar obligatoriamente los campos `moduloId` y `comisionSubseccionId` (o sus respectivos equivalentes en string si es "NINGUNO/A").



#### 2. Lógica de Filtrado y Visibilidad para el Alumno

El hook `useCronograma` debe filtrar los Ateneos y Parciales que el alumno tiene permitido ver en su interfaz según sus inscripciones activas



- **Eventos Globales:** Si un evento tiene módulo `"NINGUNO EN ESPECIAL"` y comisión `"NINGUNA EN ESPECIAL"`, se le muestra **a todos los alumnos** de la app sin distinción.

- **Eventos Segmentados:** Si el evento pertenece a un módulo y comisión específicos, **solo se le muestra al alumno si está inscrito en esa comisión/subsección exacta**. 

*(Nota: Las entregas automáticas quedan fuera de esta regla porque ya vienen filtradas nativamente por su contexto de sección/subsección).*

No gastes tokens en vano.

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useCronograma.ts#1-1), lines 1 to 120

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx#1-1), lines 1 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useCronograma.ts#120-120), lines 120 to 250

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/%28tabs%29/cronograma.tsx#80-80), lines 80 to 200

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useCronograma.ts#250-250), lines 250 to 277

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#1-1), lines 1 to 150

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#150-150), lines 150 to 348

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useModulos.ts#1-1), lines 1 to 80

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useSubsecciones.ts#1-1), lines 1 to 100

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useSecciones.ts#1-1), lines 1 to 100

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/useInscripciones.ts#1-1), lines 1 to 80

Now I have enough context. Let me build the plan. 

Created memory file [](file:///c%3A/Users/ulibu/AppData/Roaming/Code/User/workspaceStorage/9d6bf7fb64b28f76d7bf62945b5b05cd/GitHub.copilot-chat/memory-tool/memories/OTRhNjc0YzItYTcyNi00YTk0LTk0MDMtNmM4NmNmMDRkZGZi/plan.md)

---

## Plan: Asignación de Módulos y Comisiones a Eventos Manuales

**TL;DR:** Reemplazar los campos de texto libre `moduloTitulo`/`seccionTitulo` del formulario por desplegables con IDs reales; actualizar los tipos y la capa CRUD; y filtrar en el hook los eventos segmentados según las inscripciones del alumno.

---

### Fase 1 — Tipos y CRUD en useCronograma.ts

**Paso 1 – Actualizar interfaces**
- `EventoCronogramaInput`: eliminar `moduloTitulo?`/`seccionTitulo?`; agregar 4 campos obligatorios: `moduloId`, `moduloTitulo`, `comisionSubseccionId`, `comisionTitulo` (los sentinels `"NINGUNO_EN_ESPECIAL"` / `"NINGUNA_EN_ESPECIAL"` sirven como valores "global")
- `EventoCronograma`: agregar `moduloId?`, `comisionSubseccionId?`, `comisionTitulo?`

**Paso 2 – Actualizar `crearEvento` y `editarEvento`**
- Persistir los 4 campos en Firestore
- `editarEvento`: siempre escribir los 4 campos (mismo patrón que ya usa con `descripcion`)

**Paso 3 – Filtrado en el listener `onSnapshot` de `eventos_cronograma`**
- Mapear `moduloId`, `comisionSubseccionId`, `comisionTitulo` desde Firestore
- Admin/Profesor: sin filtro (como hoy)
- Alumno:
  - Cargar sus inscripciones con un `getDocs` previo al `onSnapshot`, guardarlas en un `useRef`
  - Evento global (`moduloId === "NINGUNO_EN_ESPECIAL"`) → mostrar siempre
  - Evento segmentado → mostrar solo si `inscripciones.some(i => i.moduloId === event.moduloId && i.subseccionPath?.split('/').includes(event.comisionSubseccionId))`
  - Eventos viejos sin `moduloId` (backward compat) → tratar como globales

---

### Fase 2 — Formulario en ModalEventoCronograma.tsx

**Paso 4 – Nuevo estado**
- Reemplazar `moduloTitulo` (texto libre) por `moduloId` + `moduloTitulo`
- Reemplazar `seccionTitulo` (texto libre) por `comisionSubseccionId` + `comisionTitulo`
- Estado local adicional: `modulos[]`, `comisiones[]`, `loadingComisiones`

**Paso 5 – Cargar módulos**
- Importar y consumir `useModulos` dentro del modal
- Primer ítem de la lista: `{ id: "NINGUNO_EN_ESPECIAL", titulo: "NINGUNO EN ESPECIAL" }`

**Paso 6 – Carga dinámica de comisiones (cascada)**
- `useEffect([moduloId])`: cuando se selecciona un módulo real:
  1. `getDocs` de sus secciones → buscar la que tenga `titulo` que contenga `"cursada"` (case-insensitive, para no depender del año exacto)
  2. `getDocs` de las subsecciones directas de esa sección → poblar `comisiones[]`
  3. Resetear `comisionSubseccionId` a `"NINGUNA_EN_ESPECIAL"`
- Cuando se elige `"NINGUNO_EN_ESPECIAL"`: limpiar comisiones, fijar `comisionSubseccionId = "NINGUNA_EN_ESPECIAL"`

**Paso 7 – Modo edición**
- Al abrir con `eventoExistente`: setear `moduloId` y `comisionSubseccionId` desde el evento; la cascada del paso 6 carga las comisiones y luego se restablece la selección previa con un `useRef("pendingComisionId")`

**Paso 8 – Render de desplegables**
- Patrón "botón + lista de opciones" inline (sin Picker nativo), consistente con el estilo de la app
- Desplegable 2 deshabilitado (opacidad reducida) si `moduloId === "NINGUNO_EN_ESPECIAL"` o `loadingComisiones`

**Paso 9 – `handleGuardar` actualizado**
- Pasar los 4 campos nuevos al `onGuardar`
- Ambos desplegables son obligatorios (los sentinels son valores válidos)

---

### Archivos a modificar

| Archivo | Cambios |
|---|---|
| useCronograma.ts | Tipos, CRUD, filtrado alumno |
| ModalEventoCronograma.tsx | UI completa del formulario |

cronograma.tsx — **sin cambios** (pasa `EventoCronogramaInput` de forma transparente).

---

### Verificación

1. Firestore doc creado tiene `moduloId`, `moduloTitulo`, `comisionSubseccionId`, `comisionTitulo`
2. Editar evento pre-popula ambos desplegables correctamente
3. Alumno inscripto en comisión X ve solo sus eventos + los globales
4. Alumno no inscripto en la comisión del evento NO lo ve
5. Evento sin `moduloId` (datos viejos) → visible a todos (backward compat)

---

### Decisiones

- **Sentinels en Firestore**: `"NINGUNO_EN_ESPECIAL"` / `"NINGUNA_EN_ESPECIAL"` (strings literales)
- **Búsqueda de sección Cursada**: por `titulo.toLowerCase().includes("cursada")`, no hardcodeado con año
- **Carga de inscripciones**: una sola vez al montar el `useEffect`, en `useRef`, solo para `rol === "alumno"`
- **Scope excluido**: entregas automáticas intactas; no se toca cronograma.tsx

 ERROR  SyntaxError: C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\components\ui\ModalEventoCronograma.tsx: Identifier 'ModalEventoCronograma' has already been declared. (637:24)

  635 | }
  636 |
> 637 | export default function ModalEventoCronograma({
      |                         ^
  638 |   visible,
  639 |   eventoExistente,
  640 |   onGuardar,
    at constructor (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:365:19)
    at TypeScriptParserMixin.raise (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:6616:19)
    at TypeScriptScopeHandler.checkRedeclarationInScope (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:1619:19)
    at TypeScriptScopeHandler.declareName (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:1585:12)
    at TypeScriptScopeHandler.declareName (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:4892:11)
    at TypeScriptParserMixin.registerFunctionStatementId (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:13483:16)
    at TypeScriptParserMixin.registerFunctionStatementId (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:9195:13)
    at TypeScriptParserMixin.parseFunction (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:13467:12)
    at TypeScriptParserMixin.parseExportDefaultExpression (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:13924:19)
    at TypeScriptParserMixin.parseExportDefaultExpression (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:9419:18)
    at TypeScriptParserMixin.parseExport (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:13845:25)
    at TypeScriptParserMixin.parseExport (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:9402:20)
    at TypeScriptParserMixin.parseStatementContent (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:12895:27)
    at TypeScriptParserMixin.parseStatementContent (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:9525:18)
    at TypeScriptParserMixin.parseStatementLike (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:12784:17)
    at TypeScriptParserMixin.parseModuleItem (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:12761:17)
    at TypeScriptParserMixin.parseBlockOrModuleBlockBody (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:13333:36)
    at TypeScriptParserMixin.parseBlockBody (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:13326:10)
    at TypeScriptParserMixin.parseProgram (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:12639:10)
    at TypeScriptParserMixin.parseTopLevel (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:12629:25)
    at TypeScriptParserMixin.parse (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:14505:25)
    at TypeScriptParserMixin.parse (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:10143:18)
    at parse (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\parser\lib\index.js:14518:26)
    at parser (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\core\lib\parser\index.js:41:34)
    at parser.next (<anonymous>)
    at normalizeFile (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\core\lib\transformation\normalize-file.js:51:37)
    at normalizeFile.next (<anonymous>)
    at run (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\core\lib\transformation\index.js:22:50)
    at run.next (<anonymous>)
    at transform (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\core\lib\transform.js:22:33)
    at transform.next (<anonymous>)
    at evaluateSync (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\gensync\index.js:251:28)
    at sync (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\gensync\index.js:89:14)
    at stopHiding - secret - don't use this - v1 (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\core\lib\errors\rewrite-stack-trace.js:47:12)
    at Object.transformSync (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@babel\core\lib\transform.js:40:76)
    at parseWithBabel (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@expo\metro-config\build\transformSync.js:75:18)
    at transformSync (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@expo\metro-config\build\transformSync.js:54:16)
    at Object.transform (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@expo\metro-config\build\babel-transformer.js:127:58)
    at transformJSWithBabel (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@expo\metro-config\build\transform-worker\metro-transform-worker.js:468:47)
    at Object.transform (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@expo\metro-config\build\transform-worker\metro-transform-worker.js:583:12)
    at Object.transform (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\@expo\metro-config\build\transform-worker\transform-worker.js:178:19)
    at transformFile (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\metro\src\DeltaBundler\Worker.flow.js:67:36)
    at Object.transform (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\metro\src\DeltaBundler\Worker.flow.js:42:10)
    at execFunction (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\jest-worker\build\workers\processChild.js:149:17)
    at execHelper (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\jest-worker\build\workers\processChild.js:137:5)
    at execMethod (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\jest-worker\build\workers\processChild.js:140:5)
    at process.messageListener (C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\node_modules\jest-worker\build\workers\processChild.js:44:7)
    at process.emit (node:events:509:20)
    at emit (node:internal/child_process:956:14)
    at process.processTicksAndRejections (node:internal/process/task_queues:91:21)

No gastes tokens en vano

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#620-620), lines 620 to 700

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#700-700), lines 700 to 900

The old code was appended after the new one. I need to delete everything from line 629 to end of file. 

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#615-615), lines 615 to 640

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#900-900), lines 900 to 961

Replacing 14 lines with 6 lines in [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx)


```

```


Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#620-620), lines 620 to 680

The old function body is still there. I need to remove it entirely — from the `export default function` at line 629 to the end of the file:  

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#920-920), lines 920 to 953

The old function body spans ~300 more lines. The quickest fix is to truncate the file at the correct endpoint with PowerShell: 

Ran terminal command: (Get-Content "C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\components\ui\ModalEventoCronograma.tsx" | Select-Object -First 628) | Set-Content "C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg\components\ui\ModalEventoCronograma.tsx" -Encoding UTF8

I need to find a unique anchor in the old code. Let me read the relevant section: 

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#700-700), lines 700 to 840

I'll do this in two targeted replacements — the old code's `handleGuardar` content is unique:  

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#696-696), lines 696 to 953

I need to read the missing section to construct the complete `oldString`: 

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#628-628), lines 628 to 700

Let me check the new function's exact start to confirm what's unique about the old duplicate: 

Read [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx#35-35), lines 35 to 70

Good. The old code uniquely starts with `const esEdicion` immediately followed (without `useModulos`) by `const [tipo`. Now I can delete the entire duplicate with one precise replacement: 

Replacing 325 lines with 1 lines in [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx)


```

```


Checked [](file:///c%3A/Users/ulibu/Desktop/Despu%C3%A9sLoBorro/repo-apps-moviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/components/ui/ModalEventoCronograma.tsx), no problems found

Fixed. The duplicate was removed — file now has zero errors.

Made changes.

Necesito aclarar o interpretar o implementar 2 cuestiones:

* Obviamente que, en el cronograma, las subsecciones de los módulos se eligen a partir de "Cursada 2026". Esto es dinámico año a año? Es decir, cuando termine el 2026, las subsecciones de los módulos se tendrían que tomar desde "Cursada 2027", que, obviamente, tendría que estar creada.

* Existe la posibilidad de que, en el formulario de evento de cronograma, los únicos módulos seleccionables (aparte de la opción NINGUNO EN ESPECIAL), sean Operatoria Dental I a VI? Es decir, quisiera excluir los demás módulos que se llaman "Notas Finales y Reválidas", "Ateneos", "Revistas", etc. Lo mismo con el tema comisión: habría que excluir las subsecciones dentro de la sección "Cursada - 2026" que se llamen distinto de "Comisión X". No sé si es complicado.

Perfecto. Con la información clara, te presento el plan completo:

---

## Plan de implementación

### Objetivos
1. **Selector de módulo**: reemplazar el TextInput por un selector que muestre solo "Operatoria Dental I a VI" + "Ninguno en especial"
2. **Selector de comisión**: reemplazar el TextInput por un selector que cargue las subsecciones de la sección "Cursada - {año}" del módulo seleccionado, filtrando solo las que empiecen con "Comisión"
3. **Año dinámico**: el título del cronograma y la búsqueda de la sección "Cursada" usarán el año actual

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `hooks/useCronograma.ts` | Agregar funciones `obtenerModulosOperatoria()` y `obtenerComisiones(moduloId, anio)` |
| `components/ui/ModalEventoCronograma.tsx` | Reemplazar TextInputs por selectores modales con datos de Firestore |
| `app/(tabs)/cronograma.tsx` | Cambiar "Cronograma 2026" hardcodeado por año dinámico |

### Detalle de cada cambio

#### 1. Hook `useCronograma.ts` — dos nuevas funciones exportadas

```ts
// Filtra módulos cuyo título sea exactamente "Operatoria Dental I" a "Operatoria Dental VI"
export async function obtenerModulosOperatoria(): Promise<{id: string, titulo: string}[]>

// Busca la sección "Cursada - {anio}" dentro del módulo y devuelve sus subsecciones
// que matcheen /^Comisión \d+$/ (Comisión 1, Comisión 2, etc.)
export async function obtenerComisiones(moduloId: string, anio: number): Promise<{id: string, titulo: string}[]>
```

#### 2. Modal `ModalEventoCronograma.tsx`

- **Módulo**: al abrir el modal, se ejecuta `obtenerModulosOperatoria()` y se muestra un selector tipo lista/picker con:
  - "Ninguno en especial" (valor vacío)
  - "Operatoria Dental I"
  - "Operatoria Dental II"
  - ...
  - "Operatoria Dental VI"
- **Comisión**: cuando hay un módulo seleccionado, se ejecuta `obtenerComisiones(moduloId, añoActual)` y se muestra un selector con:
  - "Ninguna en especial" (valor vacío)
  - "Comisión 1", "Comisión 2", etc.
  - Si no hay módulo seleccionado, el selector de comisión se deshabilita o muestra "Seleccioná un módulo primero"
- **Estilo**: los selectores serán un `TouchableOpacity` que al presionarlo abre un `Modal` simple con un `FlatList` de opciones (similar al diseño del resto de la app, con colores #0F4A32, borderRadius 12)

#### 3. Cronograma `cronograma.tsx`

- Línea 217: `"Cronograma 2026"` → `` `Cronograma ${new Date().getFullYear()}` ``

### Flujo de datos

```
Modal se abre
  ├── Carga módulos: collection("modulos") → filtra client-side por título exacto
  │     └── Muestra en selector
  └── Usuario selecciona módulo
        └── Carga comisiones: doc("modulos/{id}/secciones") → busca sección
              que contenga "Cursada" y el año actual → obtiene subsecciones
              → filtra por "Comisión" → muestra en selector
```

### ¿Qué pasa cuando termine 2026?

- El admin crea la sección "Cursada - 2027" con sus subsecciones "Comisión 1", etc. dentro de cada módulo de Operatoria.
- La app automáticamente:
  - Muestra "Cronograma 2027"
  - Busca la sección que contenga "Cursada 2027"
  - Lista las comisiones de esa sección
- **No requiere cambios de código.**

### Consideraciones

- Los selectores son modales simples con `FlatList`, no dependencias externas.
- Si no hay sección "Cursada - {año}" creada aún, el selector de comisión se muestra vacío con un mensaje "Sin comisiones disponibles".
- Los campos opcionales siguen siendo opcionales: "Ninguno en especial" es la opción por defecto.

---

¿Te parece bien este plan? Si está ok, decime "toggle to Act mode" para implementarlo.

Los tres cambios están implementados:

### 1. Selector de módulo filtrado
En `ModalEventoCronograma.tsx`, el desplegable de módulos ahora solo muestra:
- "NINGUNO EN ESPECIAL"
- "Operatoria Dental I", "II", "III", "IV", "V", "VI"

Los demás módulos (Notas Finales, Ateneos, Revistas, etc.) quedan excluidos.

### 2. Selector de comisión filtrado
Cuando se selecciona un módulo, se busca la sección "Cursada" y se cargan sus subsecciones. El desplegable ahora muestra:
- "NINGUNA EN ESPECIAL"
- Solo las subsecciones cuyo título empiece con "Comisión" (ej. "Comisión 1", "Comisión 2")

### 3. Año dinámico
El header del cronograma ahora muestra `Cronograma 2026` (o el año que corresponda) automáticamente usando `new Date().getFullYear()`. Cuando termine 2026 y el admin cree la sección "Cursada - 2027", la app lo tomará sin cambios de código.

### Para probar
1. Recargá la app (Expo Go)
2. Andá a la pestaña Cronograma → FAB → verificá que solo aparezcan los 6 módulos de Operatoria
3. Seleccioná un módulo → verificá que el selector de comisión cargue solo las que empiecen con "Comisión"
4. El título debe decir "Cronograma 2026"

---



---
# Q&A de la sesión 2 
---

# Gestión de perfil de usuario con validación de legajo

## User:
Hola, necesito agregar abajo en la navbar una parte para la gestión del perfil de usuario, necesito que, para no romper actualmente la creación de usuarios, estos datos nuevos del usuario sean opcionales, pero que si el alumno intenta entrar a alguna sección o algo le solicite rellenar al menos el legajo, pero eso, necesito que se pida el legajo, dni y demás datos, siendo obligatorio minímamente el legajo, pero solo para cuando se intenta ingresar en una sección y que estos datos, al menos el dni se encripten en la bdd, y que solo se lo pida a los alumnos que intentan ingresar a secciones, NO a profesores ni tampoco a admins. Te paso el codigo, si falta algo pedimelo y seguimos, y por cierto, solo pasame el codigo que debo agregar/cambiar y donde, sin crear artefactos

```

## Assistant:

Perfecto, con lo que pasaste puedo armar todo el flujo sin bloquearme en nada, pero hago dos supuestos que te aviso de entrada:

1. **El "perfil" es una nueva pestaña** en la navbar (`app/(tabs)/perfil.tsx`), separada de la lógica de bloqueo por sección.
2. **Cifrado del DNI**: como no vi ninguna Cloud Function ni backend propio, uso cifrado **del lado del cliente** con `crypto-js` (AES) antes de guardar en Firestore. Esto protege el dato si alguien mira la base/backups directamente, pero la clave viaja en el bundle de la app, así que no es inviolable ante alguien que decompile la app. Si en algún momento querés blindarlo de verdad, lo ideal es mover el cifrado a una Cloud Function (la clave nunca sale del servidor) — avisame y armamos esa versión.

Instalá antes:
```bash
npm install crypto-js
npm install --save-dev @types/crypto-js
```
Y agregá en tu `.env` (o `app.config`):
```
EXPO_PUBLIC_DNI_SECRET_KEY=una-clave-larga-y-random-que-solo-vos-conozcas
```

---

### Nuevo: `utils/crypto.ts`
```typescript
import CryptoJS from "crypto-js";

// ⚠️ Ver nota arriba: cifrado client-side, protege el dato "en reposo" en la BDD,
// no contra alguien que decompile la app.
const SECRET_KEY = process.env.EXPO_PUBLIC_DNI_SECRET_KEY ?? "cambiar-esta-clave";

export function encriptarDato(valor: string): string {
  if (!valor) return "";
  return CryptoJS.AES.encrypt(valor, SECRET_KEY).toString();
}

export function desencriptarDato(valorEncriptado: string): string {
  if (!valorEncriptado) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(valorEncriptado, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}
```

### Nuevo: `hooks/useUserProfile.ts`
```typescript
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import { desencriptarDato, encriptarDato } from "../utils/crypto";

export interface PerfilUsuario {
  legajo?: string;
  dni?: string;
  telefono?: string;
}

export function useUserProfile() {
  const [perfil, setPerfil] = useState<PerfilUsuario>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const data = snap.data();
      setPerfil({
        legajo: data?.legajo ?? "",
        dni: data?.dniEncriptado ? desencriptarDato(data.dniEncriptado) : "",
        telefono: data?.telefono ?? "",
      });
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const guardarPerfil = async (datos: { legajo: string; dni?: string; telefono?: string }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");
    if (!datos.legajo?.trim()) throw new Error("El legajo es obligatorio.");

    await setDoc(
      doc(db, "usuarios", uid),
      {
        legajo: datos.legajo.trim(),
        ...(datos.dni ? { dniEncriptado: encriptarDato(datos.dni.trim()) } : {}),
        ...(datos.telefono ? { telefono: datos.telefono.trim() } : {}),
      },
      { merge: true },
    );
  };

  const perfilCompleto = !!perfil.legajo && perfil.legajo.trim().length > 0;

  return { perfil, loading, perfilCompleto, guardarPerfil };
}
```

### Nuevo: `components/ui/ModalCompletarPerfil.tsx`
```typescriptreact
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useUserProfile } from "../../hooks/useUserProfile";

interface Props {
  visible: boolean;
  onSuccess: () => void;
  onCancelar: () => void;
}

export default function ModalCompletarPerfil({ visible, onSuccess, onCancelar }: Props) {
  const { guardarPerfil } = useUserProfile();
  const [legajo, setLegajo] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    setError("");
    if (!legajo.trim()) {
      setError("El legajo es obligatorio para continuar.");
      return;
    }
    setGuardando(true);
    try {
      await guardarPerfil({ legajo, dni, telefono });
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? "No se pudo guardar tu perfil.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Completá tu perfil</Text>
          <Text style={styles.subtitulo}>
            Para ingresar a esta sección necesitamos al menos tu legajo.
          </Text>

          <Text style={styles.label}>Legajo *</Text>
          <TextInput
            style={styles.input}
            value={legajo}
            onChangeText={setLegajo}
            placeholder="Ej: 12345/6"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>DNI (opcional)</Text>
          <TextInput
            style={styles.input}
            value={dni}
            onChangeText={setDni}
            placeholder="Ej: 30123456"
            keyboardType="number-pad"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Teléfono (opcional)</Text>
          <TextInput
            style={styles.input}
            value={telefono}
            onChangeText={setTelefono}
            placeholder="Ej: 221 555-5555"
            keyboardType="phone-pad"
            placeholderTextColor="#9CA3AF"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.boton, guardando && { opacity: 0.7 }]}
            onPress={handleGuardar}
            disabled={guardando}
          >
            {guardando ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.botonTexto}>Guardar y continuar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelar} onPress={onCancelar} disabled={guardando}>
            <Text style={styles.cancelarTexto}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 20 },
  titulo: { fontSize: 18, fontWeight: "700", color: "#11181C", marginBottom: 4 },
  subtitulo: { fontSize: 13, color: "#6B7280", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 14,
    fontSize: 15,
    color: "#000",
  },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 10, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  cancelar: { marginTop: 12, alignItems: "center" },
  cancelarTexto: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
});
```

### Nuevo: `app/(tabs)/perfil.tsx`
```typescriptreact
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import { useUserProfile } from "../../hooks/useUserProfile";
import { useUserRole } from "../../hooks/useUserRole";

export default function PerfilScreen() {
  const { rol, loading: loadingRol } = useUserRole();
  const { perfil, loading: loadingPerfil, guardarPerfil } = useUserProfile();

  const [legajo, setLegajo] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [alerta, setAlerta] = useState(false);

  useEffect(() => {
    setLegajo(perfil.legajo ?? "");
    setDni(perfil.dni ?? "");
    setTelefono(perfil.telefono ?? "");
  }, [perfil]);

  const esAlumno = rol === "alumno";

  const handleGuardar = async () => {
    setError("");
    if (esAlumno && !legajo.trim()) {
      setError("El legajo es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      await guardarPerfil({ legajo, dni, telefono });
      setAlerta(true);
    } catch (e: any) {
      setError(e.message ?? "No se pudo guardar tu perfil.");
    } finally {
      setGuardando(false);
    }
  };

  if (loadingRol || loadingPerfil) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#25B471" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Mi Perfil</Text>

      {esAlumno ? (
        <>
          <Text style={styles.label}>Legajo *</Text>
          <TextInput style={styles.input} value={legajo} onChangeText={setLegajo} placeholder="Ej: 12345/6" placeholderTextColor="#9CA3AF" />

          <Text style={styles.label}>DNI</Text>
          <TextInput style={styles.input} value={dni} onChangeText={setDni} placeholder="Ej: 30123456" keyboardType="number-pad" placeholderTextColor="#9CA3AF" />

          <Text style={styles.label}>Teléfono</Text>
          <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} placeholder="Ej: 221 555-5555" keyboardType="phone-pad" placeholderTextColor="#9CA3AF" />
        </>
      ) : (
        <Text style={styles.infoTexto}>Tu rol ({rol}) no requiere legajo ni DNI.</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {esAlumno && (
        <TouchableOpacity style={[styles.boton, guardando && { opacity: 0.7 }]} onPress={handleGuardar} disabled={guardando}>
          {guardando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.botonTexto}>Guardar cambios</Text>}
        </TouchableOpacity>
      )}

      <ModalAlerta visible={alerta} titulo="Guardado" mensaje="Tu perfil fue actualizado correctamente." tipo="exito" onClose={() => setAlerta(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20, paddingTop: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  titulo: { fontSize: 22, fontWeight: "bold", color: "#11181C", marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "700", color: "#000000", marginBottom: 8 },
  input: { backgroundColor: "#F9F9F9", borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 8, paddingHorizontal: 12, minHeight: 48, marginBottom: 20, fontSize: 16, color: "#000" },
  infoTexto: { fontSize: 14, color: "#6B7280" },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 12, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "bold", fontSize: 16 },
});
```

### Editar `app/(tabs)/_layout.tsx`
Agregá esta pestaña después de la de `home`:
```typescriptreact
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
```

### Editar `app/secciones/[id].tsx`
Agregá los imports:
```typescript
import ModalCompletarPerfil from "../../components/ui/ModalCompletarPerfil";
import { useUserProfile } from "../../hooks/useUserProfile";
```

Justo debajo de donde declarás `useUserRole`, agregá:
```typescript
const { perfilCompleto, loading: loadingPerfil } = useUserProfile();
```

Actualizá el loading inicial para que también espere el perfil cuando es alumno:
```typescript
if (loadingSeccion || loadingRol || (rol === "alumno" && loadingPerfil)) {
```
(reemplaza la condición `if (loadingSeccion || loadingRol) {` existente)

Y agregá este bloque de gating **después** del `if (!seccion) {...}` y **antes** del bloque `if (seccion.esRestringida && ...)`:
```typescript
if (rol === "alumno" && !perfilCompleto) {
  return (
    <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
      <ScreenHeader titulo={seccion.titulo} mostrarHome />
      <ModalCompletarPerfil
        visible={true}
        onSuccess={() => {}}
        onCancelar={() => router.back()}
      />
    </View>
  );
}
```
(No necesita hacer nada en `onSuccess`: al guardar, el `onSnapshot` de `useUserProfile` actualiza `perfilCompleto` solo y este bloque deja de renderizarse, mostrando la sección.)

---

### Dos cosas que te dejo marcadas, no las toqué para no meterme donde no me pediste:

1. **`firestore.rules`**: no hace falta tocar nada para que esto funcione — la regla `allow write: if request.auth.uid == userId` en `/usuarios/{userId}` ya permite que el alumno agregue `legajo`/`dniEncriptado` a su propio doc. Pero ojo: esa misma regla también le permite a cualquier usuario autenticado cambiarse a sí mismo el campo `rol` a `'admin'`. Es un tema preexistente, no de esta feature, pero ya que estamos tocando permisos te lo marco por si querés que lo blindemos después (se arregla fácil con `request.resource.data.rol == resource.data.rol` en la regla de update).
2. Si en algún momento migrás el cifrado a una Cloud Function, avisame y te paso esa versión (la función recibiría el DNI en texto plano por HTTPS callable y devolvería el valor cifrado, sin exponer la clave nunca al cliente).

## User:

todo lo que dice AES me da error en el archivo crypto:
Namespace '"c:/Users/Marti/appsmoviles/DesarrolloDeAplicacionesMoviles2026/odb-cvg/node_modules/expo-crypto/build/Crypto"' has no exported member 'AESEncryptionKey'.
type Crypto.AESEncryptionKey = /*unresolved*/ any

llegue a esta esa parte, lo demas no segui cambiandolo

## Assistant:

Tenés razón en el error — me equivoqué. Las funciones AES que te pasé (`AESEncryptionKey`, `aesEncryptAsync`, etc.) están en la documentación "unversioned" de Expo, que describe una API que **todavía no está en la versión de `expo-crypto` que corresponde a tu SDK 54** — es una función que se documentó antes de publicarse. Mi error, perdón por el ida y vuelta. Volvamos a `crypto-js`, que es una librería probada y estable, y esta vez vamos a diagnosticar bien por qué no tomaba el polyfill.

### Revertir instalación
```bash
npm uninstall expo-crypto
npm install crypto-js
npm install --save-dev @types/crypto-js
npx expo install react-native-get-random-values
```

### Reemplazar `utils/crypto.ts`
```typescript
import CryptoJS from "crypto-js";

// Cifrado reversible AES. La clave vive en el bundle de la app (sin backend
// propio no hay forma de evitarlo), así que protege el DNI ante una fuga de
// la base de datos, pero no ante alguien que decompile la app.
const SECRET_KEY = process.env.EXPO_PUBLIC_DNI_SECRET_KEY ?? "cambiar-esta-clave";

export function encriptarDato(valor: string): string {
  if (!valor) return "";
  return CryptoJS.AES.encrypt(valor.trim(), SECRET_KEY).toString();
}

export function desencriptarDato(valorEncriptado: string): string {
  if (!valorEncriptado) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(valorEncriptado, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}
```
(Ojo: ahora son funciones **síncronas** de nuevo, no `async`. Si en `hooks/useUserProfile.ts` habías puesto la versión con `await desencriptarDato(...)` del mensaje anterior, sacá los `await` de esas dos llamadas y el `(async () => {...})()` que envolvía el `onSnapshot` — volvés a la versión síncrona simple que armamos al principio.)

### `app/_layout.tsx`
Volvé a poner como primerísima línea:
```typescript
import "react-native-get-random-values";
```

### Antes de probar de nuevo, tres cosas para verificar (para no repetir el mismo síntoma):

1. **¿El archivo se llama realmente `_layout.tsx` (con guión bajo) o `layout.tsx`?** Es clave: Expo Router solo reconoce `_layout.tsx` como layout raíz. Si el archivo real no tiene el guión bajo, el `import` que agregamos ahí nunca se ejecuta antes que el resto de la app, porque ese archivo ni siquiera se está usando como root layout. Fijate en tu carpeta `app/` cuál es el nombre exacto.

2. **Reiniciá la app completa, no solo el JS.** Un módulo nativo como este necesita que cierres la app de Expo Go (o tu dev build) del todo y la vuelvas a abrir — un simple "reload" no alcanza.
```bash
npx expo start -c
```
y desde el teléfono, cerrar Expo Go completamente (no solo minimizar) y volver a escanear el QR.

3. **¿En qué estás probando?** ¿Android, iOS o web? Si es web, `react-native-get-random-values` no debería ni hacer falta (el navegador ya tiene `crypto.getRandomValues` nativo), así que si el error aparece ahí, el problema es otra cosa.

Contame el nombre real del archivo y en qué plataforma estás probando, y seguimos desde ahí.

---
## User:

Perfecto, ahora si funciona y se guarda en forma de hash y el alumno lo puede ver perfectamente, pero hagamos algo, quiero que el legajo se pida 2 veces, osea legajo y repetir legajo y que este no se pueda editar, por lo tanto poner carteles claros de que se ponga bien porque no se puede cambiar luego, y despues que este se pueda ver, pero no editar, lo mismo el dni. Pero tambien necesito que se pueda ver el nombre y apellido y editar, pero estos datos ya de por si se piden en el registro, y que cada vez que alguien quiera editar los campos que si se pueden editar como el telefono, nombre o apellido pregunte si esta seguro que desea hacerlo, ya que el nombre y apellido en realidad actua como un nombre de usuario:

## Assistant:

Buena estructura. Vamos a separar los datos en dos grupos: **fijos** (legajo + DNI, se cargan una sola vez y quedan bloqueados) y **editables** (nombre y teléfono, con confirmación cada vez). También hay que reforzar el bloqueo en las reglas de Firestore, porque si solo lo validás en el cliente, cualquiera con las devtools podría mandar un `update` directo saltándose el modal.

### Editar `firestore.rules`
Reemplazá el bloque de `usuarios` (el que ya tenía la protección de `rol`) por:
```
    match /usuarios/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId
        && request.resource.data.rol == resource.data.rol
        && (!('legajo' in resource.data) || request.resource.data.legajo == resource.data.legajo)
        && (!('dniEncriptado' in resource.data) || request.resource.data.dniEncriptado == resource.data.dniEncriptado);
      allow read, update, delete: if isAdmin();
    }
```
Así, una vez que `legajo` o `dniEncriptado` ya existen en el documento, cualquier `update` que intente cambiarlos (sin ser admin) es rechazado por el servidor, sin importar qué mande el cliente.

### Reemplazar `hooks/useUserProfile.ts`
```typescript
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import { desencriptarDato, encriptarDato } from "../utils/crypto";

export interface PerfilUsuario {
  nombre?: string;
  legajo?: string;
  dni?: string;
  telefono?: string;
  legajoBloqueado?: boolean;
  dniBloqueado?: boolean;
}

export function useUserProfile() {
  const [perfil, setPerfil] = useState<PerfilUsuario>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const data = snap.data();
      setPerfil({
        nombre: data?.nombre ?? "",
        legajo: data?.legajo ?? "",
        dni: data?.dniEncriptado ? desencriptarDato(data.dniEncriptado) : "",
        telefono: data?.telefono ?? "",
        legajoBloqueado: !!data?.legajo,
        dniBloqueado: !!data?.dniEncriptado,
      });
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Se usa UNA sola vez para fijar legajo (y opcionalmente DNI) de forma permanente.
  const completarDatosFijos = async (datos: { legajo: string; dni?: string }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");
    if (!datos.legajo?.trim()) throw new Error("El legajo es obligatorio.");

    await setDoc(
      doc(db, "usuarios", uid),
      {
        legajo: datos.legajo.trim(),
        ...(datos.dni ? { dniEncriptado: encriptarDato(datos.dni) } : {}),
      },
      { merge: true },
    );
  };

  // Se puede usar las veces que haga falta: nombre y teléfono.
  const actualizarDatosEditables = async (datos: { nombre?: string; telefono?: string }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");

    await setDoc(
      doc(db, "usuarios", uid),
      {
        ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
        ...(datos.telefono !== undefined ? { telefono: datos.telefono.trim() } : {}),
      },
      { merge: true },
    );
  };

  const perfilCompleto = !!perfil.legajo && perfil.legajo.trim().length > 0;

  return {
    perfil,
    loading,
    perfilCompleto,
    completarDatosFijos,
    actualizarDatosEditables,
  };
}
```
(`guardarPerfil` se dividió en dos funciones — hay que actualizar los dos lugares que lo usaban.)

### Reemplazar `components/ui/ModalCompletarPerfil.tsx`
```tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useUserProfile } from "../../hooks/useUserProfile";

interface Props {
  visible: boolean;
  onSuccess: () => void;
  onCancelar: () => void;
}

export default function ModalCompletarPerfil({ visible, onSuccess, onCancelar }: Props) {
  const { completarDatosFijos } = useUserProfile();
  const [legajo, setLegajo] = useState("");
  const [legajoConfirmacion, setLegajoConfirmacion] = useState("");
  const [dni, setDni] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    setError("");
    if (!legajo.trim()) {
      setError("El legajo es obligatorio para continuar.");
      return;
    }
    if (legajo.trim() !== legajoConfirmacion.trim()) {
      setError("Los dos legajos ingresados no coinciden.");
      return;
    }
    setGuardando(true);
    try {
      await completarDatosFijos({ legajo, dni });
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? "No se pudo guardar tu perfil.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Completá tu perfil</Text>
          <Text style={styles.subtitulo}>
            Para ingresar a esta sección necesitamos al menos tu legajo.
          </Text>

          <View style={styles.avisoBox}>
            <Text style={styles.avisoTexto}>
              ⚠️ El legajo (y el DNI, si lo cargás) no se podrán modificar después. Revisá bien antes de guardar.
            </Text>
          </View>

          <Text style={styles.label}>Legajo *</Text>
          <TextInput
            style={styles.input}
            value={legajo}
            onChangeText={setLegajo}
            placeholder="Ej: 12345/6"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Repetir legajo *</Text>
          <TextInput
            style={styles.input}
            value={legajoConfirmacion}
            onChangeText={setLegajoConfirmacion}
            placeholder="Volvé a escribirlo"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>DNI (opcional)</Text>
          <TextInput
            style={styles.input}
            value={dni}
            onChangeText={setDni}
            placeholder="Ej: 30123456"
            keyboardType="number-pad"
            placeholderTextColor="#9CA3AF"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.boton, guardando && { opacity: 0.7 }]}
            onPress={handleGuardar}
            disabled={guardando}
          >
            {guardando ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.botonTexto}>Guardar y continuar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelar} onPress={onCancelar} disabled={guardando}>
            <Text style={styles.cancelarTexto}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 20 },
  titulo: { fontSize: 18, fontWeight: "700", color: "#11181C", marginBottom: 4 },
  subtitulo: { fontSize: 13, color: "#6B7280", marginBottom: 16 },
  avisoBox: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginBottom: 14 },
  avisoTexto: { fontSize: 12, color: "#92400E", lineHeight: 17 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 14,
    fontSize: 15,
    color: "#000",
  },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 10, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  cancelar: { marginTop: 12, alignItems: "center" },
  cancelarTexto: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
});
```

### Reemplazar `app/(tabs)/perfil.tsx`
```tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import { useUserProfile } from "../../hooks/useUserProfile";
import { useUserRole } from "../../hooks/useUserRole";

export default function PerfilScreen() {
  const { rol, loading: loadingRol } = useUserRole();
  const {
    perfil,
    loading: loadingPerfil,
    completarDatosFijos,
    actualizarDatosEditables,
  } = useUserProfile();

  // Datos fijos (legajo/DNI) — solo se usan si todavía no están cargados
  const [legajo, setLegajo] = useState("");
  const [legajoConfirmacion, setLegajoConfirmacion] = useState("");
  const [dni, setDni] = useState("");
  const [errorFijos, setErrorFijos] = useState("");
  const [guardandoFijos, setGuardandoFijos] = useState(false);

  // Datos editables (nombre/teléfono)
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [errorEditables, setErrorEditables] = useState("");
  const [guardandoEditables, setGuardandoEditables] = useState(false);
  const [confirmarEdicion, setConfirmarEdicion] = useState(false);

  const [alerta, setAlerta] = useState(false);

  useEffect(() => {
    setNombre(perfil.nombre ?? "");
    setTelefono(perfil.telefono ?? "");
  }, [perfil]);

  const esAlumno = rol === "alumno";

  const handleGuardarFijos = async () => {
    setErrorFijos("");
    if (!legajo.trim()) {
      setErrorFijos("El legajo es obligatorio.");
      return;
    }
    if (legajo.trim() !== legajoConfirmacion.trim()) {
      setErrorFijos("Los dos legajos ingresados no coinciden.");
      return;
    }
    setGuardandoFijos(true);
    try {
      await completarDatosFijos({ legajo, dni });
      setAlerta(true);
    } catch (e: any) {
      setErrorFijos(e.message ?? "No se pudo guardar el legajo.");
    } finally {
      setGuardandoFijos(false);
    }
  };

  const handleGuardarEditables = async () => {
    setErrorEditables("");
    if (!nombre.trim()) {
      setErrorEditables("El nombre y apellido no puede quedar vacío.");
      return;
    }
    setGuardandoEditables(true);
    try {
      await actualizarDatosEditables({ nombre, telefono });
      setAlerta(true);
    } catch (e: any) {
      setErrorEditables(e.message ?? "No se pudo guardar los cambios.");
    } finally {
      setGuardandoEditables(false);
    }
  };

  if (loadingRol || loadingPerfil) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#25B471" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Mi Perfil</Text>

      <Text style={styles.label}>Nombre y Apellido</Text>
      <TextInput
        style={styles.input}
        value={nombre}
        onChangeText={setNombre}
        placeholder="Ej: Juan Pérez"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Teléfono</Text>
      <TextInput
        style={styles.input}
        value={telefono}
        onChangeText={setTelefono}
        placeholder="Ej: 221 555-5555"
        keyboardType="phone-pad"
        placeholderTextColor="#9CA3AF"
      />

      {errorEditables ? <Text style={styles.error}>{errorEditables}</Text> : null}

      <TouchableOpacity
        style={[styles.boton, guardandoEditables && { opacity: 0.7 }]}
        onPress={() => setConfirmarEdicion(true)}
        disabled={guardandoEditables}
      >
        {guardandoEditables ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.botonTexto}>Guardar cambios</Text>
        )}
      </TouchableOpacity>

      {esAlumno && (
        <>
          <View style={styles.separador} />
          <Text style={styles.subtituloSeccion}>Datos académicos</Text>

          {perfil.legajoBloqueado ? (
            <>
              <Text style={styles.label}>Legajo</Text>
              <View style={styles.campoBloqueado}>
                <Text style={styles.campoBloqueadoTexto}>{perfil.legajo}</Text>
              </View>

              <Text style={styles.label}>DNI</Text>
              <View style={styles.campoBloqueado}>
                <Text style={styles.campoBloqueadoTexto}>
                  {perfil.dniBloqueado ? perfil.dni : "No cargado"}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.avisoBox}>
                <Text style={styles.avisoTexto}>
                  ⚠️ Una vez guardados, el legajo y el DNI no se pueden modificar. Revisá bien antes de continuar.
                </Text>
              </View>

              <Text style={styles.label}>Legajo *</Text>
              <TextInput
                style={styles.input}
                value={legajo}
                onChangeText={setLegajo}
                placeholder="Ej: 12345/6"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>Repetir legajo *</Text>
              <TextInput
                style={styles.input}
                value={legajoConfirmacion}
                onChangeText={setLegajoConfirmacion}
                placeholder="Volvé a escribirlo"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>DNI (opcional)</Text>
              <TextInput
                style={styles.input}
                value={dni}
                onChangeText={setDni}
                placeholder="Ej: 30123456"
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />

              {errorFijos ? <Text style={styles.error}>{errorFijos}</Text> : null}

              <TouchableOpacity
                style={[styles.boton, guardandoFijos && { opacity: 0.7 }]}
                onPress={handleGuardarFijos}
                disabled={guardandoFijos}
              >
                {guardandoFijos ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.botonTexto}>Guardar legajo</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      <ModalConfirmacion
        visible={confirmarEdicion}
        titulo="Confirmar cambios"
        mensaje="Tu nombre y apellido funcionan como tu identificación dentro del sistema. ¿Estás seguro de que querés guardar estos cambios?"
        textoConfirmar="Sí, guardar"
        textoCancelar="Cancelar"
        onConfirm={() => {
          setConfirmarEdicion(false);
          handleGuardarEditables();
        }}
        onCancel={() => setConfirmarEdicion(false)}
      />

      <ModalAlerta
        visible={alerta}
        titulo="Guardado"
        mensaje="Tus datos fueron actualizados correctamente."
        tipo="exito"
        onClose={() => setAlerta(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20, paddingTop: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  titulo: { fontSize: 22, fontWeight: "bold", color: "#11181C", marginBottom: 20 },
  subtituloSeccion: { fontSize: 15, fontWeight: "700", color: "#374151", marginBottom: 14 },
  label: { fontSize: 14, fontWeight: "700", color: "#000000", marginBottom: 8 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 20,
    fontSize: 16,
    color: "#000",
  },
  campoBloqueado: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: "center",
    marginBottom: 20,
  },
  campoBloqueadoTexto: { fontSize: 16, color: "#6B7280" },
  separador: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 12 },
  avisoBox: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginBottom: 16 },
  avisoTexto: { fontSize: 12, color: "#92400E", lineHeight: 17 },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 12, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "bold", fontSize: 16 },
});
```

Un par de cosas que quedan a tu criterio, avisame si querés que las ajustemos:
- Dejé "Nombre y Apellido" arriba de todo y editable para **cualquier rol** (admin/profesor/alumno), ya que actúa como nombre de usuario para todos, no solo para alumnos. Si el profesor/admin no debería poder tocarlo, decime y lo restringimos.
- Si un alumno nunca entra a una sección restringida, ahora igual puede cargar su legajo/DNI directamente desde la pestaña Perfil (no solo forzado por el modal). Me pareció más prolijo que forzar a pasar por una sección primero — avisame si preferís que solo se pueda cargar desde el modal.

## User:

y algo más, el legajo no debe poder repetirse entre cuentas y el DNI al ser un dato que no se puede modificar también deberíamos pedirlo 2 veces

## Assistant:

Dos cosas distintas a resolver: la duplicación de legajo necesita validarse **en el servidor** (reglas de Firestore), porque si solo lo chequeás en el cliente cualquiera podría saltárselo. Vamos con el patrón estándar de Firestore para "reservar" un valor único sin backend propio: una colección aparte donde el ID del documento *es* el legajo, así Firestore rechaza automáticamente el segundo intento de crearlo.

### Editar `firestore.rules`
Agregá esta colección nueva (podés ponerla al lado de `usuarios`):
```
    // Índice de legajos únicos: el ID del documento ES el legajo (normalizado).
    // Si ya existe, el intento de "crearlo" pasa a evaluarse como update y se rechaza.
    match /legajos_index/{legajoId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update, delete: if isAdmin();
    }
```
Esto no reemplaza nada de lo que ya tenías, se suma.

### Reemplazar `hooks/useUserProfile.ts`
```typescript
import { doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import { desencriptarDato, encriptarDato } from "../utils/crypto";

export interface PerfilUsuario {
  nombre?: string;
  legajo?: string;
  dni?: string;
  telefono?: string;
  legajoBloqueado?: boolean;
  dniBloqueado?: boolean;
}

function normalizarLegajo(legajo: string): string {
  return legajo.trim().toUpperCase();
}

export function useUserProfile() {
  const [perfil, setPerfil] = useState<PerfilUsuario>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const data = snap.data();
      setPerfil({
        nombre: data?.nombre ?? "",
        legajo: data?.legajo ?? "",
        dni: data?.dniEncriptado ? desencriptarDato(data.dniEncriptado) : "",
        telefono: data?.telefono ?? "",
        legajoBloqueado: !!data?.legajo,
        dniBloqueado: !!data?.dniEncriptado,
      });
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Se usa UNA sola vez: fija legajo (único entre todas las cuentas) y DNI de forma permanente.
  const completarDatosFijos = async (datos: {
    legajo: string;
    legajoConfirmacion: string;
    dni?: string;
    dniConfirmacion?: string;
  }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");

    if (!datos.legajo?.trim()) {
      throw new Error("El legajo es obligatorio.");
    }
    if (datos.legajo.trim() !== datos.legajoConfirmacion.trim()) {
      throw new Error("Los dos legajos ingresados no coinciden.");
    }
    if (datos.dni && datos.dni.trim() !== (datos.dniConfirmacion ?? "").trim()) {
      throw new Error("Los dos DNI ingresados no coinciden.");
    }

    const legajoNormalizado = normalizarLegajo(datos.legajo);
    const legajoDocId = encodeURIComponent(legajoNormalizado);

    const batch = writeBatch(db);
    batch.set(doc(db, "legajos_index", legajoDocId), {
      uid,
      creadoEn: new Date(),
    });
    batch.set(
      doc(db, "usuarios", uid),
      {
        legajo: datos.legajo.trim(),
        ...(datos.dni ? { dniEncriptado: encriptarDato(datos.dni) } : {}),
      },
      { merge: true },
    );

    try {
      await batch.commit();
    } catch (e: any) {
      if (e.code === "permission-denied") {
        throw new Error("Ese legajo ya está registrado en otra cuenta.");
      }
      throw e;
    }
  };

  // Se puede usar las veces que haga falta: nombre y teléfono.
  const actualizarDatosEditables = async (datos: { nombre?: string; telefono?: string }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");

    await setDoc(
      doc(db, "usuarios", uid),
      {
        ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
        ...(datos.telefono !== undefined ? { telefono: datos.telefono.trim() } : {}),
      },
      { merge: true },
    );
  };

  const perfilCompleto = !!perfil.legajo && perfil.legajo.trim().length > 0;

  return {
    perfil,
    loading,
    perfilCompleto,
    completarDatosFijos,
    actualizarDatosEditables,
  };
}
```

Ojo con un detalle: el `legajoDocId` usa `encodeURIComponent` porque un ID de documento de Firestore no puede contener `/` literal, y tus ejemplos de legajo tienen formato `12345/6`. `encodeURIComponent` lo convierte a `12345%2F6`, que sí es válido como ID.

### Editar `components/ui/ModalCompletarPerfil.tsx`
Agregá el estado de confirmación de DNI:
```typescript
  const [dni, setDni] = useState("");
  const [dniConfirmacion, setDniConfirmacion] = useState("");
```
Reemplazá el `handleGuardar`:
```typescript
  const handleGuardar = async () => {
    setError("");
    setGuardando(true);
    try {
      await completarDatosFijos({ legajo, legajoConfirmacion, dni, dniConfirmacion });
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? "No se pudo guardar tu perfil.");
    } finally {
      setGuardando(false);
    }
  };
```
(las validaciones de coincidencia ahora las hace el hook, así que sacamos las que estaban acá para no duplicar mensajes)

Y agregá el campo de confirmación de DNI justo debajo del campo de DNI:
```tsx
          <Text style={styles.label}>DNI (opcional)</Text>
          <TextInput
            style={styles.input}
            value={dni}
            onChangeText={setDni}
            placeholder="Ej: 30123456"
            keyboardType="number-pad"
            placeholderTextColor="#9CA3AF"
          />

          {dni ? (
            <>
              <Text style={styles.label}>Repetir DNI</Text>
              <TextInput
                style={styles.input}
                value={dniConfirmacion}
                onChangeText={setDniConfirmacion}
                placeholder="Volvé a escribirlo"
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />
            </>
          ) : null}
```

### Editar `app/(tabs)/perfil.tsx`
Agregá el estado:
```typescript
  const [dniConfirmacion, setDniConfirmacion] = useState("");
```
Reemplazá `handleGuardarFijos`:
```typescript
  const handleGuardarFijos = async () => {
    setErrorFijos("");
    setGuardandoFijos(true);
    try {
      await completarDatosFijos({ legajo, legajoConfirmacion, dni, dniConfirmacion });
      setAlerta(true);
    } catch (e: any) {
      setErrorFijos(e.message ?? "No se pudo guardar el legajo.");
    } finally {
      setGuardandoFijos(false);
    }
  };
```
Y en el bloque donde está el input de DNI (dentro de la rama `!perfil.legajoBloqueado`), agregá la confirmación igual que en el modal:
```tsx
              <Text style={styles.label}>DNI (opcional)</Text>
              <TextInput
                style={styles.input}
                value={dni}
                onChangeText={setDni}
                placeholder="Ej: 30123456"
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />

              {dni ? (
                <>
                  <Text style={styles.label}>Repetir DNI</Text>
                  <TextInput
                    style={styles.input}
                    value={dniConfirmacion}
                    onChangeText={setDniConfirmacion}
                    placeholder="Volvé a escribirlo"
                    keyboardType="number-pad"
                    placeholderTextColor="#9CA3AF"
                  />
                </>
              ) : null}
```

Con esto: legajo único garantizado por el servidor (no por confianza en el cliente), y tanto legajo como DNI se piden dos veces antes de guardarse de forma permanente.

## User:

Ahora necesito incluir en los pdf y excels de forma prolija el logo de la catedra, el cual está en la carpeta: assets/images/LogoRecortado.jpg y estos son los estilos del logo en el login:

```
logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
```

pero necesito agregar el logo en los pdf y excels de las notas y planillas y que quede bien.

## Assistant:

Para el PDF es directo: `expo-print` genera HTML, así que podemos incrustar el logo como imagen en base64 y va a salir nítido. Para el Excel hay una limitación real que te aviso de entrada: la librería `xlsx` (SheetJS, community) que ya usás **no soporta insertar imágenes** — solo texto, números y estilos de celda básicos. No hay forma de meter el logo como imagen ahí sin cambiar de librería (por ejemplo a `exceljs`, que sí soporta imágenes pero es un cambio más grande, con otra API completamente distinta a la que ya tenés armada). Te dejo el PDF con el logo real, y en el Excel un encabezado prolijo con el nombre de la facultad en texto grande y en negrita, a modo de placeholder — si en algún momento querés migrar a `exceljs` para tener el logo también ahí, avisame y lo armamos aparte.

Antes de nada, instalá (si no lo tenés ya, viene con Expo pero por las dudas):
```bash
npx expo install expo-asset
```

## Nuevo: `utils/logoBase64.ts`
```typescript
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

// Cachea el logo como data URI base64 para no releerlo del disco en cada export.
let cache: string | null = null;

export async function obtenerLogoBase64(): Promise<string> {
  if (cache) return cache;
  const asset = Asset.fromModule(require("../assets/images/LogoRecortado.jpg"));
  await asset.downloadAsync();
  const base64 = await FileSystem.readAsStringAsync(asset.localUri!, {
    encoding: FileSystem.EncodingType.Base64,
  });
  cache = `data:image/jpeg;base64,${base64}`;
  return cache;
}
```

---

## Editar `components/ui/ExportarNotas.tsx`

Agregá el import:
```typescript
import { obtenerLogoBase64 } from "../../utils/logoBase64";
```

Reemplazá la firma y el header dentro de `generarHTML`:
```typescript
  const generarHTML = async (): Promise<string> => {
    const logoDataUri = await obtenerLogoBase64();
    const filas = notas
```
(la única diferencia es `async` + `await obtenerLogoBase64()` al principio)

Reemplazá el bloque de estilos `.header` y su contenido:
```css
          .header {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #0F4A32;
          }
          .header img.logo {
            width: 56px;
            height: 56px;
            border-radius: 28px;
            object-fit: cover;
            flex-shrink: 0;
          }
          .header .header-texto h1 {
            font-size: 14pt;
            font-weight: bold;
            color: #0F4A32;
            margin-bottom: 4px;
          }
          .header .header-texto h2 {
            font-size: 12pt;
            font-weight: normal;
            color: #444;
          }
```
(sacá el viejo `.header h1` y `.header h2` sueltos, ahora están anidados dentro de `.header-texto`)

Y el `<div class="header">` del body:
```html
        <div class="header">
          <img src="${logoDataUri}" class="logo" />
          <div class="header-texto">
            <h1>Universidad Nacional de La Plata - Facultad de Odontología</h1>
            <h2>Cátedra de Operatoria Dental B</h2>
          </div>
        </div>
```

Por último, en `handleExportarPDF`, agregá el `await`:
```typescript
      const html = await generarHTML();
```

### Excel prolijo (sin imagen, con encabezado en texto)
Reemplazá `handleExportarXLSX` completo:
```typescript
  const handleExportarXLSX = async () => {
    if (notas.length === 0) return;
    setExportandoXLSX(true);
    try {
      const encabezado = [
        ["Universidad Nacional de La Plata - Facultad de Odontología"],
        ["Cátedra de Operatoria Dental B"],
        [`Exámen: ${nombreExamen}`],
        [`Año Lectivo: ${anioLectivo}`],
        [],
        ["#", "Alumno", "Nota"],
      ];

      const filasDatos = notas.map((n, i) => [i + 1, n.nombre, formatearValorNota(n.nota)]);

      const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filasDatos]);

      ws["!cols"] = [{ wch: 6 }, { wch: 40 }, { wch: 10 }];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, nombreExamen.slice(0, 31));

      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const nombreArchivo = `Notas_${nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
      const uri = `${FileSystem.cacheDirectory}${nombreArchivo}`;

      await FileSystem.writeAsStringAsync(uri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: `Compartir Excel - ${nombreExamen}`,
          UTI: "org.openxmlformats.spreadsheetml.sheet",
        });
      }
    } catch (error) {
      console.error("Error exportando XLSX:", error);
    } finally {
      setExportandoXLSX(false);
    }
  };
```

---

## Editar `components/ui/ExportarPlanilla.tsx`

Import:
```typescript
import { obtenerLogoBase64 } from "../../utils/logoBase64";
```

`generarHTML` async:
```typescript
  const generarHTML = async () => {
    const logoDataUri = await obtenerLogoBase64();
    const headers = columnasOrdenadas.map((col) => `<th>${escapeHtml(col.titulo)}</th>`).join("");
```

Reemplazá el bloque `.header` de los estilos:
```css
          .header {
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 2px solid #0F4A32;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .header img.logo {
            width: 46px;
            height: 46px;
            border-radius: 23px;
            object-fit: cover;
            flex-shrink: 0;
          }
          .header .header-texto h1 { color: #0F4A32; font-size: 16pt; margin: 0 0 6px 0; }
          .header .header-texto p { margin: 2px 0; }
```
(sacá los `h1 { ... }` y `p { margin: 2px 0; }` sueltos que estaban antes, ahora anidados)

Y el div del body:
```html
        <div class="header">
          <img src="${logoDataUri}" class="logo" />
          <div class="header-texto">
            <h1>${escapeHtml(titulo)}</h1>
            <p><strong>Alumno:</strong> ${escapeHtml(alumno || "-")}</p>
            <p><strong>Tipo:</strong> ${tipo === "diaria" ? "Diaria" : "Final"}</p>
            <p><strong>Fecha de exportación:</strong> ${fechaActual}</p>
          </div>
        </div>
```

En `exportarPDF`, agregá `await`:
```typescript
      const { uri } = await Print.printToFileAsync({ html: await generarHTML() });
```

Y en `exportarXLSX`, mismo criterio que en notas — reemplazá la generación de la hoja:
```typescript
  const exportarXLSX = async () => {
    if (columnasOrdenadas.length === 0) return;
    setExportandoXLSX(true);
    try {
      const encabezado = [
        ["Universidad Nacional de La Plata - Facultad de Odontología"],
        [`${titulo}${alumno ? ` — ${alumno}` : ""}`],
        [`Tipo: ${tipo === "diaria" ? "Diaria" : "Final"} · Exportado: ${fechaActual}`],
        [],
        columnasOrdenadas.map((col) => col.titulo),
      ];

      const filasDatos = filasOrdenadas.map((fila) =>
        columnasOrdenadas.map((col) => formatValue(fila.celdas?.[col.id])),
      );

      const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filasDatos]);
      ws["!cols"] = columnasOrdenadas.map((col) => ({ wch: col.tipo === "textarea" ? 34 : 18 }));
      const ultimaColumna = columnasOrdenadas.length - 1;
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: ultimaColumna } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: ultimaColumna } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: ultimaColumna } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Planilla");
      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const uri = `${FileSystem.cacheDirectory}${safeFileName(titulo)}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: `Compartir Excel - ${titulo}`,
          UTI: "org.openxmlformats.spreadsheetml.sheet",
        });
      }
    } finally {
      setExportandoXLSX(false);
    }
  };
```

---

Con esto los PDF de notas y planillas van a mostrar el logo redondo junto al encabezado, prolijo, y los Excel van a tener un encabezado institucional bien formateado (fusionado y centrado) aunque sin la imagen en sí.

---

⚠️ Aparte de lo que pediste, noté algo al leer `mis-notas.tsx` y `notas.tsx` que me pasaste: ambos archivos ya usan `comisionesInfo[alumnoId].comisionActualTitulo` y `.comisionesActuales` (un array), pero el hook `useComisionesPorSeccion` que te di solo devuelve `cambioComision`, `comisionAnteriorTitulo` y `multiComision` — esos dos campos no existen en el objeto que devuelve, así que hoy esas líneas van a mostrar `undefined`. ¿Querés que te pase la versión ampliada del hook para que calcen con lo que ya escribiste ahí?

## User:

Bien ahora quiero que hagamos una cosa, agreguemos seguridad al login, registro y todo eso. Y además agregemos una opción en el apartado de perfil para modificar tanto el email como la contraseña, el email no estoy seguro si puede modificarse, si no se puede facilmente ni nos molestemos, pero la contraseña si, en un apartado al que se accede tocando actualizar contraseña pidamos la contraseña actual y si coincide le permitimos modicicarla poniendo 2 veces la contraseña nueva, pero ahora quiero que en el registro se pida al menos 1 mayuscula, 1 minuscula y 1 numero. Y obviamente en esto de actualizar contraseña lo mismo y que la longitud mínima sea de 8 caracteres. Osea usemos estandares:

## Assistant:

Vamos con esto. Antes de nada, una aclaración sobre el email: como bien sospechabas, cambiar el email en Firebase Auth ya no es tan directo. Los proyectos nuevos de Firebase tienen "protección contra enumeración de emails" activada por defecto, así que el método viejo (`updateEmail`) está en desuso y Firebase pide usar `verifyBeforeUpdateEmail`, que le manda un link de verificación a la casilla **nueva** y el cambio solo se efectiviza cuando el usuario lo confirma ahí — es decir, no es instantáneo, necesita un flujo de confirmación por correo aparte. Tal como me dijiste, si no es directo mejor no complicarlo ahora; nos concentramos en la contraseña, que sí es un cambio simple y seguro. Si en algún momento querés el de email con el flujo de verificación, avisame y lo armamos aparte.

## Nuevo: `utils/validacionPassword.ts`
```typescript
export function validarPassword(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[A-Z]/.test(password)) return "La contraseña debe incluir al menos una letra mayúscula.";
  if (!/[a-z]/.test(password)) return "La contraseña debe incluir al menos una letra minúscula.";
  if (!/[0-9]/.test(password)) return "La contraseña debe incluir al menos un número.";
  return null;
}
```

---

## Editar `app/registro.tsx`

Import:
```typescript
import { validarPassword } from '../utils/validacionPassword';
```

Reemplazá el chequeo inicial de `handleRegistro`:
```typescript
    if (!nombre || !email || !password) {
      setErrorMensaje("Por favor, completá todos los datos solicitados.");
      return;
    }
```
por:
```typescript
    if (!nombre || !email || !password) {
      setErrorMensaje("Por favor, completá todos los datos solicitados.");
      return;
    }

    const errorPassword = validarPassword(password);
    if (errorPassword) {
      setErrorMensaje(errorPassword);
      return;
    }
```

Agregá un texto de ayuda debajo del input de contraseña (justo antes del cierre del `TextInput` de contraseña):
```tsx
        <TextInput 
          style={[styles.input, errorMensaje ? styles.inputError : null]} 
          placeholder="Mínimo 6 caracteres" 
          value={password} 
          onChangeText={(text) => { setPassword(text); limpiarError(); }} 
          secureTextEntry 
          placeholderTextColor="#666" 
        />
        <Text style={styles.hint}>Mínimo 8 caracteres, con mayúscula, minúscula y número.</Text>
```
(cambié también el placeholder de `"Mínimo 6 caracteres"` a algo más preciso si querés, pero no es obligatorio)

Agregá el estilo:
```typescript
  hint: { fontSize: 12, color: "#6B7280", marginTop: -14, marginBottom: 16 },
```

---

## Editar `app/login.tsx`

En el `catch` de `handleLogin`, agregá el manejo del bloqueo por intentos fallidos (Firebase ya aplica rate-limiting del lado del servidor tras varios intentos incorrectos, solo hay que mostrar bien el mensaje):
```typescript
      if (error.code === 'auth/invalid-credential') {
        setErrorMensaje("El correo o la contraseña son incorrectos.");
      } else if (error.code === 'auth/invalid-email') {
        setErrorMensaje("El formato del correo electrónico no es válido.");
      } else if (error.code === 'auth/too-many-requests') {
        setErrorMensaje("Demasiados intentos fallidos. Probá de nuevo en unos minutos.");
      } else if (error.code === 'auth/user-disabled') {
        setErrorMensaje("Esta cuenta fue deshabilitada. Contactá a la cátedra.");
      } else {
        setErrorMensaje("Ocurrió un error al intentar iniciar sesión.");
      }
```

---

## Nuevo: `components/ui/ModalCambiarPassword.tsx`
```tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../../config/firebaseConfig";
import { validarPassword } from "../../utils/validacionPassword";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ModalCambiarPassword({ visible, onClose, onSuccess }: Props) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [nuevaConfirmacion, setNuevaConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const limpiarYCerrar = () => {
    setActual("");
    setNueva("");
    setNuevaConfirmacion("");
    setError("");
    onClose();
  };

  const handleGuardar = async () => {
    setError("");
    const user = auth.currentUser;
    if (!user || !user.email) {
      setError("No se pudo identificar tu cuenta. Volvé a iniciar sesión.");
      return;
    }
    if (!actual) {
      setError("Ingresá tu contraseña actual.");
      return;
    }
    const errorFormato = validarPassword(nueva);
    if (errorFormato) {
      setError(errorFormato);
      return;
    }
    if (nueva !== nuevaConfirmacion) {
      setError("Las dos contraseñas nuevas no coinciden.");
      return;
    }
    if (nueva === actual) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }

    setGuardando(true);
    try {
      const credencial = EmailAuthProvider.credential(user.email, actual);
      await reauthenticateWithCredential(user, credencial);
      await updatePassword(user, nueva);
      limpiarYCerrar();
      onSuccess();
    } catch (e: any) {
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") {
        setError("La contraseña actual es incorrecta.");
      } else if (e.code === "auth/too-many-requests") {
        setError("Demasiados intentos. Probá de nuevo en unos minutos.");
      } else {
        setError("No se pudo actualizar la contraseña. Intentá nuevamente.");
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={limpiarYCerrar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Actualizar contraseña</Text>

          <Text style={styles.label}>Contraseña actual</Text>
          <TextInput
            style={styles.input}
            value={actual}
            onChangeText={setActual}
            placeholder="Tu contraseña actual"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />

          <Text style={styles.label}>Nueva contraseña</Text>
          <TextInput
            style={styles.input}
            value={nueva}
            onChangeText={setNueva}
            placeholder="Mínimo 8 caracteres"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />
          <Text style={styles.hint}>Debe incluir mayúscula, minúscula y número.</Text>

          <Text style={styles.label}>Repetir nueva contraseña</Text>
          <TextInput
            style={styles.input}
            value={nuevaConfirmacion}
            onChangeText={setNuevaConfirmacion}
            placeholder="Volvé a escribirla"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.boton, guardando && { opacity: 0.7 }]}
            onPress={handleGuardar}
            disabled={guardando}
          >
            {guardando ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.botonTexto}>Guardar nueva contraseña</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelar} onPress={limpiarYCerrar} disabled={guardando}>
            <Text style={styles.cancelarTexto}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 20 },
  titulo: { fontSize: 18, fontWeight: "700", color: "#11181C", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 6,
    fontSize: 15,
    color: "#000",
  },
  hint: { fontSize: 11, color: "#9CA3AF", marginBottom: 14 },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 10, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  cancelar: { marginTop: 12, alignItems: "center" },
  cancelarTexto: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
});
```

---

## Editar `app/(tabs)/perfil.tsx`

Import:
```typescript
import ModalCambiarPassword from "../../components/ui/ModalCambiarPassword";
```

Agregá el estado, junto a `alerta`:
```typescript
  const [modalPassword, setModalPassword] = useState(false);
```

Agregá la sección de "Seguridad", justo después del botón "Guardar cambios" de los datos editables y antes del bloque de `esAlumno &&`:
```tsx
      <View style={styles.separador} />
      <Text style={styles.subtituloSeccion}>Seguridad</Text>
      <TouchableOpacity style={styles.botonSecundario} onPress={() => setModalPassword(true)}>
        <Text style={styles.botonSecundarioTexto}>Actualizar contraseña</Text>
      </TouchableOpacity>
```

Agregá el modal junto a los otros, al final antes de cerrar el `ScrollView`:
```tsx
      <ModalCambiarPassword
        visible={modalPassword}
        onClose={() => setModalPassword(false)}
        onSuccess={() => setAlerta(true)}
      />
```

Agregá el estilo:
```typescript
  botonSecundario: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#0F4A32",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  botonSecundarioTexto: { color: "#0F4A32", fontWeight: "700", fontSize: 15 },
```

🐛 De paso encontré un bug en el archivo que pegaste: tenés el bloque de **"DNI (opcional)" duplicado dos veces seguidas** (con los mismos `value={dni}` y `onChangeText={setDni}`). Es inofensivo porque ambos apuntan al mismo estado, pero se ve raro en pantalla (dos campos de DNI idénticos). Borrá uno de los dos bloques:
```tsx
              <Text style={styles.label}>DNI (opcional)</Text>
              <TextInput
                style={styles.input}
                value={dni}
                onChangeText={setDni}
                placeholder="Ej: 30123456"
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />
```
(dejá solo uno de los dos, están pegados exactamente iguales uno debajo del otro)

---

Con esto: `registro.tsx` exige mayúscula+minúscula+número+8 caracteres al crear cuenta, `login.tsx` da mensajes más claros ante bloqueos por intentos fallidos (que Firebase ya aplica del lado del servidor automáticamente, no hace falta programar nada extra ahí), y en Perfil cualquier usuario (alumno/profesor/admin) puede tocar "Actualizar contraseña", confirmar la actual, y poner la nueva dos veces con los mismos estándares.

---



---
# Q&A de la sesión 3
---

