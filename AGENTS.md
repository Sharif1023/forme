## Project rules

- The application runs locally as React/Vite, Express and MySQL. Keep API credentials and database access on the server.
- Preserve existing database records and uploaded images when updating the application.
- FORME garments are generated from per-model BodySpec profiles (src/lib/forme/bodies.ts) so every garment fits both models; edit profiles, not individual paths.
- Studio state (outfits, bag, saved looks) lives in a pure reducer in src/lib/forme/state.ts and persists to localStorage; keep logic there so it stays testable.
