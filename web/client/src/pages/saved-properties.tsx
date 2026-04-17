import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { App, Button, Card, Divider, Skeleton, Tag, Typography } from "antd";
import { showVestaMessage } from "@/lib/vesta-message";
import type { SavedProperty } from "@shared/schema";
import {
  MapPin,
  Trash2,
  Loader2,
  TrendingUp,
  Map,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { VestaBrandLogoMark } from "@/components/vesta-brand-logo";

const { Title, Text } = Typography;

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

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function PropertyCard({
  property,
  onDelete,
  isDeleting,
}: {
  property: SavedProperty;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  return (
    <Card className="border-border hover:border-primary/30 transition-colors" size="small">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <VestaBrandLogoMark imgClassName="h-4 w-auto max-h-4" />
            <Title level={5} className="!mb-0 !text-sm font-semibold truncate">
              {property.address || "Unknown address"}
            </Title>
          </div>
          {property.referenciaCatastral && (
            <Text type="secondary" className="text-xs font-mono block">
              Ref: {property.referenciaCatastral}
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
            label="Gross Yield"
            value={
              property.grossYield ? `${parseFloat(property.grossYield).toFixed(1)}%` : property.grossYield
            }
          />
          <MetricBadge
            label="Net Yield"
            value={property.netYield ? `${parseFloat(property.netYield).toFixed(1)}%` : property.netYield}
          />
          <MetricBadge label="ROI" value={property.roi ? `${parseFloat(property.roi).toFixed(1)}%` : property.roi} />
        </div>

        {property.opportunityScore && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">
              Opportunity Score:{" "}
              <span className="font-semibold text-primary">
                {parseFloat(property.opportunityScore).toFixed(0)}/100
              </span>
            </span>
          </div>
        )}

        {property.savedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Saved {formatDate(property.savedAt)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function EmptyState() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="rounded-full glass-panel p-4">
        <VestaBrandLogoMark imgClassName="h-8 w-auto max-h-8 opacity-80" />
      </div>
      <div>
        <Title level={5}>No saved properties yet</Title>
        <Text type="secondary" className="block max-w-xs">
          Start by analyzing a property on the map to save it here.
        </Text>
      </div>
      <Button type="primary" onClick={() => navigate("/map")} data-testid="go-to-map" icon={<Map className="h-4 w-4" />}>
        Go to Map
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}

export default function SavedProperties() {
  const qc = useQueryClient();
  const { message } = App.useApp();

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
        title: "Property removed",
        description: "Deleted from saved properties.",
        variant: "success",
      });
    },
    onError: (err: any) => {
      showVestaMessage(message, {
        title: "Could not delete",
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
            Saved Properties
          </Title>
          <Text type="secondary">
            {!isLoading && properties
              ? `${properties.length} propert${properties.length !== 1 ? "ies" : "y"} saved`
              : "Your analyzed properties"}
          </Text>
        </div>
        {properties && properties.length > 0 && <Tag>{properties.length} total</Tag>}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!isLoading && (!properties || properties.length === 0) && <EmptyState />}

      {!isLoading && properties && properties.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="properties-grid">
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              onDelete={handleDelete}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === property.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
