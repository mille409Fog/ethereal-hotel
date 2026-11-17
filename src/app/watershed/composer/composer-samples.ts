/**
 * antialiasing for the buffer the scene is drawn into, which is a property of the quality tier
 * (`quality/quality-calibration.ts`) and so changes when the meter steps down.
 *
 * the composer draws into two buffers, the second a clone of the first, and the scene can land in either, so both
 * take the samples. a buffer is allocated with its samples when it is first drawn into, so changing them means
 * releasing it; the next frame allocates it again, depth texture and all. a buffer already at the count is left
 * alone, so a tier that changes only the resolution reallocates nothing here.
 */
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';

export function drawWithSamples(composer: EffectComposer, samples: number): void {
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    if (target.samples !== samples) {
      target.samples = samples;
      target.dispose();
    }
  }
}
