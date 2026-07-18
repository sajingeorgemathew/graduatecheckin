/**
 * Staff-facing camera status messages. Explains permission, hardware and
 * secure-context problems in clear language. Never displays decoded
 * values.
 */

import type { CameraErrorKind, CameraPhase } from "../camera-controller";

interface CameraStatusProps {
  phase: CameraPhase;
  error: CameraErrorKind | null;
}

const ERROR_MESSAGES: Record<CameraErrorKind, { title: string; detail: string }> = {
  permission_denied: {
    title: "Camera permission needed",
    detail:
      "Camera access was denied. Allow camera access for this site in " +
      "your browser settings, then choose Start Camera again.",
  },
  no_camera: {
    title: "No camera found",
    detail:
      "No usable camera was found on this device. Use the manual ticket " +
      "code entry below instead.",
  },
  camera_in_use: {
    title: "Camera unavailable",
    detail:
      "The camera could not be started. It may be in use by another app. " +
      "Close other camera apps and try again, or use manual entry.",
  },
  insecure_context: {
    title: "Camera not supported here",
    detail:
      "This browser or connection does not support camera scanning. Use " +
      "a secure HTTPS connection, or use the manual ticket code entry.",
  },
  unknown: {
    title: "Camera problem",
    detail:
      "The camera could not be started. Try again, or use the manual " +
      "ticket code entry below.",
  },
};

export function CameraStatus({ phase, error }: CameraStatusProps) {
  if (phase === "error" && error !== null) {
    const message = ERROR_MESSAGES[error];
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm"
      >
        <p className="font-semibold text-red-900">{message.title}</p>
        <p className="mt-1 text-red-800">{message.detail}</p>
      </div>
    );
  }
  if (phase === "idle") {
    return (
      <p className="text-sm text-navy/70">
        The camera stays off until you choose Start Camera. Your browser
        will ask for camera permission the first time.
      </p>
    );
  }
  if (phase === "starting") {
    return (
      <p role="status" className="text-sm font-semibold text-navy">
        Starting camera. Allow camera access if your browser asks.
      </p>
    );
  }
  if (phase === "paused") {
    return (
      <p role="status" className="text-sm font-semibold text-navy">
        Scanning is paused while the ticket is checked.
      </p>
    );
  }
  return (
    <p role="status" className="text-sm font-semibold text-navy">
      Point the camera at the QR code on the graduation ticket.
    </p>
  );
}
