"""
Service layer for extracting and processing visualization data from annotations.
"""

from typing import Dict, Any, List, Optional
from collections import Counter, defaultdict
import math
import structlog

from ..models.variant import VariantAnnotation
from ..core.acmg_genes import (
    get_gene_category, GeneCategory,
)

logger = structlog.get_logger(__name__)


class ChartDataService:
    """
    Service for generating chart-ready data from annotations.
    """

    def __init__(
            self,
            annotations: Dict[str, VariantAnnotation],
            frequencies: Dict[str, Dict],
            analysis_mode: str = "clinical"
    ):
        """
        Initialize the chart data service.

        Args:
            annotations: Dictionary of variant annotations
            frequencies: Dictionary of gnomAD frequency data
            analysis_mode: Analysis mode (clinical/research)
        """
        self.annotations = annotations
        self.frequencies = frequencies
        self.analysis_mode = analysis_mode
        self.logger = logger.bind(service="chart_data")

    def get_chromosome_distribution(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get variant distribution by chromosome.

        Returns:
            List of dictionaries with chromosome and count data
        """
        chrom_counts = Counter()

        for variant_id in self.annotations:
            # Extract chromosome from variant_id (format: chr:pos:ref>alt)
            try:
                chrom = variant_id.split(':')[0]
                chrom_counts[chrom] += 1
            except:
                continue

        # Sort chromosomes naturally (1-22, X, Y)
        sorted_chroms = []

        # Numeric chromosomes
        numeric_chroms = []
        for chrom in chrom_counts:
            try:
                num = int(chrom.replace('chr', ''))
                numeric_chroms.append((num, chrom))
            except:
                pass

        numeric_chroms.sort(key=lambda x: x[0])
        sorted_chroms.extend([c[1] for c in numeric_chroms])

        # Add X and Y if present
        for special in ['chrX', 'X', 'chrY', 'Y']:
            if special in chrom_counts:
                sorted_chroms.append(special)

        # Build chart data
        chart_data = []
        for chrom in sorted_chroms:
            if chrom in chrom_counts:
                chart_data.append({
                    "name": chrom,
                    "value": chrom_counts[chrom],
                    "category": "chromosome"
                })

        if limit:
            chart_data = chart_data[:limit]

        return chart_data

    def get_gene_distribution(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get top genes by variant count.

        Args:
            limit: Maximum number of genes to return

        Returns:
            List of gene distribution data
        """
        gene_counts = Counter()
        gene_significance = defaultdict(lambda: {"pathogenic": 0, "benign": 0, "vus": 0})

        for variant_id, annotation in self.annotations.items():
            if annotation.gene_symbol:
                gene_counts[annotation.gene_symbol] += 1

                # Track significance
                if annotation.clinical_significance:
                    sig_lower = annotation.clinical_significance.lower()
                    if "pathogenic" in sig_lower:
                        gene_significance[annotation.gene_symbol]["pathogenic"] += 1
                    elif "benign" in sig_lower:
                        gene_significance[annotation.gene_symbol]["benign"] += 1
                    else:
                        gene_significance[annotation.gene_symbol]["vus"] += 1

        # Get top genes
        top_genes = gene_counts.most_common(limit)

        chart_data = []
        for gene, count in top_genes:
            data_point = {
                "name": gene,
                "value": count,
                "category": "gene"
            }

            # Add ACMG category if in clinical mode
            if self.analysis_mode == "clinical":
                category = get_gene_category(gene)
                if category:
                    data_point["acmg_category"] = category.value

            # Add significance breakdown
            data_point["pathogenic"] = gene_significance[gene]["pathogenic"]
            data_point["benign"] = gene_significance[gene]["benign"]
            data_point["vus"] = gene_significance[gene]["vus"]

            chart_data.append(data_point)

        return chart_data

    def get_impact_distribution(self) -> List[Dict[str, Any]]:
        """
        Get distribution of variants by impact level.

        Returns:
            Impact distribution data
        """
        impact_counts = Counter()
        impact_map = {
            "HIGH": "High Impact",
            "MODERATE": "Moderate Impact",
            "LOW": "Low Impact",
            "MODIFIER": "Modifier"
        }

        for annotation in self.annotations.values():
            # Try to get impact from annotation
            # This would come from VEP data if available
            impact = None
            if hasattr(annotation, 'impact'):
                impact = annotation.impact

            if impact:
                impact_counts[impact] += 1
            else:
                impact_counts["Unknown"] += 1

        chart_data = []
        for impact in ["HIGH", "MODERATE", "LOW", "MODIFIER", "Unknown"]:
            if impact in impact_counts:
                chart_data.append({
                    "name": impact_map.get(impact, impact),
                    "value": impact_counts[impact],
                    "category": "impact",
                    "severity": impact
                })

        return chart_data

    def get_significance_distribution(self) -> List[Dict[str, Any]]:
        """
        Get distribution of variants by clinical significance.

        Returns:
            Clinical significance distribution data
        """
        sig_counts = Counter()

        for annotation in self.annotations.values():
            if annotation.clinical_significance:
                # Normalize significance categories
                sig_lower = annotation.clinical_significance.lower()
                if "pathogenic" in sig_lower and "likely" not in sig_lower:
                    category = "Pathogenic"
                elif "likely pathogenic" in sig_lower:
                    category = "Likely Pathogenic"
                elif "uncertain" in sig_lower or "vus" in sig_lower:
                    category = "VUS"
                elif "likely benign" in sig_lower:
                    category = "Likely Benign"
                elif "benign" in sig_lower and "likely" not in sig_lower:
                    category = "Benign"
                else:
                    category = "Other"

                sig_counts[category] += 1
            else:
                sig_counts["Not Provided"] += 1

        # Order by clinical importance
        ordered_categories = [
            "Pathogenic",
            "Likely Pathogenic",
            "VUS",
            "Likely Benign",
            "Benign",
            "Not Provided",
            "Other"
        ]

        chart_data = []
        for category in ordered_categories:
            if category in sig_counts:
                chart_data.append({
                    "name": category,
                    "value": sig_counts[category],
                    "category": "significance"
                })

        return chart_data

    def get_acmg_category_distribution(self) -> List[Dict[str, Any]]:
        """
        Get distribution by ACMG gene categories (clinical mode only).

        Returns:
            ACMG category distribution data
        """
        if self.analysis_mode != "clinical":
            return []

        category_counts = Counter()
        category_genes = defaultdict(set)

        for annotation in self.annotations.values():
            if annotation.gene_symbol:
                category = get_gene_category(annotation.gene_symbol)
                if category:
                    category_counts[category.value] += 1
                    category_genes[category.value].add(annotation.gene_symbol)

        chart_data = []
        for category_enum in GeneCategory:
            if category_enum.value in category_counts:
                chart_data.append({
                    "name": category_enum.value,
                    "value": category_counts[category_enum.value],
                    "category": "acmg_category",
                    "unique_genes": len(category_genes[category_enum.value]),
                    "genes": sorted(list(category_genes[category_enum.value]))[:10]  # Top 10 genes
                })

        return chart_data

    def get_top_variants_by_frequency(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get the most frequent variants ranked by global allele frequency.

        Args:
            limit: Maximum number of variants to return

        Returns:
            List of variant data sorted by frequency (descending)
        """
        variant_freq_list = []

        for variant_id, freq_data in self.frequencies.items():
            if variant_id not in self.annotations:
                continue

            af = freq_data.get("af", 0)
            if af <= 0:
                continue

            annotation = self.annotations[variant_id]
            gene = annotation.gene_symbol or "Unknown"
            significance = annotation.clinical_significance or "Unknown"

            # Format display label
            if af >= 0.01:
                af_label = f"{af:.2%}"
            elif af >= 0.0001:
                af_label = f"{af:.4%}"
            else:
                af_label = f"{af:.2e}"

            variant_freq_list.append({
                "name": f"{gene} ({variant_id})",
                "value": af,
                "gene": gene,
                "variant_id": variant_id,
                "significance": significance,
                "label": af_label,
                "category": "frequency"
            })

        # Sort by frequency descending and take top N
        variant_freq_list.sort(key=lambda x: x["value"], reverse=True)
        return variant_freq_list[:limit]

    def get_frequency_histogram(self, bins: int = 10) -> List[Dict[str, Any]]:
        """
        Get frequency distribution histogram.

        Args:
            bins: Number of histogram bins

        Returns:
            Frequency histogram data
        """
        frequencies_list = []

        for variant_id, freq_data in self.frequencies.items():
            if variant_id in self.annotations:
                af = freq_data.get("af", 0)
                if af > 0:  # Only include non-zero frequencies
                    frequencies_list.append(af)

        if not frequencies_list:
            return []

        # Create logarithmic bins for better distribution
        min_freq = min(frequencies_list)
        max_freq = max(frequencies_list)

        # Log scale bins
        log_min = math.log10(min_freq) if min_freq > 0 else -6
        log_max = math.log10(max_freq) if max_freq > 0 else 0

        bin_edges = []
        for i in range(bins + 1):
            log_val = log_min + (log_max - log_min) * i / bins
            bin_edges.append(10 ** log_val)

        # Count variants in each bin
        bin_counts = [0] * bins
        for freq in frequencies_list:
            for i in range(bins):
                if bin_edges[i] <= freq < bin_edges[i + 1]:
                    bin_counts[i] += 1
                    break
            else:
                # Handle max value
                if freq == bin_edges[-1]:
                    bin_counts[-1] += 1

        # Create chart data
        chart_data = []
        for i in range(bins):
            start = bin_edges[i]
            end = bin_edges[i + 1]

            # Format labels
            if start < 0.0001:
                start_label = f"{start:.2e}"
            else:
                start_label = f"{start:.4f}"

            if end < 0.0001:
                end_label = f"{end:.2e}"
            else:
                end_label = f"{end:.4f}"

            chart_data.append({
                "name": f"{start_label} - {end_label}",
                "value": bin_counts[i],
                "range_start": start,
                "range_end": end,
                "category": "frequency_bin"
            })

        return chart_data

    def get_population_heatmap(self, limit: int = 50) -> Dict[str, Any]:
        """
        Get population frequency heatmap data.

        Args:
            limit: Maximum number of variants to include

        Returns:
            Heatmap data structure
        """
        populations = ["AFR", "AMR", "EAS", "NFE", "FIN", "ASJ", "SAS", "OTH"]
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

        # Select variants with frequency data
        variants_with_freq = []
        for variant_id, annotation in self.annotations.items():
            if variant_id in self.frequencies:
                freq_data = self.frequencies[variant_id]
                # Check if any population frequency exists
                has_pop_freq = any(
                    freq_data.get(pop_mapping[pop], 0) > 0
                    for pop in populations
                )
                if has_pop_freq:
                    variants_with_freq.append((variant_id, annotation))

        # Limit variants
        variants_with_freq = variants_with_freq[:limit]

        # Build heatmap matrix
        rows = []  # Variant labels
        values = []  # 2D frequency matrix

        for variant_id, annotation in variants_with_freq:
            # Create variant label
            gene = annotation.gene_symbol or "Unknown"
            label = f"{gene} ({variant_id.split(':')[0]}:{variant_id.split(':')[1]})"
            rows.append(label)

            # Get frequencies for each population
            freq_data = self.frequencies[variant_id]
            variant_freqs = []
            for pop in populations:
                freq_key = pop_mapping[pop]
                freq = freq_data.get(freq_key, 0)
                # Convert to log scale for better visualization
                if freq > 0:
                    log_freq = -math.log10(freq)  # Higher value = rarer
                else:
                    log_freq = 6  # Cap at 1e-6
                variant_freqs.append(log_freq)

            values.append(variant_freqs)

        return {
            "type": "heatmap",
            "rows": rows,
            "columns": populations,
            "values": values,
            "color_scale": {
                "min": 0,
                "max": 6,
                "label": "-log10(AF)"
            }
        }

    def get_frequency_vs_significance_scatter(self) -> List[Dict[str, Any]]:
        """
        Get scatter plot data for frequency vs clinical significance.

        Returns:
            Scatter plot data
        """
        scatter_data = []

        for variant_id, annotation in self.annotations.items():
            if variant_id in self.frequencies:
                freq_data = self.frequencies[variant_id]
                af = freq_data.get("af", 0)

                if af > 0:  # Only include variants with known frequency
                    # Map significance to numeric value for Y-axis
                    sig_value = self._significance_to_numeric(annotation.clinical_significance)

                    scatter_data.append({
                        "x": math.log10(af) if af > 0 else -6,
                        "y": sig_value,
                        "variant_id": variant_id,
                        "gene": annotation.gene_symbol,
                        "frequency": af,
                        "significance": annotation.clinical_significance or "Not Provided",
                        "category": "variant"
                    })

        return scatter_data

    def _significance_to_numeric(self, significance: Optional[str]) -> float:
        """
        Convert clinical significance to numeric value for plotting.

        Args:
            significance: Clinical significance string

        Returns:
            Numeric value (0-4 scale)
        """
        if not significance:
            return 2.0  # Middle value for unknown

        sig_lower = significance.lower()
        if "pathogenic" in sig_lower and "likely" not in sig_lower:
            return 4.0
        elif "likely pathogenic" in sig_lower:
            return 3.5
        elif "uncertain" in sig_lower or "vus" in sig_lower:
            return 2.0
        elif "likely benign" in sig_lower:
            return 0.5
        elif "benign" in sig_lower and "likely" not in sig_lower:
            return 0.0
        else:
            return 2.0  # Default to middle
