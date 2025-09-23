"""VCF file parsing service."""

from typing import List, Dict, Any, Optional, Generator
import structlog
from ..models.variant import Variant

logger = structlog.get_logger(__name__)


class VCFParser:
    """Parse VCF files and extract variant information."""

    def __init__(self):
        self.header_lines = []
        self.sample_names = []

    def parse_header(self, lines: List[str]) -> None:
        """Parse VCF header lines to find sample names."""
        for line in lines:
            if line.startswith("##"):
                self.header_lines.append(line)
            elif line.startswith("#CHROM"):
                fields = line.strip().split("\t")
                if len(fields) > 9:
                    self.sample_names = fields[9:]
                break

    def parse_variant_line(self, line: str) -> Optional[Variant]:
        """Parse a single variant line from VCF."""
        if line.startswith("#") or not line.strip():
            return None

        fields = line.strip().split("\t")
        if len(fields) < 8:
            return None

        try:
            info = {}
            if fields[7] != ".":
                for item in fields[7].split(";"):
                    if "=" in item:
                        key, value = item.split("=", 1)
                        info[key] = value
                    else:
                        info[item] = True

            genotype, genotype_quality = None, None
            if len(fields) > 9:
                format_keys = fields[8].split(":")
                format_values = fields[9].split(":")
                format_dict = dict(zip(format_keys, format_values))
                genotype = format_dict.get("GT")
                gq_val = format_dict.get("GQ")
                if gq_val and gq_val != ".":
                    genotype_quality = float(gq_val)

            return Variant(
                chrom=fields[0],
                pos=int(fields[1]),
                ref=fields[3],
                alt=fields[4].split(",") if fields[4] != "." else [],
                qual=float(fields[5]) if fields[5] != "." else None,
                filter=fields[6].split(";") if fields[6] != "." else ["PASS"],
                info=info,
                genotype=genotype,
                genotype_quality=genotype_quality
            )
        except (ValueError, IndexError) as e:
            logger.error(f"Error parsing variant line", line=line, error=str(e))
            return None

    def parse_vcf_content(self, content: str) -> Generator[Variant, None, None]:
        """Parse VCF content and yield variants."""
        lines = content.strip().split("\n")
        header_lines = [line for line in lines if line.startswith("#")]
        self.parse_header(header_lines)

        for line in lines:
            if not line.startswith("#"):
                variant = self.parse_variant_line(line)
                if variant:
                    yield variant

    def get_summary_stats(self, variants: List[Variant]) -> Dict[str, Any]:
        """Get summary statistics for a list of variants."""
        stats = {
            "total_variants": len(variants), "variant_types": {}, "chromosomes": {},
            "quality_distribution": {"high_quality": 0, "medium_quality": 0, "low_quality": 0, "no_quality": 0},
            "filter_status": {"PASS": 0, "filtered": 0}
        }
        for variant in variants:
            stats["variant_types"][variant.variant_type] = stats["variant_types"].get(variant.variant_type, 0) + 1
            stats["chromosomes"][variant.chrom] = stats["chromosomes"].get(variant.chrom, 0) + 1
            if variant.qual is None: stats["quality_distribution"]["no_quality"] += 1
            elif variant.qual > 30: stats["quality_distribution"]["high_quality"] += 1
            elif variant.qual >= 10: stats["quality_distribution"]["medium_quality"] += 1
            else: stats["quality_distribution"]["low_quality"] += 1
            if "PASS" in variant.filter: stats["filter_status"]["PASS"] += 1
            else: stats["filter_status"]["filtered"] += 1
        return stats
