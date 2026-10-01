# Historial de cambios

## 0.6.9

- Abre playlists para explorar canciones y reproducir o añadir cada pista; mejora paginación y navegación con controles de Steam.
- Añade siete idiomas de interfaz y traducción opcional de letras con idioma independiente. La traducción ahora muestra el agotamiento de cuota del proveedor, evita solicitudes repetidas y conserva siempre las letras originales.
- Las selecciones manuales de Search, Library, playlists y Queue dejan de generar notificaciones de canción; los cambios automáticos siguen notificando.
- Actualiza fondos y colores de la carátula, letras en pantalla completa y capturas de la interfaz.

## 0.6.9-beta.16

- Las traducciones de líneas no activas se atenúan y reducen levemente como sus letras originales; recuperan brillo con una transición al cantarse.

## 0.6.9-beta.15

- Las letras traducidas son un poco más pequeñas y usan un azul grisáceo suave para diferenciarlas del texto original blanco.

## 0.6.9-beta.14

- Al paginar una playlist o Queue con botones o gatillos, el foco nativo de Steam se mueve a la primera canción visible y la lista vuelve arriba.
- Las traducciones fullscreen usan un peso y tamaño más legibles, con una entrada más gradual y reposicionamiento de la línea activa al cargarse.
- El seguimiento de letras temporizadas consulta el reloj real del audio solo mientras Letras está abierta y adelanta ligeramente la pista visual para reducir la sensación de retraso.

## 0.6.9-beta.13

- Centrado real de los símbolos dentro de las cuatro acciones de playlist y desplazamiento del título solo cuando excede su espacio.
- Al cambiar la página desde el pie de una playlist se vuelve al inicio. L2 y R2 cambian página en el detalle y en Queue.
- Selector independiente de idioma de traducción, con el idioma de la interfaz como valor predeterminado.
- Las letras traducidas aparecen con una transición suave; el lector de pantalla completa usa tipografía y espaciado más cuidados. Las consultas de traducción se agrupan y ejecutan con concurrencia limitada.

## 0.6.9-beta.12

- Separamos las acciones del borde derecho en el detalle de playlist.
- Idioma en lista desplegable y traducciones de Settings, Shuffle, Repeat y acciones del mando.
- Traducción opcional de letras al idioma elegido, desactivada por defecto. Conserva originales y sincronización; si falla la traducción, muestra solo los originales.

## 0.6.9-beta.11

- Los iconos del encabezado de playlist usan una caja óptica común para quedar centrados y alineados.
- B desde el detalle de playlist vuelve de forma explícita a Library y restaura su posición; cada entrada al Player restablece su desplazamiento al inicio.
- Elegir manualmente una canción dentro de una playlist ya no muestra la notificación de cambio. Los cambios automáticos posteriores conservan su notificación.
- Settings incorpora idioma del sistema, English, Español, Français, Deutsch, Português, Italiano y 日本語. El selector es local, instantáneo y no añade procesos en segundo plano.

## 0.6.9-beta.10

- Las cuatro acciones de playlist pasan al lado derecho de su encabezado para dejar más espacio a las canciones en Steam Deck.
- Los controles de playlist, paginación y canciones agrupan explícitamente el movimiento horizontal y vertical del mando; cada icono tiene una descripción al enfocarlo.

## 0.6.9-beta.9

- Cada playlist de Library abre una página de detalle con sus canciones; A sobre la tarjeta abre el contenido y los botones pequeños conservan Play y Shuffle inmediatos.
- La página carga primero una tanda rápida y completa la lista en segundo plano. Muestra hasta 40 canciones por página para mantener fluida la navegación en listas grandes.
- Se pueden reproducir o agregar canciones individuales, y el encabezado permite reproducir, mezclar, poner siguiente o agregar la playlist completa.
- B vuelve a Library y restaura la pestaña, la posición de desplazamiento y el foco de la playlist abierta.

## 0.6.9-beta.8

- Fullscreen deja de generar colores complementarios: todos los tonos proceden de la carátula. Las portadas puramente blancas y negras producen una paleta gris basada en su propia luminosidad.
- Los dos campos del fondo recorren más distancia y cambian de forma con ciclos de 28 y 34 segundos, manteniendo la animación exclusivamente en transformaciones CSS.
- La importación manual explica por separado el procedimiento en navegadores Chromium y Firefox.
- El botón Import cookies incorpora un icono de galleta.

## 0.6.9-beta.7

- Settings elimina Appearance y el orden de pestañas queda fijo en Player · Library · Queue.
- Fullscreen combina los colores de la carátula en dos campos de luz con movimiento lento. Las portadas casi monocromáticas reciben tonos complementarios discretos para conservar variedad cromática.
- El fondo pausa su movimiento cuando el documento no está visible y respeta la preferencia de movimiento reducido; no usa filtros de desenfoque ni ciclos de animación en JavaScript.

