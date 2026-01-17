/**
 * Annotation Renderer for Multimodal Input Support
 * 
 * Renders analysis results as inline annotations in VS Code editor overlays.
 * Supports independent visibility toggling for labels, OCR text, and bounding boxes.
 * 
 * Requirements: REQ-2.1, REQ-2.3
 */

import * as vscode from "vscode";
import {
  AnalysisResult,
  AnnotationVisibility,
  DetectionLabel,
  BoundingBox,
} from "./types";

/**
 * Annotation content for a single detection
 */
export interface AnnotationContent {
  label: string;
  confidence: number;
  boundingBox?: BoundingBox;
  ocrText?: string;
}

/**
 * AnnotationRenderer renders analysis results as VS Code editor decorations.
 * 
 * Implements the IAnnotationRenderer interface from the design document.
 * Supports rendering labels with confidence percentages, bounding box coordinates,
 * and OCR text with independent visibility controls.
 * 
 * Requirements: REQ-2.1, REQ-2.3
 */
export class AnnotationRenderer {
  private labelDecorationType: vscode.TextEditorDecorationType | undefined;
  private ocrDecorationType: vscode.TextEditorDecorationType | undefined;
  private boundingBoxDecorationType: vscode.TextEditorDecorationType | undefined;
  
  private currentResult: AnalysisResult | undefined;
  private currentVisibility: AnnotationVisibility;
  private currentEditor: vscode.TextEditor | undefined;

  constructor() {
    this.currentVisibility = {
      labels: true,
      ocrText: true,
      boundingBoxes: true,
    };
  }

  /**
   * Render annotations for analysis result
   * 
   * Renders labels with confidence percentages, bounding box coordinates,
   * and OCR text when available. Each annotation type can be independently
   * toggled via visibility settings.
   * 
   * @param result - Analysis result to render
   * @param visibility - Visibility settings for annotation types
   * 
   * Requirements: REQ-2.1
   */
  render(result: AnalysisResult, visibility: AnnotationVisibility): void {
    this.currentResult = result;
    this.currentVisibility = { ...visibility };
    this.currentEditor = vscode.window.activeTextEditor;

    // Clear existing decorations before rendering new ones
    this.clearDecorations();

    if (!this.currentEditor) {
      return;
    }

    // Create decoration types
    this.createDecorationTypes();

    // Render each annotation type based on visibility
    if (visibility.labels) {
      this.renderLabels(result.labels);
    }

    if (visibility.ocrText && result.ocrText) {
      this.renderOcrText(result.ocrText);
    }

    if (visibility.boundingBoxes) {
      this.renderBoundingBoxes(result.labels);
    }
  }

  /**
   * Update visibility settings and re-render annotations
   * 
   * Supports independent toggling of labels, OCR text, and bounding boxes.
   * Changing one visibility setting does not affect the others.
   * 
   * @param visibility - New visibility settings
   * 
   * Requirements: REQ-2.3
   */
  updateVisibility(visibility: AnnotationVisibility): void {
    this.currentVisibility = { ...visibility };

    if (this.currentResult) {
      this.render(this.currentResult, this.currentVisibility);
    }
  }

  /**
   * Clear all annotations from the editor
   * 
   * Requirements: REQ-2.3
   */
  clear(): void {
    this.clearDecorations();
    this.currentResult = undefined;
  }

  /**
   * Get the current visibility settings
   * 
   * @returns Current annotation visibility settings
   */
  getVisibility(): AnnotationVisibility {
    return { ...this.currentVisibility };
  }

  /**
   * Get the current analysis result being rendered
   * 
   * @returns Current analysis result or undefined if none
   */
  getCurrentResult(): AnalysisResult | undefined {
    return this.currentResult;
  }

  /**
   * Format annotation content for a detection label
   * 
   * Creates a formatted string containing label, confidence percentage,
   * and bounding box coordinates when available.
   * 
   * @param detection - Detection label to format
   * @returns Formatted annotation content
   * 
   * Requirements: REQ-2.1
   */
  formatLabelAnnotation(detection: DetectionLabel): string {
    const confidencePercent = Math.round(detection.confidence * 100);
    let content = `${detection.label} (${confidencePercent}%)`;

    if (detection.boundingBox) {
      const { x, y, width, height } = detection.boundingBox;
      content += ` [${x}, ${y}, ${width}×${height}]`;
    }

    return content;
  }

