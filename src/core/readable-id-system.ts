/**
 * Optimized Readable ID System
 * Replaces the complex hash-based ID system with human-readable IDs
 */

import type { KnowledgeGraph, GraphNode, GraphEdge } from "../types/index.js";
import { logger } from "../utils/logger.js";
import path from "path";

export interface NodeIdentity {
  id: string;           // The new readable ID format
  type: string;
  name: string;
  filePath: string;
  originalRef?: string; // For backward compatibility during migration
}

export interface IdSystemStats {
  totalNodes: number;
  totalEdges: number;
  byType: Record<string, number>;
  byDomain: Record<string, number>;
  examples: {
    functions: string[];
    classes: string[];
    interfaces: string[];
  };
}

export class ReadableIdSystem {
  private fileAbbreviations = new Map<string, string>();
  private usedIds = new Set<string>();
  
  /**
   * 🔥 Create readable and unique ID
   */
  createNodeId(type: string, name: string, filePath: string): string {
    const domain = this.extractDomain(filePath);
    const fileName = this.getFileAbbreviation(filePath);
    const cleanName = this.sanitizeName(name);
    
    // Format: type.name.domain_file
    const baseId = `${type.toLowerCase()}.${cleanName}.${domain}_${fileName}`;
    
    return this.ensureUniqueness(baseId);
  }

  /**
   * 🔥 Create readable Edge ID
   */
  createEdgeId(fromId: string, toId: string, edgeType: string): string {
    return `${fromId}--${edgeType}-->${toId}`;
  }

  /**
   * Extract domain from file path
   */
  private extractDomain(filePath: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    
    // Look for directories that indicate domain
    const domainIndicators = [
      'auth', 'user', 'payment', 'order', 'product', 'admin', 'api', 
      'service', 'controller', 'model', 'view', 'component', 'business',
      'data', 'validation', 'utils', 'core', 'shared'
    ];
    
    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (domainIndicators.some(indicator => lowerPart.includes(indicator))) {
        return this.sanitizeName(lowerPart);
      }
    }
    
    // fallback: use first directory after src
    const srcIndex = parts.findIndex(p => p.toLowerCase() === 'src');
    if (srcIndex !== -1 && srcIndex + 1 < parts.length) {
      return this.sanitizeName(parts[srcIndex + 1]);
    }
    
    return 'main';
  }

  /**
   * Abbreviate file name for readability
   */
  private getFileAbbreviation(filePath: string): string {
    if (this.fileAbbreviations.has(filePath)) {
      return this.fileAbbreviations.get(filePath)!;
    }

    const fileName = path.basename(filePath, path.extname(filePath));
    const sanitized = this.sanitizeName(fileName);
    
    this.fileAbbreviations.set(filePath, sanitized);
    return sanitized;
  }

  /**
   * Sanitize names for safe and readable IDs
   */
  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase()
      .substring(0, 20); // limit length
  }

  /**
   * Ensure uniqueness
   */
  private ensureUniqueness(baseId: string): string {
    if (!this.usedIds.has(baseId)) {
      this.usedIds.add(baseId);
      return baseId;
    }

    // In case of collision, add number
    let counter = 2;
    let uniqueId = `${baseId}_${counter}`;
    
    while (this.usedIds.has(uniqueId)) {
      counter++;
      uniqueId = `${baseId}_${counter}`;
    }
    
    this.usedIds.add(uniqueId);
    return uniqueId;
  }

  /**
   * Parse ID back to components (for LLM)
   */
  parseId(id: string): {
    type: string;
    name: string;
    domain: string;
    file: string;
  } | null {
    // Format: type.name.domain_file
    const match = id.match(/^([^.]+)\.([^.]+)\.([^_]+)_(.+)$/);
    if (!match) return null;

    return {
      type: match[1],
      name: match[2],
      domain: match[3],
      file: match[4]
    };
  }

  /**
   * Generate examples for LLM
   */
  generateExamples(): {
    nodeExamples: string[];
    edgeExamples: string[];
    searchPatterns: string[];
  } {
    return {
      nodeExamples: [
        "function.processdata.business_processor",
        "class.apicontroller.api_controller", 
        "interface.iservice.core_interfaces",
        "function.validateinput.validation_validator",
        "variable.config.app_config"
      ],
      edgeExamples: [
        "function.handlerequest.api_controller--CALLS-->function.processdata.business_processor",
        "class.dataservice.business_service--USES-->interface.irepository.data_interfaces"
      ],
      searchPatterns: [
        "function.*.business_*",    // All business functions
        "*.process*.*",             // All process-related
        "class.*.api_*",            // All API classes  
        "*.*validation*",           // All validation-related
        "function.create*.*"        // All create functions
      ]
    };
  }

  /**
   * Get usage statistics
   */
  getStats(): {
    totalIds: number;
    domainBreakdown: Record<string, number>;
    typeBreakdown: Record<string, number>;
  } {
    const domains: Record<string, number> = {};
    const types: Record<string, number> = {};

    for (const id of this.usedIds) {
      const parsed = this.parseId(id);
      if (parsed) {
        domains[parsed.domain] = (domains[parsed.domain] || 0) + 1;
        types[parsed.type] = (types[parsed.type] || 0) + 1;
      }
    }

    return {
      totalIds: this.usedIds.size,
      domainBreakdown: domains,
      typeBreakdown: types
    };
  }
}
