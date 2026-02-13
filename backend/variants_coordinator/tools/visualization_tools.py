"""
Visualization tools for generating chart data from genomic analysis results.
These tools query existing annotations artifacts to create visualization-ready data.
"""

from typing import Dict, Any, List, Optional
from collections import Counter
import structlog

from google.adk.tools import FunctionTool, ToolContext
from ..models.variant import deserialize_data_from_artifact
from ..models.visualization import VisualizationType
from ..services.chart_data_service import ChartDataService
from ..core.acmg_genes import (
    ACMG_GENES_BY_CATEGORY, GeneCategory
)

logger = structlog.get_logger(__name__)


async def generate_chart_data_tool(
        chart_type: str,
        dimension: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
        tool_context: ToolContext = None
) -> Dict[str, Any]:
    """
    Generate chart data based on the requested type and parameters.

    Args:
        chart_type: Type of chart (bar, pie, histogram, heatmap, scatter)
        dimension: Primary data dimension (gene, chromosome, impact, significance, population)
        filters: Optional filters to apply (e.g., {"significance": "pathogenic"})
        limit: Maximum number of data points (for top-N charts)
        tool_context: ADK tool context containing state and artifacts

    Returns:
        Structured chart data ready for frontend visualization
    """
    tool_logger = logger.bind(tool="generate_chart_data")

    # Validate inputs
    try:
        viz_type = VisualizationType(chart_type.lower().strip())
    except ValueError:
        return {
            "status": "error",
            "message": f"Invalid chart type: {chart_type}. Valid types: {[e.value for e in VisualizationType]}"
        }

    # Check if annotations are available
    annotations_artifact_name = tool_context.state.get('annotations_artifact_name')
    if not annotations_artifact_name:
        return {
            "status": "error",
            "message": "No analysis results available. Please complete the analysis first."
        }

    try:
        # Load annotations artifact
        tool_logger.info("Loading annotations for visualization",
                         artifact=annotations_artifact_name,
                         chart_type=chart_type)

        annotations_artifact = await tool_context.load_artifact(filename=annotations_artifact_name)
        annotations_data = deserialize_data_from_artifact(annotations_artifact)

        # Extract components
        annotations = annotations_data.get('annotations', {})
        frequencies = annotations_data.get('frequencies', {})
        analysis_mode = annotations_data.get('analysis_mode', 'clinical')
        total_variants_analyzed = annotations_data.get('total_variants_analyzed', 0)

        tool_logger.info(f"Loaded {len(annotations)} annotations in {analysis_mode} mode")

        # Pre-filter annotations by gene if a gene filter is specified
        # This ensures all chart types (including heatmaps) respect the gene filter
        if filters and "gene" in filters:
            gene_filter = filters["gene"].upper()
            annotations = {
                vid: ann for vid, ann in annotations.items()
                if ann.gene_symbol and ann.gene_symbol.upper() == gene_filter
            }
            # Also filter frequencies to match
            frequencies = {vid: freq for vid, freq in frequencies.items() if vid in annotations}
            tool_logger.info(f"Pre-filtered to {len(annotations)} annotations for gene {gene_filter}")

        # Initialize chart service
        chart_service = ChartDataService(
            annotations=annotations,
            frequencies=frequencies,
            analysis_mode=analysis_mode
        )

        # Generate chart data based on type and dimension
        chart_data = None

        if viz_type == VisualizationType.BAR:
            if dimension == "chromosome":
                chart_data = chart_service.get_chromosome_distribution(limit=limit)
            elif dimension == "gene":
                chart_data = chart_service.get_gene_distribution(limit=limit or 20)
            elif dimension == "impact":
                chart_data = chart_service.get_impact_distribution()
            elif dimension == "category" and analysis_mode == "clinical":
                chart_data = chart_service.get_acmg_category_distribution()
            else:
                chart_data = chart_service.get_gene_distribution(limit=10)

        elif viz_type == VisualizationType.PIE:
            if dimension == "significance":
                chart_data = chart_service.get_significance_distribution()
            elif dimension == "category" and analysis_mode == "clinical":
                chart_data = chart_service.get_acmg_category_distribution()
            else:
                chart_data = chart_service.get_significance_distribution()

        elif viz_type == VisualizationType.HISTOGRAM:
            if dimension == "frequency":
                chart_data = chart_service.get_frequency_histogram()
            else:
                chart_data = chart_service.get_frequency_histogram()

        elif viz_type == VisualizationType.HEATMAP:
            chart_data = chart_service.get_population_heatmap(limit=limit or 50)

        elif viz_type == VisualizationType.SCATTER:
            chart_data = chart_service.get_frequency_vs_significance_scatter()

        if not chart_data:
            return {
                "status": "error",
                "message": f"Unable to generate {chart_type} chart for dimension {dimension}"
            }

        # Apply filters if provided (only for list-based chart data, not heatmaps/dicts)
        if filters and isinstance(chart_data, list):
            chart_data = apply_filters_to_chart_data(chart_data, filters)

        # Add metadata
        response = {
            "status": "success",
            "chart_type": chart_type,
            "dimension": dimension,
            "analysis_mode": analysis_mode,
            "data": chart_data,
            "metadata": {
                "total_annotations": len(annotations),
                "total_variants_analyzed": total_variants_analyzed,
                "filters_applied": filters or {},
                "data_points": len(chart_data) if isinstance(chart_data, list) else 1
            }
        }

        # Add mode-specific context
        if analysis_mode == "clinical":
            response["metadata"]["context"] = "ACMG Secondary Findings (84 genes)"
        else:
            response["metadata"]["context"] = "Comprehensive genome-wide analysis"

        tool_logger.info(f"Generated {chart_type} chart with {len(chart_data)} data points")
        return response

    except Exception as e:
        tool_logger.exception(f"Error generating chart data: {e}")
        return {
            "status": "error",
            "message": f"Failed to generate chart: {str(e)}"
        }


