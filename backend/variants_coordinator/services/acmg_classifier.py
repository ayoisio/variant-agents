"""ACMG variant classification service."""

from typing import Any, Dict, List, Optional, Tuple
import structlog
from ..models.variant import Variant, VariantAnnotation
from ..core.constants import ACMG_CLASSIFICATIONS

logger = structlog.get_logger(__name__)


class ACMGClassifier:
    """A simplified ACMG variant classification engine for demonstration."""

    def classify_variant(
            self,
            variant: Variant,
            annotation: Optional[VariantAnnotation] = None,
            frequency_data: Optional[Dict] = None
    ) -> Tuple[str, List[str], str]:
        """
        Classify a variant according to simplified ACMG guidelines.
        This is a rule-based system for variants not found in ClinVar.
        """
        pathogenic_score = 0
        benign_score = 0
        criteria = []

        # Rule PM2: Absent or very rare in population databases
        if frequency_data and frequency_data.get("allele_frequency", 1.0) < 0.0001:
            pathogenic_score += 2  # Moderate evidence
            criteria.append("PM2")

        # Rule PVS1: Null variant (e.g., frameshift, stop_gained) in a gene where LoF is a known mechanism
        consequences = variant.info.get("VEP_consequence", [])
        is_null_variant = any(c in ["stop_gained", "frameshift_variant"] for c in consequences)
        if is_null_variant and variant.info.get("GENE"):  # Only apply if gene is known
            pathogenic_score += 8  # Very Strong evidence
            criteria.append("PVS1")

        # Rule BA1: Allele frequency is >5% in population databases
        if frequency_data and frequency_data.get("allele_frequency", 0.0) > 0.05:
            benign_score += 10  # Stand-alone evidence
            criteria.append("BA1")

        # Determine final classification based on combined evidence scores
        if "BA1" in criteria:
            return ACMG_CLASSIFICATIONS["BENIGN"], criteria, "Variant is common in the general population."
        if pathogenic_score >= 10:
            return ACMG_CLASSIFICATIONS["PATHOGENIC"], criteria, "Strong pathogenic evidence found (PVS1 + PM)."
        if pathogenic_score >= 6:
            return ACMG_CLASSIFICATIONS["LIKELY_PATHOGENIC"], criteria, "Moderate pathogenic evidence found."
        if benign_score >= 8:
            return ACMG_CLASSIFICATIONS["BENIGN"], criteria, "Strong benign evidence found."

        return ACMG_CLASSIFICATIONS["VUS"], criteria, "Insufficient evidence for classification."
