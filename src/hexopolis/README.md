# ⬢ HEXÓPOLIS

Juego de colonizar una isla hexagonal con las reglas clásicas del género: recursos, dados, ladrón, puertos, cartas de desarrollo, camino más largo, ejército más grande y victoria a 10 puntos.

## Arrancar

```bash
npm install
npm start
```

Abre **http://localhost:3000**.

## Modos

- **Jugar contra bots**: partida local en tu navegador (1 humano + 1 a 3 bots).
- **Salas online**: al crear una sala aparece su enlace de invitación con botones de Copiar, Compartir y WhatsApp. Quien lo abre ve "Te han invitado a la sala XXXX", escribe su nombre y entra. El anfitrión puede añadir bots y elegir su nivel.

## Web fija gratis (sin tener el ordenador encendido)

```bash
npm run build
```

Genera la carpeta `dist/`, una web estática. Súbela a Netlify (gratis): entra en https://app.netlify.com/drop, crea una cuenta y arrastra la carpeta `dist`. Te da un enlace fijo (`algo.netlify.app`, que puedes renombrar en *Site configuration → Change site name*).

En esa web, **Salas online** funciona en modo directo: quien crea la sala hace de anfitrión desde su navegador (la partida y los bots corren ahí) y los demás entran con el código de 4 letras o el enlace de la sala. Los navegadores se encuentran con el servicio gratuito de PeerJS y luego se comunican directamente (WebRTC).

- El anfitrión debe mantener la pestaña del juego abierta y visible; si la cierra, la partida termina.
- Si alguien recarga la página, vuelve a su sitio en la partida.
- Algunas redes muy restrictivas (empresas, ciertos móviles) bloquean las conexiones directas.
- Para actualizar la web: `npm run build` y vuelve a arrastrar `dist` en la pestaña *Deploys* de tu sitio.

## Subirlo a GitHub (GitHub Pages + servidor gratis en Render)

Así el enlace es fijo y las salas funcionan en cualquier red, sin tener el ordenador encendido:

1. Mete esta carpeta entera (sin `node_modules`, `dist` ni `tools`) en tu repositorio, por ejemplo en `hexopolis/`.
2. **Servidor de salas (Render, gratis):** en https://render.com → *New → Web Service* → elige el repositorio. *Root Directory*: `hexopolis` · *Build Command*: `npm install` · *Start Command*: `npm start` · plan *Free*. Te da una dirección tipo `https://hexopolis-xxxx.onrender.com` (ese enlace ya es un juego completo que funciona).
3. **Página en GitHub Pages (opcional, junto a tus otros juegos):** genera la web apuntando al servidor:
   ```bash
   SERVER_URL=https://hexopolis-xxxx.onrender.com npm run build
   ```
   y sube el contenido de `dist/` a la carpeta que publique GitHub Pages. Las salas se crean en el servidor de Render y los enlaces de invitación apuntan a la página de GitHub.

El plan gratis de Render se duerme tras 15 minutos sin uso: la primera conexión tarda hasta un minuto (el juego lo avisa y lo despierta al abrirse).

## Jugar por internet desde tu ordenador

```bash
npm run online
```

Arranca el juego y un túnel gratuito de Cloudflare (usa `tools/cloudflared`), y muestra el enlace público en la consola. Los enlaces de las salas usan esa dirección automáticamente. El enlace cambia cada vez que lo arrancas y solo funciona mientras el ordenador esté encendido. Ctrl+C lo cierra todo.

Si tienes una dirección fija propia, arranca con `PUBLIC_URL=https://tu-direccion npm start` y las invitaciones la usarán.

Si alguien se desconecta, un bot juega por él hasta que vuelva (se reconecta solo al recargar).

**Partidas que no se pierden:** el servidor manda cada poco a los jugadores una copia cifrada de su partida, que se guarda en su navegador. Si el servidor se reinicia (o se duerme), el primero que vuelve la reconstruye y los demás entran en su sitio; en el menú aparece «Volver a tu partida online». La clave de cifrado sale de la variable `HX_SAVE_KEY`, que debe ser fija en el servidor. Las partidas contra bots se guardan en el navegador y se pueden continuar con «Continuar partida contra bots».

## Bots

| Nivel | Comportamiento |
|---|---|
| ★ Novato | Coloca y construye casi al azar |
| ★★ Normal | Elige buenas casillas por probabilidad y construye con prioridades simples |
| ★★★ Difícil | Planifica objetivos, usa puertos, comercia con jugadores, ataca al líder con el ladrón |
| ★★★★ Experto | Todo lo anterior + mirada al futuro en la colocación inicial, cuenta cartas para el monopolio, carrera por el ejército y el camino, no regala tratos al líder |

`npm run sim` lanza 200 partidas bot contra bot sin interfaz (útil para comprobar reglas y nivel de la IA).

## Controles

- `ESPACIO` tirar dados / terminar turno · `1` camino · `2` poblado · `3` ciudad · `4` carta · `T` comercio · `ESC` cancelar

## Estructura

- `shared/engine.js` — reglas y generación aleatoria del mapa (servidor y navegador)
- `shared/bots.js` — IA de los 4 niveles
- `shared/room.js` — salas, asientos y bucle de turnos de los bots
- `server.js` — servidor HTTP + WebSocket
- `public/` — interfaz (canvas pixel-art, HUD, sonido chiptune)
