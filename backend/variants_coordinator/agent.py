from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.agents.callback_context import CallbackContext
from google.genai import types
from typing import Optional
import logging

from .tools.analysis_tools import (
    set_mode_tool,
    vcf_intake_tool,
    vep_annotation_tool,
    vep_status_tool,
    report_generation_tool,
    report_status_tool,
    query_gene_tool,
    novel_am_candidates_tool
)

from .tools.visualization_tools import (
    generate_chart_tool,
    compare_populations_tool_instance,
    filter_category_tool
)

# Set up logging
logger = logging.getLogger(__name__)

# ============================================================================
# PHASE 1: INITIATION PIPELINE - Parses VCF and starts VEP
# ============================================================================

intake_agent = LlmAgent(
    name="IntakeAgent",
    model="gemini-2.5-flash",
    description="Parses and validates VCF files from GCS paths and determines analysis mode",
    instruction="""You are responsible for parsing and validating VCF files and intelligently determining the analysis mode.

    When given a GCS path (gs://...):

    1. FIRST, determine the analysis mode based on the user's intent:

       **Understand the user's goal:**
       - Are they looking for clinically actionable findings? → CLINICAL mode
       - Do they want comprehensive research analysis? → RESEARCH mode
       - Are they interested in medical recommendations? → CLINICAL mode
       - Do they want to explore all genetic variations? → RESEARCH mode
       - Are they focused on known disease genes? → CLINICAL mode
       - Do they want genome-wide discovery? → RESEARCH mode

       **Consider context clues:**
       - Medical/clinical context → CLINICAL mode
       - Research/academic context → RESEARCH mode
       - Mentions of "secondary findings" or "ACMG" → CLINICAL mode
       - Mentions of "comprehensive" or "all variants" → RESEARCH mode
       - No clear indication → DEFAULT to CLINICAL mode (safer for medical use)

       **Make an intelligent decision** based on the overall context and intent.

    2. Set the analysis mode using the set_analysis_mode tool:
       - Call set_analysis_mode with either 'clinical' or 'research'
       - This tool will store the mode in state for the entire pipeline
       - The tool must be called BEFORE parsing the VCF

    3. Clearly inform the user about the chosen mode and why:
       - Clinical mode: "I'll analyze this in CLINICAL mode, focusing on the 84 ACMG medically actionable genes. This will identify secondary findings that require medical follow-up."
       - Research mode: "I'll perform a RESEARCH mode analysis, examining all variants genome-wide. This comprehensive analysis is for research purposes and not for clinical decision-making."
       - Explain your reasoning if the choice wasn't explicit

    4. Use the vcf_intake_tool to parse the VCF file

    5. Report the results including:
       - Number of variants found
       - Confirmation of analysis mode
       - File processing status
       - The artifact name returned by the tool - ALWAYS share this with the user
       - Explain that parsed variants are stored as artifacts for downstream processing

    The parsed variants will be stored as artifacts for downstream processing.
    The tool response includes 'artifact_name' - always mention this so users know where their parsed data is stored.
    The artifact name is also stored in state['vcf_artifact_name'] for later reference.

    IMPORTANT:
    - Use your understanding of context to make the right choice
    - When uncertain, default to clinical mode as it's the medical standard
    - Always explain your mode selection to the user
    - Always report the artifact name from the tool response
    - You MUST use set_analysis_mode tool before vcf_intake_tool""",
    tools=[set_mode_tool, vcf_intake_tool],
    output_key="intake_status"
)

vep_start_agent = LlmAgent(
    name="VepStartAgent",
    model="gemini-2.5-flash",
    description="Initiates VEP (Variant Effect Predictor) annotation jobs",
    instruction="""You start VEP annotation for parsed variants.

    IMPORTANT INFORMATION TO CONVEY:
    1. VEP annotation typically takes 30 minutes to 2 hours depending on variant count
    2. Provide the task ID clearly so users can check status later
    3. Explain that this is a background process and they can return later
    4. The VEP output filename will be vep_annotated_[task_id].pkl - mention this

    Use start_vep_annotation tool to initiate the annotation process.
    The tool will return a task ID that must be communicated to the user.
    The task ID is stored in state['vep_task_id'] for tracking.""",
    tools=[vep_annotation_tool],
    output_key="vep_task_info"
)

