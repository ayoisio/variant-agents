"""Local ClinVar database service using a downloaded VCF file."""

import gzip
import os
from typing import Dict, List
import structlog
from ..models.variant import Variant, VariantAnnotation

logger = structlog.get_logger(__name__)


class LocalClinVarService:
    """Queries a local ClinVar VCF file for variant annotations."""

    def __init__(self, clinvar_vcf_path: str = "data/clinvar.vcf.gz"):
        self.clinvar_path = clinvar_vcf_path
        self.clinvar_index: Dict[str, Dict] = {}
        self._loaded = False
        self._load_attempted = False

    def is_loaded(self) -> bool:
        """Check if the ClinVar index is loaded in memory."""
        if not self._load_attempted:
            self.load_clinvar_index()
        return self._loaded

    def load_clinvar_index(self):
        """Load ClinVar data into memory from the VCF file."""
        if self._loaded or self._load_attempted:
            return

        self._load_attempted = True
        if not os.path.exists(self.clinvar_path):
            logger.warning(f"Local ClinVar file not found, API will be used.", path=self.clinvar_path)
            return

        logger.info("Loading local ClinVar database into memory...")
        try:
            with gzip.open(self.clinvar_path, 'rt') as f:
                for line in f:
                    if line.startswith('#'):
                        continue
                    fields = line.strip().split('\t')
                    chrom, pos, _, ref, alts, _, _, info = fields[:8]

                    info_dict = {i.split('=', 1)[0]: i.split('=', 1)[1] for i in info.split(';') if '=' in i}
                    clnsig = self._parse_clnsig(info_dict.get('CLNSIG', ''))
                    gene = info_dict.get('GENEINFO', ':').split(':')[0]

                    for alt in alts.split(','):
                        key = f"{chrom.replace('chr', '')}:{pos}:{ref}>{alt}"
                        self.clinvar_index[key] = {
                            'clinical_significance': clnsig,
                            'gene_symbol': gene if gene else None
                        }
            self._loaded = True
            logger.info(f"Successfully loaded {len(self.clinvar_index)} variants from local ClinVar.")
        except Exception as e:
            logger.exception("Error loading local ClinVar database.")

    def _parse_clnsig(self, clnsig: str) -> str:
        """Parse ClinVar significance codes."""
        # Simplified parser for the demo
        if "pathogenic" in clnsig.lower():
            return "Pathogenic/Likely_pathogenic"
        if "benign" in clnsig.lower():
            return "Benign/Likely_benign"
        if "uncertain" in clnsig.lower():
            return "Uncertain_significance"
        return "Not provided"

    async def batch_annotate(self, variants: List[Variant]) -> Dict[str, VariantAnnotation]:
        """Annotate multiple variants using the local index."""
        if not self.is_loaded():
            return {}

        annotations = {}
        for variant in variants:
            key = f"{variant.chrom.replace('chr', '')}:{variant.pos}:{variant.ref}>{variant.alt[0]}"
            if key in self.clinvar_index:
                data = self.clinvar_index[key]
                annotations[variant.variant_id] = VariantAnnotation(
                    variant_id=variant.variant_id,
                    source="ClinVar_Local",
                    **data
                )
        return annotations