async def compare_populations_tool(
        gene: Optional[str] = None,
        populations: Optional[List[str]] = None,
        significance_filter: Optional[str] = None,
        limit: Optional[int] = None,
        tool_context: ToolContext = None
) -> Dict[str, Any]:
    """
    Compare variant frequencies across different populations.

    Args:
        gene: Specific gene to analyze (optional)
        populations: List of populations to compare (default: all)
        significance_filter: Filter by clinical significance
        limit: Maximum number of variants to compare
        tool_context: ADK tool context

    Returns:
        Population comparison data for visualization
    """
    tool_logger = logger.bind(tool="compare_populations")

    # Check annotations availability
    annotations_artifact_name = tool_context.state.get('annotations_artifact_name')
    if not annotations_artifact_name:
        return {
            "status": "error",
            "message": "No analysis results available."
        }

    try:
        # Load data
        annotations_artifact = await tool_context.load_artifact(filename=annotations_artifact_name)
        annotations_data = deserialize_data_from_artifact(annotations_artifact)

        annotations = annotations_data.get('annotations', {})
        frequencies = annotations_data.get('frequencies', {})
        analysis_mode = annotations_data.get('analysis_mode', 'clinical')

        # Default populations if not specified
        if not populations:
            populations = ["AFR", "AMR", "EAS", "NFE", "FIN", "ASJ", "SAS", "OTH"]

        # Initialize comparison data
        comparison_data = []

        # Filter annotations
        filtered_annotations = annotations

        if gene:
            filtered_annotations = {
                vid: ann for vid, ann in annotations.items()
                if ann.gene_symbol and ann.gene_symbol.upper() == gene.upper()
            }

        if significance_filter:
            filtered_annotations = {
                vid: ann for vid, ann in filtered_annotations.items()
                if ann.clinical_significance and
                   significance_filter.lower() in ann.clinical_significance.lower()
            }

        # Apply limit
        if limit:
            variant_ids = list(filtered_annotations.keys())[:limit]
            filtered_annotations = {
                vid: filtered_annotations[vid] for vid in variant_ids
            }

        # Build comparison data
        for variant_id, annotation in filtered_annotations.items():
            freq_data = frequencies.get(variant_id, {})

            if not freq_data:
                continue

            variant_comparison = {
                "variant_id": variant_id,
                "gene": annotation.gene_symbol,
                "significance": annotation.clinical_significance,
                "populations": {}
            }

            # Map population codes to frequencies
            pop_mapping = {
                "AFR": "af_afr",
                "AMR": "af_amr",
                "EAS": "af_eas",
                "NFE": "af_nfe",
                "FIN": "af_fin",
                "ASJ": "af_asj",
                "SAS": "af_sas",
                "OTH": "af_oth"
            }

            for pop in populations:
                if pop in pop_mapping:
                    freq_key = pop_mapping[pop]
                    freq_value = freq_data.get(freq_key, 0)
                    variant_comparison["populations"][pop] = freq_value

            # Add global frequency for reference
            variant_comparison["global_af"] = freq_data.get("af", 0)

            comparison_data.append(variant_comparison)

        # Calculate population statistics
        pop_stats = calculate_population_statistics(comparison_data, populations)

        tool_logger.info(f"Compared {len(comparison_data)} variants across {len(populations)} populations")

        return {
            "status": "success",
            "comparison_type": "population_frequencies",
            "gene": gene,
            "populations": populations,
            "data": comparison_data,
            "statistics": pop_stats,
            "metadata": {
                "analysis_mode": analysis_mode,
                "total_variants_compared": len(comparison_data),
                "filters": {
                    "gene": gene,
                    "significance": significance_filter
                }
            }
        }

    except Exception as e:
        tool_logger.exception(f"Error comparing populations: {e}")
        return {
            "status": "error",
            "message": f"Failed to compare populations: {str(e)}"
        }


