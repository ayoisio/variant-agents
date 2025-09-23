"""
Pydantic models for visualization requests and responses.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class VisualizationType(str, Enum):
    """Types of visualizations available."""
    BAR = "bar"
    PIE = "pie"
    HISTOGRAM = "histogram"
    HEATMAP = "heatmap"
    SCATTER = "scatter"
    LINE = "line"
    STACKED_BAR = "stacked_bar"
    BUBBLE = "bubble"
    SANKEY = "sankey"
    TREEMAP = "treemap"


class PopulationType(str, Enum):
    """gnomAD population codes."""
    AFRICAN = "AFR"
    LATINO = "AMR"
    EAST_ASIAN = "EAS"
    EUROPEAN_NON_FINNISH = "NFE"
    FINNISH = "FIN"
    ASHKENAZI_JEWISH = "ASJ"
    SOUTH_ASIAN = "SAS"
    OTHER = "OTH"


class ClinicalSignificanceType(str, Enum):
    """Clinical significance categories."""
    PATHOGENIC = "pathogenic"
    LIKELY_PATHOGENIC = "likely_pathogenic"
    VUS = "uncertain_significance"
    LIKELY_BENIGN = "likely_benign"
    BENIGN = "benign"
    NOT_PROVIDED = "not_provided"


class ChartDimension(str, Enum):
    """Data dimensions for chart generation."""
    GENE = "gene"
    CHROMOSOME = "chromosome"
    IMPACT = "impact"
    SIGNIFICANCE = "significance"
    POPULATION = "population"
    FREQUENCY = "frequency"
    CATEGORY = "category"
    CONDITION = "condition"


class ChartRequest(BaseModel):
    """Request model for chart generation."""
    chart_type: VisualizationType = Field(..., description="Type of chart to generate")
    dimension: Optional[ChartDimension] = Field(None, description="Primary data dimension")
    gene_list: Optional[List[str]] = Field(None, description="Specific genes to include")
    populations: Optional[List[PopulationType]] = Field(None, description="Populations to compare")
    filters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional filters")
    limit: Optional[int] = Field(None, description="Maximum number of data points")
    group_by: Optional[str] = Field(None, description="Secondary grouping dimension")
    sort_by: Optional[str] = Field("value", description="Sort field")
    sort_order: Optional[str] = Field("desc", description="Sort order (asc/desc)")


class DataPoint(BaseModel):
    """Individual data point for charts."""
    label: str = Field(..., description="Data point label")
    value: float = Field(..., description="Numeric value")
    category: Optional[str] = Field(None, description="Category for grouping")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")


class ChartAxis(BaseModel):
    """Axis configuration for charts."""
    label: str = Field(..., description="Axis label")
    type: str = Field("linear", description="Axis type (linear/log/category)")
    min_value: Optional[float] = Field(None, description="Minimum axis value")
    max_value: Optional[float] = Field(None, description="Maximum axis value")


class ChartSeries(BaseModel):
    """Data series for multi-series charts."""
    name: str = Field(..., description="Series name")
    data: List[DataPoint] = Field(..., description="Data points in series")
    color: Optional[str] = Field(None, description="Series color")
    type: Optional[str] = Field(None, description="Series type for mixed charts")


class ChartResponse(BaseModel):
    """Response model containing chart data."""
    status: str = Field(..., description="Response status (success/error)")
    chart_type: VisualizationType = Field(..., description="Type of chart")
    title: Optional[str] = Field(None, description="Chart title")
    subtitle: Optional[str] = Field(None, description="Chart subtitle")
    data: List[Dict[str, Any]] = Field(..., description="Chart data")
    series: Optional[List[ChartSeries]] = Field(None, description="Data series for multi-series charts")
    x_axis: Optional[ChartAxis] = Field(None, description="X-axis configuration")
    y_axis: Optional[ChartAxis] = Field(None, description="Y-axis configuration")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    timestamp: datetime = Field(default_factory=datetime.now, description="Generation timestamp")


class HeatmapData(BaseModel):
    """Specialized data structure for heatmap visualizations."""
    rows: List[str] = Field(..., description="Row labels")
    columns: List[str] = Field(..., description="Column labels")
    values: List[List[float]] = Field(..., description="2D matrix of values")
    color_scale: Optional[Dict[str, str]] = Field(None, description="Color scale configuration")


class PopulationComparisonData(BaseModel):
    """Data structure for population comparison charts."""
    variant_id: str = Field(..., description="Variant identifier")
    gene: Optional[str] = Field(None, description="Gene symbol")
    significance: Optional[str] = Field(None, description="Clinical significance")
    populations: Dict[str, float] = Field(..., description="Population frequencies")
    global_frequency: Optional[float] = Field(None, description="Global allele frequency")


class CategoryDistribution(BaseModel):
    """Distribution of variants by category."""
    category: str = Field(..., description="Category name")
    count: int = Field(..., description="Variant count")
    percentage: float = Field(..., description="Percentage of total")
    genes: List[str] = Field(default_factory=list, description="Genes in category")
    subcategories: Optional[Dict[str, int]] = Field(None, description="Subcategory breakdown")


class FrequencyBin(BaseModel):
    """Frequency histogram bin."""
    range_start: float = Field(..., description="Bin start value")
    range_end: float = Field(..., description="Bin end value")
    count: int = Field(..., description="Number of variants in bin")
    label: str = Field(..., description="Bin label")
    variants: Optional[List[str]] = Field(None, description="Variant IDs in bin")


class VisualizationConfig(BaseModel):
    """Configuration for visualization rendering."""
    width: Optional[int] = Field(None, description="Chart width in pixels")
    height: Optional[int] = Field(None, description="Chart height in pixels")
    color_scheme: Optional[str] = Field("default", description="Color scheme name")
    show_legend: bool = Field(True, description="Show chart legend")
    show_labels: bool = Field(True, description="Show data labels")
    interactive: bool = Field(True, description="Enable interactivity")
    export_formats: List[str] = Field(
        default_factory=lambda: ["png", "svg", "csv"],
        description="Available export formats"
    )
