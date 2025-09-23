"""Custom exceptions for the genomic variant agent."""

class VariantAgentException(Exception):
    """Base exception for all variant agent errors."""
    pass

class VCFParsingError(VariantAgentException):
    """Error parsing VCF file."""
    pass

class AnnotationError(VariantAgentException):
    """Error retrieving variant annotations."""
    pass

class AgentExecutionError(VariantAgentException):
    """Error during agent execution."""
    pass

class GCSAccessError(VariantAgentException):
    """Error accessing Google Cloud Storage."""
    pass

class ValidationError(VariantAgentException):
    """Data validation error."""
    pass
