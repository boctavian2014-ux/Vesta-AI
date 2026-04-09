import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useHashLocation } from "wouter/use-hash-location";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
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

function PropertyCardSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Separator className="my-3" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </CardContent>
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
    <Card className="border-border hover:border-primary/30 transition-colors">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <VestaBrandLogoMark imgClassName="h-4 w-auto max-h-4" />
              <CardTitle className="text-sm font-semibold truncate">
                {property.address || "Unknown address"}
              </CardTitle>
            </div>
            {property.referenciaCatastral && (
              <p className="text-xs text-muted-foreground font-mono">
                Ref: {property.referenciaCatastral}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(property.id)}
            disabled={isDeleting}
            data-testid={`delete-property-${property.id}`}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Location */}
        {(property.lat || property.lon) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>
              {parseFloat(property.lat ?? "0").toFixed(4)},{" "}
              {parseFloat(property.lon ?? "0").toFixed(4)}
            </span>
          </div>
        )}

        <Separator />

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2">
          <MetricBadge
            label="Gross Yield"
            value={
              property.grossYield
                ? `${parseFloat(property.grossYield).toFixed(1)}%`
                : property.grossYield
            }
          />
          <MetricBadge
            label="Net Yield"
            value={
              property.netYield
                ? `${parseFloat(property.netYield).toFixed(1)}%`
                : property.netYield
            }
          />
          <MetricBadge
            label="ROI"
            value={
              property.roi
                ? `${parseFloat(property.roi).toFixed(1)}%`
                : property.roi
            }
          />
        </div>

        {/* Opportunity score */}
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

        {/* Saved date */}
        {property.savedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Saved {formatDate(property.savedAt)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const [, navigate] = useHashLocation();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="rounded-full glass-panel p-4">
        <VestaBrandLogoMark imgClassName="h-8 w-auto max-h-8 opacity-80" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          No saved properties yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Start by analyzing a property on the map to save it here.
        </p>
      </div>
      <Button
        onClick={() => navigate("/map")}
        className="gap-2"
        data-testid="go-to-map"
      >
        <Map className="h-4 w-4" />
        Go to Map
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function SavedProperties() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: properties, isLoading } = useQuery<SavedProperty[]>({
    queryKey: ["/api/properties"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const deletingIds = new Set<number>();

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/properties/${id}`);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: "Property removed", description: "Deleted from saved properties." });
    },
    onError: (err: any) => {
      toast({
        title: "Could not delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Saved Properties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {!isLoading && properties
              ? `${properties.length} propert${properties.length !== 1 ? "ies" : "y"} saved`
              : "Your analyzed properties"}
          </p>
        </div>
        {properties && properties.length > 0 && (
          <Badge variant="secondary">{properties.length} total</Badge>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!properties || properties.length === 0) && <EmptyState />}

      {/* Property grid */}
      {!isLoading && properties && properties.length > 0 && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          data-testid="properties-grid"
        >
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              onDelete={handleDelete}
              isDeleting={
                deleteMutation.isPending && deleteMutation.variables === property.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
