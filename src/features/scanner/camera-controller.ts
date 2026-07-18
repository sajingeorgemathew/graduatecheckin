/**
 * Pure camera-scanner controller. Owns the camera lifecycle rules so they
 * are unit testable without a browser: the camera never starts without an
 * explicit start call, decoding pauses after the first result, duplicate
 * decode callbacks are ignored while paused, media sessions are always
 * stopped on pause, switch and dispose, and scanning only resumes after
 * an explicit resume call.
 *
 * Decoded payloads pass straight through to the onPayload callback. The
 * controller never stores, logs or compares payload values.
 */

export type CameraPhase =
  | "idle"
  | "starting"
  | "scanning"
  | "paused"
  | "error";

export type CameraErrorKind =
  | "permission_denied"
  | "no_camera"
  | "camera_in_use"
  | "insecure_context"
  | "unknown";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface DecodeSession {
  stop(): void;
}

export interface CameraControllerDeps {
  /** True when camera APIs may be used (secure context with media support). */
  isSupported(): boolean;
  listDevices(): Promise<CameraDevice[]>;
  /**
   * Starts continuous decoding. A null deviceId asks for the rear-facing
   * camera via facingMode preference. onDecode may fire many times.
   */
  startDecode(
    deviceId: string | null,
    onDecode: (payload: string) => void
  ): Promise<DecodeSession>;
}

export interface CameraControllerState {
  phase: CameraPhase;
  error: CameraErrorKind | null;
  devices: CameraDevice[];
  activeDeviceId: string | null;
}

export interface CameraControllerCallbacks {
  onPayload(payload: string): void;
  onStateChange(state: CameraControllerState): void;
}

const REAR_CAMERA_LABEL = /back|rear|environment/i;

/** Picks the device that looks rear facing, or null for facingMode. */
export function preferRearDevice(
  devices: readonly CameraDevice[]
): string | null {
  const rear = devices.find((device) => REAR_CAMERA_LABEL.test(device.label));
  return rear?.deviceId ?? null;
}

/** Maps a thrown camera error to a staff-facing error kind. */
export function classifyCameraError(error: unknown): CameraErrorKind {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "permission_denied";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "no_camera";
  }
  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError"
  ) {
    return "camera_in_use";
  }
  return "unknown";
}

export interface CameraController {
  getState(): CameraControllerState;
  /** Requests permission and starts scanning. Never called automatically. */
  start(): Promise<void>;
  /** Stops the active media session and returns to idle. */
  stop(): void;
  /** Stops the current session and starts the selected device. */
  switchTo(deviceId: string): Promise<void>;
  /** Resumes decoding after a result. Only ever called by user action. */
  resume(): Promise<void>;
  /** Stops everything. The controller cannot be used afterwards. */
  dispose(): void;
}

export function createCameraController(
  deps: CameraControllerDeps,
  callbacks: CameraControllerCallbacks
): CameraController {
  let state: CameraControllerState = {
    phase: "idle",
    error: null,
    devices: [],
    activeDeviceId: null,
  };
  let session: DecodeSession | null = null;
  let accepting = false;
  let disposed = false;

  function setState(next: Partial<CameraControllerState>): void {
    state = { ...state, ...next };
    callbacks.onStateChange(state);
  }

  function stopSession(): void {
    accepting = false;
    if (session !== null) {
      session.stop();
      session = null;
    }
  }

  function handleDecode(payload: string): void {
    // Ignore duplicate callbacks after the first accepted result. The
    // payload is forwarded once and never stored on the controller.
    if (!accepting || disposed) {
      return;
    }
    stopSession();
    setState({ phase: "paused" });
    callbacks.onPayload(payload);
  }

  async function startDevice(deviceId: string | null): Promise<void> {
    if (disposed) {
      return;
    }
    if (!deps.isSupported()) {
      setState({ phase: "error", error: "insecure_context" });
      return;
    }
    stopSession();
    setState({ phase: "starting", error: null, activeDeviceId: deviceId });
    try {
      const started = await deps.startDecode(deviceId, handleDecode);
      if (disposed) {
        started.stop();
        return;
      }
      session = started;
      accepting = true;
      setState({ phase: "scanning" });
      const devices = await deps.listDevices();
      if (!disposed) {
        setState({ devices });
      }
    } catch (error) {
      stopSession();
      setState({ phase: "error", error: classifyCameraError(error) });
    }
  }

  return {
    getState: () => state,
    start: () => startDevice(state.activeDeviceId),
    stop: () => {
      stopSession();
      setState({ phase: "idle" });
    },
    switchTo: (deviceId: string) => startDevice(deviceId),
    resume: () => startDevice(state.activeDeviceId),
    dispose: () => {
      disposed = true;
      stopSession();
    },
  };
}
