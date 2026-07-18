"use client";

/**
 * Camera scanner. The only module that touches @zxing/browser and camera
 * APIs, and it is a Client Component so no camera work ever happens
 * during server rendering. BrowserQRCodeReader decodes QR codes only.
 *
 * Privacy rules: decoded payloads go straight to the onPayload callback
 * and are never logged, never rendered and never placed in browser
 * storage. The camera starts only after the staff member presses Start
 * Camera and every media track is stopped on pause, switch and unmount.
 */

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import {
  createCameraController,
  type CameraController,
  type CameraControllerDeps,
  type CameraControllerState,
} from "../camera-controller";
import { CameraStatus } from "./camera-status";

interface CameraScannerProps {
  /** Receives one decoded payload per accepted scan. */
  onPayload: (payload: string) => void;
  /** True while a validation request is active or a result is shown. */
  locked: boolean;
  /** Increments when the user chooses Scan Another Ticket. */
  resumeToken: number;
}

const INITIAL_STATE: CameraControllerState = {
  phase: "idle",
  error: null,
  devices: [],
  activeDeviceId: null,
};

export function CameraScanner({
  onPayload,
  locked,
  resumeToken,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controllerRef = useRef<CameraController | null>(null);
  const lockedRef = useRef(false);
  const onPayloadRef = useRef<(payload: string) => void>(() => undefined);
  const [state, setState] = useState<CameraControllerState>(INITIAL_STATE);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    onPayloadRef.current = onPayload;
  }, [onPayload]);

  useEffect(() => {
    const readerRef: { current: BrowserQRCodeReader | null } = {
      current: null,
    };
    const deps: CameraControllerDeps = {
      isSupported: () =>
        typeof window !== "undefined" &&
        window.isSecureContext &&
        typeof navigator !== "undefined" &&
        navigator.mediaDevices !== undefined,
      listDevices: async () => {
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        return devices.map((device) => ({
          deviceId: device.deviceId,
          label: device.label,
        }));
      },
      startDecode: async (deviceId, onDecode) => {
        const video = videoRef.current;
        if (video === null) {
          throw new Error("The camera view is not ready.");
        }
        if (readerRef.current === null) {
          readerRef.current = new BrowserQRCodeReader();
        }
        const constraints: MediaStreamConstraints =
          deviceId !== null
            ? { video: { deviceId: { exact: deviceId } } }
            : { video: { facingMode: { ideal: "environment" } } };
        const controls = await readerRef.current.decodeFromConstraints(
          constraints,
          video,
          (result) => {
            if (result !== undefined) {
              onDecode(result.getText());
            }
          }
        );
        return { stop: () => controls.stop() };
      },
    };
    const controller = createCameraController(deps, {
      onPayload: (payload) => {
        // Duplicate suppression: nothing is forwarded while a request is
        // already active. The payload value is never kept here.
        if (!lockedRef.current) {
          onPayloadRef.current(payload);
        }
      },
      onStateChange: setState,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (
      resumeToken > 0 &&
      controller !== null &&
      controller.getState().phase === "paused"
    ) {
      void controller.resume();
    }
  }, [resumeToken]);

  const cameraOn =
    state.phase === "starting" ||
    state.phase === "scanning" ||
    state.phase === "paused";
  const multipleCameras = state.devices.length > 1;

  function switchToNextCamera(): void {
    const controller = controllerRef.current;
    if (controller === null || state.devices.length === 0) {
      return;
    }
    const currentIndex = state.devices.findIndex(
      (device) => device.deviceId === state.activeDeviceId
    );
    const next = state.devices[(currentIndex + 1) % state.devices.length];
    void controller.switchTo(next.deviceId);
  }

  return (
    <section aria-label="Camera scanner" className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border-2 border-navy/20 bg-navy">
        <video
          ref={videoRef}
          className="aspect-square w-full object-cover"
          muted
          playsInline
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="h-3/5 w-3/5 rounded-2xl border-4 border-gold/90" />
        </div>
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy/90 p-6 text-center">
            <p className="text-sm font-semibold text-white/90">
              Camera is off
            </p>
          </div>
        )}
      </div>

      <CameraStatus phase={state.phase} error={state.error} />

      <div className="flex flex-wrap gap-3">
        {!cameraOn ? (
          <button
            type="button"
            onClick={() => void controllerRef.current?.start()}
            className="min-h-12 flex-1 rounded-lg bg-navy px-5 py-3 text-base font-semibold text-white hover:bg-navy-light"
          >
            Start Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={() => controllerRef.current?.stop()}
            className="min-h-12 flex-1 rounded-lg border-2 border-navy px-5 py-3 text-base font-semibold text-navy hover:bg-cream"
          >
            Stop Camera
          </button>
        )}
        {cameraOn && multipleCameras && (
          <button
            type="button"
            onClick={switchToNextCamera}
            className="min-h-12 rounded-lg border-2 border-navy px-5 py-3 text-base font-semibold text-navy hover:bg-cream"
          >
            Switch Camera
          </button>
        )}
      </div>

      {cameraOn && multipleCameras && (
        <label className="block text-sm font-semibold text-navy">
          Camera
          <select
            value={state.activeDeviceId ?? ""}
            onChange={(changeEvent) => {
              const deviceId = changeEvent.target.value;
              if (deviceId.length > 0) {
                void controllerRef.current?.switchTo(deviceId);
              }
            }}
            className="mt-1 block w-full rounded-lg border border-navy/30 bg-white px-3 py-3 text-base text-navy"
          >
            <option value="" disabled>
              Choose a camera
            </option>
            {state.devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label.length > 0
                  ? device.label
                  : `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
