import { Player, Constants } from 'yt-cast-receiver';
import { randomUUID } from 'node:crypto';
import type { Volume, Video } from 'yt-cast-receiver';
import { extractAudioInfo, type AudioInfo } from './ytdlp.js';
import type { WsManager } from './wsManager.js';
import type { JsonDataStore } from './JsonDataStore.js';

export interface CastPlayerOptions {
  ytdlpPath: string;
  wsManager: WsManager;
  dataStore: JsonDataStore;
}

export class CastPlayer extends Player {
  private ytdlpPath: string;
  private ws: WsManager;
  private store: JsonDataStore;
  private currentVolume: Volume = { level: 100, muted: false };
  private currentPosition: number = 0;
  private currentDuration: number = 0;
  private currentTrackInfo: AudioInfo | null = null;
  private playing: boolean = false;
  private lastSenderActivity: number = 0;
  private sessionCleared: boolean = true;
  private playbackGeneration = 0;
  private playbackId: string | null = null;
  private endedPlaybackId: string | null = null;
  private retryingPlaybackId: string | null = null;
  private retriedPlaybackId: string | null = null;
  private failedTracks = 0;
  private lastSenderSync = 0;
  private lastProgressSync = 0;
  private progressHeartbeat: ReturnType<typeof setInterval> | null = null;
  private lastAudioReport = 0;
  private stopHeartbeat() {
    if (this.progressHeartbeat) clearInterval(this.progressHeartbeat);
    this.progressHeartbeat = null;
    this.lastAudioReport = 0;
  }
  private armHeartbeat() {
    if (this.progressHeartbeat || !this.playing) return;
    this.progressHeartbeat = setInterval(() => {
      // Bridge short overlay throttling only. Never invent indefinite playback.
      if (!this.playing || this.sessionCleared || Date.now() - this.lastAudioReport > 15000) {
        this.currentPosition = this.estimatedPosition();
        this.stopHeartbeat(); return;
      }
      void this.syncSender(this.playbackId).catch(err => console.warn('[YTCast] Heartbeat failed:', err));
    }, 5000);
    this.progressHeartbeat.unref?.();
  }
  private playRequest = 0;
  private activePlayRequest = 0;
  private extractionFailure: { id:string; generation:number } | null = null;
  private playChain: Promise<void> = Promise.resolve();
  private deckOrder: string[] | null = null;

  /** An incoming sender playlist takes priority over a Deck-side arrangement. */
  clearDeckOrder(): void { this.deckOrder = null; }

  async appendTracks(tracks: Array<{videoId?: string; title?: string; artist?: string; albumArt?: string; duration?: number}>, next = false) {
    const current = this.queue.current;
    const ids = this.deckOrder ?? this.queue.videoIds;
    if (this.sessionCleared || !current || !ids.includes(current.id))
      return { ok:false, message:'Cast session ended. Please try again.' };
    if (!Array.isArray(tracks) || !tracks.length || tracks.length > 10000 ||
        tracks.some(t => !t || typeof t.videoId !== 'string' || !/^[\w-]{1,64}$/.test(t.videoId)))
      return { ok:false, message:'Invalid playlist.' };
    const order = [...ids], seen = new Set(ids);
    let added = 0;
    for (const track of tracks) {
      const id = track.videoId!;
      // The Cast receiver identifies entries by ID. Keep each ID unambiguous.
      if (seen.has(id)) continue;
      seen.add(id); order.push(id); added++;
      this.metadataCache.set(id, { videoId:id, title:String(track.title || id), artist:String(track.artist || ''),
        albumArt:String(track.albumArt || ''), duration:Number(track.duration) || 0, url:'' });
    }
    if (next) {
      const requested = [...new Set(tracks.map(t => t.videoId!))].filter(id => id !== current.id);
      const set = new Set(requested);
      const remaining = order.filter(id => !set.has(id));
      remaining.splice(remaining.indexOf(current.id) + 1, 0, ...requested);
      this.deckOrder = remaining;
    } else this.deckOrder = order;
    this.ws.broadcast('queue', this.getQueueWithMetadata());
    await this.notifyExternalStateChange();
    return { ok:true, added };
  }