## 0.6.9-beta.6

- Al cambiar de canción, la interfaz descarta inmediatamente la paleta anterior y muestra un neutro coherente hasta terminar de analizar la portada nueva; una carga tardía ya no puede repintar la pista equivocada.
- Stop usa una paleta acero azul inspirada en el estado “Nothing playing” en vez de conservar el color de la última canción.
- Lyrics compactas eliminan el delineado de la burbuja interior para que la lectura se perciba como una sola superficie.
- Like y dislike comparten el mismo borde sutil de la carátula que el resto de los controles del reproductor.
- Se añade un paquete de código fuente legible y reproducible para revisión externa.

## 0.6.9-beta.5

- Player vuelve a ser la primera pestaña; el orden predeterminado es Player · Library · Queue y puede invertirse a Player · Queue · Library desde Appearance.
- El último color real de la carátula se conserva tras Stop, con degradado vertical a transparente; filas de Library, Queue y Search mantienen su color sin necesitar foco.
- Player usa superficies coloreadas transparentes en vez de gris y una cápsula de canción más saturada para distinguirla del fondo.
- Las letras sin timing dejan de desplazarse mientras la reproducción está pausada.
- Settings elimina Tor Browser, renombra el botón a Import cookies y devuelve los botones del encabezado a su forma nativa.

## 0.6.9-beta.4

- El fondo de Quick Access usa un color de la carátula que se desvanece a transparente; reproductor y letras compactas dejan ver mejor ese color.
- Nuevo orden de pestañas Library · Player · Queue, con Player como pantalla inicial.
- La notificación de conexión usa carátula cuadrada con el mismo redondeo que la de canción; la notificación de canción no cambia.
- Settings muestra los navegadores compatibles y la importación manual, explica cuándo reiniciar Cast y elimina el botón Stop Cast / Unlink redundante.
- Los botones Back y Settings del encabezado comparten redondeo.

## 0.6.9-beta.3

- La importación automática de cookies queda limitada a Firefox, Zen, LibreWolf, Waterfox y Floorp; Tor Browser usa la importación manual porque normalmente no conserva cookies al cerrarse.
- Se eliminó la lectura Chromium y sus dependencias de keyring; la importación ya no requiere KWallet ni Secret Service.

## 0.6.9-beta.2

- La importación Chromium se ejecuta con la sesión del usuario Steam para acceder al bus de escritorio y al keyring correspondiente.
- Los errores distinguen entre una sesión de escritorio no disponible y cookies que el keyring no pudo descifrar; Firefox y Zen siguen disponibles como alternativa.

## 0.6.9-beta.1

- El panel de Quick Access se distingue mejor de las filas coloreadas de biblioteca y cola.
- La cápsula del reproductor tiene un borde superior más discreto; las lyrics compactas ahora usan bordes redondeados y colores acordes al tema.
- Importación local de sesión desde Firefox y Zen, además de Chrome, Brave, Opera, Chromium, Edge y Vivaldi cuando el almacén de claves del escritorio puede desbloquear sus cookies.
- El importador busca cookies solo de YouTube, valida la cuenta y conserva la sesión previa si falla.

## 0.6.8

- Lanzamiento de **YouTube Music for Steam**, con soporte objetivo para Steam Deck y Steam Machine en SteamOS cuando Decky Loader está disponible.
- Inicio más rápido de playlists: reproduce el primer lote mientras el resto se carga en segundo plano.
- Importación más sencilla de sesiones desde Firefox, reordenamiento de biblioteca y cola, y orden alfabético personalizado.
- Letras a pantalla completa con seguimiento sincronizado, protección temporal contra suspensión y fondo animado de carátula.
- Mejoras visuales en reproductor, búsqueda, biblioteca, cola, letras y notificaciones.
- Recuperación de Cast, controles de volumen y likes, y limpieza de sesión al usar Stop.

## 0.6.3

- Respect independent connection and track notification sound preferences when Steam displays queued toasts.
- Preserve sounds for Steam achievements and other plugins; remove the compatibility hook on plugin unload.

## 0.6.2

- Automatically enable Cast-only mode when signed out; keep Player and Queue accessible.
- Explain optional account setup in Library and disable account-only actions without cookies.
- Refresh account access after sign-in/sign-out without polling.
- Apply the ytmusicapi compatibility patch in clean builds and CI.

## 0.6.1

- Logo de conexión centrado y más grande.
- Foco nativo automático en Lyrics.
- Ayuda centrada como L1 Up · R1 Down.

## 0.6.0

- Reordenamiento de cola y Play next.
- Notificaciones de conexión y canción con sonido configurable.
- Cola Cast respetada al avanzar y retroceder.

## 0.5.9

- Encabezados centrados y carátula responsive.
- Altura del panel adaptada al viewport.

Las notas históricas detalladas se conservan en RELEASE-*.md.
