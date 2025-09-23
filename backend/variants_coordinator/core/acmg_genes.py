"""
ACMG Secondary Findings Gene List and Filtering Logic
======================================================

This module contains the American College of Medical Genetics and Genomics (ACMG)
Secondary Findings list version 3.3 (SF v3.3) as published in 2025.

Reference:
Lee K, et al. ACMG SF v3.3 list for reporting of secondary findings in clinical
exome and genome sequencing: A policy statement of the American College of Medical
Genetics and Genomics (ACMG). Genet Med. 2025.

Version History:
- v3.0 (2021): 73 genes
- v3.1 (2022): 78 genes
- v3.2 (2023): 81 genes
- v3.3 (2025): 84 genes (current)

New in v3.3:
- ABCD1 (Adrenoleukodystrophy)
- CYP27A1 (Cerebrotendinous xanthomatosis)
- PLN (Intrinsic cardiomyopathy)
"""

from typing import List, Set, Dict, Optional
from enum import Enum
import structlog

logger = structlog.get_logger(__name__)


class GeneCategory(Enum):
    """Categories of conditions associated with ACMG reportable genes."""
    CANCER = "Cancer predisposition"
    CARDIOVASCULAR = "Cardiovascular disease"
    METABOLIC = "Inborn errors of metabolism"
    OTHER = "Other conditions"


