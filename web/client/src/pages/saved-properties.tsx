import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { App, Button, Card, Divider, Empty, Skeleton, Tag, Typography } from "antd";
import { HeartOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { showVestaMessage } from "@/lib/vesta-message";
import type { SavedProperty } from "@shared/schema";
import {
  MapPin,
  Trash2,
  Loader2,
  TrendingUp,
  Map,
  Calendar,
} from "lucide-react";
import { VestaBrandLogoMark } from "@/components/vesta-brand-logo";
import { useUiLocale } from "@/lib/ui-locale";

const { Title, Text } = Typography;

type SavedPropertyCardCopy = {
  unknownAddress: string;
  refPrefix: string;
  grossYield: string;
  netYield: string;
  roi: string;
  opportunityScore: string;
  savedPrefix: string;
  deleteAria: string;
};

function PropertyCardSkeleton() {
  return (
    <Card className="border-border" size="small">
      <Skeleton active title={{ width: "66%" }} paragraph={{ rows: 2 }} />
      <Divider className="my-3" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton.Button active block />
        <Skeleton.Button active block />
        <Skeleton.Button active block />
      </div>
    </Card>
  );
}

function MetricBadge({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === "null" || value === "undefined") return null;
  return (
    <div className="flex flex-col items-center glass-panel rounded-lg px-3 py-2 text-center min-w-0">
      <span className="text-xs text-muted-foreground truncate w-full">{label}</span>
      <span className="text-sm font-semibold text-foreground mt-0.5">{value}</span>
    </div>
  );
}

function formatDate(dateStr: string, locale: "en" | "es") {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function PropertyCard({
  property,
  onDelete,
  isDeleting,
  card,
  uiLocale,
}: {
  property: SavedProperty;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  card: SavedPropertyCardCopy;
  uiLocale: "en" | "es";
}) {
  return (
    <Card className="border-border hover:border-primary/30 transition-colors" size="small">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <VestaBrandLogoMark imgClassName="h-4 w-auto max-h-4" />
            <Title level={5} className="!mb-0 !text-sm font-semibold truncate">
              {property.address || card.unknownAddress}
            </Title>
          </div>
          {property.referenciaCatastral && (
            <Text type="secondary" className="text-xs font-mono block">
              {card.refPrefix} {property.referenciaCatastral}
            </Text>
          )}
        </div>
        <Button
          type="text"
          danger
          shape="circle"
          icon={isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          onClick={() => onDelete(property.id)}
          disabled={isDeleting}
          aria-label={card.deleteAria}
          data-testid={`delete-property-${property.id}`}
        />
      </div>

      <div className="px-0 pb-0 pt-1 space-y-3">
        {(property.lat || property.lon) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>
              {parseFloat(property.lat ?? "0").toFixed(4)}, {parseFloat(property.lon ?? "0").toFixed(4)}
            </span>
          </div>
        )}

        <Divider className="my-2" />

        <div className="grid grid-cols-3 gap-2">
          <MetricBadge
            label={card.grossYield}
            value={
              property.grossYield ? `${parseFloat(property.grossYield).toFixed(1)}%` : property.grossYield
            }
          />
          <MetricBadge
            label={card.netYield}
            value={property.netYield ? `${parseFloat(property.netYield).toFixed(1)}%` : property.netYield}
          />
          <MetricBadge label={card.roi} value={property.roi ? `${parseFloat(property.roi).toFixed(1)}%` : property.roi} />
        </div>

        {property.opportunityScore && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">
              {card.opportunityScore}{" "}
              <span className="font-semibold text-primary">
                {parseFloat(property.opportunityScore).toFixed(0)}/100
              </span>
            </span>
          </div>
        )}

        {property.savedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>
              {card.savedPrefix} {formatDate(property.savedAt, uiLocale)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta: string;
}) {
  const [, navigate] = useLocation();
  return (
    <Empty
      image={<HeartOutlined style={{ fontSize: 48, color: "hsl(var(--muted-foreground))" }} />}
      styles={{ image: { height: 56 } }}
      description={
        <div style={{ textAlign: "center", maxWidth: 360, margin: "0 auto" }}>
          <Title level={5} style={{ marginBottom: 8 }}>
            {title}
          </Title>
          <Text type="secondary">{description}</Text>
        </div>
      }
    >
      <Button type="primary" onClick={() => navigate("/map")} data-testid="go-to-map" icon={<Map className="h-4 w-4" />}>
        {cta}
        <ArrowRightOutlined />
      </Button>
    </Empty>
  );
}

export default function SavedProperties() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const { locale } = useUiLocale();
  const copy =
    locale === "es"
      ? {
          pageTitle: "Propiedades guardadas",
          subtitleLoading: "Tus propiedades analizadas",
          subtitleCount: (n: number) =>
            `${n} propiedad${n !== 1 ? "es" : ""} guardada${n !== 1 ? "s" : ""}`,
          emptyTitle: "Aún no hay propiedades guardadas",
          emptyDesc: "Analiza una propiedad en el mapa y guárdala aquí.",
          goMap: "Ir al mapa",
          totalTag: (n: number) => `${n} en total`,
          removedTitle: "Propiedad eliminada",
          removedDesc: "Se ha quitado de las propiedades guardadas.",
          deleteErrorTitle: "No se pudo eliminar",
          card: {
            unknownAddress: "Dirección desconocida",
            refPrefix: "Ref.",
            grossYield: "Rent. bruta",
            netYield: "Rent. neta",
            roi: "ROI",
            opportunityScore: "Puntuación de oportunidad:",
            savedPrefix: "Guardado el",
            deleteAria: "Eliminar propiedad guardada",
          } satisfies SavedPropertyCardCopy,
        }
      : {
          pageTitle: "Saved Properties",
          subtitleLoading: "Your analyzed properties",
          subtitleCount: (n: number) => `${n} propert${n !== 1 ? "ies" : "y"} saved`,
          emptyTitle: "No saved properties yet",
          emptyDesc: "Start by analyzing a property on the map to save it here.",
          goMap: "Go to Map",
          totalTag: (n: number) => `${n} total`,
          removedTitle: "Property removed",
          removedDesc: "Deleted from saved properties.",
          deleteErrorTitle: "Could not delete",
          card: {
            unknownAddress: "Unknown address",
            refPrefix: "Ref:",
            grossYield: "Gross Yield",
            netYield: "Net Yield",
            roi: "ROI",
            opportunityScore: "Opportunity Score:",
            savedPrefix: "Saved",
            deleteAria: "Remove saved property",
          } satisfies SavedPropertyCardCopy,
        };

  const { data: properties, isLoading } = useQuery<SavedProperty[]>({
    queryKey: ["/api/properties"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/properties/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/properties"] });
      showVestaMessage(message, {
        title: copy.removedTitle,
        description: copy.removedDesc,
        variant: "success",
      });
    },
    onError: (err: any) => {
      showVestaMessage(message, {
        title: copy.deleteErrorTitle,
        description: err?.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            {copy.pageTitle}
          </Title>
          <Text type="secondary">
            {!isLoading && properties
              ? copy.subtitleCount(properties.length)
              : copy.subtitleLoading}
          </Text>
        </div>
        {properties && properties.length > 0 && <Tag>{copy.totalTag(properties.length)}</Tag>}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!isLoading && (!properties || properties.length === 0) && (
        <EmptyState title={copy.emptyTitle} description={copy.emptyDesc} cta={copy.goMap} />
      )}

      {!isLoading && properties && properties.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="properties-grid">
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === property.id}
              card={copy.card}
              uiLocale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}
