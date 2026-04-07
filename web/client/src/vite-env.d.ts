/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_PRET_NOTA_SIMPLE_EUR?: string;
  readonly VITE_PRET_RAPORT_EXPERT_EUR?: string;
  readonly VITE_PRET_EXPERT_EUR?: string;
  readonly VITE_GOOGLE_MAPS_JS_API_KEY?: string;
  readonly VITE_GOOGLE_MAPS_EMBED_KEY?: string;
  /** Stripe publishable key (pk_live_… / pk_test_…) for Payment Element on the map checkout modal */
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
