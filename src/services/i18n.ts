import { useEffect, useState } from 'react';

export type Language = 'system'|'en'|'es'|'fr'|'de'|'pt'|'it'|'ja';
type Messages = Record<string,string>;
const STORAGE_KEY = 'ytm-language-v1';
const CHANGE_EVENT = 'ytm-language-changed';
const TRANSLATE_KEY = 'ytm-translate-lyrics-v1';
const TRANSLATE_LANGUAGE_KEY = 'ytm-translation-language-v1';
export type TranslationLanguage = 'follow' | Exclude<Language,'system'>;

export const languageOptions: Array<{id:Language; name:string}> = [
  {id:'system',name:'System language'}, {id:'en',name:'English'}, {id:'es',name:'Español'},
  {id:'fr',name:'Français'}, {id:'de',name:'Deutsch'}, {id:'pt',name:'Português'},
  {id:'it',name:'Italiano'}, {id:'ja',name:'日本語'},
];

const en:Messages = {
  'tabs.player':'Player','tabs.library':'Library','tabs.queue':'Queue',
  'common.back':'Back','common.previous':'Previous','common.next':'Next','common.retry':'Retry','common.loading':'Loading…','common.songs':'{count} songs',
  'library.title':'Your library','library.search':'Search','library.searchHint':'Find your next song','library.castOnly':'Cast only','library.signInHint':'Sign in to access your library, search and likes.','library.signIn':'Sign in to YouTube Music','library.loading':'Loading your library…','library.empty':'Your playlists will appear here.','library.open':'Open playlist','library.play':'Play playlist','library.shuffle':'Shuffle playlist','library.refresh':'Refresh library','library.edit':'Edit custom order','library.done':'Done reordering','library.moveUp':'Move playlist up','library.moveDown':'Move playlist down',
  'playlist.crumb':'Your library / Playlist','playlist.back':'Back to Library','playlist.type':'YouTube Music playlist','playlist.actions':'Playlist actions','playlist.playAll':'Play all','playlist.shuffle':'Shuffle','playlist.playNext':'Play next','playlist.addAll':'Add all to queue','playlist.opening':'Opening playlist…','playlist.empty':'No playable songs found in this playlist.','playlist.loadingRest':'Loading the rest of the playlist…','playlist.addQueue':'Add to queue',
  'queue.title':'Up next','queue.loadingRest':'Loading the rest of your playlist…','queue.loading':'Loading queue…','queue.empty':'Your queue is empty','queue.emptyHint':'Choose a playlist in Library or find a song in Search.','queue.moveUp':'Move up','queue.moveDown':'Move down','queue.done':'Done','queue.move':'Move song','queue.remove':'Remove song',
  'search.eyebrow':'Your music','search.title':'Find your next song','search.placeholder':'Song or artist','search.button':'Search','search.hint':'Search by song or artist.','search.empty':'No songs found. Try another title or artist.','search.back':'Back',
  'player.setupCast':'Set up Cast','player.deviceShuffle':'Shuffle / repeat: use your device.','player.stop':'Stop','player.stopping':'Stopping…','player.lyrics':'Lyrics','player.nothing':'Nothing playing','player.find':'Find a song in Library',
  'lyrics.title':'Lyrics','lyrics.loading':'Loading lyrics…','lyrics.fullscreen':'Fullscreen','lyrics.region':'Song lyrics',
  'settings.account':'Account','settings.cast':'Cast Receiver','settings.notifications':'Notifications','settings.language':'Language','language.title':'Language','language.description':'Choose the language used throughout the plugin. Changes apply immediately and use no background resources.','language.system':'Follow Steam / system language',
  'notifications.description':'Steam notifications while you listen or play. Sound is off by default.','notifications.device':'Device connected','notifications.deviceHint':'Show the name of the device connecting to Cast.','notifications.connectionSound':'Connection sound','notifications.nowPlaying':'Now playing','notifications.nowPlayingHint':'Show album cover, song title and artist when a song starts.','notifications.songSound':'Song change sound','notifications.reload':'Reload preferences',
};

