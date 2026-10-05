# Historial de cambios

## 0.7.1

- Fixed untimed fullscreen lyrics jumping back after manual scrolling. Reading now pauses for five seconds after the last input and continues from the chosen position.
- At the end of untimed lyrics, reading waits five seconds before repeating, without an extra startup pause.
- Artist names and Cast text/icons now use the same light cover color as translated lyrics and the translation badge.
- Regression tests cover local/Cast readers, repeated manual input, looping, paused/hidden playback, cleanup and matching metadata colors.

## 0.7.0

- Library y Search permiten explorar canciones, álbumes, artistas y playlists, con Play/Shuffle en las colecciones y opciones individuales de cola. La búsqueda conserva su estado y recibe la categoría inicial de Library.
- Las ventanas nuevas de álbum, artista o playlist enfocan Play. B restaura categoría, página, posición y elemento de la ventana anterior, incluso al regresar de un álbum a la sección Albums de un artista.
- Refresh muestra una tanda nueva antes de completar las continuaciones. Las playlists usan sesiones de red independientes y caché compartida; una respuesta anterior al refresh no puede reemplazar los datos nuevos.
- El selector de Library tiene foco redondeado y legible, sin superponer bordes o cambiar la escala. Queue incorpora paginación inferior y todos los paginadores comparten el mismo comportamiento.
- Se consolidan las correcciones de las betas: seguimiento de letras, traducciones gratuitas con caché y fallback, UUID persistente de Cast, controles locales validados y orígenes restringidos.
- README actualizado con siete capturas nuevas; la imagen de diagnóstico del cursor queda excluida. El instalador y el código fuente se distribuyen por separado.

## 0.7.0-beta.9

- Queue incorpora Previous y Next inferiores. La paginación por botones mantiene el foco en el control superior correspondiente y vuelve al inicio de la lista; los gatillos conservan el acceso a la primera fila.
- Las ventanas de Search, playlist y artista/álbum dejan de recordar el paginador inferior como último hijo del grupo de canciones. Al bajar desde Next superior se entra por la primera fila de la nueva página.
- Search conserva la categoría inicial de Library, pero enfoca el campo de búsqueda para escribir inmediatamente. B y Back vuelven al plugin en Library; el estado de búsquedas realizadas se conserva.
- Se suaviza el aspecto de hover y foco en los controles de las ventanas: bordes redondeados, sin escalado ni una segunda capa rectangular de enfoque.
- Se adopta la revisión de Claude: hook compartido de paginación, limpieza de una condición redundante y validación de videoId en queue/jump. Las solicitudes mayores de 1 MB reciben 413 antes de terminar la carga, se pausa su lectura y se cierra la conexión después de entregar la respuesta.
- El reinicio del scroll localiza el contenedor por su overflow real; la clase privada de Steam queda únicamente como respaldo.

## 0.7.0-beta.8

- Se confirma y corrige el UUID persistente de Cast: la compilación pasa la identidad guardada al anunciante DIAL/SSDP. La reparación es reproducible y la compilación falla si no puede aplicarla.
- Seek y volumen validan números; los comandos rechazan JSON inválido y cuerpos demasiado grandes. HTTP y WebSocket admiten los orígenes locales de Steam y bloquean páginas externas.
- El heartbeat congela la misma estimación limitada a 15 segundos que informa al teléfono. Los IDs de reintento tienen tipo string o null.
- Next y Previous conservan el cursor en el botón superior correspondiente. Usar el control inferior sube la lista y devuelve el foco al superior; los gatillos conservan el enfoque en la primera fila.
- Search hereda la categoría de Library antes de la primera búsqueda y enfoca ese filtro. Después conserva su consulta, filtro, resultados y página, aunque se abra desde otra categoría.
- Los resultados de Search usan paginación de 40 elementos; el código para revisión incluye los tests de backend y la reparación de compilación.

## 0.7.0-beta.7

- Se integra la revisión de Claude: ordenamiento memoizado en playlists y catálogo, lecturas de preferencias en memoria y lectura directa de píxeles al extraer paletas.
- La caché de preferencias se invalida con eventos storage de otras ventanas de Steam, conserva opciones durante la sesión si falla el almacenamiento y libera sus observadores al descargar el plugin.
- La lectura automática sin timing usa RAF mientras se mueve y un único timeout para sus esperas. Pausar u ocultar el lector detiene los frames; el regreso manual de cinco segundos se conserva incluso durante una pausa de reproducción.
- Cambiar categorías mantiene el cursor en el selector, incluso al pasar entre playlists y las otras categorías. Los filtros de artistas dejan de enfocar la primera canción al cambiar de categoría.
- El resultado del reinicio Cast aparece arriba del formulario y se lleva a la vista. El mensaje se traduce a los siete idiomas; un doble clic no inicia dos reinicios.
- Cast descarta eventos del receptor anterior después de reiniciar y escrituras diferidas de volumen de una sesión antigua. Los errores al restaurar volumen se manejan sin propagarse como rechazos no controlados.

## 0.7.0-beta.6

