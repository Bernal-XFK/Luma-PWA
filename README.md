# 🌿 Luma · Un paso a la vez

> **Una aplicación web progresiva (PWA) de productividad serena, actividades, cumpleaños, notas y recuerdos con imágenes. Creada con Vanilla JS, sin dependencias externas, 100% privada y offline-first.**

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-success?style=flat-square&logo=pwa)](https://developer.mozilla.org/es/docs/Web/Progressive_web_apps)
[![Offline First](https://img.shields.io/badge/Offline-First-blue?style=flat-square&logo=firefox)](https://developer.mozilla.org/es/docs/Web/API/IndexedDB_API)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-orange?style=flat-square)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## ✨ ¿Qué es Luma?

**Luma** nace bajo la filosofía de la *productividad en calma* (*calm technology*). No busca abrumarte con notificaciones invasivas ni métricas de estrés; está pensada para acompañarte a tu propio ritmo:

> *"Organiza lo que importa. Deja espacio para lo que te hace bien."*

Tus datos **nunca salen de tu dispositivo**. No hay bases de datos externas, cuentas de usuario, inicios de sesión obligatorios ni telemetría.

---

## 🌟 Características principales

### 1. 📅 Gestión inteligente de actividades
* **Categorías organizadas:** Personal, Trabajo, Hogar, Bienestar y Otros.
* **Niveles de atención:** Tranquila, Importante y Prioritaria.
* **Avisos locales:** Recordatorios configurables (a la hora, 10 min, 30 min, 1 hora o 1 día antes).
* **Filtros y vistas:** *Mi día*, *Próximas*, *Cumpleaños*, *Todas* y *Completadas*.
* **Búsqueda instantánea:** Atajo global `⌘ K` o `Ctrl + K`.

### 2. 🪄 Reconocimiento de fechas en lenguaje natural
Escribe directamente en el nombre de la actividad o en el campo de fecha rápida:
* *«lunes»*, *«mañana»*, *«pasado mañana»*, *«este viernes»*
* *«en 3 días»*, *«la próxima semana»*
* *«18/10»*, *«24 de diciembre»*
Luma detecta la intención y calcula el día automáticamente en el calendario.

### 3. 🎂 Fechas especiales y cumpleaños
* **Repetición anual automática:** Calcula la próxima fecha festiva automáticamente.
* **Soporte de años bisiestos:** Manejo suave y seguro para nacidos el 29 de febrero.
* **Foto local:** Permite asociar una fotografía que se recorta y comprime localmente.

### 4. 📝 Notas personales y galería de fotos
* Guarda listas, ideas, notas libres o recordatorios visuales.
* Adjunta hasta 3 fotos por nota.
* **Compresión en cliente:** Las fotos se procesan mediante un `<canvas>` dinámico en el navegador para ocupar el menor espacio posible manteniendo excelente nitidez.
* **Almacenamiento en IndexedDB:** Capacidad local amplia y sin las limitaciones del cupo tradicional de 5 MB de `localStorage`.

### 5. 🔒 Privacidad total y copias de seguridad
* **Local-First:** Todo se almacena en el navegador mediante `IndexedDB` y `localStorage`.
* **Exportación JSON:** Descarga un archivo completo con todas tus actividades, cumpleaños y notas.
* **Importación inteligente:** Fusiona datos nuevos sin sobrescribir ni borrar actividades locales previas.

### 6. 📱 PWA & Funcionamiento sin conexión
* **Service Worker con Stale-While-Revalidate:** Carga instantánea con o sin conexión a internet.
* **Detección de actualizaciones:** Notificación automática en pantalla cuando hay una nueva versión disponible.
* **Instalable en cualquier plataforma:** Android, iOS, Windows, macOS y Linux.

---

## 🚀 Probar Luma en local

Luma es una aplicación web estática pura (no requiere `npm install` ni compiladores):

1. Clona el repositorio:
   ```bash
   git clone https://github.com/Bernal-XFK/Luma-PWA.git
   cd Luma-PWA
   ```
2. Inicia un servidor web local sencillo:
   * **Con Python:**
     ```bash
     python -m http.server 4173
     ```
   * **Con Node.js:**
     ```bash
     npx serve .
     ```
3. Abre en tu navegador `http://localhost:4173`.

---

## 📲 Instalación como App (PWA)

* **En Android (Chrome, Edge o Brave):**
  Abre la web, pulsa en el botón **Instalar app** de la barra superior o en el menú del navegador `⋮ → Instalar aplicación` o `Añadir a pantalla de inicio`.
* **En iPhone / iPad (Safari):**
  Abre la web en Safari, pulsa el botón **Compartir** (icono de cuadrado con flecha hacia arriba) y selecciona **Añadir a pantalla de inicio**.
* **En PC / Mac (Chrome o Edge):**
  Haz clic en el icono de instalación situado a la derecha de la barra de direcciones.

---

## 🤖 ¿Cómo convertir Luma a APK para Android?

Tienes **3 opciones directas**:

### Opción 1: PWABuilder (Recomendada, rápida y sin instalar nada)
1. Publica Luma en GitHub Pages (ej. `https://bernal-xfk.github.io/Luma-PWA/`).
2. Entra en [PWABuilder.com](https://www.pwabuilder.com/).
3. Pega la URL de tu app y haz clic en **Start**.
4. Pulsa en **Package for Android**.
5. Descarga el archivo `.apk` para instalarlo directamente en tu teléfono o el archivo `.aab` si deseas publicarlo en Google Play Store.

### Opción 2: Compilación automática con GitHub Actions
Este repositorio incluye un flujo de trabajo en `.github/workflows/build-apk.yml`.
1. Ve a la pestaña **Actions** en tu repositorio de GitHub.
2. Selecciona el flujo **Compilar APK Android (TWA)**.
3. Haz clic en **Run workflow**.
4. Al terminar el proceso, descarga el artefacto `Luma-APK-Android` que contiene el instalador `.apk`.

### Opción 3: Con Bubblewrap CLI en tu terminal
```bash
# 1. Instalar la herramienta oficial de Google
npm install -g @bubblewrap/cli

# 2. Inicializar y compilar usando el manifiesto incluido
bubblewrap init --manifest twa-manifest.json
bubblewrap build
```

---

## 🌐 Publicar en GitHub Pages

1. En tu repositorio de GitHub, dirígete a **Settings → Pages**.
2. En **Build and deployment → Source**, selecciona **Deploy from a branch**.
3. Elige la rama `main` y la carpeta `/ (root)`.
4. Guarda los cambios. En 1-2 minutos tu app estará disponible en una URL HTTPS pública (por ejemplo: `https://bernal-xfk.github.io/Luma-PWA/`).

---

## 🛠️ Estructura del proyecto

```text
Luma-PWA/
├── .github/
│   └── workflows/
│       └── build-apk.yml       # Flujo para compilar APK en la nube
├── .nojekyll                   # Evita que GitHub Pages ignore archivos
├── index.html                  # Estructura semántica accesible con sprites SVG
├── styles.css                  # Diseño responsivo, variables CSS y tipografía fluida
├── app.js                      # Lógica principal, IndexedDB, NLP y compresión
├── sw.js                       # Service Worker (caché offline y actualizaciones)
├── manifest.webmanifest        # Manifiesto PWA para instalación nativa
├── twa-manifest.json           # Configuración para empaquetado Android (TWA)
├── icon.svg                    # Vector original del logotipo
├── icon-192.png                # Icono PWA estándar (192x192)
├── icon-512.png                # Icono PWA maskable de alta resolución (512x512)
└── README.md                   # Documentación completa
```

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Eres libre de usarlo, adaptarlo y compartirlo.

---

<p align="center">
  <b>Luma</b> · Hecho con calma, para acompañarte y no para apurarte ✿
</p>
