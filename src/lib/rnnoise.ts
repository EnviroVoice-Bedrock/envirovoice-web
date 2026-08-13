import { loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPathUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

export const rnnoiseWorkletPath = rnnoiseWorkletPathUrl;

// the compiled WASM binary is the same regardless of how many AudioContexts
// we open over the session — fetch/decode it once and reuse it
let cached: Promise<ArrayBuffer> | null = null;

export function getRnnoiseWasmBinary(): Promise<ArrayBuffer> {
  if (!cached) {
    cached = loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseWasmSimdPath });
  }
  return cached;
}
