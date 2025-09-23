"""
Central place to hold the singleton instances of Google Cloud clients.
These variables are initialized at application startup by the lifespan manager
in main.py.
"""

db = None
tasks_client = None
genai_client = None