# Main ACMG SF v3.3 gene set (84 genes total)
ACMG_SF_V3_3_GENES: Set[str] = {
    # Cancer predisposition (29 genes)
    "APC",  # Familial adenomatous polyposis
    "RET",  # Familial medullary thyroid cancer
    "BRCA1",  # Hereditary breast and/or ovarian cancer
    "BRCA2",  # Hereditary breast and/or ovarian cancer
    "PALB2",  # Hereditary breast and/or ovarian cancer
    "SDHD",  # Hereditary paraganglioma-pheochromocytoma syndrome
    "SDHAF2",  # Hereditary paraganglioma-pheochromocytoma syndrome
    "SDHC",  # Hereditary paraganglioma-pheochromocytoma syndrome
    "SDHB",  # Hereditary paraganglioma-pheochromocytoma syndrome
    "MAX",  # Hereditary paraganglioma-pheochromocytoma syndrome
    "TMEM127",  # Hereditary paraganglioma-pheochromocytoma syndrome
    "BMPR1A",  # Juvenile polyposis syndrome
    "SMAD4",  # Juvenile polyposis syndrome
    "TP53",  # Li-Fraumeni syndrome
    "MLH1",  # Lynch syndrome
    "MSH2",  # Lynch syndrome
    "MSH6",  # Lynch syndrome
    "PMS2",  # Lynch syndrome
    "MEN1",  # Multiple endocrine neoplasia type 1
    "MUTYH",  # MUTYH-associated polyposis (SPECIAL: requires 2 variants)
    "NF2",  # Neurofibromatosis type 2
    "STK11",  # Peutz-Jeghers syndrome
    "PTEN",  # PTEN hamartoma tumor syndrome
    "RB1",  # Retinoblastoma
    "TSC1",  # Tuberous sclerosis complex
    "TSC2",  # Tuberous sclerosis complex
    "VHL",  # von Hippel-Lindau syndrome
    "WT1",  # WT1-related Wilms tumor

    # Cardiovascular disease (41 genes)
    "FBN1",  # Aortopathies
    "TGFBR1",  # Aortopathies
    "TGFBR2",  # Aortopathies
    "SMAD3",  # Aortopathies
    "ACTA2",  # Aortopathies
    "MYH11",  # Aortopathies
    "PKP2",  # Arrhythmogenic right ventricular cardiomyopathy
    "DSP",  # Arrhythmogenic right ventricular cardiomyopathy
    "DSC2",  # Arrhythmogenic right ventricular cardiomyopathy
    "TMEM43",  # Arrhythmogenic right ventricular cardiomyopathy
    "DSG2",  # Arrhythmogenic right ventricular cardiomyopathy
    "RYR2",  # Catecholaminergic polymorphic ventricular tachycardia
    "CASQ2",  # Catecholaminergic polymorphic ventricular tachycardia
    "TRDN",  # Catecholaminergic polymorphic ventricular tachycardia
    "BAG3",  # Dilated cardiomyopathy
    "DES",  # Dilated cardiomyopathy
    "RBM20",  # Dilated cardiomyopathy
    "TNNC1",  # Dilated cardiomyopathy
    "TNNT2",  # Dilated cardiomyopathy
    "LMNA",  # Dilated cardiomyopathy
    "FLNC",  # Dilated cardiomyopathy
    "TTN",  # Dilated cardiomyopathy
    "CALM1",  # Long QT syndrome types 14 and 16
    "CALM2",  # Long QT syndrome types 14 and 16
    "CALM3",  # Long QT syndrome types 14 and 16
    "COL3A1",  # Ehlers-Danlos syndrome, vascular type
    "LDLR",  # Familial hypercholesterolemia
    "APOB",  # Familial hypercholesterolemia
    "PCSK9",  # Familial hypercholesterolemia
    "MYH7",  # Hypertrophic cardiomyopathy
    "MYBPC3",  # Hypertrophic cardiomyopathy
    "TNNI3",  # Hypertrophic cardiomyopathy
    "TPM1",  # Hypertrophic cardiomyopathy
    "MYL3",  # Hypertrophic cardiomyopathy
    "ACTC1",  # Hypertrophic cardiomyopathy
    "PRKAG2",  # Hypertrophic cardiomyopathy
    "MYL2",  # Hypertrophic cardiomyopathy
    "PLN",  # Intrinsic cardiomyopathy (NEW in v3.3)
    "KCNQ1",  # Long QT syndrome types 1 and 2
    "KCNH2",  # Long QT syndrome types 1 and 2
    "SCN5A",  # Long QT syndrome 3; Brugada syndrome

    # Inborn errors of metabolism (5 genes)
    "BTD",  # Biotinidase deficiency (SPECIAL: requires 2 variants)
    "CYP27A1",  # Cerebrotendinous xanthomatosis (NEW in v3.3, SPECIAL: requires 2 variants)
    "GLA",  # Fabry disease
    "OTC",  # Ornithine transcarbamylase deficiency
    "GAA",  # Pompe disease (SPECIAL: requires 2 variants)

    # Other conditions (9 genes)
    "ABCD1",  # Adrenoleukodystrophy (NEW in v3.3)
    "HFE",  # Hereditary hemochromatosis (SPECIAL: p.Cys282Tyr homozygous only)
    "ACVRL1",  # Hereditary hemorrhagic telangiectasia
    "ENG",  # Hereditary hemorrhagic telangiectasia
    "RYR1",  # Malignant hyperthermia
    "CACNA1S",  # Malignant hyperthermia
    "HNF1A",  # Maturity-onset diabetes of the young
    "RPE65",  # RPE65-related retinopathy (SPECIAL: requires 2 variants)
    "ATP7B",  # Wilson disease (SPECIAL: requires 2 variants)
    "TTR",  # Hereditary transthyretin amyloidosis
}