  /**
   * Format bounding box coordinates for display
   * 
   * @param boundingBox - Bounding box to format
   * @returns Formatted bounding box string
   * 
   * Requirements: REQ-2.1
   */
  formatBoundingBox(boundingBox: BoundingBox): string {
    return `Box: [x=${boundingBox.x}, y=${boundingBox.y}, w=${boundingBox.width}, h=${boundingBox.height}]`;
  }

  /**
   * Get all annotation contents for the current result
   * 
   * Returns an array of annotation contents including labels with
   * confidence percentages and bounding box coordinates.
   * 
   * @returns Array of annotation contents
   * 
   * Requirements: REQ-2.1
   */
  getAnnotationContents(): AnnotationContent[] {
    if (!this.currentResult) {
      return [];
    }

    return this.currentResult.labels.map((label) => ({
      label: label.label,
      confidence: label.confidence,
      boundingBox: label.boundingBox,
      ocrText: this.currentResult?.ocrText,
    }));
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clear();
  }

  // Private methods

  private createDecorationTypes(): void {
    // Label decoration type - shows label and confidence
    this.labelDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1em",
        color: new vscode.ThemeColor("editorInfo.foreground"),
      },
      backgroundColor: new vscode.ThemeColor("editor.infoBackground"),
      borderRadius: "3px",
    });

    // OCR text decoration type
    this.ocrDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1em",
        color: new vscode.ThemeColor("editorWarning.foreground"),
      },
      backgroundColor: new vscode.ThemeColor("editor.warningBackground"),
      borderRadius: "3px",
    });

    // Bounding box decoration type
    this.boundingBoxDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1em",
        color: new vscode.ThemeColor("editorHint.foreground"),
      },
      backgroundColor: new vscode.ThemeColor("editor.hintBackground"),
      borderRadius: "3px",
    });
  }

  private clearDecorations(): void {
    if (this.labelDecorationType) {
      this.labelDecorationType.dispose();
      this.labelDecorationType = undefined;
    }
    if (this.ocrDecorationType) {
      this.ocrDecorationType.dispose();
      this.ocrDecorationType = undefined;
    }
    if (this.boundingBoxDecorationType) {
      this.boundingBoxDecorationType.dispose();
      this.boundingBoxDecorationType = undefined;
    }
  }

  private renderLabels(labels: DetectionLabel[]): void {
    if (!this.currentEditor || !this.labelDecorationType) {
      return;
    }

    const decorations: vscode.DecorationOptions[] = labels.map((label, index) => {
      const line = Math.min(index, this.currentEditor!.document.lineCount - 1);
      const range = new vscode.Range(line, 0, line, 0);
      
      return {
        range,
        renderOptions: {
          after: {
            contentText: this.formatLabelAnnotation(label),
          },
        },
      };
    });

    this.currentEditor.setDecorations(this.labelDecorationType, decorations);
  }

  private renderOcrText(ocrText: string): void {
    if (!this.currentEditor || !this.ocrDecorationType) {
      return;
    }

    // Render OCR text on the first line after labels
    const line = 0;
    const range = new vscode.Range(line, 0, line, 0);

    const decorations: vscode.DecorationOptions[] = [
      {
        range,
        renderOptions: {
          after: {
            contentText: `OCR: "${ocrText.substring(0, 100)}${ocrText.length > 100 ? "..." : ""}"`,
          },
        },
      },
    ];

    this.currentEditor.setDecorations(this.ocrDecorationType, decorations);
  }

  private renderBoundingBoxes(labels: DetectionLabel[]): void {
    if (!this.currentEditor || !this.boundingBoxDecorationType) {
      return;
    }

    const labelsWithBoxes = labels.filter((label) => label.boundingBox);
    
    const decorations: vscode.DecorationOptions[] = labelsWithBoxes.map((label, index) => {
      const line = Math.min(index, this.currentEditor!.document.lineCount - 1);
      const range = new vscode.Range(line, 0, line, 0);
      
      return {
        range,
        renderOptions: {
          after: {
            contentText: this.formatBoundingBox(label.boundingBox!),
          },
        },
      };
    });

    this.currentEditor.setDecorations(this.boundingBoxDecorationType, decorations);
  }
}