const dictionaries:Record<Exclude<Language,'system'|'en'>,Messages> = {
  es:{'tabs.player':'Reproductor','tabs.library':'Biblioteca','tabs.queue':'Cola','common.back':'Volver','common.previous':'Anterior','common.next':'Siguiente','common.retry':'Reintentar','common.loading':'Cargando…','common.songs':'{count} canciones','library.title':'Tu biblioteca','library.search':'Buscar','library.searchHint':'Encuentra tu próxima canción','library.castOnly':'Solo Cast','library.signInHint':'Inicia sesión para acceder a tu biblioteca, búsqueda y Me gusta.','library.signIn':'Iniciar sesión en YouTube Music','library.loading':'Cargando tu biblioteca…','library.empty':'Tus playlists aparecerán aquí.','library.open':'Abrir playlist','library.play':'Reproducir playlist','library.shuffle':'Mezclar playlist','library.refresh':'Actualizar biblioteca','library.edit':'Editar orden personalizado','library.done':'Terminar reordenado','library.moveUp':'Subir playlist','library.moveDown':'Bajar playlist','playlist.crumb':'Tu biblioteca / Playlist','playlist.back':'Volver a Biblioteca','playlist.type':'Playlist de YouTube Music','playlist.actions':'Acciones de playlist','playlist.playAll':'Reproducir todo','playlist.shuffle':'Mezclar','playlist.playNext':'Reproducir después','playlist.addAll':'Agregar todo a la cola','playlist.opening':'Abriendo playlist…','playlist.empty':'No se encontraron canciones reproducibles.','playlist.loadingRest':'Cargando el resto de la playlist…','playlist.addQueue':'Agregar a la cola','queue.title':'A continuación','queue.loadingRest':'Cargando el resto de tu playlist…','queue.loading':'Cargando cola…','queue.empty':'Tu cola está vacía','queue.emptyHint':'Elige una playlist en Biblioteca o busca una canción.','queue.moveUp':'Subir','queue.moveDown':'Bajar','queue.done':'Listo','queue.move':'Mover canción','queue.remove':'Quitar canción','search.eyebrow':'Tu música','search.title':'Encuentra tu próxima canción','search.placeholder':'Canción o artista','search.button':'Buscar','search.hint':'Busca por canción o artista.','search.empty':'No se encontraron canciones. Prueba otro título o artista.','search.back':'Volver','player.setupCast':'Configurar Cast','player.deviceShuffle':'Mezcla y repetición: usa tu dispositivo.','player.stop':'Detener','player.stopping':'Deteniendo…','player.lyrics':'Letras','player.nothing':'Nada reproduciéndose','player.find':'Busca una canción en Biblioteca','lyrics.title':'Letras','lyrics.loading':'Cargando letras…','lyrics.fullscreen':'Pantalla completa','lyrics.region':'Letra de la canción','settings.account':'Cuenta','settings.cast':'Receptor Cast','settings.notifications':'Notificaciones','settings.language':'Idioma','language.title':'Idioma','language.description':'Elige el idioma de todo el plugin. El cambio se aplica de inmediato y no consume recursos en segundo plano.','language.system':'Usar el idioma de Steam o del sistema','notifications.description':'Notificaciones de Steam mientras escuchas o juegas. El sonido está desactivado por defecto.','notifications.device':'Dispositivo conectado','notifications.deviceHint':'Muestra el nombre del dispositivo que se conecta por Cast.','notifications.connectionSound':'Sonido de conexión','notifications.nowPlaying':'Reproduciendo ahora','notifications.nowPlayingHint':'Muestra portada, canción y artista cuando inicia una pista.','notifications.songSound':'Sonido al cambiar canción','notifications.reload':'Recargar preferencias'},
  fr:{'tabs.player':'Lecteur','tabs.library':'Bibliothèque','tabs.queue':'File','common.back':'Retour','common.previous':'Précédent','common.next':'Suivant','common.retry':'Réessayer','common.loading':'Chargement…','common.songs':'{count} titres','library.title':'Votre bibliothèque','library.search':'Rechercher','library.searchHint':'Trouvez votre prochain titre','library.loading':'Chargement de la bibliothèque…','library.open':'Ouvrir la playlist','library.play':'Lire la playlist','library.shuffle':'Lecture aléatoire','playlist.back':'Retour à la bibliothèque','playlist.playAll':'Tout lire','playlist.shuffle':'Aléatoire','playlist.playNext':'Lire ensuite','playlist.addAll':'Tout ajouter','playlist.opening':'Ouverture de la playlist…','playlist.loadingRest':'Chargement du reste de la playlist…','playlist.addQueue':'Ajouter à la file','queue.title':'À suivre','queue.loading':'Chargement de la file…','queue.empty':'Votre file est vide','search.title':'Trouvez votre prochain titre','search.placeholder':'Titre ou artiste','search.button':'Rechercher','player.stop':'Arrêter','player.stopping':'Arrêt…','player.lyrics':'Paroles','lyrics.title':'Paroles','lyrics.loading':'Chargement des paroles…','settings.account':'Compte','settings.cast':'Récepteur Cast','settings.notifications':'Notifications','settings.language':'Langue','language.title':'Langue','language.description':'Choisissez la langue du plugin. Le changement est immédiat et ne consomme aucune ressource en arrière-plan.','language.system':'Suivre la langue de Steam / du système'},
  de:{'tabs.player':'Player','tabs.library':'Bibliothek','tabs.queue':'Warteschlange','common.back':'Zurück','common.previous':'Zurück','common.next':'Weiter','common.retry':'Erneut versuchen','common.loading':'Wird geladen…','common.songs':'{count} Titel','library.title':'Deine Bibliothek','library.search':'Suchen','library.searchHint':'Finde deinen nächsten Song','library.loading':'Bibliothek wird geladen…','library.open':'Playlist öffnen','library.play':'Playlist abspielen','library.shuffle':'Playlist mischen','playlist.back':'Zurück zur Bibliothek','playlist.playAll':'Alle abspielen','playlist.shuffle':'Mischen','playlist.playNext':'Als Nächstes','playlist.addAll':'Alle hinzufügen','playlist.opening':'Playlist wird geöffnet…','playlist.loadingRest':'Rest der Playlist wird geladen…','playlist.addQueue':'Zur Warteschlange','queue.title':'Als Nächstes','queue.loading':'Warteschlange wird geladen…','queue.empty':'Deine Warteschlange ist leer','search.title':'Finde deinen nächsten Song','search.placeholder':'Song oder Künstler','search.button':'Suchen','player.stop':'Stopp','player.stopping':'Wird gestoppt…','player.lyrics':'Songtext','lyrics.title':'Songtext','lyrics.loading':'Songtext wird geladen…','settings.account':'Konto','settings.cast':'Cast-Empfänger','settings.notifications':'Benachrichtigungen','settings.language':'Sprache','language.title':'Sprache','language.description':'Wähle die Sprache des Plugins. Änderungen gelten sofort und benötigen keine Hintergrundressourcen.','language.system':'Steam-/Systemsprache verwenden'},
  pt:{'tabs.player':'Player','tabs.library':'Biblioteca','tabs.queue':'Fila','common.back':'Voltar','common.previous':'Anterior','common.next':'Próxima','common.retry':'Tentar novamente','common.loading':'Carregando…','common.songs':'{count} músicas','library.title':'Sua biblioteca','library.search':'Pesquisar','library.searchHint':'Encontre sua próxima música','library.loading':'Carregando sua biblioteca…','library.open':'Abrir playlist','library.play':'Reproduzir playlist','library.shuffle':'Embaralhar playlist','playlist.back':'Voltar à Biblioteca','playlist.playAll':'Reproduzir tudo','playlist.shuffle':'Embaralhar','playlist.playNext':'Tocar a seguir','playlist.addAll':'Adicionar tudo','playlist.opening':'Abrindo playlist…','playlist.loadingRest':'Carregando o restante da playlist…','playlist.addQueue':'Adicionar à fila','queue.title':'A seguir','queue.loading':'Carregando fila…','queue.empty':'Sua fila está vazia','search.title':'Encontre sua próxima música','search.placeholder':'Música ou artista','search.button':'Pesquisar','player.stop':'Parar','player.stopping':'Parando…','player.lyrics':'Letras','lyrics.title':'Letras','lyrics.loading':'Carregando letras…','settings.account':'Conta','settings.cast':'Receptor Cast','settings.notifications':'Notificações','settings.language':'Idioma','language.title':'Idioma','language.description':'Escolha o idioma do plugin. A alteração é imediata e não usa recursos em segundo plano.','language.system':'Usar idioma do Steam / sistema'},
  it:{'tabs.player':'Lettore','tabs.library':'Libreria','tabs.queue':'Coda','common.back':'Indietro','common.previous':'Precedente','common.next':'Successivo','common.retry':'Riprova','common.loading':'Caricamento…','common.songs':'{count} brani','library.title':'La tua libreria','library.search':'Cerca','library.searchHint':'Trova il prossimo brano','library.loading':'Caricamento libreria…','library.open':'Apri playlist','library.play':'Riproduci playlist','library.shuffle':'Casuale','playlist.back':'Torna alla Libreria','playlist.playAll':'Riproduci tutto','playlist.shuffle':'Casuale','playlist.playNext':'Riproduci dopo','playlist.addAll':'Aggiungi tutto','playlist.opening':'Apertura playlist…','playlist.loadingRest':'Caricamento del resto della playlist…','playlist.addQueue':'Aggiungi alla coda','queue.title':'In coda','queue.loading':'Caricamento coda…','queue.empty':'La coda è vuota','search.title':'Trova il prossimo brano','search.placeholder':'Brano o artista','search.button':'Cerca','player.stop':'Stop','player.stopping':'Arresto…','player.lyrics':'Testo','lyrics.title':'Testo','lyrics.loading':'Caricamento testo…','settings.account':'Account','settings.cast':'Ricevitore Cast','settings.notifications':'Notifiche','settings.language':'Lingua','language.title':'Lingua','language.description':'Scegli la lingua del plugin. La modifica è immediata e non usa risorse in background.','language.system':'Usa la lingua di Steam / sistema'},
  ja:{'tabs.player':'プレーヤー','tabs.library':'ライブラリ','tabs.queue':'キュー','common.back':'戻る','common.previous':'前へ','common.next':'次へ','common.retry':'再試行','common.loading':'読み込み中…','common.songs':'{count} 曲','library.title':'ライブラリ','library.search':'検索','library.searchHint':'次の曲を探す','library.loading':'ライブラリを読み込み中…','library.open':'プレイリストを開く','library.play':'プレイリストを再生','library.shuffle':'シャッフル再生','playlist.back':'ライブラリに戻る','playlist.playAll':'すべて再生','playlist.shuffle':'シャッフル','playlist.playNext':'次に再生','playlist.addAll':'すべてキューに追加','playlist.opening':'プレイリストを開いています…','playlist.loadingRest':'残りの曲を読み込み中…','playlist.addQueue':'キューに追加','queue.title':'次に再生','queue.loading':'キューを読み込み中…','queue.empty':'キューは空です','search.title':'次の曲を探す','search.placeholder':'曲名またはアーティスト','search.button':'検索','player.stop':'停止','player.stopping':'停止中…','player.lyrics':'歌詞','lyrics.title':'歌詞','lyrics.loading':'歌詞を読み込み中…','settings.account':'アカウント','settings.cast':'Cast レシーバー','settings.notifications':'通知','settings.language':'言語','language.title':'言語','language.description':'プラグイン全体の言語を選択します。変更はすぐに反映され、バックグラウンド処理は増えません。','language.system':'Steam / システム言語を使用'},
};

