# ⚔ DOMINIUM · Conquista del Mundo

Juego de estrategia por turnos de conquista mundial (reglas clásicas del género), **multijugador online** con salas por código, bots con 4 niveles y 7 mapas reales del mundo. Estética de juego de mesa clásico, sin dependencias.

## Jugar en local

```bash
npm start
```

Abre <http://localhost:3000>. Para jugar con amigos en tu misma red, compárteles `http://TU-IP-LOCAL:3000`.

## Publicado en NS Games

- Web: <https://5amueln5.github.io/nsgames/dominium/> (GitHub Pages, carpeta `dominium/` del repositorio).
- Servidor de salas: <https://dominium-gt9w.onrender.com> (Render, plan gratuito). Ajustes del servicio: *Root Directory* `src/dominium`, *Build Command* `npm install`, *Start Command* `npm start`.
- La web lee la dirección del servidor de `config.json`. En el plan gratuito el servidor se duerme tras unos minutos sin uso; la primera conexión puede tardar hasta un minuto y el juego lo avisa.

Para regenerar la web tras un cambio:

```bash
SERVER_URL=https://dominium-gt9w.onrender.com npm run build
rm -rf ../../dominium && cp -R dist ../../dominium
```

## Cómo funciona el online

1. **Crear sala** → obtienes un código de 5 letras (y un enlace `?sala=CÓDIGO`).
2. Tus amigos pulsan **Unirse** con el código, o eligen la sala en **Salas públicas**.
3. El anfitrión añade **bots** (Recluta, Soldado, General, Mariscal), elige mapa y reglas.
4. Los invitados marcan **Estoy listo** y el anfitrión pulsa **¡A la guerra!**
5. Si alguien se desconecta o agota el tiempo dos veces, **un bot juega por él** hasta que vuelva. Quien entra con una partida ya empezada la ve como **espectador**.
6. Al terminar, **Revancha** devuelve a todos a la sala.

## Perfil de jugador

Funciona igual que el de Hexópolis:

- Cada navegador tiene un perfil con nivel (1 a 100), rango, emblema, foto, estadísticas por tipo de partida y 16 logros.
- La experiencia se gana al terminar partidas online (menos contra bots; nada si te vas o si un bot juega por ti casi toda la partida).
- El perfil lo firma el servidor y se guarda en el navegador, así nadie puede subirse el nivel a mano. Con el enlace de recuperación se recupera en otro navegador.
- Ranking de amigos con las personas con las que has terminado partidas.
- La firma usa la variable `DOM_PROFILE_KEY` del servidor (o, si no existe, el identificador fijo del servicio en Render).

## Reglas implementadas

- Reparto aleatorio con despliegue simultáneo, o modo **clásico** (elegir territorios por turnos y colocar de 1 en 1).
- Ejército **neutral** en partidas de 2 jugadores.
- Refuerzos: territorios ÷ 3 (mín. 3) + bonus de regiones completas.
- Cartas (infantería, caballería, artillería, 2 comodines): canje **progresivo** (4, 6, 8, 10, 12, 15, +5…) o **fijo** (4/6/8/10); +2 en territorio propio de la carta; canje obligatorio con 5+ cartas.
- Ataque con 1–3 dados contra 1–2, empates para el defensor, **asalto total** automático, mover al menos tantos ejércitos como dados.
- Eliminar a un jugador te da sus cartas; con 6+ canjeas en el acto.
- Fortificación única al final del turno (por camino propio o solo a vecino).
- Una carta por turno si conquistas algo.
- **Dominación mundial** o **misiones secretas**.
- Temporizador de turno configurable.

## Mapas

| Mapa | Tipo |
|---|---|
| Mundo Clásico | 42 territorios, 6 continentes (el tablero clásico) |
| Europa, África, Las Américas, Asia y Oceanía | continentes por países |
| Europa, África, Las Américas, Latinoamérica, Asia y Oceanía | continentes por países |
| España, Estados Unidos, Italia, Alemania, Islas Británicas | países por provincias / regiones |
| Tierras de Aeloria | mapa de fantasía original |

Los mapas se generan desde datos geográficos reales (`tools/build-maps.mjs`, `npm run build-maps`) y se guardan ya procesados en `public/maps/`.

## Pruebas

```bash
npm test                      # cientos de partidas bot vs bot en todos los mapas, comprobando invariantes
node test/online.mjs clasico  # partida online completa por HTTP con 2 humanos simulados, bots y espectador
```

## Estructura

```
server/server.js   servidor HTTP + SSE, salas, temporizadores, bots
shared/engine.js   motor de reglas (lo usan servidor y cliente)
shared/bots.js     IA de los bots
public/            cliente (HTML/CSS/JS sin compilación) y mapas
tools/             generador de mapas
test/              simulaciones y prueba online
```

Controles: rueda o pellizco para zoom, arrastrar para mover. Atajos: `Espacio` atacar · `A` asalto total · `F` fortificar · `E` terminar turno · `C` cartas · `Esc` cancelar.