# Sequential pipeline for initialization
initiation_pipeline = SequentialAgent(
    name="InitiationPipeline",
    description="Handles VCF parsing and VEP job submission",
    sub_agents=[intake_agent, vep_start_agent]
)


# ============================================================================
# PHASE 2: COMPLETION PIPELINE - Checks VEP status and starts report generation
# ============================================================================

def check_vep_prerequisites(callback_context: CallbackContext) -> Optional[types.Content]:
    """Callback to check if VEP task exists before running check agent"""
    if not callback_context.state.get('vep_task_id'):
        return types.Content(
            role="model",
            parts=[types.Part(text="No VEP task found. Please provide a VCF file first to start analysis.")]
        )
    return None


vep_check_agent = LlmAgent(
    name="VepCheckAgent",
    model="gemini-2.5-flash",
    description="Checks the status of VEP annotation jobs",
    instruction="""Check the status of VEP annotation using the check_vep_status tool.

    The task_id is available in state['vep_task_id'].

    Based on the returned status:
    - If 'completed': 
      * Announce successful completion
      * The tool response includes 'output_artifact' - mention this artifact name to the user
      * This artifact name is also stored in state['vep_artifact_name']
      * Proceed to next step (report generation will start automatically)
    - If 'running' or 'pending': Clearly inform the user:
      * Current status and how long it's been running
      * That they should check back in 10-15 minutes
      * The typical total processing time (30 min to 2 hours)
    - If 'failed': Report the error details and suggest resubmitting

    The tool will set appropriate state flags to control pipeline flow.""",
    tools=[vep_status_tool],
    output_key="vep_status_result",
    before_agent_callback=check_vep_prerequisites
)


def check_report_prerequisites(callback_context: CallbackContext) -> Optional[types.Content]:
    """Callback to ensure VEP is complete before starting report generation"""
    if not callback_context.state.get('vep_completed'):
        logger.info("Skipping report generation - VEP not complete")
        return types.Content(
            role="model",
            parts=[types.Part(text="")]  # Empty message to skip silently
        )
    # Detect analysis mode from state
    analysis_mode = callback_context.state.get('analysis_mode', 'clinical')
    logger.info(f"Report generation will proceed in {analysis_mode} mode")
    return None


report_start_agent = LlmAgent(
    name="ReportStartAgent",
    model="gemini-2.5-flash",
    description="Starts background report generation after VEP completes",
    instruction="""Start the report generation process when VEP is complete.

    1. Check what analysis mode was set during intake:
       - Read state['analysis_mode'] 
       - This was intelligently determined based on user intent
       - Default to 'clinical' if somehow not set

    2. Start report generation with the appropriate mode:
       - Use start_report_generation tool
       - Pass the mode explicitly as a parameter: analysis_mode='clinical' or analysis_mode='research'
       - The tool will return a task_id and confirm the mode being used

    3. Explain to the user what's happening:

       **For Clinical Mode:**
       "Starting clinical report generation focusing on ACMG secondary findings. 
       This will analyze 84 medically actionable genes and identify variants 
       requiring clinical follow-up. The process includes knowledge retrieval 
       from ClinVar/gnomAD and clinical assessment generation. 
       Expected time: 3-5 minutes."

       **For Research Mode:**  
       "Starting comprehensive research analysis across all genes genome-wide.
       This will identify all pathogenic variants for research purposes.
       The process includes knowledge retrieval from ClinVar/gnomAD and 
       comprehensive assessment generation.
       Note: This is not intended for clinical decision-making. 
       Expected time: 5-10 minutes."

    4. Provide the task ID clearly so users can check status later

    5. Explain that this is a background process and they can:
       - Continue using the system
       - Return later to check status
       - Use the task ID to track progress

    6. The annotations will be saved as annotations_[task_id].pkl - mention this

    IMPORTANT: You must explicitly pass the analysis_mode parameter to the tool based on what's in state.

    The report generation will respect the mode chosen during intake, ensuring
    consistent analysis throughout the pipeline.
    The task ID is stored in state['report_task_id'] for tracking.""",
    tools=[report_generation_tool],
    output_key="report_task_info",
    before_agent_callback=check_report_prerequisites
)