Object.assign(en, {
  'language.choose':'Interface language','language.translate':'Translate lyrics','language.translateHint':'Off by default. When enabled, lyric text is sent to MyMemory for translation when you open Lyrics. Your cookies are never sent. Translation may be unavailable or inaccurate.','language.translationLanguage':'Translation language','language.follow':'Follow interface language',
  'player.shuffle':'Shuffle','player.repeat':'Repeat','common.on':'On','common.off':'Off','player.one':'One','player.all':'All','player.pause':'Pause','player.play':'Play','player.like':'Like','player.dislike':'Dislike','player.stopHint':'Stop playback, clear queue and unlink Cast',
  'settings.accountTitle':'Your account','settings.importTitle':'Import from Firefox or a Firefox-based browser','settings.importHint':'For automatic import, sign in to music.youtube.com in Firefox, Zen, LibreWolf, Waterfox or Floorp in Desktop Mode, then close the browser. Your saved session is replaced only after validation.','settings.supported':'Supported browsers','settings.manualAvailable':'Manual request-header import is also available in Advanced setup below.','settings.import':'Import cookies','settings.importing':'Importing…','settings.authenticated':'Authenticated ✓','settings.signOut':'Sign Out','settings.castOnlyHint':'Cast only is available without signing in. Add your account below to unlock your library, search, likes and lyrics.','settings.hideManual':'Hide manual import','settings.showManual':'Advanced: import request headers manually','settings.manual1':'1. Open music.youtube.com, sign in and press F12 to open Developer Tools.','settings.manual2':'2. Select Network, then open Library so YouTube Music sends new requests.','settings.manual3':'3. Find a successful POST request named browse (status 200).','settings.manual4':'4. Right-click the request → Copy → Copy request headers.','settings.manual5':'5. Paste the copied headers into a plain-text file named yt-music-headers.txt. Do not reformat them.','settings.manual6':'6. Save or transfer it to /home/deck/yt-music-headers.txt.','settings.manual7':'7. Confirm the path below and select Load & Connect.','settings.loadConnect':'Load & Connect','settings.castTitle':'Listen from your phone','settings.deviceName':'Cast device name','settings.saveDeviceName':'Save device name','settings.advertised':'Currently advertised as: {name}','settings.castHint':'Use YouTube or YouTube Music on your phone and choose your Deck as a Cast device. Use Stop in Player to end the session.','settings.network':'Current network','settings.notDetected':'Not detected','settings.trust':'Trust this network','settings.untrust':'Disable Cast on this network','settings.castEnabled':'Cast receiver is enabled on this network ✓','settings.restartHint':'Restart if playback or progress on your phone no longer matches the plugin, or the phone keeps loading without starting Cast. Reconnect afterward.','settings.restart':'Restart Cast receiver',
});
Object.assign(dictionaries.es, {
  'language.choose':'Idioma de la interfaz','language.translate':'Traducir letras','language.translateHint':'Desactivado por defecto. Al activarlo, el texto de las letras se envía a MyMemory al abrir Letras. Nunca se envían tus cookies. La traducción puede no estar disponible o ser imprecisa.','language.translationLanguage':'Idioma de traducción','language.follow':'Usar idioma de la interfaz',
  'player.shuffle':'Aleatorio','player.repeat':'Repetir','common.on':'Sí','common.off':'No','player.one':'Una','player.all':'Todas','player.pause':'Pausar','player.play':'Reproducir','player.like':'Me gusta','player.dislike':'No me gusta','player.stopHint':'Detener, vaciar la cola y desvincular Cast',
  'settings.accountTitle':'Tu cuenta','settings.importTitle':'Importar desde Firefox o un navegador derivado','settings.importHint':'Para importar automáticamente, inicia sesión en music.youtube.com desde Firefox, Zen, LibreWolf, Waterfox o Floorp en modo escritorio y cierra el navegador. Tu sesión guardada solo se reemplaza después de validarla.','settings.supported':'Navegadores compatibles','settings.manualAvailable':'También puedes importar las cabeceras de forma manual en Configuración avanzada.','settings.import':'Importar cookies','settings.importing':'Importando…','settings.authenticated':'Sesión iniciada ✓','settings.signOut':'Cerrar sesión','settings.castOnlyHint':'Puedes usar Cast sin iniciar sesión. Agrega tu cuenta para usar biblioteca, búsqueda, Me gusta y letras.','settings.hideManual':'Ocultar importación manual','settings.showManual':'Avanzado: importar cabeceras manualmente','settings.manual1':'1. Abre music.youtube.com, inicia sesión y presiona F12 para abrir las herramientas de desarrollo.','settings.manual2':'2. En Red (Network), abre Biblioteca para generar nuevas solicitudes.','settings.manual3':'3. Busca una solicitud POST exitosa llamada browse (estado 200).','settings.manual4':'4. Haz clic derecho en la solicitud → Copiar → Copiar cabeceras de la solicitud.','settings.manual5':'5. Pega las cabeceras en un archivo de texto llamado yt-music-headers.txt. No las modifiques.','settings.manual6':'6. Guarda o transfiere el archivo a /home/deck/yt-music-headers.txt.','settings.manual7':'7. Confirma la ruta y elige Cargar y conectar.','settings.loadConnect':'Cargar y conectar','settings.castTitle':'Escucha desde tu teléfono','settings.deviceName':'Nombre del dispositivo Cast','settings.saveDeviceName':'Guardar nombre','settings.advertised':'Nombre visible: {name}','settings.castHint':'En YouTube o YouTube Music de tu teléfono, selecciona tu Deck como dispositivo Cast. Usa Detener en el reproductor para terminar la sesión.','settings.network':'Red actual','settings.notDetected':'No detectada','settings.trust':'Confiar en esta red','settings.untrust':'Desactivar Cast en esta red','settings.castEnabled':'El receptor Cast está activo en esta red ✓','settings.restartHint':'Reinicia si el progreso del teléfono no coincide con el plugin o si el teléfono se queda cargando sin iniciar Cast. Después, vuelve a conectarlo.','settings.restart':'Reiniciar receptor Cast',
});

