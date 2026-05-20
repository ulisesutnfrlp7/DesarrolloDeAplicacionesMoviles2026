---
## Q&A de la sesión
---

### 1. Planificación inicial — CRUD de Módulos de Información

**Pregunta:**

> Actúa como un Desarrollador Full-Stack Senior. Necesito implementar un sistema CRUD para "Módulos de Información" gestionados por un Administrador.
>
> **UI/UX:** Los módulos NO deben ser botones en la navbar. Cada módulo debe representarse como una "Tarjeta" (Card). Al hacer clic, ir a una pantalla de detalle.
>
> **Roles:** Admin (CRUD completo), Profesor (puede crear secciones), Usuario regular (solo lectura).
>
> **Estructura de datos:** ID, título, descripción corta, contenido (markdown), secciones, ícono, fechas.

**Respuesta:** Se planificó e implementó la arquitectura completa: colección `modulos/{moduloId}` en Firestore, subcolección `secciones/{seccionId}`, hooks `useModulos.ts`, `useSecciones.ts` y `useUserRole.ts`, componente `ModuloCard.tsx`, grid en home con FAB para admin, pantallas `modulos/[id].tsx`, `modulos/form.tsx`, `secciones/form.tsx`, y `firestore.rules` con helpers `isAdmin()` e `isProfesor()`.

---

### 2. Error de permisos de Firebase

**Pregunta:**

> `ERROR useModulos error: [FirebaseError: Missing or insufficient permissions.]`
> Me tira este error con cualquier usuario. Igualmente me deja navegar por la aplicación.

**Respuesta:** Las reglas de `firestore.rules` estaban escritas localmente pero no publicadas en Firebase. La app "deja navegar" porque usa caché local antes de recibir el rechazo del servidor.

**Solución:** Firebase Console → Firestore → Reglas → pegar el contenido → Publicar.

---

### 3. Error al deployar reglas con Firebase CLI

**Pregunta:**

> ```
> $ firebase deploy --only firestore:rules
> Error: Not in a Firebase app directory (could not locate firebase.json)
> ```

