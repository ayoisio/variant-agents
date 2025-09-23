"""Variant data models for the ADK agent."""

import pickle
from datetime import datetime
from typing import Any, Dict, List, Optional

from google.genai.types import Blob, Part
from pydantic import BaseModel, Field


class Variant(BaseModel):
    """Represents a genomic variant."""
    chrom: str = Field(..., description="Chromosome")
    pos: int = Field(..., description="Position (1-based)")
    ref: str = Field(..., description="Reference allele")
    alt: List[str] = Field(..., description="Alternate alleles")
    qual: Optional[float] = Field(None, description="Quality score")
    filter: Optional[List[str]] = Field(None, description="Filter status")
    genotype: Optional[str] = Field(None, description="Sample genotype")
    genotype_quality: Optional[float] = Field(None, description="Genotype quality")
    info: Dict[str, Any] = Field(default_factory=dict, description="INFO field data")
    variant_id: Optional[str] = Field(None, description="Variant identifier")
    variant_type: Optional[str] = Field(None, description="Type of variant (SNV, INDEL, etc)")

    def __init__(self, **data):
        super().__init__(**data)
        if not self.variant_id:
            self.variant_id = f"{self.chrom}:{self.pos}:{self.ref}>{','.join(self.alt)}"
        if not self.variant_type:
            if len(self.ref) == 1 and all(len(a) == 1 for a in self.alt):
                self.variant_type = "SNV"
            else:
                self.variant_type = "INDEL"


class VariantAnnotation(BaseModel):
    """Variant annotation from external sources."""
    variant_id: str
    source: str = Field(..., description="Annotation source (ClinVar, gnomAD, etc)")
    clinical_significance: Optional[str] = None
    review_status: Optional[str] = None
    condition: Optional[List[str]] = None
    allele_frequency: Optional[float] = None
    homozygote_count: Optional[int] = None
    gene_symbol: Optional[str] = None
    transcript_id: Optional[str] = None
    consequence: Optional[List[str]] = None
    impact: Optional[str] = None
    acmg_classification: Optional[str] = None
    acmg_criteria: Optional[List[str]] = None
    annotation_date: datetime = Field(default_factory=datetime.now)


def serialize_data_to_artifact(data: Any) -> Part:
    """Serialize any Python object into an ADK Part for artifact storage using pickle."""
    data_bytes = pickle.dumps(data)
    return Part(inline_data=Blob(mime_type="application/python-pickle", data=data_bytes))


def deserialize_data_from_artifact(artifact: Part) -> Any:
    """Deserialize any Python object from an ADK artifact Part."""
    if not artifact.inline_data or not artifact.inline_data.data:
        raise ValueError("Artifact part has no data to deserialize.")
    return pickle.loads(artifact.inline_data.data)
