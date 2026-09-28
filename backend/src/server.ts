import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import YouTubeCastReceiver from 'yt-cast-receiver';
import { CastPlayer } from './CastPlayer.js';
import { JsonDataStore } from './JsonDataStore.js';
import { WsManager } from './wsManager.js';
import { handleRequest } from './httpServer.js';
import { selfUpdate } from './ytdlp.js';
import { getCurrentNetwork, type ActiveNetwork } from './network.js';

const PORT = 39281;

// Resolve paths relative to the plugin directory
// When running via main.py, cwd is the plugin dir
// esbuild defines __dirname for CJS bundles automatically
declare const __dirname: string;
const pluginDir = path.resolve(__dirname, '..', '..');
const binDir = path.join(pluginDir, 'bin');
// main.py stages yt-dlp out of the plugin folder (to avoid ETXTBSY on
// reinstall) and points us at it via YTCAST_YTDLP_PATH. Fall back to
// the in-folder path if the env var is missing (e.g. dev runs).
const ytdlpPath = process.env.YTCAST_YTDLP_PATH || path.join(binDir, 'yt-dlp');
const dataStorePath = '/home/deck/homebrew/settings/youtube-music/datastore.json';

async function main() {
  console.log('[YTCast] Starting YouTube Cast Receiver backend...');

  // Self-update yt-dlp (async, non-blocking to startup)
  selfUpdate(ytdlpPath).then(() => {
    console.log('[YTCast] yt-dlp self-update check complete.');
  });

  // Create HTTP server
  const httpServer = http.createServer();

  // Create WebSocket manager
  const wsManager = new WsManager(httpServer);

  // Create DataStore
  const dataStore = new JsonDataStore(dataStorePath);

  // Create CastPlayer
  const castPlayer = new CastPlayer({
    ytdlpPath,
    wsManager,
    dataStore,
  });

  // Get or create a persistent UUID so the device looks the same across reinstalls
  let ssdpUuid = await dataStore.get<string>('ssdp.uuid');
  if (!ssdpUuid) {
    const { randomUUID } = await import('node:crypto');
    ssdpUuid = randomUUID();
    await dataStore.set('ssdp.uuid', ssdpUuid);
    console.log(`[YTCast] Generated new SSDP UUID: ${ssdpUuid}`);
  } else {
    console.log(`[YTCast] Using persisted SSDP UUID: ${ssdpUuid}`);
  }

  // Create the YouTube Cast Receiver
  const deviceName = (process.env.YTCAST_DEVICE_NAME || os.hostname()).trim() || os.hostname();
  const createReceiver = () => new YouTubeCastReceiver(castPlayer, {
    app: {
      // The library defaults to resetting even on temporary sender loss.
      // Preserve its queue until explicit unlink; our grace handles abandonment.
      resetPlayerOnDisconnectPolicy: 'allExplicitlyDisconnected',
    },
    dial: {
      uuid: ssdpUuid,
    } as any,
    device: {
      name: deviceName,
      screenName: `YouTube on ${deviceName}`,
    },
    dataStore,
    logLevel: 'info',
  });
  let receiver = createReceiver();

  // Single state model:
  //   - trustedNetworks (persisted) — connection NAMEs the user marked as trusted.
  //     We match by name (e.g. SSID for wifi, "Wired connection 1" for ethernet)
  //     because NetworkManager UUIDs can rotate when connections are re-added,
  //     while names are user-meaningful and stable across reconnects.
  //   - currentNetwork (live) — UUID/name of the active connection
  //   - advertising (live) — whether SSDP/DIAL is actually running
  //
  // Receiver advertises iff currentNetwork.name is in trustedNetworks.
  // Empty list (or untrusted current network) = receiver off.
  // Migration: drop legacy UUID-keyed list (incompatible matching).
  let trustedNetworks: string[] = (await dataStore.get<string[]>('network.trusted.names')) ?? [];
  let currentNetwork: ActiveNetwork | null = null;
  let advertising = false;
  // UUID of the network the receiver is currently bound to. SSDP/DIAL
  // multicast sockets are interface-specific — switching networks while
  // advertising leaves the socket on the old interface (advertising into
  // the void). When this differs from currentNetwork.uuid, we restart.
  let boundNetworkUuid: string | null = null;
  let shuttingDown = false;
  const intervals: ReturnType<typeof setInterval>[] = [];
  console.log(`[YTCast] Loaded trusted networks: [${trustedNetworks.map((n) => `"${n}"`).join(', ')}]`);

  const reconcile = async (): Promise<void> => {
    if (shuttingDown) return;
    const shouldRun = !!currentNetwork && trustedNetworks.includes(currentNetwork.name);

    // Case 0: advertising on a different network than current — rebind.
    // Fires when switching between two trusted networks; without this,
    // SSDP keeps broadcasting on the old interface.
    if (shouldRun && advertising && currentNetwork && boundNetworkUuid !== currentNetwork.uuid) {
      console.log(
        `[YTCast] Reconcile: rebinding receiver to "${currentNetwork.name}" ` +
        `(was bound to ${boundNetworkUuid ?? '(none)'})`
      );
      await receiver.stop();
      advertising = false;
      boundNetworkUuid = null;
    }

    // Only log when something actually changes — reconcile fires every
    // 10s on the network poll, so steady-state silence is the goal.
    if (shouldRun && !advertising) {
      console.log(`[YTCast] Reconcile: starting receiver on "${currentNetwork?.name}"`);
      await receiver.start();
      advertising = true;
      boundNetworkUuid = currentNetwork!.uuid;
      console.log('[YTCast] Cast receiver advertising');
    } else if (!shouldRun && advertising) {
      console.log(
        `[YTCast] Reconcile: stopping receiver (currentNetwork=${currentNetwork?.name ?? '(none)'} trusted=${shouldRun})`
      );
      await receiver.stop();
      advertising = false;
      boundNetworkUuid = null;
      console.log('[YTCast] Cast receiver stopped advertising');
    }
  };

  // Serialize reconcile calls so user toggle + network poll can't race two
  // overlapping receiver.start()/stop() calls. Also no-ops post-shutdown.
  // Suppresses repeated identical error messages so retry-spam doesn't
  // flood logs (we retry every 10s on poll).
  let reconcileInflight: Promise<void> = Promise.resolve();
  let disconnectInflight: Promise<boolean> | null = null;
  let lastReconcileErrorMessage: string | null = null;
  const safeReconcile = (): Promise<void> => {
    if (shuttingDown) return Promise.resolve();
    reconcileInflight = reconcileInflight
      .then(() => reconcile())
      .then(() => {
        if (lastReconcileErrorMessage !== null) {
          console.log('[YTCast] Reconcile recovered after prior failure');
          lastReconcileErrorMessage = null;
        }
      })
      .catch((err) => {
        const msg = (err as Error)?.message ?? String(err);
        if (msg !== lastReconcileErrorMessage) {
          console.error('[YTCast] Reconcile failed:', msg);
          lastReconcileErrorMessage = msg;
        }
      });
    return reconcileInflight;
  };

  const broadcastNetwork = (): void => {
    wsManager.broadcast('network', {
      uuid: currentNetwork?.uuid ?? null,
      name: currentNetwork?.name ?? null,
      trusted: !!currentNetwork && trustedNetworks.includes(currentNetwork.name),
    });
  };

  const networkControl = {
    getCurrent: () => ({
      uuid: currentNetwork?.uuid ?? null,
      name: currentNetwork?.name ?? null,
      trusted: !!currentNetwork && trustedNetworks.includes(currentNetwork.name),
    }),
    trust: async () => {
      if (!currentNetwork) return false;
      const name = currentNetwork.name;
      if (trustedNetworks.includes(name)) return true;
      trustedNetworks = [...trustedNetworks, name];
      console.log(`[YTCast] Trusting network "${name}". List now: [${trustedNetworks.map((n) => `"${n}"`).join(', ')}]`);
      await dataStore.set('network.trusted.names', trustedNetworks);
      await dataStore.flush(); // force immediate disk write so reboots persist
      await safeReconcile();
      broadcastNetwork();
      return true;
    },
    untrust: async () => {
      if (!currentNetwork) return false;
      const name = currentNetwork.name;
      const before = trustedNetworks.length;
      trustedNetworks = trustedNetworks.filter((n) => n !== name);
      if (trustedNetworks.length === before) return true;
      console.log(`[YTCast] Untrusting network "${name}". List now: [${trustedNetworks.map((n) => `"${n}"`).join(', ')}]`);
      await dataStore.set('network.trusted.names', trustedNetworks);
      await dataStore.flush();
      await safeReconcile();
      broadcastNetwork();
      return true;
    },
  };

  // Handle WebSocket messages from frontend
  wsManager.onMessage((msg) => {
    switch (msg.event) {
      case 'progress': {
        const data = msg.data as { currentTime: number; duration: number; playbackId?: string };
        castPlayer.updateProgress(data?.currentTime, data?.duration, data?.playbackId);
        break;
      }
      case 'ended': {
        void castPlayer.handleTrackEnded((msg.data as any)?.playbackId).catch(err => console.warn('[YTCast] Advance failed:', err));
        break;
      }
      case 'playbackError': {
        void castPlayer.handlePlaybackError((msg.data as any)?.playbackId).catch(err => console.warn('[YTCast] Retry failed:', err));
        break;
      }
      case 'playing': {
        void castPlayer.syncSender((msg.data as any)?.playbackId).catch(err => console.warn('[YTCast] State sync failed:', err));
        break;
      }
    }
  });

  // Handle HTTP requests
  httpServer.on('request', (req, res) => {
    handleRequest(req, res, {
      castPlayer,
      libraryPlayer: castPlayer,
      isConnected: () => receiver.getConnectedSenders().length > 0 || reconnectUntil > Date.now(),
      senderName: () => activeSenderName ?? receiver.getConnectedSenders()[0]?.name?.trim() ?? null,
      disconnectCast: async () => {
        // Coalesce duplicate Stop requests so an impatient second click cannot
        // stop the receiver again while it is restarting after the first one.
        if (disconnectInflight) return disconnectInflight;
        const unlink = (async () => {
        // Queue unlink alongside network reconciliation so start/stop cannot race.
        const operation = reconcileInflight.then(async () => {
          if (shuttingDown) throw new Error('Receiver is shutting down');
          await receiver.stop();
          advertising = false;
          boundNetworkUuid = null;
          activeSenderName = null;
          wasConnected = false;
          reconnectUntil = 0;
          // yt-cast-receiver persists the MDX screen identity across starts.
          // On explicit Stop, remove it so the sender cannot silently resume
          // the just-ended Cast session when advertising comes back.
          await dataStore.remove('mdxContext.cl');
          await dataStore.remove('mdxContext.m');
          await dataStore.flush();
          castPlayer.clearOnDisconnect();
          wsManager.broadcast('connection', { phoneConnected: false, senderName: null });
          // stop()/start() on the same library object retains each Session's
          // screenId in memory. A fresh receiver instance is required to make
          // the cleared MDX context take effect immediately.
          receiver = createReceiver();
          attachReceiverEvents(receiver);
        });
        // Keep Stop pending until the receiver has restarted, and serialize
        // any network poll behind that restart.
        reconcileInflight = operation.then(() => reconcile()).catch(err => {
          console.warn('[YTCast] Receiver restart deferred to network poll:', err);
        });
        try {
          await operation;
          await reconcileInflight;
          return true;
        } catch (err) {
          console.error('[YTCast] Failed to disconnect/restart Cast receiver:', err);
          return false;
        }
        })();
        disconnectInflight = unlink;
        void unlink.finally(() => {
          if (disconnectInflight === unlink) disconnectInflight = null;
        });
        return unlink;
      },
      network: networkControl,
    });
  });

  // Shared connection tracking — used by senderDisconnect, sleep detection,
  // and the periodic health check to stay in sync.
  let wasConnected = false;
  let activeSenderName: string | null = null;
  let reconnectUntil = 0;
  const RECONNECT_GRACE_MS = 90000;

  // Receiver events are attached to each instance because explicit Stop
  // rebuilds the receiver to discard its in-memory Cast screen identities.
  const onSenderConnect = (sender: any) => {
    console.log(`[YTCast] Phone connected: ${sender.name}`);
    wsManager.broadcast('senderConnected', { senderName: sender.name ?? null, avatar:sender.user?.thumbnail ?? null });
    activeSenderName = sender.name ?? null;
    wsManager.broadcast('connection', { phoneConnected: true, senderName: activeSenderName });
    wasConnected = true;
    reconnectUntil = 0;
    castPlayer.markSenderActivity(); // seed idle clock so health check doesn't fire before first cast command
    void castPlayer.syncSender(castPlayer.getPlaybackId()).catch(err => console.warn('[YTCast] Reconnect state sync failed:', err));

    // The phone sends its own volume (usually 100%) on connect, overriding
    // our persisted volume. After the connection settles, push our saved
    // volume back to both the phone and the frontend.
    setTimeout(async () => {
      const savedVol = await dataStore.get<{ level: number; muted: boolean }>('volume');
      if (savedVol) {
        console.log(`[YTCast] Restoring persisted volume: ${savedVol.level}`);
        await castPlayer.setVolume(savedVol);
      }
    }, 2000);
  };

  // Recover a reconnect if the receiver's senderConnect event was missed
  // while it restarted after Stop. This only broadcasts on a real transition
  // or when the newly connected sender's name becomes available.
  const syncSenderIdentity = () => {
    if (shuttingDown) return;
    const sender = receiver.getConnectedSenders()[0];
    if (!sender) return;
    const name = sender.name?.trim() || null;
    if (wasConnected && (!name || name === activeSenderName)) return;
    console.log('[YTCast] Recovered sender identity: ' + (name ?? '(unnamed)'));
    if (name) activeSenderName = name;
    wasConnected = true;
    reconnectUntil = 0;
    castPlayer.markSenderActivity();
    wsManager.broadcast('senderConnected', { senderName:name, avatar:sender.user?.thumbnail ?? null });
    wsManager.broadcast('connection', { phoneConnected:true, senderName:activeSenderName });
  };

  const onSenderDisconnect = (sender: any, implicit: boolean) => {
    console.log(`[YTCast] Phone disconnected: ${sender.name} (implicit: ${implicit})`);
    const connectedSenders = receiver.getConnectedSenders();
    const stillConnected = connectedSenders.length > 0;
    if (!stillConnected && implicit) {
      // A transient Lounge connection loss is not an explicit Stop from the phone.
      reconnectUntil = Date.now() + RECONNECT_GRACE_MS;
      return;
    }
    reconnectUntil = 0;
    activeSenderName = connectedSenders[0]?.name ?? null;
    wsManager.broadcast('connection', { phoneConnected: stillConnected, senderName: activeSenderName });
    if (!stillConnected) {
      console.log('[YTCast] No senders remaining, clearing playback and queue');
      castPlayer.clearOnDisconnect();
      wasConnected = false;
    }
  };

  // Subscribe to Playlist events for real-time queue broadcasts
  const broadcastQueue = () => {
    castPlayer.clearDeckOrder();
    const queueData = castPlayer.getQueueWithMetadata();
    wsManager.broadcast('queue', queueData);
  };

  const playlist = castPlayer.queue;
  playlist.on('playlistUpdated', broadcastQueue);
  playlist.on('playlistSet', broadcastQueue);
  playlist.on('playlistCleared', broadcastQueue);
  playlist.on('videoAdded', broadcastQueue);
  playlist.on('videoRemoved', broadcastQueue);
  playlist.on('videoSelected', broadcastQueue);
  playlist.on('playlistAdded', broadcastQueue);

  const onReceiverError = (error: Error) => {
    console.error('[YTCast] Receiver error:', error);
  };

  const attachReceiverEvents = (target: typeof receiver) => {
    target.on('senderConnect', onSenderConnect);
    target.on('senderDisconnect', onSenderDisconnect);
    target.on('error', onReceiverError);
  };
  attachReceiverEvents(receiver);

  // Start the HTTP/WS server
  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[YTCast] FATAL: Port ${PORT} is already in use.`);
        process.exit(1);
      }
      reject(err);
    });

    httpServer.listen(PORT, '127.0.0.1', () => {
      console.log(`[YTCast] HTTP/WS server listening on 127.0.0.1:${PORT}`);
      resolve();
    });
  });

  // Detect current network and reconcile receiver state on startup.
  // Receiver advertises iff current network's name is in trustedNetworks.
  currentNetwork = await getCurrentNetwork();
  if (currentNetwork) {
    console.log(`[YTCast] Active network: name="${currentNetwork.name}" uuid=${currentNetwork.uuid} type=${currentNetwork.type}`);
  } else {
    console.log('[YTCast] No active network detected at startup (nmcli unavailable or no active connection)');
  }
  // Initial reconcile is best-effort. At Steam Deck boot, NetworkManager
  // reports the wifi as "active" before DNS/internet is fully reachable,
  // so receiver.start() can fail with fetch errors against YouTube's API.
  // We must NOT let that take down the plugin — log it and let the poll
  // loop retry every 10s.
  try {
    await safeReconcile();
  } catch (err) {
    console.error('[YTCast] Initial reconcile failed (will retry on poll):', err);
  }
  console.log(
    `[YTCast] Cast receiver ${advertising ? 'advertising' : 'idle'}. ` +
    `trustedNetworks=${trustedNetworks.length} Device name: "${deviceName}"`
  );

  // Signal readiness to main.py
  console.log('READY');

  // Graceful shutdown.
  // Decky reinstalls block on extractall() if our binaries (bin/node,
  // bin/yt-dlp) are still being executed. The Python wrapper kills the
  // whole process group on _unload, but we also enforce a hard upper
  // bound here so a misbehaving receiver.stop() can't keep us alive.
  const SHUTDOWN_HARD_LIMIT_MS = 1500;
  const RECEIVER_STOP_LIMIT_MS = 1000;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[YTCast] Shutting down...');

    // Stop all background timers first so no new work starts after this.
    for (const id of intervals) clearInterval(id);

    // Fail-safe: force exit if cleanup hangs. .unref() lets us exit
    // cleanly via process.exit(0) below if cleanup completes in time.
    const failSafe = setTimeout(() => {
      console.error('[YTCast] Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_HARD_LIMIT_MS);
    failSafe.unref();

    try {
      if (advertising) {
        // Race against a 1s timer — yt-cast-receiver's stop() can hang
        // on flaky network conditions during SSDP teardown.
        await Promise.race([
          receiver.stop(),
          new Promise<void>((resolve) => setTimeout(resolve, RECEIVER_STOP_LIMIT_MS)),
        ]);
        advertising = false;
      }
      await dataStore.flush();
      wsManager.close();
      httpServer.close();
    } catch (err) {
      console.error('[YTCast] Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  // Detect sleep/wake by monitoring timer drift.
  // When the Deck sleeps, the process is frozen (SIGSTOP). On wake (SIGCONT),
  // a setInterval tick that was supposed to fire in 5s fires after minutes.
  // If drift > 10s, the Deck slept — clear playback entirely since the cast
  // session is dead after sleep.
  let lastTick = Date.now();
  intervals.push(setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    const drift = now - lastTick;
    lastTick = now;
    if (drift > 15000) { // 5s interval + 10s tolerance
      // Timer drift can also be CPU contention while gaming. Give the receiver
      // time to reconnect after wake instead of treating drift as a user Stop.
      if (wasConnected) reconnectUntil = Date.now() + RECONNECT_GRACE_MS;
    }
  }, 5000));

  // Periodic connection health check.
  // Catches cases where the RPC connection to YouTube silently dies
  // (e.g. Steam Deck loses wifi) and no senderDisconnect event fires.
  // Bumped from 5 min to 30 min — paused tracks count as idle, and 5 min
  // was clearing the session for users who paused and walked away briefly.
  // Case 1 (library reports 0 senders) still fires immediately for genuine
  // disconnects; this stale check is the fallback for silent RPC death.
  const STALE_SESSION_MS = 30 * 60 * 1000;
  intervals.push(setInterval(() => {
    if (shuttingDown) return;
    const sendersNow = receiver.getConnectedSenders().length > 0;

    // Case 1: Library now reports 0 senders but we thought we had one
    if (wasConnected && !sendersNow) {
      if (!reconnectUntil) { reconnectUntil = Date.now() + RECONNECT_GRACE_MS; return; }
      if (Date.now() < reconnectUntil) return;
      console.log('[YTCast] Health check: senders dropped to 0, clearing playback');
      activeSenderName = null;
      wsManager.broadcast('connection', { phoneConnected: false, senderName: null });
      castPlayer.clearOnDisconnect();
      wasConnected = false;
      reconnectUntil = 0;
      return;
    }

    // Case 2: Stale session — library says connected but no sender activity
    // for 5 minutes AND playback is stopped (active playback = session alive)
    if (wasConnected && !castPlayer.isCurrentlyPlaying() && castPlayer.getSenderIdleMs() > STALE_SESSION_MS) {
      console.log('[YTCast] Health check: no sender activity for 30m, clearing stale session');
      activeSenderName = null;
      wsManager.broadcast('connection', { phoneConnected: false, senderName: null });
      castPlayer.clearOnDisconnect();
      wasConnected = false;
      return;
    }

    if (sendersNow) reconnectUntil = 0;
    wasConnected = sendersNow;
  }, 30000)); // Check every 30s

  intervals.push(setInterval(syncSenderIdentity, 2000));

  // Network change detection — poll the active connection every 10s.
  // If the network changes (different UUID, or appeared/disappeared),
  // re-run reconcile so the trust feature can flip the receiver on/off.
  const NETWORK_POLL_MS = 10000;
  intervals.push(setInterval(() => {
    if (shuttingDown) return;
    void (async () => {
      if (shuttingDown) return;
      const next = await getCurrentNetwork();
      if (shuttingDown) return;
      // Match on name (which is what trustedNetworks stores). Also account
      // for uuid changes for the same name — both should trigger a refresh
      // since SSDP needs to rebind on a different network interface.
      const prevName = currentNetwork?.name ?? null;
      const nextName = next?.name ?? null;
      const prevUuid = currentNetwork?.uuid ?? null;
      const nextUuid = next?.uuid ?? null;
      const networkChanged = prevName !== nextName || prevUuid !== nextUuid;
      if (networkChanged) {
        currentNetwork = next;
        console.log(
          `[YTCast] Network changed: "${prevName ?? '(none)'}" (${prevUuid ?? '-'}) -> ` +
          `"${nextName ?? '(none)'}" (${nextUuid ?? '-'})`
        );
        broadcastNetwork();
      }
      // Always run reconcile — handles retries when initial start failed.
      // Reconcile is idempotent and safeReconcile catches throws.
      await safeReconcile();
    })();
  }, NETWORK_POLL_MS));
}

main().catch((err) => {
  console.error('[YTCast] Fatal error:', err);
  process.exit(1);
});