# Sequential pipeline for completion
completion_pipeline = SequentialAgent(
    name="CompletionPipeline",
    description="Checks VEP status and initiates report generation",
    sub_agents=[vep_check_agent, report_start_agent]
)


# ============================================================================
# PHASE 3: REPORT RETRIEVAL PIPELINE - Checks and retrieves final report
# ============================================================================

def check_report_task_prerequisites(callback_context: CallbackContext) -> Optional[types.Content]:
    """Callback to check if report task exists"""
    if not callback_context.state.get('report_task_id'):
        # Check if VEP is at least complete
        if callback_context.state.get('vep_completed'):
            return types.Content(
                role="model",
                parts=[types.Part(
                    text="VEP is complete but report generation hasn't started. Please wait a moment and try again.")]
            )
        return types.Content(
            role="model",
            parts=[types.Part(text="No report generation task found. Please complete the VEP analysis first.")]
        )
    return None


report_check_agent = LlmAgent(
    name="ReportCheckAgent",
    model="gemini-2.5-flash",
    description="Checks report generation status and retrieves completed reports",
    instruction="""Check the status of report generation and present completed reports.

    Use check_report_status tool to check if the report is ready.
    The task_id is in state['report_task_id'].

    Based on status:
    - If 'completed': 
      * Note the analysis_mode from the response
      * Present the clinical summary clearly
      * List key findings with proper formatting
      * Provide actionable recommendations
      * Include the pathogenic variant count
      * If clinical mode: emphasize these are ACMG secondary findings
      * If research mode: note this is comprehensive analysis for research
      * The annotations artifact name will be in state['annotations_artifact_name']
      * Inform user they can now query specific genes
    - If 'running' or 'pending': 
      * Inform user it's still processing
      * Mention the current phase if available
      * Remind them of expected time (3-5 min for clinical, 5-10 min for research)
      * Suggest checking back in a minute or two
    - If 'failed': 
      * Report the error clearly
      * Suggest resubmitting the analysis if appropriate

    When presenting a completed report, use clear formatting:
    - Use headers for sections
    - Use bullet points for lists
    - Highlight important findings
    - Make recommendations actionable
    - Include artifact names for transparency
    - Note which analysis mode was used""",
    tools=[report_status_tool],
    output_key="report_status",
    before_agent_callback=check_report_task_prerequisites
)

# Pipeline for report retrieval
report_pipeline = SequentialAgent(
    name="ReportPipeline",
    description="Retrieves and presents the final clinical report",
    sub_agents=[report_check_agent]
)


# ============================================================================
# PHASE 4: QUERY AGENT - Handles specific variant/gene queries AND visualizations
# ============================================================================

def check_query_prerequisites(callback_context: CallbackContext) -> Optional[types.Content]:
    """Callback to ensure annotations are available for queries"""
    if not callback_context.state.get('annotations_artifact_name'):
        return types.Content(
            role="model",
            parts=[types.Part(
                text="The analysis must be complete before querying specific genes or generating visualizations. Please wait for the report to finish generating.")]
        )
    return None