const catalogText:Record<string,string[]>={
  en:['All','Songs','Playlists','Albums','Artists','Singles & EPs','Song','Playlist','Album','Artist','Filter library','Open','Play song','Added to queue','Load more','No results available.','Search songs, albums, artists or playlists.','Browse your music','Could not connect. Please retry.','Translating…','Retry translation'],
  es:['Todo','Canciones','Playlists','Álbumes','Artistas','Sencillos y EPs','Canción','Playlist','Álbum','Artista','Filtrar biblioteca','Abrir','Reproducir canción','Agregado a la cola','Cargar más','No hay resultados disponibles.','Busca canciones, álbumes, artistas o playlists.','Explora tu música','No se pudo conectar. Intenta de nuevo.','Traduciendo…','Reintentar traducción'],
  fr:['Tout','Titres','Playlists','Albums','Artistes','Singles et EP','Titre','Playlist','Album','Artiste','Filtrer la bibliothèque','Ouvrir','Lire le titre','Ajouté à la file','Charger plus','Aucun résultat disponible.','Recherchez des titres, albums, artistes ou playlists.','Explorez votre musique','Connexion impossible. Réessayez.','Traduction…','Réessayer la traduction'],
  de:['Alle','Titel','Playlists','Alben','Künstler','Singles und EPs','Titel','Playlist','Album','Künstler','Bibliothek filtern','Öffnen','Titel abspielen','Zur Warteschlange hinzugefügt','Mehr laden','Keine Ergebnisse verfügbar.','Suche Titel, Alben, Künstler oder Playlists.','Musik entdecken','Verbindung fehlgeschlagen. Bitte erneut versuchen.','Übersetzung…','Übersetzung wiederholen'],
  pt:['Tudo','Músicas','Playlists','Álbuns','Artistas','Singles e EPs','Música','Playlist','Álbum','Artista','Filtrar biblioteca','Abrir','Reproduzir música','Adicionado à fila','Carregar mais','Nenhum resultado disponível.','Pesquise músicas, álbuns, artistas ou playlists.','Explore sua música','Falha na conexão. Tente novamente.','Traduzindo…','Tentar tradução novamente'],
  it:['Tutto','Brani','Playlist','Album','Artisti','Singoli ed EP','Brano','Playlist','Album','Artista','Filtra libreria','Apri','Riproduci brano','Aggiunto alla coda','Carica altro','Nessun risultato disponibile.','Cerca brani, album, artisti o playlist.','Esplora la tua musica','Connessione non riuscita. Riprova.','Traduzione…','Riprova traduzione'],
  ja:['すべて','曲','プレイリスト','アルバム','アーティスト','シングルとEP','曲','プレイリスト','アルバム','アーティスト','ライブラリを絞り込む','開く','曲を再生','キューに追加しました','さらに読み込む','結果がありません。','曲、アルバム、アーティスト、プレイリストを検索。','音楽を探す','接続できません。再試行してください。','翻訳中…','翻訳を再試行'],
};
const catalogKeys=['all','songs','playlists','albums','artists','singles','song','playlist','album','artist','filter','open','playSong','queued','more','empty','searchHint','browse','connectionError'];
for(const [locale,labels] of Object.entries(catalogText)){
  const target=locale==='en'?en:dictionaries[locale as keyof typeof dictionaries];
  catalogKeys.forEach((key,index)=>{target['catalog.'+key]=labels[index];});
  target['lyrics.translating']=labels[19];target['lyrics.retryTranslation']=labels[20];
}
const catalogExtras:Record<string,string[]>={
  en:['Related artists','Loading more of your library…','Off by default. Lyrics are sent to MyMemory, with Apertium as a fallback for supported languages. Cookies are never sent. Free services have availability and accuracy limits.'],
  es:['Artistas similares','Cargando más de tu biblioteca…','Desactivado por defecto. Las letras se envían a MyMemory, con Apertium como respaldo para idiomas compatibles. Nunca se envían tus cookies. Los servicios gratuitos tienen límites de disponibilidad y precisión.'],
  fr:['Artistes similaires','Chargement de la bibliothèque…','Désactivé par défaut. Les paroles sont envoyées à MyMemory, avec Apertium en secours pour les langues prises en charge. Aucun cookie n’est envoyé. Les services gratuits ont des limites de disponibilité et de précision.'],
  de:['Ähnliche Künstler','Weitere Bibliothekseinträge werden geladen…','Standardmäßig aus. Texte werden an MyMemory gesendet; Apertium unterstützt als Ersatz einige Sprachen. Cookies werden nie gesendet. Kostenlose Dienste sind nicht immer verfügbar oder genau.'],
  pt:['Artistas relacionados','Carregando mais da biblioteca…','Desativado por padrão. As letras são enviadas ao MyMemory, com Apertium como alternativa para idiomas compatíveis. Cookies nunca são enviados. Serviços gratuitos têm limites de disponibilidade e precisão.'],
  it:['Artisti simili','Caricamento della libreria…','Disattivato per impostazione predefinita. I testi vengono inviati a MyMemory, con Apertium come alternativa per le lingue supportate. I cookie non vengono mai inviati. I servizi gratuiti hanno limiti di disponibilità e precisione.'],
  ja:['関連アーティスト','ライブラリを追加読み込み中…','初期設定はオフです。歌詞をMyMemoryに送信し、対応言語ではApertiumを代替として使用します。Cookieは送信しません。無料サービスの可用性と精度には制限があります。'],
};
for(const [locale,labels] of Object.entries(catalogExtras)){
  const target=locale==='en'?en:dictionaries[locale as keyof typeof dictionaries];
  target['catalog.relatedArtists']=labels[0];target['catalog.loadingRest']=labels[1];target['language.translateHint']=labels[2];
}