- El SVG de traducción queda debajo de Source en ambos lectores, junto a Translating mientras carga. Ya no comparte espacio con el logo de YouTube Music.
- El icono y las letras traducidas comparten un pastel del color secundario de la portada: claro, con matiz visible y sin llegar al blanco. Las portadas monocromáticas conservan tonos neutros.
- Se conserva la animación y el difuminado compartido de original y traducción, además del regreso automático tras cinco segundos de lectura manual.

## 0.7.0-beta.5

- Sort conserva el foco en su botón al alternar el orden. Las filas dejan de pedir foco al ordenar, incluso después de haber cambiado de página o al terminar una carga en segundo plano.
- Los encabezados de Library dicen Your saved playlists/albums/songs/artists, con equivalentes en los siete idiomas.
- Las letras sincronizadas retoman la línea cantada tras cinco segundos desde el último movimiento manual, en pestaña y fullscreen. La lectura sin timing retoma su posición automática con el mismo plazo.
- El desplazamiento manual y el seguimiento usan una sola animación. Se evita que un frame manual antiguo compita con el regreso o quede activo por redondeo de píxeles; se desactiva el smooth nativo en el lector para no duplicar interpolaciones.
- Un SVG de traducción identifica la opción en Settings y aparece en ambos lectores cuando está activada, aunque la traducción siga cargando.

## 0.7.0-beta.4

- Una barra superior reúne filtro, ordenar y actualizar en todas las categorías de Library. Los encabezados distinguen tus playlists, álbumes, canciones y artistas en los siete idiomas.
- Álbumes, canciones y artistas guardan su orden predeterminado, A–Z o Z–A por separado. El reordenado manual sigue siendo exclusivo de las playlists; ordenar alfabéticamente carga el catálogo completo en segundo plano.
- Reproducir desde una colección cierra sus páginas, incluso al navegar de artista a álbum, y vuelve al Player. Play next y agregar a la cola mantienen abierta la colección. El destino Player sobrevive al remontaje del panel.
- Las traducciones usan un matiz muy claro de la portada y mantienen la misma animación y difuminado que el texto original.
- Las letras sincronizadas se centran cuando el diseño está listo y se ajustan si cambia la altura de las traducciones. La llegada de la traducción conserva el plazo de lectura manual; después de tres segundos vuelve el seguimiento.
- Las letras sin timing también regresan a su posición de lectura automática después del desplazamiento manual; el desplazamiento continúa respetando la pausa de reproducción.

## 0.7.0-beta.3

- Library separa con 12 px sus bloques de búsqueda, paginación, resultados y actualización; las tarjetas conservan su separación de 8 px.
- Refresh library usa el mismo tamaño de texto que Previous/Next y queda separado del paginador inferior.
- El contador mantiene ancho estable para sus números y los botones se adaptan al espacio disponible en paneles estrechos.

## 0.7.0-beta.2

- Play y Shuffle en las filas de álbumes, artistas y playlists de Library, Search y las vistas de artistas. Al abrir una colección aparecen también Play next y Add all.
- Cada artista abre en Canciones. Se elimina Todo de los filtros visibles y se distingue Artistas similares; las fotos son cuadradas y mantienen el encuadre al abrirse.
- Library muestra la primera tanda antes de cargar más en segundo plano. Next obtiene resultados adicionales sin un botón redundante de Cargar más, vuelve al inicio y enfoca la primera canción; L2/R2 conservan esa navegación.
- Traducción gratuita: Apertium respalda a MyMemory en los pares de idiomas compatibles. Se reducen las esperas de red y se conservan caché y resultados parciales.
- Las solicitudes de traducción para canciones o idiomas diferentes ya no se bloquean entre sí. Se corrige una carrera de inicialización del detector de idioma y se reutiliza su resultado.
- Pruebas de acciones, filtros, fotos, carga progresiva, foco de paginación, respaldo tras cuota agotada y detección concurrente.

## 0.7.0-beta.1

- Library filtra playlists, álbumes, artistas y canciones; Search incorpora los mismos filtros y una vista de todos los resultados.
- Los álbumes abren sus canciones y las acciones para reproducir o añadir todo. Los artistas abren canciones, álbumes, sencillos y artistas relacionados, con filtros y navegación de regreso.
- Las listas nuevas usan páginas de 40 elementos y navegación con L2/R2; al cambiar página se mueve el foco a la primera canción y se vuelve al inicio.
- Traducción gratuita sin claves: caché persistente por línea, versos repetidos reutilizados, recuperación de resultados parciales y reintento visible. El límite diario del proveedor sigue aplicando; nunca se reemplazan los originales por mensajes de error.
- Original y traducción comparten exactamente la misma animación de enfoque y opacidad. El desplazamiento manual de letras acumula el movimiento del mando y responde más rápido.
- El estado del audio se restaura en el primer render; las paletas se calculan al cambiar de canción, se guardan localmente y se adelantan para las dos próximas canciones. La apertura espera a la paleta inicial.
- Se detiene el audio antes de vaciar los datos al final de la cola y se descartan respuestas tardías de reanudación después de Stop.
- Las selecciones manuales siguen sin notificar después de un reintento de audio o una pausa; las canciones que avanzan automáticamente conservan sus notificaciones.
- Las playlists reutilizan datos recientes y comparten solicitudes concurrentes. Las lecturas del catálogo y sus continuaciones usan sesiones separadas para no bloquear controles de reproducción.

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