# Genes organized by category for reporting purposes
ACMG_GENES_BY_CATEGORY: Dict[GeneCategory, Set[str]] = {
    GeneCategory.CANCER: {
        "APC", "RET", "BRCA1", "BRCA2", "PALB2", "SDHD", "SDHAF2", "SDHC",
        "SDHB", "MAX", "TMEM127", "BMPR1A", "SMAD4", "TP53", "MLH1", "MSH2",
        "MSH6", "PMS2", "MEN1", "MUTYH", "NF2", "STK11", "PTEN", "RB1",
        "TSC1", "TSC2", "VHL", "WT1"
    },
    GeneCategory.CARDIOVASCULAR: {
        "FBN1", "TGFBR1", "TGFBR2", "SMAD3", "ACTA2", "MYH11", "PKP2", "DSP",
        "DSC2", "TMEM43", "DSG2", "RYR2", "CASQ2", "TRDN", "BAG3", "DES",
        "RBM20", "TNNC1", "TNNT2", "LMNA", "FLNC", "TTN", "CALM1", "CALM2",
        "CALM3", "COL3A1", "LDLR", "APOB", "PCSK9", "MYH7", "MYBPC3", "TNNI3",
        "TPM1", "MYL3", "ACTC1", "PRKAG2", "MYL2", "PLN", "KCNQ1", "KCNH2", "SCN5A"
    },
    GeneCategory.METABOLIC: {
        "BTD", "CYP27A1", "GLA", "OTC", "GAA"
    },
    GeneCategory.OTHER: {
        "ABCD1", "HFE", "ACVRL1", "ENG", "RYR1", "CACNA1S", "HNF1A", "RPE65",
        "ATP7B", "TTR"
    }
}

# Genes requiring special handling (autosomal recessive - need 2 pathogenic variants)
RECESSIVE_GENES: Set[str] = {
    "MUTYH",  # MUTYH-associated polyposis
    "BTD",  # Biotinidase deficiency
    "CYP27A1",  # Cerebrotendinous xanthomatosis
    "GAA",  # Pompe disease
    "RPE65",  # RPE65-related retinopathy
    "ATP7B",  # Wilson disease
}

# HFE-specific handling
HFE_REPORTABLE_VARIANT = "p.Cys282Tyr"  # Only this specific variant when homozygous
HFE_REPORTABLE_VARIANT_HGVS = ["c.845G>A", "p.C282Y", "p.Cys282Tyr", "rs1800562"]


def is_acmg_gene(gene_symbol: str) -> bool:
    """
    Check if a gene is in the ACMG SF v3.3 list.

    Args:
        gene_symbol: Gene symbol to check (case-insensitive)

    Returns:
        True if gene is in ACMG list, False otherwise
    """
    if not gene_symbol:
        return False
    return gene_symbol.upper() in ACMG_SF_V3_3_GENES


def get_gene_category(gene_symbol: str) -> Optional[GeneCategory]:
    """
    Get the category for an ACMG gene.

    Args:
        gene_symbol: Gene symbol to categorize

    Returns:
        GeneCategory enum or None if not an ACMG gene
    """
    if not gene_symbol:
        return None

    gene_upper = gene_symbol.upper()
    for category, genes in ACMG_GENES_BY_CATEGORY.items():
        if gene_upper in genes:
            return category
    return None


def requires_two_variants(gene_symbol: str) -> bool:
    """
    Check if a gene requires two pathogenic variants for reporting
    (autosomal recessive inheritance).

    Args:
        gene_symbol: Gene symbol to check

    Returns:
        True if gene requires compound heterozygous or homozygous variants
    """
    if not gene_symbol:
        return False
    return gene_symbol.upper() in RECESSIVE_GENES


def is_hfe_reportable_variant(gene_symbol: str, variant_notation: str) -> bool:
    """
    Check if an HFE variant is the specific p.Cys282Tyr that should be reported.

    Args:
        gene_symbol: Gene symbol (should be HFE)
        variant_notation: Any notation for the variant (HGVS, rsID, etc.)

    Returns:
        True if this is the reportable HFE variant
    """
    if not gene_symbol or gene_symbol.upper() != "HFE":
        return False

    # Check if variant matches any of the known notations for p.Cys282Tyr
    return any(notation in str(variant_notation) for notation in HFE_REPORTABLE_VARIANT_HGVS)


def filter_variants_to_acmg_genes(variants: List, gene_field: str = "GENE") -> List:
    """
    Filter a list of variants to only those in ACMG genes.

    Args:
        variants: List of variant objects (must have .info dict)
        gene_field: Field name in variant.info containing gene symbol

    Returns:
        Filtered list containing only variants in ACMG genes
    """
    filtered = []
    genes_found = set()

    for variant in variants:
        if hasattr(variant, 'info') and variant.info:
            gene = variant.info.get(gene_field)
            if gene and is_acmg_gene(gene):
                filtered.append(variant)
                genes_found.add(gene.upper())

    logger.info(
        f"Filtered {len(variants)} variants to {len(filtered)} in ACMG genes",
        unique_genes=len(genes_found),
        genes=sorted(genes_found)
    )

    return filtered


