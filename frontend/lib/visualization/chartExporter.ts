/**
 * Chart export utilities for various formats
 */

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import { DetectedVisualization } from './chartDetector';

export interface ExportOptions {
  format: 'png' | 'svg' | 'pdf' | 'csv' | 'json' | 'html';
  filename?: string;
  quality?: number;
  includeMetadata?: boolean;
  combineMultiple?: boolean;
}

export interface ReportOptions {
  title: string;
  subtitle?: string;
  author?: string;
  date?: Date;
  sessionId?: string;
  analysisMode?: 'clinical' | 'research';
  includeCharts: boolean;
  includeSummary: boolean;
  includeRawData: boolean;
  customCSS?: string;
}

export class ChartExporter {
  /**
   * Export a single chart element
   */
  static async exportChart(
    element: HTMLElement,
    options: ExportOptions
  ): Promise<void> {
    const filename = options.filename || `chart_${Date.now()}`;
    
    switch (options.format) {
      case 'png':
        await this.exportAsPNG(element, filename, options.quality);
        break;
      case 'svg':
        this.exportAsSVG(element, filename);
        break;
      case 'pdf':
        await this.exportAsPDF(element, filename);
        break;
      case 'csv':
        // CSV export handled separately as it needs data, not DOM
        throw new Error('Use exportDataAsCSV for CSV format');
      case 'json':
        // JSON export handled separately
        throw new Error('Use exportDataAsJSON for JSON format');
      case 'html':
        this.exportAsHTML(element, filename);
        break;
    }
  }

  /**
   * Export chart as PNG
   */
  private static async exportAsPNG(
    element: HTMLElement,
    filename: string,
    quality: number = 2
  ): Promise<void> {
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: quality,
        logging: false,
        useCORS: true
      });
      
      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, `${filename}.png`);
        }
      }, 'image/png');
    } catch (error) {
      console.error('Failed to export as PNG:', error);
      throw error;
    }
  }

  /**
   * Export chart as SVG
   */
  private static exportAsSVG(element: HTMLElement, filename: string): void {
    const svgElement = element.querySelector('svg');
    if (!svgElement) {
      throw new Error('No SVG element found in chart');
    }
    
    // Clone SVG to avoid modifying original
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;
    
    // Add white background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'white');
    clonedSvg.insertBefore(rect, clonedSvg.firstChild);
    
    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    saveAs(blob, `${filename}.svg`);
  }

  /**
   * Export chart as PDF
   */
  private static async exportAsPDF(
    element: HTMLElement,
    filename: string
  ): Promise<void> {
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('Failed to export as PDF:', error);
      throw error;
    }
  }

  /**
   * Export chart as HTML
   */
  private static exportAsHTML(element: HTMLElement, filename: string): void {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filename}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background: white;
        }
        .chart-container { 
            max-width: 1200px; 
            margin: 0 auto; 
        }
    </style>
