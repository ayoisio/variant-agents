import asyncio
from typing import Dict, List
from google.cloud import bigquery
import structlog
from ..models.variant import Variant

logger = structlog.get_logger(__name__)


class GnomADClient:
    """Query gnomAD data from BigQuery public datasets."""

    def __init__(self):
        try:
            self.client = bigquery.Client()
            logger.info("BigQuery client initialized for gnomAD queries")
        except Exception as e:
            logger.error(f"Failed to initialize BigQuery client: {e}")
            self.client = None
        self.cache = {}  # Cache results to avoid repeated queries

    async def batch_query_frequencies(self, variants: List[Variant]) -> Dict[str, Dict]:
        """
        Query gnomAD for multiple variants efficiently.
        Returns dict mapping variant_id to frequency data.
        """
        if not self.client:
            logger.warning("BigQuery client not initialized, returning empty results")
            return {}

        logger.info(f"Querying gnomAD for {len(variants)} variants")

        # Limit to prevent excessive costs
        MAX_VARIANTS = 10000
        if len(variants) > MAX_VARIANTS:
            logger.warning(f"Limiting gnomAD query to first {MAX_VARIANTS} variants")
            variants = variants[:MAX_VARIANTS]

        # Group by chromosome for efficient querying
        variants_by_chrom = {}
        for v in variants:
            chrom = str(v.chrom).replace('chr', '')
            # Skip non-standard chromosomes
            if chrom not in [str(i) for i in range(1, 23)] + ['X', 'Y']:
                continue
            if chrom not in variants_by_chrom:
                variants_by_chrom[chrom] = []
            variants_by_chrom[chrom].append(v)

        results = {}
        total_batches = sum((len(chrom_vars) - 1) // 100 + 1 for chrom_vars in variants_by_chrom.values())
        current_batch = 0

        for chrom, chrom_variants in variants_by_chrom.items():
            # Process in batches of 100 to avoid query size limits
            for i in range(0, len(chrom_variants), 100):
                batch = chrom_variants[i:i + 100]
                current_batch += 1
                logger.info(f"Processing batch {current_batch}/{total_batches} for chromosome {chrom}")

                try:
                    batch_results = await self._query_batch(chrom, batch)
                    results.update(batch_results)
                except Exception as e:
                    logger.error(f"Failed to query batch for chromosome {chrom}: {e}")
                    # Continue with other batches

                # Yield control periodically
                if i % 500 == 0:
                    await asyncio.sleep(0)

        logger.info(f"Retrieved frequency data for {len(results)} variants")
        return results

    async def _query_batch(self, chrom: str, variants: List[Variant]) -> Dict[str, Dict]:
        """Query a batch of variants on the same chromosome."""

        # Build WHERE conditions with proper SQL escaping
        conditions = []
        variant_map = {}

        for v in variants:
            # Handle alt field - it might be a list
            if isinstance(v.alt, list):
                # Take the first alt allele if it's a list
                alt_str = str(v.alt[0]) if v.alt else ''
            else:
                alt_str = str(v.alt)

            # Handle ref field similarly (just in case)
            if isinstance(v.ref, list):
                ref_str = str(v.ref[0]) if v.ref else ''
            else:
                ref_str = str(v.ref)

            # Map for result matching
            key = f"{v.pos}:{ref_str}:{alt_str}"
            variant_map[key] = v.variant_id

            # SQL injection protection - use double quotes for escaping in BigQuery
            ref_escaped = ref_str.replace("'", "''")
            alt_escaped = alt_str.replace("'", "''")

            try:
                pos_int = int(v.pos)
            except (ValueError, TypeError) as e:
                logger.error(f"Invalid position for variant {v.variant_id}: {v.pos}, error: {e}")
                continue

            # Build condition - ensure no line breaks within the condition
            condition = f"(start_position = {pos_int} AND reference_bases = '{ref_escaped}' AND alternate_bases.alt = '{alt_escaped}')"
            conditions.append(condition)

        if not conditions:
            logger.warning(f"No valid conditions for chromosome {chrom}")
            return {}

        # Join conditions with proper spacing
        where_clause = " OR ".join(conditions)

        # Build query v3 using string format() method to completely avoid f-string issues
        query_v3_template = """SELECT 'v3' as source, start_position, reference_bases, alternate_bases.alt, alternate_bases.AF as af, alternate_bases.AC as ac, main_table.AN as an, alternate_bases.AF_afr as af_afr, alternate_bases.AF_nfe as af_nfe, alternate_bases.AF_eas as af_eas, alternate_bases.AF_amr as af_amr, alternate_bases.AF_fin as af_fin, alternate_bases.AF_asj as af_asj, alternate_bases.AF_sas as af_sas, alternate_bases.AF_oth as af_oth, alternate_bases.nhomalt as hom_count FROM `bigquery-public-data.gnomAD.v3_genomes__chr{chrom}` AS main_table, main_table.alternate_bases AS alternate_bases WHERE {where_clause}"""

        query_v3 = query_v3_template.format(chrom=chrom, where_clause=where_clause)

        try:
            # Run v3 query asynchronously
            loop = asyncio.get_event_loop()
            query_job_v3 = await loop.run_in_executor(
                None,
                self.client.query,
                query_v3
            )
            rows_v3 = await loop.run_in_executor(None, query_job_v3.result)

            results = {}
            found_variants = set()

            for row in rows_v3:
                key = f"{row.start_position}:{row.reference_bases}:{row.alt}"
                if key in variant_map:
                    variant_id = variant_map[key]
                    found_variants.add(variant_id)
                    results[variant_id] = {
                        'source': 'gnomAD_v3',
                        'af': float(row.af) if row.af else 0,
                        'ac': int(row.ac) if row.ac else 0,
                        'an': int(row.an) if row.an else 0,
                        'af_afr': float(row.af_afr) if row.af_afr else 0,
                        'af_amr': float(row.af_amr) if row.af_amr else 0,
                        'af_eas': float(row.af_eas) if row.af_eas else 0,
                        'af_nfe': float(row.af_nfe) if row.af_nfe else 0,
                        'af_fin': float(row.af_fin) if row.af_fin else 0,
                        'af_asj': float(row.af_asj) if row.af_asj else 0,
                        'af_sas': float(row.af_sas) if row.af_sas else 0,
                        'af_oth': float(row.af_oth) if row.af_oth else 0,
                        'hom_count': int(row.hom_count) if row.hom_count else 0
                    }

            # Check if we need to query v2 for missing variants
            missing_variants = [v for v in variants if v.variant_id not in found_variants]

            if missing_variants:
                logger.info(f"Querying v2 for {len(missing_variants)} variants not found in v3")

                # Build conditions for missing variants
                conditions_v2 = []
                for v in missing_variants:
                    # Handle alt field - it might be a list
                    if isinstance(v.alt, list):
                        alt_str = str(v.alt[0]) if v.alt else ''
                    else:
                        alt_str = str(v.alt)

                    # Handle ref field similarly
                    if isinstance(v.ref, list):
                        ref_str = str(v.ref[0]) if v.ref else ''
                    else:
                        ref_str = str(v.ref)

                    ref_escaped = ref_str.replace("'", "''")
                    alt_escaped = alt_str.replace("'", "''")

                    try:
                        pos_int = int(v.pos)
                    except (ValueError, TypeError) as e:
                        logger.error(f"Invalid position for variant {v.variant_id}: {v.pos}, error: {e}")
                        continue

                    condition = f"(start_position = {pos_int} AND reference_bases = '{ref_escaped}' AND alternate_bases.alt = '{alt_escaped}')"
                    conditions_v2.append(condition)

                if conditions_v2:  # Only query if we have valid conditions
                    where_clause_v2 = " OR ".join(conditions_v2)

                    # Build query v2 using string format() method
                    # Note: v2 doesn't have AF_sas field, it was added in v3
                    query_v2_template = """SELECT 'v2' as source, start_position, reference_bases, alternate_bases.alt, alternate_bases.AF as af, alternate_bases.AC as ac, main_table.AN as an, alternate_bases.AF_afr as af_afr, alternate_bases.AF_nfe as af_nfe, alternate_bases.AF_eas as af_eas, alternate_bases.AF_amr as af_amr, alternate_bases.AF_fin as af_fin, alternate_bases.AF_asj as af_asj, alternate_bases.AF_oth as af_oth, alternate_bases.nhomalt as hom_count FROM `bigquery-public-data.gnomAD.v2_1_1_genomes__chr{chrom}` AS main_table, main_table.alternate_bases AS alternate_bases WHERE {where_clause}"""

                    query_v2 = query_v2_template.format(chrom=chrom, where_clause=where_clause_v2)

                    try:
                        query_job_v2 = await loop.run_in_executor(
                            None,
                            self.client.query,
                            query_v2
                        )
                        rows_v2 = await loop.run_in_executor(None, query_job_v2.result)

                        for row in rows_v2:
                            key = f"{row.start_position}:{row.reference_bases}:{row.alt}"
                            if key in variant_map:
                                variant_id = variant_map[key]
                                results[variant_id] = {
                                    'source': 'gnomAD_v2',
                                    'af': float(row.af) if row.af else 0,
                                    'ac': int(row.ac) if row.ac else 0,
                                    'an': int(row.an) if row.an else 0,
                                    'af_afr': float(row.af_afr) if row.af_afr else 0,
                                    'af_amr': float(row.af_amr) if row.af_amr else 0,
                                    'af_eas': float(row.af_eas) if row.af_eas else 0,
                                    'af_nfe': float(row.af_nfe) if row.af_nfe else 0,
                                    'af_fin': float(row.af_fin) if row.af_fin else 0,
                                    'af_asj': float(row.af_asj) if row.af_asj else 0,
                                    'af_sas': 0,  # v2 doesn't have South Asian population data
                                    'af_oth': float(row.af_oth) if row.af_oth else 0,
                                    'hom_count': int(row.hom_count) if row.hom_count else 0
                                }

                        # Log v2 query cost
                        gb_v2 = query_job_v2.total_bytes_billed / (1024 ** 3) if query_job_v2.total_bytes_billed else 0
                        logger.info(f"v2 query processed {gb_v2:.4f} GB")

                    except Exception as e:
                        logger.warning(f"v2 query failed for chromosome {chrom}: {e}")

            # Log summary
            not_found = len(variants) - len(results)
            if not_found > 0:
                logger.info(f"Chr{chrom}: {len(results)} found, {not_found} not in gnomAD")

            # Log v3 query cost
            gb_v3 = query_job_v3.total_bytes_billed / (1024 ** 3) if query_job_v3.total_bytes_billed else 0
            logger.info(f"v3 query processed {gb_v3:.4f} GB")

            return results

        except Exception as e:
            logger.error(f"BigQuery error for chromosome {chrom}: {e}", exc_info=True)
            # Return empty dict on error but log it
            return {}

    async def close(self):
        """Close the BigQuery client."""
        self.cache.clear()
        logger.info("gnomAD client closed")