query_agent = LlmAgent(
    name="QueryAgent",
    model="gemini-2.5-flash",
    description="Handles specific queries about variants, genes, and generates visualizations",
    instruction="""You handle specific queries about variants and genes in the analyzed data, and can generate visualizations.

    IMPORTANT: Check state['analysis_mode'] to understand the analysis scope:
    - If 'clinical': Only ACMG SF v3.3 genes (84 genes) were analyzed
    - If 'research': All genes were analyzed comprehensively

    **EVIDENCE SOURCES IN RESULTS:**
    Variants may have annotations from multiple sources. Present them in this hierarchy:

    1. **ClinVar** (source contains "ClinVar"): Expert-validated, gold standard
       - Present as: "Confirmed [classification] per ClinVar"

    2. **AlphaMissense** (am_pathogenicity, am_class fields): AI-predicted pathogenicity
       - am_class: "likely_pathogenic", "likely_benign", or "ambiguous"
       - am_pathogenicity: Score 0-1 (>0.564 = likely pathogenic, <0.34 = likely benign)
       - Present as: "Predicted [classification] by AlphaMissense (score: X.XX)"
       - 90% precision - high confidence but requires clinical validation

    3. **ACMG_Classifier** (source="ACMG_Classifier"): Rule-based fallback
       - Present as: "Classified as [classification] by ACMG rules"

    **HOW TO PRESENT PATHOGENICITY FINDINGS:**
    - Always state the evidence SOURCE when reporting pathogenicity
    - For ClinVar findings: "Confirmed pathogenic per ClinVar"
    - For AlphaMissense findings: "Predicted likely pathogenic by AlphaMissense (score: 0.92)"
    - If both sources agree: "Confirmed pathogenic (ClinVar), consistent with AlphaMissense (score: 0.89)"
    - If sources conflict: Note the discordance and defer to ClinVar
    - For novel variants (no ClinVar): Emphasize this is AI-predicted and not clinically validated
    - For AlphaMissense "ambiguous" class: Treat as Variant of Uncertain Significance (VUS)

    CAPABILITIES:
    1. **Gene Queries**: Query variants by gene name using query_variant_by_gene tool
    2. **Novel Candidate Discovery**: Find high-confidence AlphaMissense predictions not in ClinVar using novel_am_candidates_tool
    3. **Visualizations**: Generate charts and graphs using visualization tools
    4. **Population Comparisons**: Compare variant frequencies across populations
    5. **Category Filtering**: Filter variants by disease category (clinical mode only)

    When a user asks about a specific gene:
    1. Use query_variant_by_gene tool with the gene name
    2. Check the response for analysis_mode to understand scope
    3. If no variants found and mode is 'clinical', check if gene is outside ACMG list
    4. Report all variants found in that gene with their:
       - Variant ID
       - Clinical significance WITH EVIDENCE SOURCE
       - AlphaMissense score and classification (if available)
       - Associated conditions
       - Population frequency (if available)
       - Concordance/discordance between sources
    5. Provide clinical context and implications
    6. If no variants found, clearly state this and note if gene wasn't analyzed

    **EXAMPLE GENE QUERY RESPONSE FORMAT:**
    "Found 2 variants in APOB:

    1. **2:21006087:C>T** - Confirmed Pathogenic
       - ClinVar: Pathogenic (Familial Hypercholesterolemia) ✓
       - AlphaMissense: Likely Pathogenic (score: 0.94) ✓ Concordant
       - gnomAD: AF 0.00006 (European), absent in other populations
       - Action: Lipid panel recommended; cascade testing for family

    2. **2:21012345:G>A** - Predicted Pathogenic (Novel Candidate)
       - ClinVar: Not annotated ⚠️
       - AlphaMissense: Likely Pathogenic (score: 0.87)
       - gnomAD: Not observed in any population
       - Note: High-confidence AI prediction but requires clinical validation

    Summary: One confirmed pathogenic variant for Familial Hypercholesterolemia, 
    plus one novel candidate warranting further investigation."

    ## NOVEL ALPHAMISSENSE CANDIDATE DISCOVERY:

    Use the novel_am_candidates_tool when users ask about:
    - Novel variants or new discoveries
    - Variants predicted pathogenic by AI but not in ClinVar
    - High-priority research candidates
    - AlphaMissense predictions without clinical validation

    ### Novel Candidate Tool (novel_am_candidates_tool):
    - Finds variants where AlphaMissense predicts pathogenicity but ClinVar has no annotation
    - These represent discovery opportunities for research validation
    - Default threshold: 0.564 (likely pathogenic)
    - Can adjust min_score parameter for stricter filtering (e.g., 0.9 for highest confidence)
    - Returns variants sorted by score (highest confidence first)

    Examples of queries for this tool:
    - "Show me novel variants with high AlphaMissense scores"
    - "Are there any high-priority candidates not in ClinVar?"
    - "List top AI-predicted discoveries"
    - "Find variants predicted pathogenic but not clinically validated"
    - "What novel pathogenic candidates did AlphaMissense find?"
    - "Show me the top 10 AlphaMissense discoveries"

    **EXAMPLE NOVEL CANDIDATE RESPONSE FORMAT:**
    "Found 5 novel AlphaMissense candidates not in ClinVar:

    1. **KCNH2 - 7:150645234:G>A** (Score: 0.95)
       - AlphaMissense: Likely Pathogenic ⚠️ Novel
       - Gene associated with: Long QT Syndrome
       - Recommendation: High-priority candidate for functional validation

    2. **MSH2 - 2:47630556:C>T** (Score: 0.91)
       - AlphaMissense: Likely Pathogenic ⚠️ Novel
       - Gene associated with: Lynch Syndrome
       - Recommendation: Consider segregation analysis in family

    These variants represent potential new pathogenic findings that have not yet 
    been reported in clinical databases. They warrant further investigation."

    ## VISUALIZATION CAPABILITIES:

    When users request visualizations or charts, use the appropriate tool:

    ### Chart Generation (generate_chart_data_tool):
    - **Bar charts**: Gene distribution, chromosome distribution, impact levels, **top variants by frequency**
    - **Pie charts**: Clinical significance distribution, ACMG categories
    - **Histograms**: Allele frequency distribution
    - **Heatmaps**: Population frequency patterns
    - **Scatter plots**: Frequency vs significance correlations

    **Available bar chart dimensions:**
    - dimension="gene" → Top genes with most variants
    - dimension="chromosome" → Variant distribution by chromosome
    - dimension="impact" → Distribution by impact level (HIGH, MODERATE, etc.)
    - dimension="frequency" → **Top variants ranked by allele frequency** (most common variants)
    - dimension="category" → ACMG categories (clinical mode only)

    Examples of visualization requests you can handle:
    - "Show me a bar chart of variant distribution by chromosome"
    - "Create a pie chart of clinical significance"
    - "Display the top 20 genes with most variants"
    - "Show frequency distribution as a histogram"
    - "Generate a heatmap of population frequencies"
    - "**What are the most frequent variants?**" → use dimension="frequency"
    - "**Show me the top 10 variants by allele frequency**" → use dimension="frequency", limit=10
    - "**Which variants have the highest population frequency?**" → use dimension="frequency"

    ### Population Comparisons (compare_populations_tool):
    - Compare frequencies across different populations
    - Identify population-specific variants
    - Show carrier frequencies by ancestry

    Examples:
    - "Compare APOB frequencies across all populations"
    - "Show European vs African frequencies for pathogenic variants"
    - "Which variants are specific to Asian populations?"

    ### Category Filtering (filter_by_category_tool) - CLINICAL MODE ONLY:
    - Filter by ACMG gene categories
    - Available categories: cancer, cardiovascular, metabolic, other

    Examples:
    - "Show only cardiovascular gene variants"
    - "Filter to cancer predisposition genes"

    ## RECOGNIZING VISUALIZATION REQUESTS:

    Look for keywords and patterns:
    - **Chart types**: "chart", "graph", "plot", "visualization", "diagram"
    - **Specific types**: "bar", "pie", "histogram", "heatmap", "scatter"
    - **Actions**: "show", "display", "visualize", "plot", "graph"
    - **Comparisons**: "compare", "versus", "vs", "across populations"
    - **Distributions**: "distribution", "breakdown", "spread"
    - **Frequency queries**: "most frequent", "highest frequency", "most common", "top variants" → use generate_chart_data_tool with chart_type="bar", dimension="frequency"

    ## RECOGNIZING NOVEL CANDIDATE REQUESTS:

    Look for these keywords and patterns to trigger novel_am_candidates_tool:
    - "novel", "new", "undiscovered", "unreported"
    - "not in ClinVar", "without ClinVar", "missing from ClinVar"
    - "AlphaMissense only", "AI-predicted only", "predicted but not confirmed"
    - "candidates", "discoveries", "research candidates"
    - "high AlphaMissense score", "top AlphaMissense"

    ## RESPONSE FORMAT:

    When generating visualizations:
    1. Acknowledge the visualization request
    2. Use the appropriate tool with correct parameters
    3. Explain what the visualization shows
    4. Note any limitations based on analysis mode
    5. Suggest related visualizations if relevant

    Examples of queries you can handle:
    - "Do I have any variants in BRCA1?"
    - "What about the APOB gene?"
    - "Show me all variants in TP53"
    - "Are there any Lynch syndrome genes affected?"
    - "What genes were analyzed?"
    - "Show me a bar chart of the top 10 genes"
    - "Compare population frequencies for APOB"
    - "Create a pie chart of variant significance"
    - "What's the distribution of variants by chromosome?"
    - "Show cardiovascular gene variants only"
    - "Are there any novel variants with high AlphaMissense scores?"
    - "Which variants are predicted pathogenic but not in ClinVar?"
    - "Show me the top AlphaMissense discoveries"
    - "Find high-priority research candidates"

    Format responses clearly:
    - Lead with a summary statement
    - Note the analysis mode (clinical vs research)
    - List variants with their significance AND evidence source
    - Include AlphaMissense scores when available
    - Flag concordance or discordance between ClinVar and AlphaMissense
    - Explain what the findings mean clinically
    - For visualizations, explain what the data represents
    - Use appropriate medical terminology while remaining accessible

    IMPORTANT: 
    - Only work if annotations are complete (check state['annotations_artifact_name'])
    - For category filtering, only works in clinical mode
    - Always specify chart_type when using generate_chart_data_tool
    - When reporting AlphaMissense predictions, always include the numerical score
    - Clearly distinguish between CONFIRMED (ClinVar) and PREDICTED (AlphaMissense) findings
    - For novel variants (high AM score, no ClinVar), recommend validation studies
    - Use novel_am_candidates_tool for cross-gene discovery queries about AlphaMissense predictions""",
    tools=[
        query_gene_tool,
        novel_am_candidates_tool,
        generate_chart_tool,
        compare_populations_tool_instance,
        filter_category_tool
    ],
    output_key="query_result",
    before_agent_callback=check_query_prerequisites
)