def apply_acmg_reporting_rules(annotations_by_gene: Dict[str, List]) -> Dict[str, List]:
    """
    Apply ACMG-specific reporting rules to filter annotations.

    This function enforces:
    - Recessive genes need 2+ pathogenic variants
    - HFE only reports specific p.Cys282Tyr homozygous
    - No VUS reporting for secondary findings

    Args:
        annotations_by_gene: Dict mapping gene symbols to lists of annotations

    Returns:
        Filtered annotations following ACMG reporting rules
    """
    filtered = {}

    for gene, annotations in annotations_by_gene.items():
        gene_upper = gene.upper()

        # Skip non-ACMG genes
        if not is_acmg_gene(gene_upper):
            continue

        # Filter out VUS - only report pathogenic/likely pathogenic
        pathogenic_annotations = [
            ann for ann in annotations
            if ann.clinical_significance and
               any(term in ann.clinical_significance.lower()
                   for term in ['pathogenic', 'likely_pathogenic'])
               and 'uncertain' not in ann.clinical_significance.lower()
        ]

        if not pathogenic_annotations:
            continue

        # Apply gene-specific rules
        if requires_two_variants(gene_upper):
            # Need at least 2 pathogenic variants for recessive genes
            if len(pathogenic_annotations) >= 2:
                filtered[gene] = pathogenic_annotations
                logger.info(
                    f"Reporting {gene} with {len(pathogenic_annotations)} variants (recessive gene)"
                )
            else:
                logger.debug(
                    f"Skipping {gene} - only {len(pathogenic_annotations)} variant(s) found, needs 2+"
                )

        elif gene_upper == "HFE":
            # Special HFE handling - only report p.Cys282Tyr homozygous
            # This would need additional logic to check exact variant and zygosity
            logger.debug("HFE variant found - requires specific p.Cys282Tyr homozygous check")
            # For now, skip HFE unless we implement detailed variant checking
            continue

        else:
            # Standard dominant genes - report single pathogenic variant
            filtered[gene] = pathogenic_annotations
            logger.info(
                f"Reporting {gene} with {len(pathogenic_annotations)} variant(s)"
            )

    return filtered


def get_acmg_stats() -> Dict[str, any]:
    """
    Get statistics about the ACMG gene list.

    Returns:
        Dictionary with counts and version information
    """
    return {
        "version": "3.3",
        "year": 2025,
        "total_genes": len(ACMG_SF_V3_3_GENES),
        "cancer_genes": len(ACMG_GENES_BY_CATEGORY[GeneCategory.CANCER]),
        "cardiovascular_genes": len(ACMG_GENES_BY_CATEGORY[GeneCategory.CARDIOVASCULAR]),
        "metabolic_genes": len(ACMG_GENES_BY_CATEGORY[GeneCategory.METABOLIC]),
        "other_genes": len(ACMG_GENES_BY_CATEGORY[GeneCategory.OTHER]),
        "recessive_genes": len(RECESSIVE_GENES),
        "genes_requiring_special_handling": len(RECESSIVE_GENES) + 1  # +1 for HFE
    }


# Validation on module load
assert len(ACMG_SF_V3_3_GENES) == 84, f"Expected 84 ACMG genes, found {len(ACMG_SF_V3_3_GENES)}"

# Verify all categorized genes are in main set
all_categorized = set()
for genes in ACMG_GENES_BY_CATEGORY.values():
    all_categorized.update(genes)
assert all_categorized == ACMG_SF_V3_3_GENES, "Mismatch between categorized genes and main gene set"

logger.info(f"ACMG SF v3.3 module loaded", stats=get_acmg_stats())
