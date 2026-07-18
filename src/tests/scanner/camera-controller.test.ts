import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  classifyCameraError,
  createCameraController,
  preferRearDevice,
  type CameraControllerCallbacks,
  type CameraControllerDeps,
  type CameraControllerState,
} from "@/features/scanner/camera-controller";

const srcDir = fileURLToPath(new URL("../..", import.meta.url));

interface FakeCamera {
  deps: CameraControllerDeps;
  startCalls: Array<string | null>;
  stopCalls: number;
  emitDecode(payload: string): void;
  failNextStart(error: unknown): void;
}

function fakeCamera(devices: Array<{ deviceId: string; label: string }> = []): FakeCamera {
  let onDecode: ((payload: string) => void) | null = null;
  let nextError: unknown = null;
  const camera: FakeCamera = {
    startCalls: [],
    stopCalls: 0,
    emitDecode(payload: string) {
      onDecode?.(payload);
    },
    failNextStart(error: unknown) {
      nextError = error;
    },
    deps: {
      isSupported: () => true,
      listDevices: async () => devices,
      startDecode: async (deviceId, decode) => {
        if (nextError !== null) {
          const error = nextError;
          nextError = null;
          throw error;
        }
        camera.startCalls.push(deviceId);
        onDecode = decode;
        return {
          stop: () => {
            camera.stopCalls += 1;
            onDecode = null;
          },
        };
      },
    },
  };
  return camera;
}

interface Harness {
  camera: FakeCamera;
  payloads: string[];
  states: CameraControllerState[];
  controller: ReturnType<typeof createCameraController>;
}

function harness(
  devices: Array<{ deviceId: string; label: string }> = [],
  overrides: Partial<CameraControllerDeps> = {}
): Harness {
  const camera = fakeCamera(devices);
  const payloads: string[] = [];
  const states: CameraControllerState[] = [];
  const callbacks: CameraControllerCallbacks = {
    onPayload: (payload) => payloads.push(payload),
    onStateChange: (state) => states.push(state),
  };
  const controller = createCameraController(
    { ...camera.deps, ...overrides },
    callbacks
  );
  return { camera, payloads, states, controller };
}

describe("camera controller", () => {
  it("never starts the camera automatically", () => {
    const { camera, controller } = harness();
    expect(camera.startCalls).toHaveLength(0);
    expect(controller.getState().phase).toBe("idle");
  });

  it("requests the camera only on start", async () => {
    const { camera, controller } = harness();
    await controller.start();
    expect(camera.startCalls).toHaveLength(1);
    expect(controller.getState().phase).toBe("scanning");
  });

  it("prefers the rear-facing camera by default", async () => {
    const { camera, controller } = harness();
    await controller.start();
    // A null device id means the facingMode environment constraint.
    expect(camera.startCalls[0]).toBeNull();

    expect(
      preferRearDevice([
        { deviceId: "front-1", label: "Front Camera" },
        { deviceId: "back-1", label: "Back Camera" },
      ])
    ).toBe("back-1");
    expect(
      preferRearDevice([{ deviceId: "cam-1", label: "Integrated Webcam" }])
    ).toBeNull();
  });

  it("stops media tracks when decoding pauses after a result", async () => {
    const { camera, payloads, controller } = harness();
    await controller.start();
    camera.emitDecode("TAE-GRAD1:v1.fictional.value");
    expect(camera.stopCalls).toBe(1);
    expect(controller.getState().phase).toBe("paused");
    expect(payloads).toHaveLength(1);
  });

  it("stops media tracks on stop and on dispose", async () => {
    const first = harness();
    await first.controller.start();
    first.controller.stop();
    expect(first.camera.stopCalls).toBe(1);
    expect(first.controller.getState().phase).toBe("idle");

    const second = harness();
    await second.controller.start();
    second.controller.dispose();
    expect(second.camera.stopCalls).toBe(1);
  });

  it("switches cameras by stopping the old session first", async () => {
    const devices = [
      { deviceId: "back-1", label: "Back Camera" },
      { deviceId: "front-1", label: "Front Camera" },
    ];
    const { camera, controller } = harness(devices);
    await controller.start();
    await controller.switchTo("front-1");
    expect(camera.stopCalls).toBe(1);
    expect(camera.startCalls).toEqual([null, "front-1"]);
    expect(controller.getState().activeDeviceId).toBe("front-1");
    expect(controller.getState().devices).toEqual(devices);
  });

  it("ignores duplicate decode callbacks after the first result", async () => {
    const { camera, payloads, controller } = harness();
    await controller.start();
    camera.emitDecode("first-payload");
    camera.emitDecode("first-payload");
    camera.emitDecode("first-payload");
    expect(payloads).toHaveLength(1);
    expect(controller.getState().phase).toBe("paused");
  });

  it("resumes only after an explicit resume call", async () => {
    const { camera, payloads, controller } = harness();
    await controller.start();
    camera.emitDecode("first-payload");
    expect(camera.startCalls).toHaveLength(1);

    await controller.resume();
    expect(camera.startCalls).toHaveLength(2);
    camera.emitDecode("second-payload");
    expect(payloads).toEqual(["first-payload", "second-payload"]);
  });

  it("reports permission denial clearly", async () => {
    const { camera, controller } = harness();
    camera.failNextStart({ name: "NotAllowedError" });
    await controller.start();
    expect(controller.getState().phase).toBe("error");
    expect(controller.getState().error).toBe("permission_denied");
  });

  it("reports missing cameras clearly", async () => {
    const { camera, controller } = harness();
    camera.failNextStart({ name: "NotFoundError" });
    await controller.start();
    expect(controller.getState().error).toBe("no_camera");
  });

  it("reports insecure or unsupported contexts clearly", async () => {
    const { controller, camera } = harness([], { isSupported: () => false });
    await controller.start();
    expect(controller.getState().error).toBe("insecure_context");
    expect(camera.startCalls).toHaveLength(0);
  });

  it("classifies camera-in-use errors", () => {
    expect(classifyCameraError({ name: "NotReadableError" })).toBe(
      "camera_in_use"
    );
    expect(classifyCameraError({ name: "SomethingElse" })).toBe("unknown");
    expect(classifyCameraError(null)).toBe("unknown");
  });

  it("never logs or stores decoded payloads in camera modules", () => {
    for (const relative of [
      "features/scanner/camera-controller.ts",
      "features/scanner/components/camera-scanner.tsx",
      "features/scanner/components/scanner-shell.tsx",
      "features/scanner/components/scanner-result.tsx",
      "features/scanner/components/recent-validations.tsx",
      "features/scanner/components/manual-code-form.tsx",
    ]) {
      const source = readFileSync(
        join(srcDir, ...relative.split("/")),
        "utf8"
      );
      expect(source, relative).not.toContain("console.log");
      expect(source, relative).not.toContain("console.debug");
      expect(source, relative).not.toContain("console.error");
      expect(source, relative).not.toContain("localStorage");
      expect(source, relative).not.toContain("sessionStorage");
      expect(source, relative).not.toContain("indexedDB");
      expect(source, relative).not.toContain("document.cookie");
    }
  });
});
