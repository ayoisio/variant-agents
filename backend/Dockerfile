FROM python:3.10-slim

# Set environment variables to prevent Python from writing .pyc files
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory in the container
WORKDIR /app

# Install system dependencies and VEP requirements
RUN apt-get update && apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    # VEP and its dependencies
    perl \
    cpanminus \
    build-essential \
    git \
    wget \
    unzip \
    tabix \
    # BioPerl dependencies
    libxml2-dev \
    libxslt1-dev \
    libgd-dev \
    # Install Perl modules via apt
    libdbi-perl \
    libjson-perl \
    libwww-perl \
    && rm -rf /var/lib/apt/lists/*

# Install BioPerl (required by VEP despite --NO_BIOPERL flag)
RUN cpanm --notest Bio::Perl

# Install VEP
RUN cd /opt && \
    git clone https://github.com/Ensembl/ensembl-vep.git && \
    cd ensembl-vep && \
    git checkout release/113 && \
    perl INSTALL.pl --AUTO a --NO_UPDATE --NO_HTSLIB --NO_TEST

# Copy requirements file first to leverage Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download ClinVar data
RUN mkdir -p /app/data && \
    wget -O /app/data/clinvar.vcf.gz https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz && \
    wget -O /app/data/clinvar.vcf.gz.tbi https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz.tbi

# Download and index AlphaMissense data
RUN wget -O /app/data/AlphaMissense_hg38.tsv.gz \
      https://storage.googleapis.com/dm_alphamissense/AlphaMissense_hg38.tsv.gz && \
    tabix -s 1 -b 2 -e 2 -f -S 1 /app/data/AlphaMissense_hg38.tsv.gz

# Download AlphaMissense VEP plugin
RUN mkdir -p /opt/ensembl-vep/Plugins && \
    wget -O /opt/ensembl-vep/Plugins/AlphaMissense.pm \
      https://raw.githubusercontent.com/Ensembl/VEP_plugins/release/115/AlphaMissense.pm

# Copy the entire application code into the container
COPY . .

# Cloud Run listens on port 8080 by default
EXPOSE 8080

# The command to run your app using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]