async def filter_by_category_tool(
        category: str,
        include_frequencies: bool = True,
        tool_context: ToolContext = None
) -> Dict[str, Any]:
    """
    Filter variants by disease category (clinical mode only).

    Args:
        category: Disease category (cancer, cardiovascular, metabolic, other)
        include_frequencies: Whether to include population frequency data
        tool_context: ADK tool context

    Returns:
        Filtered variant data for the specified category
    """
    tool_logger = logger.bind(tool="filter_by_category")

    # Check annotations
    annotations_artifact_name = tool_context.state.get('annotations_artifact_name')
    if not annotations_artifact_name:
        return {
            "status": "error",
            "message": "No analysis results available."
        }

    try:
        # Load data
        annotations_artifact = await tool_context.load_artifact(filename=annotations_artifact_name)
        annotations_data = deserialize_data_from_artifact(annotations_artifact)

        annotations = annotations_data.get('annotations', {})
        frequencies = annotations_data.get('frequencies', {})
        analysis_mode = annotations_data.get('analysis_mode', 'clinical')

        # Category filtering only works in clinical mode
        if analysis_mode != "clinical":
            return {
                "status": "error",
                "message": "Category filtering is only available in clinical mode for ACMG genes.",
                "suggestion": "Try filtering by chromosome, gene, or significance instead."
            }

        # Map category string to GeneCategory enum
        category_mapping = {
            "cancer": GeneCategory.CANCER,
            "cardiovascular": GeneCategory.CARDIOVASCULAR,
            "metabolic": GeneCategory.METABOLIC,
            "other": GeneCategory.OTHER
        }

        category_enum = category_mapping.get(category.lower())
        if not category_enum:
            return {
                "status": "error",
                "message": f"Invalid category: {category}. Valid categories: {list(category_mapping.keys())}"
            }

        # Get genes in this category
        genes_in_category = ACMG_GENES_BY_CATEGORY[category_enum]

        # Filter annotations
        filtered_data = []
        for variant_id, annotation in annotations.items():
            if annotation.gene_symbol and annotation.gene_symbol in genes_in_category:
                variant_data = {
                    "variant_id": variant_id,
                    "gene": annotation.gene_symbol,
                    "significance": annotation.clinical_significance,
                    "condition": annotation.condition,
                    "category": category
                }

                # Add frequencies if requested
                if include_frequencies and variant_id in frequencies:
                    freq_data = frequencies[variant_id]
                    variant_data["frequencies"] = {
                        "global": freq_data.get("af", 0),
                        "source": freq_data.get("source", "Unknown")
                    }

                filtered_data.append(variant_data)

        # Calculate category statistics
        gene_counts = Counter(v["gene"] for v in filtered_data)
        significance_counts = Counter(v["significance"] for v in filtered_data if v["significance"])

        tool_logger.info(f"Filtered {len(filtered_data)} variants in {category} category")

        return {
            "status": "success",
            "category": category,
            "data": filtered_data,
            "statistics": {
                "total_variants": len(filtered_data),
                "unique_genes": len(gene_counts),
                "gene_distribution": dict(gene_counts),
                "significance_distribution": dict(significance_counts),
                "genes_in_category": sorted(list(genes_in_category))
            },
            "metadata": {
                "analysis_mode": "clinical",
                "category_description": category_enum.value
            }
        }

    except Exception as e:
        tool_logger.exception(f"Error filtering by category: {e}")
        return {
            "status": "error",
            "message": f"Failed to filter by category: {str(e)}"
        }


# Helper functions
def apply_filters_to_chart_data(
        chart_data: List[Dict[str, Any]],
        filters: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Apply filters to chart data."""
    filtered = chart_data

    for key, value in filters.items():
        if key == "min_frequency":
            filtered = [d for d in filtered if d.get("frequency", 0) >= value]
        elif key == "max_frequency":
            filtered = [d for d in filtered if d.get("frequency", 1) <= value]
        elif key == "significance":
            filtered = [d for d in filtered if value.lower() in d.get("significance", "").lower()]
        elif key == "gene":
            filtered = [d for d in filtered if d.get("gene") == value]

    return filtered


def calculate_population_statistics(
        comparison_data: List[Dict[str, Any]],
        populations: List[str]
) -> Dict[str, Any]:
    """Calculate statistics across populations."""
    stats = {
        "mean_frequencies": {},
        "variants_present": {},
        "variants_absent": {},
        "population_specific": {}
    }

    for pop in populations:
        frequencies = []
        present_count = 0
        absent_count = 0

        for variant in comparison_data:
            freq = variant["populations"].get(pop, 0)
            frequencies.append(freq)
            if freq > 0:
                present_count += 1
            else:
                absent_count += 1

        if frequencies:
            stats["mean_frequencies"][pop] = sum(frequencies) / len(frequencies)
            stats["variants_present"][pop] = present_count
            stats["variants_absent"][pop] = absent_count

            # Check if any variants are specific to this population
            pop_specific = []
            for variant in comparison_data:
                this_pop_freq = variant["populations"].get(pop, 0)
                other_pops_freq = [
                    variant["populations"].get(p, 0)
                    for p in populations if p != pop
                ]
                if this_pop_freq > 0 and all(f == 0 for f in other_pops_freq):
                    pop_specific.append(variant["variant_id"])

            stats["population_specific"][pop] = pop_specific

    return stats


# Tool instantiations for ADK
generate_chart_tool = FunctionTool(func=generate_chart_data_tool)
compare_populations_tool_instance = FunctionTool(func=compare_populations_tool)
filter_category_tool = FunctionTool(func=filter_by_category_tool)
