// Fixed system contract, supplied to the developer; never taken from candidate JS.
export const RUNTIME_CONTRACT=Object.freeze({
 version:'browser-v1',
 common:['Use external local scripts/styles; no inline event handlers, frames, workers, remote assets or network services.',
  'Provide exactly one visible [data-sim-view] canvas or SVG for the simulation (at least 160x100 pixels).',
  'Mark exactly one primary range/select/checkbox with data-sim-control. Give it an accessible label. Changing it must change both the diagram and visible [data-sim-output] text.',
  'Provide a visible button [data-sim-reset] that restores the primary control, output and view to their initial state.',
  'Keep [data-sim-assumptions] visible with the model assumptions and limits; support reduced motion and 390px/1440px layouts.'],
 threeD:['Use a real WebGL canvas for [data-sim-view]. Provide a labelled range [data-sim-camera] that changes the rendered view.',
  'Provide a button [data-sim-fallback] showing a visible non-canvas [data-sim-alternative] explanation/table. Show that alternative automatically if WebGL is unavailable.'],
 limits:{seconds:45,actionMilliseconds:3000,requests:200,pages:1,viewports:[390,1440]},
});
