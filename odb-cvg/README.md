# CVG - Odonto B

Aplicación móvil educativa para la **Facultad de Odontología de la UNLP**, desarrollada con React Native + Expo. Permite gestionar y consultar contenido académico organizado en módulos, secciones y subsecciones, con un sistema de roles (administrador, profesor y alumno) respaldado por Firebase.

---

## Tabla de Contenidos

- [Introducción](#introducción)
- [Prerrequisitos](#prerrequisitos)
- [Instalación](#instalación)
- [Configuración del entorno](#configuración-del-entorno)
- [Comandos de ejecución](#comandos-de-ejecución)

---

## Introducción

**CVG - Odonto B** es una aplicación multiplataforma (Android, iOS y Web) que centraliza el material educativo de la cátedra. Sus funcionalidades principales son:

- Navegación por módulos, secciones, subsecciones e ítems de contenido.
- Sistema de autenticación y registro de usuarios mediante Firebase Auth.
- Control de acceso basado en roles: `admin`, `profesor` y `alumno`.
- Panel de administración para gestión de usuarios.
- Soporte para carga de imágenes, videos y documentos a través de **Cloudinary** (CDN y almacenamiento de archivos).

El stack tecnológico utilizado es:

| Capa              | Tecnología                                                   |
| ----------------- | ------------------------------------------------------------ |
| Framework UI      | React Native 0.81 + Expo SDK 54                              |
| Enrutamiento      | Expo Router (file-based routing)                             |
| Lenguaje          | TypeScript 5.9                                               |
| Backend / BaaS    | Firebase (Auth, Firestore, Analytics) + Cloudinary (Storage) |
| Gestión de estado | React Hooks + custom hooks                                   |

---

## Prerrequisitos

Asegurate de tener instaladas las siguientes herramientas **antes** de continuar:

| Herramienta                                                 | Versión mínima recomendada | Verificación         |
| ----------------------------------------------------------- | -------------------------- | -------------------- |
| [Node.js](https://nodejs.org/)                              | 18.x LTS o superior        | `node -v`            |
| [npm](https://www.npmjs.com/)                               | 9.x o superior             | `npm -v`             |
| [Git](https://git-scm.com/)                                 | Cualquier versión reciente | `git --version`      |
| [Expo CLI](https://docs.expo.dev/get-started/installation/) | Global o via `npx`         | `npx expo --version` |

Para correr la app en un dispositivo físico:

- **Android / iOS**: instalar [Expo Go](https://expo.dev/go) desde la tienda de aplicaciones correspondiente.
- **Android emulado**: Android Studio con un AVD configurado.
- **iOS simulado**: Xcode (solo en macOS).

> Adicionalmente, necesitás acceso a un proyecto de **Firebase** con Authentication y Firestore habilitados, y a una cuenta de **Cloudinary** para el almacenamiento de archivos. Pedile las credenciales al responsable del proyecto si no las tenés.

---

## Instalación

Seguí estos pasos en orden:

**1. Clonar el repositorio**

```bash
git clone <URL_DEL_REPOSITORIO>
cd odb-cvg
```

**2. Instalar las dependencias**

```bash
npm install
```

**3. Configurar las variables de entorno**

Copiá el archivo de ejemplo y completá los valores (ver sección siguiente):

```bash
# En macOS / Linux
cp .env.example .env

# En Windows (PowerShell)
Copy-Item .env.example .env
```

Abrí el archivo `.env` recién creado y completá cada variable con las credenciales de Firebase (ver [Configuración del entorno](#configuración-del-entorno)).

---

## Configuración del Entorno

Todas las credenciales sensibles se cargan a través de variables de entorno con el prefijo `EXPO_PUBLIC_`, que Expo expone de forma segura al cliente.

El archivo `.env.example` incluido en el repositorio lista **todas las variables necesarias** sin valores reales, para que sirva como plantilla. **Nunca commitees el archivo `.env` con credenciales reales.**

```dotenv
# .env.example — copiá este archivo como .env y completá los valores

# Firebase — obtenelos desde Firebase Console > Configuración del proyecto > Tus apps
EXPO_PUBLIC_API_KEY=
EXPO_PUBLIC_AUTH_DOMAIN=
EXPO_PUBLIC_PROJECT_ID=
EXPO_PUBLIC_STORAGE_BUCKET=
EXPO_PUBLIC_MESSAGING_SENDER_ID=
EXPO_PUBLIC_APP_ID=
EXPO_PUBLIC_MEASUREMENT_ID=
```

**Cómo obtener los valores:**

1. Ingresá a [Firebase Console](https://console.firebase.google.com/).
2. Seleccioná el proyecto `odb-cvg`.
3. Ir a **Configuración del proyecto** (ícono de engranaje) → pestaña **General**.
4. En la sección **Tus apps**, seleccioná la app web y copiá el objeto `firebaseConfig`.
5. Pegá cada valor en la variable correspondiente del archivo `.env`.

---

## Comandos de Ejecución

Todos los comandos se ejecutan desde la raíz del proyecto.

| Comando           | Descripción                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `npm start`       | Inicia el servidor de desarrollo de Expo (muestra QR para Expo Go) |
| `npm run android` | Lanza la app en un emulador Android o dispositivo conectado        |
| `npm run ios`     | Lanza la app en el simulador de iOS (requiere macOS + Xcode)       |
| `npm run web`     | Abre la app en el navegador                                        |
| `npm run lint`    | Ejecuta ESLint sobre el código fuente                              |

**Flujo de desarrollo típico:**

```bash
# 1. Iniciar el servidor
npm start

# 2. Escanear el QR con Expo Go (Android/iOS)
#    o presionar 'a' para Android / 'i' para iOS / 'w' para Web en la terminal
```

> **Tip:** Si encontrás errores de módulos no resueltos al iniciar, probá limpiar la caché con `npx expo start --clear`.

---