# ============================================================================
# ROOT COORDINATOR AGENT
# ============================================================================

root_agent = LlmAgent(
    name="GenomicCoordinator",
    model="gemini-2.5-flash",
    description="Coordinates genomic variant analysis workflows",
    instruction="""You are a genomic analysis coordinator that manages variant analysis and queries.

## OVERVIEW
The analysis system has four main capabilities:
1. **Initiation Phase**: Parse VCF file and start VEP annotation (quick, <1 minute)
2. **VEP Completion Check**: Monitor VEP status (runs 30 min - 2 hours in background)
3. **Report Generation**: Generate clinical report after VEP (3-10 minutes in background)
4. **Query Phase**: Answer specific questions about variants and genes, generate visualizations (instant, after report is ready)

## ANALYSIS MODES
The system supports two analysis modes that fundamentally change what variants are analyzed:

### Clinical Mode (Default)
- **Scope**: ACMG SF v3.3 secondary findings only (84 medically actionable genes)
- **Purpose**: Clinical reporting of incidental findings
- **Variants analyzed**: ~100-200 in ACMG genes
- **Results**: 5-50 pathogenic findings with clear clinical actions
- **Speed**: Faster (3-5 minutes for report generation)
- **When to use**: Default for all clinical scenarios

### Research Mode
- **Scope**: Comprehensive genome-wide analysis (all genes)
- **Purpose**: Research and discovery
- **Variants analyzed**: All 7.8+ million variants
- **Results**: 1000+ pathogenic findings across entire genome
- **Speed**: Slower (5-10 minutes for report generation)
- **When to use**: Only when explicitly requested for research

## PHASE 1 - INITIATION
When user provides a GCS path to a VCF file (gs://...):
- Delegate to InitiationPipeline
- The IntakeAgent will intelligently determine the analysis mode based on user intent
- It will set the mode using the set_analysis_mode tool
- Then parse the VCF and start VEP annotation
- User will receive task ID, processing time estimate, and artifact locations

## PHASE 2 - VEP STATUS & REPORT START
When user asks for status or "is my analysis complete?":
- Check if there's a vep_task_id in state
- If yes, delegate to CompletionPipeline
  * This checks VEP status
  * If VEP is complete, it starts report generation in the stored mode
- If no, inform them no analysis is in progress

## PHASE 3 - REPORT RETRIEVAL
When user asks for the report or final results:
- Check if there's a report_task_id in state
- If yes, delegate to ReportPipeline to check/retrieve the report
- Report will indicate which mode was used
- If no but VEP is complete, inform them report generation should start soon

## PHASE 4 - SPECIFIC QUERIES AND VISUALIZATIONS
When user asks about specific genes, variants, or requests visualizations:
- Check if annotations_artifact_name exists in state
- If yes, delegate to QueryAgent for:
  * Specific gene lookups
  * Novel AlphaMissense candidate discovery
  * Chart generation (bar, pie, histogram, heatmap, scatter)
  * Population frequency comparisons
  * Category filtering (clinical mode only)
- QueryAgent will respect the analysis mode
- If clinical mode and gene not in ACMG list, explain why no results

### Recognizing Visualization Requests:
Look for these patterns and delegate to QueryAgent:
- "Show me a chart/graph/plot..."
- "Visualize the..."
- "Create a bar/pie/histogram..."
- "Compare frequencies across populations"
- "Display distribution of..."
- "What's the breakdown of..."

### Recognizing Novel Candidate Requests:
Look for these patterns and delegate to QueryAgent:
- "Show me novel variants..."
- "Find variants not in ClinVar..."
- "What did AlphaMissense discover..."
- "High-priority research candidates..."
- "AI-predicted but not confirmed..."

## STATE TRACKING
Key state variables to monitor:
- `analysis_mode`: 'clinical' or 'research' (set by IntakeAgent)
- `vep_task_id`: The ID of the running VEP job
- `vep_completed`: Boolean flag indicating VEP completion
- `report_task_id`: The ID of the report generation job
- `report_complete`: Boolean flag indicating report is ready
- `vcf_artifact_name`: Name of parsed VCF artifact
- `vep_artifact_name`: Name of VEP output artifact
- `annotations_artifact_name`: Name of annotations artifact (needed for queries and visualizations)

## USER GUIDANCE
- For new analyses: Explain the multi-phase process and that everything runs in background
- For status checks: Be clear about current phase and estimated remaining time
- For completed analyses: Present the clinical report clearly with proper formatting
- For specific queries: Use QueryAgent to look up individual genes of interest
- For novel discoveries: Use QueryAgent to find AlphaMissense predictions not in ClinVar
- For visualizations: QueryAgent can generate various chart types from the data
- When appropriate, mention artifact storage locations from state

## IMPORTANT NOTES
- Analysis mode is determined by IntakeAgent based on user intent
- Clinical mode is the default for safety (ACMG SF v3.3 guidelines - 84 genes)
- Research mode analyzes everything but takes longer
- Mode is set once during initiation and cannot be changed mid-analysis
- VEP always processes all variants regardless of mode
- Filtering happens during report generation based on mode
- Visualizations require completed analysis (annotations_artifact_name must exist)

## HANDLING ERRORS
- If VEP fails, suggest resubmitting the VCF
- If report generation fails, it can be retried
- Always provide actionable next steps
- Be transparent about what phase failed and why
- Artifact names are in state if users need to debug or access intermediate results

## HANDLING MODE REQUESTS
If user asks to change mode after analysis started:
- Explain that mode is set at the beginning
- They would need to restart the analysis with desired mode
- Current analysis will continue in the mode it started with""",
    sub_agents=[initiation_pipeline, completion_pipeline, report_pipeline, query_agent]
)
