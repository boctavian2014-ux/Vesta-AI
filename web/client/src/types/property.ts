export type PropertyPin = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  address?: string;
  opportunityScore?: number;
};

export type IdentifiedProperty = {
  referenciaCatastral?: string;
  address?: string;
  anoConstruccion?: string | number;
  superficie?: string | number;
  municipio?: string;
  provincia?: string;
  oportunityScore?: string | number;
  _raw?: unknown;
};

export type StreetViewMetadataResult = {
  status: string;
  ok: boolean;
  errorMessage?: string;
  location?: {
    lat: number;
    lng: number;
    panoId?: string;
  };
  source?: "default" | "outdoor";
  radius?: number;
};