const libraryLabels:Record<string,string[]>={
  en:['Your saved playlists','Your saved albums','Your saved songs','Your saved artists','Sort','Custom','YouTube Music order'],
  es:['Tus playlists guardadas','Tus álbumes guardados','Tus canciones guardadas','Tus artistas guardados','Ordenar','Personalizado','Orden de YouTube Music'],
  fr:['Vos playlists enregistrées','Vos albums enregistrés','Vos titres enregistrés','Vos artistes enregistrés','Trier','Personnalisé','Ordre YouTube Music'],
  de:['Deine gespeicherten Playlists','Deine gespeicherten Alben','Deine gespeicherten Titel','Deine gespeicherten Künstler','Sortieren','Benutzerdefiniert','YouTube Music-Reihenfolge'],
  pt:['Suas playlists salvas','Seus álbuns salvos','Suas músicas salvas','Seus artistas salvos','Ordenar','Personalizado','Ordem do YouTube Music'],
  it:['Le tue playlist salvate','I tuoi album salvati','I tuoi brani salvati','I tuoi artisti salvati','Ordina','Personalizzato','Ordine YouTube Music'],
  ja:['保存したプレイリスト','保存したアルバム','保存した曲','保存したアーティスト','並べ替え','カスタム','YouTube Musicの順序'],
};
for(const [locale,labels] of Object.entries(libraryLabels)){
  const target=locale==='en'?en:dictionaries[locale as keyof typeof dictionaries];
  ['playlistsTitle','albumsTitle','songsTitle','artistsTitle','sort','custom','defaultOrder'].forEach((key,index)=>target[`library.${key}`]=labels[index]);
}

