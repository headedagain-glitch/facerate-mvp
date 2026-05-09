# FaceRate MVP

FaceRate MVP is a local browser facial-proportion analysis app built with Next.js, TypeScript, Tailwind CSS, and MediaPipe Face Landmarker.

It lets an adult user upload or capture a front-facing face photo, detects dense face landmarks in the browser, draws visible landmark dots and measurement lines, calculates approximate symmetry/proportion metrics, and generates a safe looks-analysis report.

## Safety and Privacy

- Do not analyze children. The app requires an `18+` confirmation before upload or camera capture.
- The app does not infer race, ethnicity, gender identity, health, personality, identity, or objective attractiveness.
- Photos are processed locally in the browser with MediaPipe and are not uploaded or stored by this MVP.
- The report uses the label `Aesthetic balance estimate` and includes this disclaimer: `This is an experimental computer-vision estimate, not an objective measure of attractiveness.`

## Features

- Drag-and-drop image upload.
- Camera capture when the browser grants camera access.
- Client-side MediaPipe Face Landmarker detection through `@mediapipe/tasks-vision`.
- Canvas overlay for jawline, cheekbones, eyes, eyebrows, nose, lips, chin, face centerline, and measurement lines.
- Approximate metrics for symmetry, left/right balance, face width-to-height, eye spacing, jaw/nose/mouth ratios, cheekbone prominence, jawline definition, and facial thirds.
- Error states for no face, multiple faces, side angle, low resolution, and off-center photo conditions.
- Export report as JSON and annotated overlay as PNG.
- Reset/delete photo action.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Architecture

```text
app/
  layout.tsx
  page.tsx
components/
  AnalysisReport.tsx
  FaceCanvas.tsx
  ImageUploader.tsx
lib/
  faceLandmarks.ts
  metrics.ts
  reportGenerator.ts
types/
  face.ts
```

## Technical Notes

MediaPipe Face Landmarker is loaded client-side. The model and WASM assets are fetched from the public MediaPipe/CDN URLs at runtime, so the first analysis can take a moment. Landmark indexes are grouped in `lib/faceLandmarks.ts`; the formulas in `lib/metrics.ts` are transparent approximations based on normalized landmark positions mapped onto image pixels.

The metric formulas are intentionally conservative and photo-dependent. They are useful for an MVP visualization and structured report, not for scientific, medical, or objective attractiveness claims.
