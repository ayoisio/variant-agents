"""ClinVar API client for variant annotation."""

import asyncio
import xml.etree.ElementTree as ElementTree
from typing import Dict, Any, List, Optional
import httpx
import structlog
from ..models.variant import Variant, VariantAnnotation
from ..services.local_clinvar import LocalClinVarService
from ..core.config import settings

logger = structlog.get_logger(__name__)


class ClinVarClient:
    """Client for querying ClinVar, using local data first then falling back to API."""

    def __init__(self):
        self.local_clinvar = LocalClinVarService()
        self.base_url = settings.clinvar_api_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def batch_annotate(self, variants: List[Variant]) -> Dict[str, VariantAnnotation]:
        """Annotate multiple variants with ClinVar data."""
        if self.local_clinvar.is_loaded():
            logger.info("Using pre-loaded local ClinVar database for batch annotation.")
            return await self.local_clinvar.batch_annotate(variants)

        logger.info("Using ClinVar API for batch annotation (rate-limited).")
        annotations = {}
        # Limit API calls to avoid excessive usage during testing
        variants_to_query = variants[:100]

        tasks = [self.annotate_variant(v) for v in variants_to_query]
        results = await asyncio.gather(*tasks)

        for annotation in results:
            if annotation:
                annotations[annotation.variant_id] = annotation

        logger.info(f"Found {len(annotations)} annotations from ClinVar API.")
        return annotations

    async def annotate_variant(self, variant: Variant) -> Optional[VariantAnnotation]:
        """Annotate a single variant using the ClinVar API."""
        if not variant.alt: return None

        chrom_num = variant.chrom.replace('chr', '')
        search_term = f"{chrom_num}[CHR] AND {variant.pos}[POS]"

        try:
            # Short delay to respect NCBI E-utils API limits (3 requests/sec)
            await asyncio.sleep(0.4)

            search_params = {'db': 'clinvar', 'term': search_term, 'retmode': 'json'}
            search_resp = await self.client.get(f"{self.base_url}/esearch.fcgi", params=search_params)
            search_resp.raise_for_status()

            id_list = search_resp.json().get('esearchresult', {}).get('idlist', [])
            if not id_list: return None

            # Fetch details for the first ID found
            fetch_params = {'db': 'clinvar', 'id': id_list[0], 'rettype': 'vcv', 'retmode': 'xml'}
            fetch_resp = await self.client.get(f"{self.base_url}/efetch.fcgi", params=fetch_params)
            fetch_resp.raise_for_status()

            details = self._parse_vcv_xml(fetch_resp.text)

            return VariantAnnotation(
                variant_id=variant.variant_id,
                source="ClinVarAPI",
                **details
            )
        except httpx.HTTPStatusError as e:
            logger.warning(f"ClinVar API request failed", status=e.response.status_code, variant=variant.variant_id)
            return None
        except Exception as e:
            logger.error("Error annotating variant from ClinVar API", variant=variant.variant_id, error=str(e))
            return None

    def _parse_vcv_xml(self, xml_string: str) -> Dict[str, Any]:
        """Parse the VCV XML response from ClinVar efetch."""
        root = ElementTree.fromstring(xml_string)
        details = {'conditions': []}

        sig_elem = root.find('.//ClinicalSignificance/Description')
        if sig_elem is not None: details['clinical_significance'] = sig_elem.text

        rev_elem = root.find('.//ClinicalSignificance/ReviewStatus')
        if rev_elem is not None: details['review_status'] = rev_elem.text

        for trait_elem in root.findall('.//TraitSet/Trait/Name/ElementValue'):
            if trait_elem.text: details['conditions'].append(trait_elem.text)

        gene_elem = root.find('.//Gene/Symbol')
        if gene_elem is not None: details['gene_symbol'] = gene_elem.text

        return details

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