const restartLabels:Record<Exclude<Language,'system'>,string[]>={
  en:['Restarting Cast receiver…','Cast receiver restarted.','Could not restart Cast receiver.'],
  es:['Reiniciando el receptor Cast…','Receptor Cast reiniciado.','No se pudo reiniciar el receptor Cast.'],
  fr:['Redémarrage du récepteur Cast…','Récepteur Cast redémarré.','Impossible de redémarrer le récepteur Cast.'],
  de:['Cast-Empfänger wird neu gestartet…','Cast-Empfänger neu gestartet.','Cast-Empfänger konnte nicht neu gestartet werden.'],
  pt:['Reiniciando o receptor Cast…','Receptor Cast reiniciado.','Não foi possível reiniciar o receptor Cast.'],
  it:['Riavvio del ricevitore Cast…','Ricevitore Cast riavviato.','Impossibile riavviare il ricevitore Cast.'],
  ja:['Cast レシーバーを再起動中…','Cast レシーバーを再起動しました。','Cast レシーバーを再起動できませんでした。'],
};
for(const [locale,labels] of Object.entries(restartLabels)){
  const target=locale==='en'?en:dictionaries[locale as keyof typeof dictionaries];
  ['restarting','restarted','restartFailed'].forEach((key,index)=>target[`settings.${key}`]=labels[index]);
}