</head>
<body>
    <div class="chart-container">
        ${element.outerHTML}
    </div>
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    saveAs(blob, `${filename}.html`);
  }

  /**
   * Export data as CSV
   */
  static exportDataAsCSV(
    data: any[],
    filename: string = 'data',
    includeHeaders: boolean = true
  ): void {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid data for CSV export');
    }
    
    const csv = this.convertToCSV(data, includeHeaders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${filename}.csv`);
  }

  /**
   * Export data as JSON
   */
  static exportDataAsJSON(
    data: any,
    filename: string = 'data',
    pretty: boolean = true
  ): void {
    const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `${filename}.json`);
  }

  /**
   * Convert data to CSV format
   */
  private static convertToCSV(data: any[], includeHeaders: boolean): string {
    if (data.length === 0) return '';
    
    // Get headers from first object
    const headers = Object.keys(data[0]);
    const rows: string[] = [];
    
    if (includeHeaders) {
      rows.push(headers.join(','));
    }
    
    // Process each row
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        
        // Handle different data types
        if (value === null || value === undefined) {
          return '';
        }
        
        if (typeof value === 'object') {
          return JSON.stringify(value).replace(/"/g, '""');
        }
        
        // Escape values containing commas or quotes
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
      });
      
      rows.push(values.join(','));
    }
    
    return rows.join('\n');
  }

  /**
   * Generate HTML report with embedded charts
   */
  static async generateHTMLReport(
    visualizations: DetectedVisualization[],
    chartElements: HTMLElement[],
    options: ReportOptions
  ): Promise<string> {
    const chartImages: string[] = [];
    
    // Convert charts to base64 images
    if (options.includeCharts) {
      for (const element of chartElements) {
        try {
          const canvas = await html2canvas(element, {
            backgroundColor: '#ffffff',
            scale: 2
          });
          chartImages.push(canvas.toDataURL('image/png'));
        } catch (error) {
          console.error('Failed to capture chart:', error);
        }
      }
    }
    
    // Generate HTML report
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.title}</title>
    <style>
        ${this.getReportCSS(options.customCSS)}
    </style>
</head>
<body>
    <div class="report-container">
        <header>
            <h1>${options.title}</h1>
            ${options.subtitle ? `<h2>${options.subtitle}</h2>` : ''}
            <div class="metadata">
                ${options.author ? `<p><strong>Author:</strong> ${options.author}</p>` : ''}
                <p><strong>Date:</strong> ${(options.date || new Date()).toLocaleDateString()}</p>
                ${options.sessionId ? `<p><strong>Session ID:</strong> ${options.sessionId}</p>` : ''}
                <p><strong>Analysis Mode:</strong> ${options.analysisMode || 'Clinical'}</p>
            </div>
        </header>
        
        ${options.includeSummary ? this.generateSummarySection(visualizations) : ''}
        
        ${options.includeCharts ? this.generateChartsSection(visualizations, chartImages) : ''}
        
        ${options.includeRawData ? this.generateDataSection(visualizations) : ''}
        
        <footer>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </footer>
    </div>
</body>
</html>`;
    
    return html;
  }

  /**
   * Generate PDF report with charts
   */
  static async generatePDFReport(
    visualizations: DetectedVisualization[],
    chartElements: HTMLElement[],
    options: ReportOptions
  ): Promise<void> {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    let yPosition = 20;
    const pageHeight = pdf.internal.pageSize.height;
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    
    // Add title
    pdf.setFontSize(20);
    pdf.text(options.title, margin, yPosition);
    yPosition += 15;
    
    // Add subtitle
    if (options.subtitle) {
      pdf.setFontSize(14);
      pdf.text(options.subtitle, margin, yPosition);
      yPosition += 10;
    }
    
    // Add metadata
    pdf.setFontSize(10);
    pdf.text(`Date: ${(options.date || new Date()).toLocaleDateString()}`, margin, yPosition);
    yPosition += 5;
    
    if (options.analysisMode) {
      pdf.text(`Analysis Mode: ${options.analysisMode}`, margin, yPosition);
      yPosition += 10;
    }
    
    // Add charts
    if (options.includeCharts) {
      for (let i = 0; i < chartElements.length; i++) {
        try {
          const canvas = await html2canvas(chartElements[i], {
            backgroundColor: '#ffffff',
            scale: 2
          });
          
          const imgData = canvas.toDataURL('image/png');
          const imgHeight = (canvas.height * contentWidth) / canvas.width;
          
          // Check if we need a new page
          if (yPosition + imgHeight > pageHeight - margin) {
            pdf.addPage();
            yPosition = margin;
          }
          
          // Add visualization title - FIXED: Added null check
          const vizTitle = visualizations[i]?.title;
          if (vizTitle) {
            pdf.setFontSize(12);
            pdf.text(vizTitle, margin, yPosition);
            yPosition += 7;
          }
          
          // Add chart image
          pdf.addImage(imgData, 'PNG', margin, yPosition, contentWidth, imgHeight);
          yPosition += imgHeight + 10;
          
        } catch (error) {
          console.error('Failed to add chart to PDF:', error);
        }
      }
    }
    
    // Save PDF
    pdf.save(`${options.title.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
  }

  /**
   * Get default CSS for reports
   */
  private static getReportCSS(customCSS?: string): string {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }
        
        .report-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        
        header {
            border-bottom: 2px solid #eee;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        h2 {
            color: #7f8c8d;
            font-size: 1.2em;
            margin-bottom: 15px;
        }
        
        .metadata {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            font-size: 0.9em;
            color: #666;
            margin-top: 15px;
        }
        
        .metadata p {
            margin: 0;
        }
        
        .summary-section,
        .charts-section,
        .data-section {
            margin-bottom: 40px;
        }
        
        .chart-wrapper {
            margin: 20px 0;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: #fafafa;
        }
        
        .chart-wrapper h3 {
            margin-bottom: 15px;
            color: #34495e;
        }
        
        .chart-wrapper img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        
        th {
            background: #f4f4f4;
            font-weight: bold;
        }
        
        footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            font-size: 0.9em;
            color: #666;
        }
        
        ${customCSS || ''}
    `;
  }

  /**
   * Generate summary section for report
   */
  private static generateSummarySection(visualizations: DetectedVisualization[]): string {
    const summary = visualizations.map(v => v.metadata).filter(Boolean);
    const totalAnnotations = summary[0]?.totalAnnotations || 0;
    const analysisMode = summary[0]?.analysisMode || 'Unknown';
    
    return `
        <section class="summary-section">
            <h2>Analysis Summary</h2>
            <ul>
                <li>Total Visualizations: ${visualizations.length}</li>
                <li>Analysis Mode: ${analysisMode}</li>
                <li>Total Annotations: ${totalAnnotations.toLocaleString()}</li>
                <li>Report Generated: ${new Date().toLocaleString()}</li>
            </ul>
        </section>
    `;
  }

  /**
   * Generate charts section for report
   */
  private static generateChartsSection(
    visualizations: DetectedVisualization[],
    images: string[]
  ): string {
    let html = '<section class="charts-section"><h2>Visualizations</h2>';
    
    visualizations.forEach((viz, index) => {
      if (images[index]) {
        html += `
          <div class="chart-wrapper">
            <h3>${viz.title || `Chart ${index + 1}`}</h3>
            <img src="${images[index]}" alt="${viz.title || 'Chart'}" />
            ${viz.metadata?.context ? `<p><em>${viz.metadata.context}</em></p>` : ''}
          </div>
        `;
      }
    });
    
    html += '</section>';
    return html;
  }

  /**
   * Generate data section for report
   */
  private static generateDataSection(visualizations: DetectedVisualization[]): string {
    let html = '<section class="data-section"><h2>Raw Data</h2>';
    
    visualizations.forEach((viz, index) => {
      html += `
        <details>
          <summary>${viz.title || `Dataset ${index + 1}`}</summary>
          <pre>${JSON.stringify(viz.data, null, 2)}</pre>
        </details>
      `;
    });
    
    html += '</section>';
    return html;
  }
}