  async queueNext(metadata: { videoId?: string; title?: string; artist?: string; albumArt?: string }) {
    const ids = this.deckOrder ?? this.queue.videoIds;
    const current = this.queue.current;
    const id = metadata?.videoId;
    if (this.sessionCleared || !current || typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id))
      return { ok:false, message:'No active Cast session or invalid song.' };
    if (ids.includes(id)) return this.editQueue(ids.indexOf(id), 'next', [...ids]);
    const index = ids.indexOf(current.id);
    if (index < 0) return { ok:false, message:'Queue changed. Please try again.' };
    this.deckOrder = [...ids];
    this.deckOrder.splice(index + 1, 0, id);
    this.metadataCache.set(id, { videoId:id, title:String(metadata.title || id), artist:String(metadata.artist || ''), albumArt:String(metadata.albumArt || ''), duration:0, url:'' });
    this.ws.broadcast('queue', this.getQueueWithMetadata());
    await this.notifyExternalStateChange();
    return { ok:true };
  }

  async editQueue(index: number, action: string, expectedIds: string[]) {
    const ids = this.deckOrder ?? this.queue.videoIds;
    const current = this.queue.current;
    if (this.sessionCleared || !current || !Array.isArray(expectedIds) ||
        expectedIds.length !== ids.length || expectedIds.some((id, i) => id !== ids[i]))
      return { ok:false, message:'Queue changed. Please try again.' };
    if (!Number.isInteger(index) || index < 0 || index >= ids.length)
      return { ok:false, message:'Invalid queue position' };
    // The receiver identifies songs by videoId; ambiguous occurrences cannot be edited safely.
    if (new Set(ids).size !== ids.length)
      return { ok:false, message:'This Cast queue contains duplicates. Arrange it on your device.' };
    const playing = ids.indexOf(current.id);
    if (playing < 0) return { ok:false, message:'No current song' };
    const target = action === 'next' ? (index < playing ? playing : playing + 1)
      : action === 'up' ? index - 1 : action === 'down' ? index + 1 : -1;
    if (action === 'next' && index === playing) return { ok:false, message:'This song is already playing' };
    if (target < 0 || target >= ids.length) return { ok:false, message:'Invalid destination' };
    const order = [...ids];
    order.splice(target, 0, order.splice(index, 1)[0]);
    this.deckOrder = order;
    this.ws.broadcast('queue', this.getQueueWithMetadata());
    await this.notifyExternalStateChange();
    return { ok:true, ...this.getQueueWithMetadata() };
  }

  private orderedVideo(index: number): Video | null {
    const current = this.queue.current;
    const id = this.deckOrder?.[index];
    if (!current || !id) return null;
    // Do not keep the original playlist index/params after rearranging its songs.
    return { id, client:current.client } as Video;
  }

  override getNavInfo() {
    if (!this.deckOrder) return super.getNavInfo();
    const position = this.deckOrder.indexOf(this.queue.current?.id ?? '');
    return { hasPrevious:position > 0, hasNext:position >= 0 && position < this.deckOrder.length - 1, autoplayMode:this.autoplayMode };
  }

  override async getState() {
    const original = await super.getState();
    // Playlist updates mutate context.index in place. Preserve a snapshot so
    // the receiver can still compare it with the next state correctly.
    const state = { ...original, queue:{ ...original.queue,
      videoIds:[...original.queue.videoIds], current:original.queue.current
        ? { ...original.queue.current, context:{ ...original.queue.current.context } } : null } };
    if (!this.deckOrder) return state;
    const position = this.deckOrder.indexOf(state.queue.current?.id ?? '');
    return { ...state, queue:{ ...state.queue, videoIds:[...this.deckOrder],
      current:state.queue.current ? { ...state.queue.current, context:{ ...state.queue.current.context, index:position } } : null,
      previous:this.orderedVideo(position - 1), next:this.orderedVideo(position + 1), autoplay:null } };
  }

  override async next(AID?: number | null): Promise<boolean> {
    if (!this.deckOrder) {
      const state = this.queue.getState();
      const index = this.queue.videoIds.indexOf(state.current?.id ?? '');
      const nextId = index >= 0 ? this.queue.videoIds[index + 1] : undefined;
      // setAsCurrent() does not refresh the library's cached neighbours after
      // a Deck queue jump. Do not replay a stale cached next/previous song.
      if (nextId && !this.queue.isUpdating && state.next?.id !== nextId) return this.playVideoById(nextId);
      return super.next(AID);
    }
    const position = this.deckOrder.indexOf(this.queue.current?.id ?? '');
    const video = position >= 0 ? this.orderedVideo(position + 1) : null;
    if (video) return this.play(video, 0, AID);
    await this.stop(AID);
    return false;
  }

  override async previous(AID?: number | null): Promise<boolean> {
    if (!this.deckOrder) {
      const state = this.queue.getState();
      const index = this.queue.videoIds.indexOf(state.current?.id ?? '');
      const previousId = index > 0 ? this.queue.videoIds[index - 1] : undefined;
      if (previousId && !this.queue.isUpdating && state.previous?.id !== previousId) return this.playVideoById(previousId);
      return super.previous(AID);
    }
    const video = this.orderedVideo(this.deckOrder.indexOf(this.queue.current?.id ?? '') - 1);
    return video ? this.play(video, 0, AID) : false;
  }

  override play(video: Video, position?: number, AID?: number | null): Promise<boolean> {
    const request = ++this.playRequest;
    // Cancel extraction for a superseded request, then let the library finish
    // its status transition before the newest play begins. Otherwise an old
    // failed extraction can set STOPPED after a newer song is already playing.
    this.playbackGeneration++;
    const operation = this.playChain.then(async () => {
      if (request !== this.playRequest) return false;
      this.activePlayRequest = request;
      let candidate = video;
      const visited = new Set<string>();
      for (let attempt = 0; attempt < 5; attempt++) {
        visited.add(candidate.id);
        this.extractionFailure = null;
        if (await super.play(candidate, attempt === 0 ? position : 0, AID)) return true;
        const failure = this.extractionFailure as {id:string; generation:number} | null;
        if (request !== this.playRequest || !failure || failure.id !== candidate.id ||
            failure.generation !== this.playbackGeneration || this.sessionCleared) return false;
        const ids = this.deckOrder ?? this.queue.videoIds;
        const index = ids.indexOf(candidate.id);
        const nextId = index >= 0 ? ids[index + 1] : undefined;
        if (!nextId || visited.has(nextId) || attempt === 4) break;
        candidate = { id:nextId, client:candidate.client, ...(!this.deckOrder ? {
          context:{ playlistId:candidate.context?.playlistId, index:index + 1 },
        } : {}) } as Video;
      }
      // Clear stale frontend audio as well as the sender's loading state.
      // super.play already reports STOPPED on failure, so stop() would no-op.
      await this.doStop();
      return false;
    });
    this.playChain = operation.then(() => {}, () => {});
    return operation;
  }

  override async pause(AID?: number | null): Promise<boolean> {
    if ((await this.getState()).status === Constants.PLAYER_STATUSES.LOADING) {
      this.playRequest++;
      return this.stop(AID);
    }
    return super.pause(AID);
  }
  private metadataCache: Map<string, AudioInfo> = new Map();
  private enrichingMetadata = false;
  private visibleMetadata: string[] = [];
  private metadataFailures = new Map<string, number>();
  private volumeBroadcastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CastPlayerOptions) {
    super();
    this.ytdlpPath = options.ytdlpPath;
    this.ws = options.wsManager;
    this.store = options.dataStore;
    // Load persisted volume
    void this.store.get<Volume>('volume').then((vol) => {
      if (vol) this.currentVolume = vol;
    });
  }

  /**
   * Called by frontend via WebSocket 'progress' messages.
   * Updates position/duration so the library can relay to the phone.
   */
  getPlaybackId(): string | null { return this.playbackId; }

  private matchesPlayback(id: unknown): id is string {
    return typeof id === 'string' && id === this.playbackId &&
      !this.sessionCleared && !!this.currentTrackInfo;
  }

  async syncSender(id: unknown): Promise<void> {
    if (!this.matchesPlayback(id)) return;
    // An audio acknowledgement can arrive after a delayed sender transition.
    // Confirm the real state, without undoing a phone pause.
    if (this.playing && this.status !== Constants.PLAYER_STATUSES.PLAYING)
      await this.notifyExternalStateChange(Constants.PLAYER_STATUSES.PLAYING);
    const current = await this.getState();
    if (!this.matchesPlayback(id) || current.queue.current?.id !== this.currentTrackInfo?.videoId) return;
    this.lastSenderSync = Date.now();
    this.lastProgressSync = this.lastSenderSync;
    // A full snapshot makes the receiver resend nowPlaying, including after a
    // lost notification. A normal state diff can omit the unchanged video ID.
    this.emit('state', { current, previous:null });
  }

  updateProgress(currentTime: number, duration: number, id: unknown): void {
    if (!this.matchesPlayback(id) || !Number.isFinite(currentTime) || currentTime < 0 ||
        !Number.isFinite(duration) || duration < 0) return;
    this.currentPosition = currentTime;
    this.lastAudioReport = Date.now();
    this.armHeartbeat();
    if (currentTime > 2) this.failedTracks = 0;
    if (duration > 0) this.currentDuration = duration;
    // Reuse the existing progress messages; no new idle timer or polling loop.
    if (this.playing && Date.now() - this.lastSenderSync >= 30000)
      void this.syncSender(id).catch(err => console.warn('[YTCast] State sync failed:', err));
    else if (this.playing && Date.now() - this.lastProgressSync >= 5000) {
      this.lastProgressSync = Date.now();
      void this.notifyExternalStateChange(Constants.PLAYER_STATUSES.PLAYING)
        .catch(err => console.warn('[YTCast] Progress sync failed:', err));
    }
  }

  /**
   * Called by frontend via WebSocket 'ended' message.
   * Notifies the library that the track finished so it can advance.
   */
  async handleTrackEnded(id: unknown): Promise<void> {
    if (!this.matchesPlayback(id) || this.endedPlaybackId === id) return;
    this.endedPlaybackId = id as string;
    this.stopHeartbeat();
    this.playing = false;
    if (this.deckOrder) { await this.next(); return; }

    if (this.queue.hasNext) {
      console.log('[YTCast] Track ended, advancing to next');
      await this.next();
      return;
    }

    // The library's cached neighbours can be absent after a queue jump.
    // Fall back to the sender's explicit list of video IDs.
    const videoIds = this.queue.videoIds;
    const currentId = this.queue.current?.id;
    const currentIndex = currentId ? videoIds.indexOf(currentId) : -1;

    if (currentIndex >= 0 && currentIndex < videoIds.length - 1) {
      const nextId = videoIds[currentIndex + 1];
      console.log(`[YTCast] Track ended, advancing via fallback to ${nextId}`);
      await this.playVideoById(nextId);
    } else {
      console.log('[YTCast] Track ended, no more tracks in queue');
      await this.notifyExternalStateChange(Constants.PLAYER_STATUSES.STOPPED);
    }
  }

  /**
   * Called by frontend via WebSocket 'playbackError' message.
   * Re-extracts the URL and sends it again.
   */
  async handlePlaybackError(id: unknown): Promise<void> {
    if (!this.matchesPlayback(id) || !this.currentTrackInfo || this.retryingPlaybackId === id) return;
    if (this.retriedPlaybackId === id) {
      if (++this.failedTracks > 5) { await this.stop(); return; }
      this.retryingPlaybackId = id as string;
      try { await this.next(); } finally { if (this.retryingPlaybackId === id) this.retryingPlaybackId = null; }
      return;
    }
    this.retriedPlaybackId = id;
    this.retryingPlaybackId = id as string;
    const generation = this.playbackGeneration;

    try {
      const info = await extractAudioInfo(this.currentTrackInfo.videoId, this.ytdlpPath);
      if (generation !== this.playbackGeneration) return;
      this.currentTrackInfo = info;
      this.ws.broadcast('track', {
        playbackId: this.playbackId,
        videoId: info.videoId,
        title: info.title,
        artist: info.artist,
        albumArt: info.albumArt,
        duration: info.duration,
        url: info.url,
        position: this.currentPosition,
        autoplay: this.playing,
      });
    } catch (err) {
      if (generation !== this.playbackGeneration) return;
      this.ws.broadcast('error', {
        message: `Failed to re-extract URL: ${(err as Error).message}`,
        code: 'YTDLP_RETRY_FAILED',
      });
      // Try advancing to the next track
      try {
        if (++this.failedTracks > 5) await this.stop();
        else await this.next();
      } catch {
        // Nothing more we can do
      }
    } finally {
      if (this.retryingPlaybackId === id) this.retryingPlaybackId = null;
    }
  }

  /**
   * Clear player state when all senders disconnect.
   * Stops playback and broadcasts cleared state to the frontend.
   * Named to avoid shadowing Player.reset() from yt-cast-receiver.
   * Idempotent — no-ops if already cleared.
   */
  clearOnDisconnect(): void {
    this.stopHeartbeat();
    this.deckOrder = null;
    this.playRequest++;
    this.playbackGeneration++;
    this.playbackId = null;
    if (this.sessionCleared) return;
    this.playing = false;
    this.currentTrackInfo = null;
    this.currentPosition = 0;
    this.currentDuration = 0;
    this.sessionCleared = true;
    this.ws.broadcast('stop', {});
    this.ws.broadcast('queue', { tracks: [], position: -1 });
  }

  /** Record that a sender-initiated action occurred. */
  markSenderActivity(): void {
    this.lastSenderActivity = Date.now();
  }

  /** Milliseconds since the last sender-initiated action. */
  getSenderIdleMs(): number {
    if (this.lastSenderActivity === 0) return Infinity;
    return Date.now() - this.lastSenderActivity;
  }

  getCurrentTrackInfo(): AudioInfo | null {
    return this.currentTrackInfo;
  }

  isCurrentlyPlaying(): boolean {
    return this.playing;
  }

  getQueueWithMetadata(): { tracks: Array<{ videoId: string; title: string; artist: string; albumArt: string; isCurrent: boolean }>; position: number } {
    if (this.sessionCleared) return { tracks: [], position: -1 };
    const playlist = this.queue;
    const state = playlist.getState();
    const videoIds = this.deckOrder ?? playlist.videoIds;
    const currentIndex = state.current
      ? videoIds.indexOf(state.current.id)
      : -1;

    const tracks = videoIds.map((id: string) => {
      const cached = this.metadataCache.get(id);
      return {
        videoId: id,
        title: cached?.title ?? 'Loading song…',
        artist: cached?.artist ?? '',
        albumArt: cached?.albumArt ?? '',
        isCurrent: state.current?.id === id,
      };
    });

    // Fetch oEmbed metadata for uncached items in the background
    // Only enrich the nearby queue, not thousands of tracks on every UI refresh.
    const uncachedIds = videoIds.slice(Math.max(0, currentIndex - 3), Math.max(0, currentIndex) + 24)
      .filter(id => !this.metadataCache.has(id) && Date.now() - (this.metadataFailures.get(id) ?? 0) > 60000);
    if (uncachedIds.length > 0) {
      void this.enrichQueueMetadata(uncachedIds);
    }

    return { tracks, position: currentIndex };
  }

  private async enrichQueueMetadata(videoIds: string[]): Promise<void> {
    if (this.enrichingMetadata) return;
    this.enrichingMetadata = true;
    const generation = this.playbackGeneration;
    let enriched = false;
    try {
      for (const id of videoIds) {
        if (this.sessionCleared || generation !== this.playbackGeneration) break;
        if (this.metadataCache.has(id)) continue;
        const meta = await this.fetchMetadataFromOembed(id);
        if (this.sessionCleared || generation !== this.playbackGeneration) break;
        if (meta) {
          this.metadataCache.set(id, { videoId:id, ...meta, duration:0, url:'' });
          enriched = true;
          // Show each result immediately instead of waiting for the entire batch.
          this.ws.broadcast('queue', this.getQueueWithMetadata());
        } else {
          this.metadataFailures.set(id, Date.now());
          if (this.metadataFailures.size > 128) this.metadataFailures.delete(this.metadataFailures.keys().next().value!);
        }
      }
      // Keep the single-flight guard while broadcasting; no recursive retries.
      if (enriched && !this.sessionCleared) this.ws.broadcast('queue', this.getQueueWithMetadata());
    } finally {
      this.enrichingMetadata = false;
      const pending = this.visibleMetadata;
      this.visibleMetadata = [];
      if (pending.length && !this.sessionCleared) void this.loadVisibleMetadata(pending);
    }
  }

  async loadVisibleMetadata(ids: unknown): Promise<void> {
    if (!Array.isArray(ids) || ids.length > 40 || this.sessionCleared) return;
    const allowed = new Set(this.deckOrder ?? this.queue.videoIds);
    const missing = [...new Set(ids)].filter((id): id is string =>
      typeof id === 'string' && allowed.has(id) && !this.metadataCache.has(id) &&
      Date.now() - (this.metadataFailures.get(id) ?? 0) > 60000);
    // The current background batch finishes first; visible requests stay bounded.
    if (this.enrichingMetadata) {
      this.visibleMetadata = missing;
      return;
    }
    await this.enrichQueueMetadata(missing);
  }

  private async fetchMetadataFromOembed(videoId: string): Promise<{ title: string; artist: string; albumArt: string } | null> {
    try {
      const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
      const response = await fetch(url, {signal:AbortSignal.timeout(5000)});
      if (!response.ok) return null;
      const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      return {
        title: data.title ?? videoId,
        artist: data.author_name ?? '',
        albumArt: data.thumbnail_url ?? '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Jump to a specific video in the queue by ID.
   * Constructs a Video object using the current video's client.
   */
  async playVideoById(videoId: string): Promise<boolean> {
    const state = this.queue.getState();
    const client = state.current?.client;
    if (!client) {
      console.error('[YTCast] Cannot jump: no current client');
      return false;
    }
    try {
      const index = this.queue.videoIds.indexOf(videoId);
      if (index < 0) return false;
      // Keep the playlist identity and destination index so the sender can
      // select the same item. Omit per-video navigation tokens from the old song.
      return await this.play({ id: videoId, client, context: {
        playlistId: state.current?.context?.playlistId, index,
      } } as Video, 0);
    } catch (err) {
      console.error(`[YTCast] Jump to ${videoId} failed:`, (err as Error).message);
      return false;
    }
  }

  // --- Player abstract method implementations ---

  protected async doPlay(video: Video, position: number): Promise<boolean> {
    this.stopHeartbeat();
    if (this.activePlayRequest !== this.playRequest) return false;
    if (this.deckOrder && !this.deckOrder.includes(video.id)) this.deckOrder = null;
    const generation = ++this.playbackGeneration;
    this.playbackId = randomUUID();
    this.endedPlaybackId = null;
    this.lastSenderSync = 0;
    this.currentTrackInfo = null;
    this.currentPosition = position;
    this.currentDuration = 0;
    this.playing = false;
    try {
      this.markSenderActivity();
      this.sessionCleared = false;
      const info = await extractAudioInfo(video.id, this.ytdlpPath);
      if (generation !== this.playbackGeneration) return false;
      this.currentTrackInfo = info;
      this.metadataCache.set(video.id, info);
      this.currentPosition = position;
      this.currentDuration = info.duration;
      this.playing = true;

      // Defer track broadcast to next macrotask so a follow-up doPause
      // (which fires when phone connects in paused state) flips this.playing
      // before we tell the frontend whether to autoplay. Library calls
      // `await doPlay; await doPause` — microtasks drain between them, but
      // setTimeout(0) runs after both settle.
      setTimeout(() => {
        if (generation !== this.playbackGeneration) return;
        this.ws.broadcast('track', {
          playbackId: this.playbackId,
          videoId: info.videoId,
          title: info.title,
          artist: info.artist,
          albumArt: info.albumArt,
          duration: info.duration,
          url: info.url,
          autoplay: this.playing,
          position,
        });
        console.log(`[YTCast] Loaded: ${info.title} by ${info.artist} (${info.videoId}) autoplay=${this.playing}`);

        if (position > 0) {
          this.ws.broadcast('seek', { position });
        }

        // Broadcast updated queue so the current track indicator moves
        const queueData = this.getQueueWithMetadata();
        this.ws.broadcast('queue', queueData);
      }, 0);

      return true;
    } catch (err) {
      if (generation !== this.playbackGeneration) return false;
      this.extractionFailure = { id:video.id, generation };
      console.error(`[YTCast] doPlay failed for ${video.id}:`, (err as Error).message);
      this.ws.broadcast('error', {
        message: `Failed to play: ${(err as Error).message}`,
        code: 'YTDLP_FAILED',
      });
      return false;
    }
  }

  protected async doPause(): Promise<boolean> {
    this.currentPosition = await this.doGetPosition();
    this.stopHeartbeat();
    this.markSenderActivity();
    this.playing = false;
    this.ws.broadcast('state', {
      isPlaying: false,
      position: this.currentPosition,
      duration: this.currentDuration,
    });
    return true;
  }

  protected async doResume(): Promise<boolean> {
    this.markSenderActivity();
    this.playing = true;
    this.ws.broadcast('state', {
      isPlaying: true,
      position: this.currentPosition,
      duration: this.currentDuration,
    });
    return true;
  }

  protected async doStop(): Promise<boolean> {
    this.stopHeartbeat();
    this.playbackGeneration++;
    this.playbackId = null;
    this.markSenderActivity();
    this.playing = false;
    this.currentTrackInfo = null;
    this.currentPosition = 0;
    this.currentDuration = 0;
    this.ws.broadcast('stop', {});
    return true;
  }

  protected async doSeek(position: number): Promise<boolean> {
    this.stopHeartbeat();
    this.markSenderActivity();
    this.currentPosition = position;
    this.ws.broadcast('seek', { position });
    return true;
  }

  protected async doSetVolume(volume: Volume): Promise<boolean> {
    this.markSenderActivity();
    this.currentVolume = volume;

    // Coalesce rapid hardware-button changes, preserving the final direction.
    if (this.volumeBroadcastTimer) {
      clearTimeout(this.volumeBroadcastTimer);
    }

    this.volumeBroadcastTimer = setTimeout(() => {
      this.volumeBroadcastTimer = null;
      this.ws.broadcast('volume', { value: this.currentVolume.level, muted: this.currentVolume.muted });
      void this.store.set('volume', this.currentVolume);
    }, 300);

    return true;
  }

  protected async doGetVolume(): Promise<Volume> {
    return this.currentVolume;
  }

  private estimatedPosition(): number {
    if (!this.playing || !this.lastAudioReport) return this.currentPosition;
    const delta = Math.min(15, Math.max(0, (Date.now() - this.lastAudioReport) / 1000));
    return Math.min(this.currentDuration || Infinity, this.currentPosition + delta);
  }

  protected async doGetPosition(): Promise<number> {
    return this.estimatedPosition();
  }

  protected async doGetDuration(): Promise<number> {
    return this.currentDuration;
  }
}