// Read each preference once; setters and storage events keep the cache current.
let cachedRawLanguage: Language | undefined;
let cachedTranslateLyrics: boolean | undefined;
let cachedTranslationLanguage: TranslationLanguage | undefined;
function invalidatePreferences(){cachedRawLanguage=undefined;cachedTranslateLyrics=undefined;cachedTranslationLanguage=undefined;}
/** Observe other Steam windows for the plugin lifetime, including while QAM is closed. */
export function initI18nPreferences(){
  invalidatePreferences();
  const onStorage=(event:StorageEvent)=>{
    if(event.storageArea && event.storageArea!==localStorage)return;
    if(event.key!==null && ![STORAGE_KEY,TRANSLATE_KEY,TRANSLATE_LANGUAGE_KEY].includes(event.key))return;
    invalidatePreferences();
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  const onSystemLanguage=()=>window.dispatchEvent(new Event(CHANGE_EVENT));
  window.addEventListener('storage',onStorage);
  window.addEventListener('languagechange',onSystemLanguage);
  return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener('languagechange',onSystemLanguage);invalidatePreferences();};
}
function persistPreference(key:string,value:string){try{localStorage.setItem(key,value);}catch{/* Retain the setting for this session when storage is unavailable. */}}
function savedLanguage():Language {
  if (cachedRawLanguage !== undefined) return cachedRawLanguage;
  try { const value=localStorage.getItem(STORAGE_KEY) as Language|null; cachedRawLanguage = languageOptions.some(option=>option.id===value) ? value! : 'system'; }
  catch { cachedRawLanguage = 'system'; }
  return cachedRawLanguage;
}
function resolvedLanguage(value:Language):Exclude<Language,'system'> {
  if (value !== 'system') return value;
  const code=(navigator.language || 'en').toLowerCase().split('-')[0];
  return (['en','es','fr','de','pt','it','ja'] as const).includes(code as any) ? code as Exclude<Language,'system'> : 'en';
}
export function getLanguage(){ return savedLanguage(); }
export function getResolvedLanguage(){ return resolvedLanguage(savedLanguage()); }
export function getTranslateLyricsEnabled(){
  if (cachedTranslateLyrics !== undefined) return cachedTranslateLyrics;
  try { cachedTranslateLyrics = localStorage.getItem(TRANSLATE_KEY) === 'true'; } catch { cachedTranslateLyrics = false; }
  return cachedTranslateLyrics;
}
export function setTranslateLyricsEnabled(value:boolean){ persistPreference(TRANSLATE_KEY,String(value)); cachedTranslateLyrics = value; window.dispatchEvent(new Event(CHANGE_EVENT)); }
export function getTranslationLanguage():TranslationLanguage {
  if (cachedTranslationLanguage !== undefined) return cachedTranslationLanguage;
  try { const value=localStorage.getItem(TRANSLATE_LANGUAGE_KEY); cachedTranslationLanguage = value && languageOptions.some(option=>option.id===value && value!=='system') ? value as TranslationLanguage : 'follow'; }
  catch { cachedTranslationLanguage = 'follow'; }
  return cachedTranslationLanguage;
}
export function getResolvedTranslationLanguage(){ const value=getTranslationLanguage(); return value==='follow' ? getResolvedLanguage() : value; }
export function setTranslationLanguage(value:TranslationLanguage){ if (value!=='follow' && !languageOptions.some(option=>option.id!=='system' && option.id===value)) return; persistPreference(TRANSLATE_LANGUAGE_KEY,value); cachedTranslationLanguage = value; window.dispatchEvent(new Event(CHANGE_EVENT)); }
export function setLanguage(value:Language){ if(!languageOptions.some(option=>option.id===value))return; persistPreference(STORAGE_KEY,value); cachedRawLanguage = value; window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:value})); }
export function translate(key:string, values:Record<string,string|number>={}) {
  const language=resolvedLanguage(savedLanguage());
  let value=(language === 'en' ? en[key] : dictionaries[language]?.[key]) || en[key] || key;
  for (const [name,replacement] of Object.entries(values)) value=value.split(`{${name}}`).join(String(replacement));
  return value;
}
export function useI18n(){
  const [,setRevision]=useState(0);
  useEffect(()=>{ const update=()=>setRevision(value=>value+1); window.addEventListener(CHANGE_EVENT,update); return()=>window.removeEventListener(CHANGE_EVENT,update); },[]);
  return { t:translate, language:getLanguage(), setLanguage, resolvedLanguage:getResolvedLanguage(), translateLyrics:getTranslateLyricsEnabled(), setTranslateLyrics:setTranslateLyricsEnabled, translationLanguage:getTranslationLanguage(), resolvedTranslationLanguage:getResolvedTranslationLanguage(), setTranslationLanguage };
}
