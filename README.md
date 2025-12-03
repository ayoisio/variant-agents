# Multi-Agent Variant Analysis

<div align="center">
  <img src="frontend/public/og-image.png" alt="Genomic Analysis Platform" width="100%" />
  
  <p align="center">
    <strong>Enterprise-grade genomic variant analysis powered by Google Cloud and Gemini</strong>
  </p>
  
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#demo">Demo</a> •
    <a href="#documentation">Documentation</a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Python-3.10+-blue.svg" alt="Python" />
    <img src="https://img.shields.io/badge/Next.js-14-black.svg" alt="Next.js" />
    <img src="https://img.shields.io/badge/GKE-Ready-4285F4.svg" alt="GKE" />
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
  </p>
</div>

## 🚀 Overview

A production-ready platform that transforms whole-genome variant analysis from a hours-long manual process into an intelligent, conversational experience. Built with Google's Agent Development Kit (ADK) and deployed on Google Kubernetes Engine (GKE), this system processes millions of variants through a sophisticated multi-agent pipeline.

### Key Capabilities

- **🔬 Comprehensive Analysis**: Process 7.8M+ variants from whole-genome VCF files
- **🤖 AI-Powered Insights**: Natural language interface for complex genomic queries
- **⚡ Optimized Performance**: VEP annotation in ~60 minutes (vs 6+ hours standard)
- **🌍 Population Context**: Integrated gnomAD frequencies across multiple ancestries
- **📊 Clinical Assessment**: Automated pathogenicity evaluation and gene-disease associations
- **💬 Conversational Interface**: Ask follow-up questions about specific genes instantly

## ✨ Features

### For Clinicians & Researchers
- **Natural Language Processing**: Chat with your genomic data like you would with a colleague
- **Background Processing**: Submit jobs and return later - analysis continues automatically
- **Instant Queries**: Once processed, get answers about specific genes in seconds
- **Population Insights**: Compare variants against global population frequencies
- **Clinical Prioritization**: Automatic identification of pathogenic variants

### For Developers & IT Teams
- **Scalable Architecture**: Kubernetes-native design with auto-scaling
- **Multi-Agent System**: Modular pipeline with specialized agents for each task
- **Production Ready**: HTTPS support, authentication, and monitoring built-in
- **Cost Optimized**: Efficient resource usage with on-demand scaling
- **Open Source**: Fully customizable and extensible

## 🏗️ Architecture

![architecture](/frontend/public/architecture.png)

### Technology Stack

#### Frontend (`/frontend`)
- **Framework**: Next.js 14 with App Router
- **UI**: React + TypeScript + Tailwind CSS
- **Components**: Shadcn/ui component library
- **Auth**: Firebase Authentication
- **Real-time**: Server-Sent Events (SSE)

#### Backend (`/backend`)
- **Framework**: FastAPI + Python 3.10
- **AI/ML**: Google ADK + Gemini API
- **Genomics**: VEP 113 + ClinVar + gnomAD
- **Infrastructure**: GKE + Cloud Tasks + Firestore
- **Storage**: Google Cloud Storage + BigQuery

## 🚦 Quick Start

### Prerequisites
- Google Cloud Project with billing enabled
- `gcloud` CLI installed and configured
- Docker installed
- Node.js 18+ and Python 3.10+

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/ayoisio/variant-agents.git
   cd variant-agents
   ```

2. **Set up the frontend**
   ```bash
   cd frontend
   npm install
   cp .env.example .env.local
   # Configure your Firebase and API settings
   npm run dev
   ```

3. **Set up the backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env
   # Configure your API keys and GCP settings
   python main.py
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080

### Production Deployment

See [backend/README.md](backend/README.md) for detailed GKE deployment instructions.

## 🎯 Usage Workflow

### 1. Start Analysis
```javascript
// Simply provide a VCF file path in natural language
"Please analyze gs://genomics-data/patient123.vcf"
"Check gs://bucket/sample.vcf for cardiac variants"
```

### 2. Background Processing (~60-70 min)
- VCF parsing and validation
- VEP annotation with consequence prediction
- gnomAD population frequency queries
- ClinVar pathogenicity assessment

### 3. Get Results
```javascript
// Ask for your report when ready
"Is my analysis complete? Please provide the report."
```

### 4. Interactive Queries
```javascript
// Ask specific questions instantly
"Were any pathogenic variants found in the BRCA1 gene?"
"Show me all variants with AF < 0.01"
"List cardiac-related findings"
```

## 📊 Performance Metrics

| Operation | Time | Throughput |
|-----------|------|------------|
| VCF Parsing | ~30 sec | 7.8M variants |
| VEP Annotation | ~60 min | 130K variants/min |
| gnomAD Query | ~30 sec | 10K variants |
| Clinical Assessment | ~2 min | 2K pathogenic variants |
| Gene Query | <5 sec | Instant |

## 🔒 Security & Compliance

- **Authentication**: Firebase Authentication with JWT tokens
- **Authorization**: Role-based access control (RBAC)
- **Data Encryption**: TLS 1.3 in transit, AES-256 at rest
- **Audit Logging**: Comprehensive activity tracking
- **HIPAA Ready**: Architecture supports HIPAA compliance requirements

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Google Agent Development Kit](https://github.com/google/adk-python) for the multi-agent framework
- [Ensembl VEP](https://www.ensembl.org/vep) for variant annotation
- [gnomAD](https://gnomad.broadinstitute.org/) for population frequencies
- [ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/) for clinical significance

## 📧 Contact

For questions, issues, or collaboration opportunities:
- Open an [Issue](https://github.com/ayoisio/variant-agents/issues)
- Email: ayoad@google.com

---

<div align="center">
  <p>Built with ❤️ for the genomics community</p>
</div>