**Respuesta:** Faltaba el archivo `firebase.json` en la raíz. Se creó con:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firebase.indexes.json"
  }
}
```

El deploy siguió fallando con error 403 (permisos de CLI). La solución definitiva fue publicar las reglas **manualmente desde Firebase Console**.

---

### 4. Rediseño del modelo de datos

**Pregunta:**

> Quiero rediseñar la app para que los módulos no tengan campo `contenido`, las secciones no tengan `contenido` ni `orden`, y en su lugar cada sección tenga una subcolección `items` con tipos Texto/PDF/Imagen/Documento almacenados en Firebase Storage.

**Respuesta:** Se implementó completamente:

- `hooks/useModulos.ts` — eliminado `contenido`
- `hooks/useSecciones.ts` — eliminados `contenido` y `orden`, orden por `fechaCreacion`
- `hooks/useItems.ts` — nuevo hook con CRUD completo para la subcolección `items`
- `app/modulos/[id].tsx` — rediseñado con secciones como tarjetas tapeables
- `app/secciones/[id].tsx` — nueva pantalla, renderiza ítems por tipo
- `app/items/form.tsx` — nuevo formulario de creación con selector de tipo y subida de archivos
- `config/firebaseConfig.ts` — agregado `storage` de Firebase
- `firestore.rules` y `storage.rules` — escritas localmente (deben publicarse en la consola de Firebase)

---

### 5. Error CORS al subir archivos desde la web

**Pregunta:**

> Me da un error de CORS cuando intento subir archivos a Firebase Storage desde el navegador.

**Respuesta:** No era un error de código sino de configuración del bucket. La solución es aplicar un archivo `cors.json` al bucket de Firebase Storage mediante:

```bash
gsutil cors set cors.json gs://odb-cvg.firebasestorage.app
```

El `cors.json` creado permite todos los orígenes con los métodos GET, POST, PUT, DELETE, HEAD. También puede configurarse desde Google Cloud Console si el CLI no está disponible.

---

### 6. El formulario de edición de ítems siempre creaba uno nuevo

**Pregunta:**

> Cuando edito un ítem existente, en lugar de actualizarlo me crea uno nuevo.

**Respuesta:** El bug era que `app/items/form.tsx` no leía el parámetro `itemId` de la URL. Se corrigió:

- Leer `itemId` con `useLocalSearchParams`
- Agregar `modoEdicion = !!itemId`
- Agregar un `useEffect` que carga los datos del ítem con `getDoc` al montar en modo edición
- Ramificar `handleGuardar` entre `crearItem` (creación) y `actualizarItem` (edición)

---

### 7. Botones de navegación atrás en todas las pantallas

**Pregunta:**

> Necesito que las siguientes pantallas tengan un botón de flecha para volver: formulario de módulo, detalle de módulo, formulario de sección, detalle de sección, formulario de ítem. En los formularios, si hay campos rellenados, advertir al usuario antes de salir.

**Respuesta:** Se implementó en 5 archivos con dos patrones:

**Pantallas de detalle** (`modulos/[id].tsx`, `secciones/[id].tsx`) — back simple con `router.back()`.

**Formularios** (`modulos/form.tsx`, `secciones/form.tsx`, `items/form.tsx`) — patrón completo:

- Estado `hayCambios` (inicia en `false`, se activa solo desde handlers del usuario, nunca desde el `useEffect` de carga de datos en modo edición)
- Función `handleAtras`: si `hayCambios` → mostrar modal, si no → `router.back()`
- `ModalConfirmacion` con "Descartar" / "Quedarme"
- `useFocusEffect` + `BackHandler` para el botón físico de Android

Luego se refactorizó para usar el componente `ScreenHeader` propio en lugar del header nativo de expo-router, con `headerShown: false` en `layout.tsx`.

---

### 8. Migración de Firebase Storage a Cloudinary

_(Realizado de forma independiente por el usuario entre sesiones)_

Firebase Storage fue reemplazado por Cloudinary. Se agregaron los tipos `video` y `enlace` a `ItemTipo`. La subida usa un upload preset **unsigned**. El borrado usa firma SHA1 con `crypto-js` desde el cliente.

---

### 9. Diagnóstico — botón de flecha de retroceso no visible en ninguna pantalla

**Pregunta:**

> ¿Por qué no aparece el botón de flecha (back button) en el header de las pantallas?

**Respuesta:** La causa raíz era que `<Stack.Screen headerLeft={...}>` solo se renderizaba en el `return` principal de cada componente. Durante los estados de carga o sin permiso (early returns), el `Stack.Screen` no se montaba, por lo que el header nativo de React Navigation no recibía el `headerLeft`.

**Solución:** En cada pantalla afectada se envolvieron todos los early returns en un fragmento `<>` con su propio `<Stack.Screen headerLeft={...}>`. Adicionalmente, en `app/layout.tsx` se creó el componente `HeaderBackButton` con `<Ionicons name="arrow-back" size={24} color="#0F4A32">` y se asignó como `headerLeft` a las pantallas `registro` y `recuperar`.

---

### 10. Implementación del botón "Volver atrás" con comportamiento diferenciado según tipo de pantalla

**Pregunta:**

> Necesito implementar un botón de "Volver atrás" (Back Button con icono de flecha) en varias pantallas. Este botón debe seguir dos comportamientos específicos dependiendo del tipo de pantalla:
>
> - **Pantallas de vista** (`modulos/[id].tsx`, `secciones/[id].tsx`): la flecha regresa a la pantalla anterior de forma inmediata.
> - **Pantallas de formulario** (`modulos/form.tsx`, `secciones/form.tsx`, `items/form.tsx`): si el formulario está "sucio" (hay cambios sin guardar), mostrar un modal de confirmación con título "¿Descartar cambios?", mensaje "Tienes cambios sin guardar. Si sales ahora, perderás el progreso.", botón confirmar "Descartar cambios" y botón cancelar "Mantenerse en la pantalla".

**Respuesta:** Se implementó en 5 archivos con dos patrones distintos:

**Pantallas de vista** (`modulos/[id].tsx`, `secciones/[id].tsx`):

- Helper `backButton` con `<Ionicons name="arrow-back">` que llama `router.back()`
- `headerLeft: backButton` en el `<Stack.Screen>` del return principal
- Early returns (carga, no encontrado) envueltos en `<>` con su propio `<Stack.Screen>`

**Formularios** (`modulos/form.tsx`, `secciones/form.tsx`, `items/form.tsx`):

- Imports añadidos: `useFocusEffect` de `expo-router`, `BackHandler` de `react-native`, `ModalConfirmacion`
- Estados añadidos: `hayCambios` (se activa solo por interacción del usuario, nunca desde el `useEffect` de carga) y `modalDescartar`
- Función `handleAtras`: si `hayCambios` → `setModalDescartar(true)`, sino → `router.back()`
- `useFocusEffect` + `BackHandler.addEventListener("hardwareBackPress")` para interceptar el botón físico de Android
- `onChangeText` de todos los inputs actualizados para llamar `setHayCambios(true)`; en `items/form.tsx` también se activa al seleccionar tipo y al elegir archivo en `elegirArchivo`
- Early returns envueltos en `<>` con `<Stack.Screen>` propio
- `<ModalConfirmacion>` agregado al final del return con los textos exactos del spec

---
