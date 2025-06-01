import type { KnowledgeGraph, GraphNode } from "../types/index.js";

export interface SearchResult {
  node: GraphNode;
  score: number;
  matchedFields: string[];
  context?: string;
}

export interface SearchOptions {
  nodeTypes?: string[];
  limit?: number;
  threshold?: number;
  fuzzy?: boolean;
  includeContext?: boolean;
  sortBy?: "relevance" | "name" | "type";
  filterOptions?: {
    metadataFilters?: Record<string, any>;
    relationFilters?: {
      relationType?: string;
      connectedTo?: string[];
    };
    filePatterns?: string[];
    excludeNodeIds?: string[];
  };
  semanticSearch?: boolean;
}

export class SearchEngine {
  private indexes: Map<string, SearchIndex> = new Map();

  async indexGraph(graphId: string, graph: KnowledgeGraph): Promise<void> {
    const index = new SearchIndex();
    await index.buildIndex(graph);
    this.indexes.set(graphId, index);
  }

  async searchNodes(
    graphId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const index = this.indexes.get(graphId);
    if (!index) {
      throw new Error(`Graph index not found: ${graphId}`);
    }

    return index.search(query, options);
  }

  async semanticSearch(
    graphId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    // Override semanticSearch option
    return this.searchNodes(graphId, query, {
      ...options,
      semanticSearch: true,
    });
  }

  async searchByType(
    graphId: string,
    nodeTypes: string[]
  ): Promise<GraphNode[]> {
    const index = this.indexes.get(graphId);
    if (!index) {
      throw new Error(`Graph index not found: ${graphId}`);
    }

    return index.getNodesByType(nodeTypes);
  }

  async findSimilarNodes(
    graphId: string,
    targetNode: GraphNode,
    limit: number = 5
  ): Promise<SearchResult[]> {
    const index = this.indexes.get(graphId);
    if (!index) {
      throw new Error(`Graph index not found: ${graphId}`);
    }

    return index.findSimilar(targetNode, limit);
  }

  async findNodesByRelation(
    graphId: string,
    relationTypes: string[],
    targetNodeId?: string
  ): Promise<{ source: GraphNode; target: GraphNode; relationType: string }[]> {
    const index = this.indexes.get(graphId);
    if (!index) {
      throw new Error(`Graph index not found: ${graphId}`);
    }

    return index.findByRelation(relationTypes, targetNodeId);
  }

  async contextualSearch(
    graphId: string,
    query: string,
    contextNodeIds: string[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const index = this.indexes.get(graphId);
    if (!index) {
      throw new Error(`Graph index not found: ${graphId}`);
    }

    return index.contextualSearch(query, contextNodeIds, options);
  }

  async advancedSearch(
    graphId: string,
    params: {
      textQuery?: string;
      nodeTypes?: string[];
      metadata?: Record<string, any>;
      relationTypes?: string[];
      connectedToNodes?: string[];
      filePatterns?: string[];
      limit?: number;
      includeContext?: boolean;
    }
  ): Promise<SearchResult[]> {
    const index = this.indexes.get(graphId);
    if (!index) {
      throw new Error(`Graph index not found: ${graphId}`);
    }

    return index.advancedSearch(params);
  }

  async removeGraphIndex(graphId: string): Promise<void> {
    this.indexes.delete(graphId);
  }

  async getIndexStats(graphId: string): Promise<{
    totalNodes: number;
    indexedTerms: number;
    nodeTypes: Record<string, number>;
  } | null> {
    const index = this.indexes.get(graphId);
    if (!index) {
      return null;
    }

    return index.getStats();
  }
}

class SearchIndex {
  private nodes: GraphNode[] = [];
  private termIndex: Map<string, Set<string>> = new Map(); // term -> node IDs
  private nodeIndex: Map<string, GraphNode> = new Map(); // node ID -> node
  private typeIndex: Map<string, GraphNode[]> = new Map(); // type -> nodes
  private relationIndex: Map<string, { from: string; to: string }[]> =
    new Map(); // relationType -> edges
  private graph: KnowledgeGraph | null = null;

  async buildIndex(graph: KnowledgeGraph): Promise<void> {
    this.nodes = graph.nodes;
    this.graph = graph;
    this.termIndex.clear();
    this.nodeIndex.clear();
    this.typeIndex.clear();
    this.relationIndex.clear();

    // Index nodes
    for (const node of graph.nodes) {
      this.nodeIndex.set(node.id, node);

      // Index by type
      if (!this.typeIndex.has(node.type)) {
        this.typeIndex.set(node.type, []);
      }
      this.typeIndex.get(node.type)!.push(node);

      // Index searchable terms
      const terms = this.extractSearchTerms(node);
      for (const term of terms) {
        if (!this.termIndex.has(term)) {
          this.termIndex.set(term, new Set());
        }
        this.termIndex.get(term)!.add(node.id);
      }
    }

    // Index relations
    for (const edge of graph.edges) {
      if (!this.relationIndex.has(edge.type)) {
        this.relationIndex.set(edge.type, []);
      }
      this.relationIndex.get(edge.type)!.push({
        from: edge.from,
        to: edge.to,
      });
    }
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const {
      nodeTypes = [],
      limit = 10,
      threshold = 0.1,
      fuzzy = true,
      includeContext = false,
      sortBy = "relevance",
      filterOptions = {},
      semanticSearch = false,
    } = options;

    if (semanticSearch) {
      return this.performSemanticSearch(query, options);
    }

    const queryTerms = this.normalizeQuery(query);
    const candidates = new Map<string, SearchResult>();

    // Direct term matching
    for (const term of queryTerms) {
      const matchingNodeIds = this.termIndex.get(term) || new Set();
      for (const nodeId of matchingNodeIds) {
        const node = this.nodeIndex.get(nodeId)!;

        // Apply filters
        if (!this.passesFilters(node, filterOptions)) {
          continue;
        }

        if (nodeTypes.length > 0 && !nodeTypes.includes(node.type)) {
          continue;
        }

        const existing = candidates.get(nodeId);
        const score = this.calculateScore(node, queryTerms, ["exact"]);

        if (!existing || existing.score < score) {
          candidates.set(nodeId, {
            node,
            score,
            matchedFields: this.getMatchedFields(node, queryTerms),
            context: includeContext ? this.getNodeContext(node) : undefined,
          });
        }
      }
    }

    // Fuzzy matching if enabled
    if (fuzzy) {
      for (const [term, nodeIds] of this.termIndex.entries()) {
        for (const queryTerm of queryTerms) {
          const similarity = this.calculateStringSimilarity(term, queryTerm);
          if (similarity > 0.7) {
            // Fuzzy threshold
            for (const nodeId of nodeIds) {
              const node = this.nodeIndex.get(nodeId)!;

              // Apply filters
              if (!this.passesFilters(node, filterOptions)) {
                continue;
              }

              if (nodeTypes.length > 0 && !nodeTypes.includes(node.type)) {
                continue;
              }

              const existing = candidates.get(nodeId);
              const score =
                this.calculateScore(node, queryTerms, ["fuzzy"]) * similarity;

              if (!existing || existing.score < score) {
                candidates.set(nodeId, {
                  node,
                  score,
                  matchedFields: this.getMatchedFields(node, queryTerms),
                  context: includeContext
                    ? this.getNodeContext(node)
                    : undefined,
                });
              }
            }
          }
        }
      }
    }

    // Partial matching
    for (const node of this.nodes) {
      // Apply filters
      if (!this.passesFilters(node, filterOptions)) {
        continue;
      }

      if (nodeTypes.length > 0 && !nodeTypes.includes(node.type)) {
        continue;
      }

      if (candidates.has(node.id)) {
        continue;
      }

      const score = this.calculateScore(node, queryTerms, ["partial"]);
      if (score > threshold) {
        candidates.set(node.id, {
          node,
          score,
          matchedFields: this.getMatchedFields(node, queryTerms),
          context: includeContext ? this.getNodeContext(node) : undefined,
        });
      }
    }

    // Convert to array and sort
    let results = Array.from(candidates.values());

    // Sort based on specified criteria
    switch (sortBy) {
      case "name":
        results.sort((a, b) => a.node.name.localeCompare(b.node.name));
        break;
      case "type":
        results.sort((a, b) => a.node.type.localeCompare(b.node.type));
        break;
      case "relevance":
      default:
        results.sort((a, b) => b.score - a.score);
        break;
    }

    return results.slice(0, limit);
  }

  contextualSearch(
    query: string,
    contextNodeIds: string[],
    options: SearchOptions = {}
  ): SearchResult[] {
    // Get standard search results
    const standardResults = this.search(query, options);

    // Boost scores for nodes connected to context nodes
    for (const result of standardResults) {
      const boostFactor = this.calculateContextualBoost(
        result.node.id,
        contextNodeIds
      );
      result.score *= 1 + boostFactor;
    }

    // Re-sort by the new scores
    standardResults.sort((a, b) => b.score - a.score);

    return standardResults.slice(0, options.limit || 10);
  }

  performSemanticSearch(
    query: string,
    options: SearchOptions = {}
  ): SearchResult[] {
    // In a real implementation, this would use embeddings or another semantic similarity method
    // For now, we'll simulate semantic search with a more advanced scoring mechanism

    const queryTerms = this.normalizeQuery(query);
    const results: SearchResult[] = [];

    for (const node of this.nodes) {
      // Apply type and other filters
      if (options.nodeTypes?.length && !options.nodeTypes.includes(node.type)) {
        continue;
      }

      if (!this.passesFilters(node, options.filterOptions || {})) {
        continue;
      }

      // Calculate a semantic-like score that gives higher weight to documentation and context
      let score = 0;

      // Name similarity gets a boost
      if (node.name) {
        const nameTerms = this.tokenize(node.name);
        const nameSimilarity = this.calculateTermOverlap(queryTerms, nameTerms);
        score += nameSimilarity * 2.0;
      }

      // Documentation gets a higher weight for semantic searches
      if (node.metadata?.documentation) {
        const docTerms = this.tokenize(node.metadata.documentation);
        const docSimilarity = this.calculateTermOverlap(queryTerms, docTerms);
        score += docSimilarity * 3.0;
      }

      // Consider node type
      score += node.type.toLowerCase().includes(query.toLowerCase()) ? 1.0 : 0;

      // Consider related nodes for semantic context
      const connectedNodes = this.getConnectedNodes(node.id);
      for (const connectedNode of connectedNodes) {
        if (connectedNode.name?.toLowerCase().includes(query.toLowerCase())) {
          score += 0.5;
        }
      }

      if (score > 0.1) {
        // Apply threshold
        results.push({
          node,
          score,
          matchedFields: this.getMatchedFields(node, queryTerms),
          context: options.includeContext
            ? this.getNodeContext(node)
            : undefined,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 10);
  }

  advancedSearch(params: {
    textQuery?: string;
    nodeTypes?: string[];
    metadata?: Record<string, any>;
    relationTypes?: string[];
    connectedToNodes?: string[];
    filePatterns?: string[];
    limit?: number;
    includeContext?: boolean;
  }): SearchResult[] {
    const {
      textQuery = "",
      nodeTypes = [],
      metadata = {},
      relationTypes = [],
      connectedToNodes = [],
      filePatterns = [],
      limit = 10,
      includeContext = false,
    } = params;

    // Convert parameters to our filter options format
    const filterOptions: SearchOptions["filterOptions"] = {
      metadataFilters: metadata,
      relationFilters: {
        relationType: relationTypes.length > 0 ? relationTypes[0] : undefined,
        connectedTo: connectedToNodes,
      },
      filePatterns,
    };

    // If we have a text query, use full search
    if (textQuery) {
      return this.search(textQuery, {
        nodeTypes,
        limit,
        filterOptions,
        includeContext,
      });
    }

    // If no text query, just filter by criteria
    const results: SearchResult[] = [];

    for (const node of this.nodes) {
      if (
        this.passesFilters(node, filterOptions) &&
        (nodeTypes.length === 0 || nodeTypes.includes(node.type))
      ) {
        results.push({
          node,
          score: 1.0, // All matches have equal score when just filtering
          matchedFields: [],
          context: includeContext ? this.getNodeContext(node) : undefined,
        });
      }
    }

    return results.slice(0, limit);
  }

  getNodesByType(nodeTypes: string[]): GraphNode[] {
    const results: GraphNode[] = [];
    for (const type of nodeTypes) {
      const nodes = this.typeIndex.get(type) || [];
      results.push(...nodes);
    }
    return results;
  }

  findSimilar(targetNode: GraphNode, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const targetTerms = this.extractSearchTerms(targetNode);

    for (const node of this.nodes) {
      if (node.id === targetNode.id) {
        continue;
      }

      const score = this.calculateSimilarityScore(
        targetNode,
        node,
        targetTerms
      );
      if (score > 0) {
        results.push({
          node,
          score,
          matchedFields: [],
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  findByRelation(
    relationTypes: string[],
    targetNodeId?: string
  ): { source: GraphNode; target: GraphNode; relationType: string }[] {
    const results: {
      source: GraphNode;
      target: GraphNode;
      relationType: string;
    }[] = [];

    if (!this.graph) {
      return results;
    }

    for (const edge of this.graph.edges) {
      if (relationTypes.length > 0 && !relationTypes.includes(edge.type)) {
        continue;
      }

      if (
        targetNodeId &&
        edge.from !== targetNodeId &&
        edge.to !== targetNodeId
      ) {
        continue;
      }

      const sourceNode = this.nodeIndex.get(edge.from);
      const targetNode = this.nodeIndex.get(edge.to);

      if (sourceNode && targetNode) {
        results.push({
          source: sourceNode,
          target: targetNode,
          relationType: edge.type,
        });
      }
    }

    return results;
  }

  getStats(): {
    totalNodes: number;
    indexedTerms: number;
    nodeTypes: Record<string, number>;
  } {
    const nodeTypes: Record<string, number> = {};
    for (const [type, nodes] of this.typeIndex.entries()) {
      nodeTypes[type] = nodes.length;
    }

    return {
      totalNodes: this.nodes.length,
      indexedTerms: this.termIndex.size,
      nodeTypes,
    };
  }

  private extractSearchTerms(node: GraphNode): string[] {
    const terms: string[] = [];

    // Node name
    if (node.name) {
      terms.push(...this.tokenize(node.name));
    }

    // Node type
    terms.push(node.type.toLowerCase());

    // Description
    if (node.metadata?.documentation) {
      terms.push(...this.tokenize(node.metadata.documentation));
    }

    // File path
    if (node.file) {
      const fileName = node.file.split("/").pop() || "";
      terms.push(...this.tokenize(fileName));
    }

    // Properties
    if (node.metadata) {
      for (const [key, value] of Object.entries(node.metadata)) {
        terms.push(key.toLowerCase());
        if (typeof value === "string") {
          terms.push(...this.tokenize(value));
        }
      }
    }

    return [...new Set(terms)]; // Remove duplicates
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 1)
      .map((term) => term.trim());
  }

  private normalizeQuery(query: string): string[] {
    return this.tokenize(query);
  }

  private calculateScore(
    node: GraphNode,
    queryTerms: string[],
    matchTypes: string[]
  ): number {
    let score = 0;
    const nodeTerms = this.extractSearchTerms(node);

    for (const queryTerm of queryTerms) {
      // Exact matches
      if (matchTypes.includes("exact") && nodeTerms.includes(queryTerm)) {
        score += 1.0;
      }

      // Name matches (higher weight)
      if (node.name && node.name.toLowerCase().includes(queryTerm)) {
        score += 1.5;
      }

      // Type matches
      if (node.type.toLowerCase().includes(queryTerm)) {
        score += 0.8;
      }

      // Partial matches
      if (matchTypes.includes("partial")) {
        for (const nodeTerm of nodeTerms) {
          if (nodeTerm.includes(queryTerm) || queryTerm.includes(nodeTerm)) {
            score += 0.3;
          }
        }
      }

      // Fuzzy matches
      if (matchTypes.includes("fuzzy")) {
        for (const nodeTerm of nodeTerms) {
          const similarity = this.calculateStringSimilarity(
            nodeTerm,
            queryTerm
          );
          if (similarity > 0.7) {
            score += similarity * 0.5;
          }
        }
      }
    }

    return score / queryTerms.length; // Normalize by query length
  }

  private calculateSimilarityScore(
    node1: GraphNode,
    node2: GraphNode,
    node1Terms: string[]
  ): number {
    const node2Terms = this.extractSearchTerms(node2);

    // Type similarity
    let score = node1.type === node2.type ? 0.5 : 0;

    // Term overlap
    const commonTerms = node1Terms.filter((term) => node2Terms.includes(term));
    const termSimilarity =
      commonTerms.length / Math.max(node1Terms.length, node2Terms.length);
    score += termSimilarity * 0.5;

    return score;
  }

  private getMatchedFields(node: GraphNode, queryTerms: string[]): string[] {
    const matchedFields: string[] = [];

    for (const term of queryTerms) {
      if (node.name && node.name.toLowerCase().includes(term)) {
        matchedFields.push("name");
      }
      if (node.type.toLowerCase().includes(term)) {
        matchedFields.push("type");
      }
      if (
        node.metadata?.documentation &&
        node.metadata.documentation.toLowerCase().includes(term)
      ) {
        matchedFields.push("description");
      }
      if (node.file && node.file.toLowerCase().includes(term)) {
        matchedFields.push("filePath");
      }
    }

    return [...new Set(matchedFields)];
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance-based similarity
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private passesFilters(
    node: GraphNode,
    filterOptions: SearchOptions["filterOptions"]
  ): boolean {
    if (!filterOptions) return true;

    // Check file pattern filters
    if (filterOptions.filePatterns && filterOptions.filePatterns.length > 0) {
      if (!node.file) return false;

      const matchesAnyPattern = filterOptions.filePatterns.some((pattern) => {
        // Convert glob pattern to regex
        const regexPattern = pattern
          .replace(/\./g, "\\.")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".");

        const regex = new RegExp(regexPattern, "i");
        return regex.test(node.file!);
      });

      if (!matchesAnyPattern) return false;
    }

    // Check metadata filters
    if (
      filterOptions.metadataFilters &&
      Object.keys(filterOptions.metadataFilters).length > 0
    ) {
      if (!node.metadata) return false;

      for (const [key, value] of Object.entries(
        filterOptions.metadataFilters
      )) {
        // Skip undefined values in filter
        if (value === undefined) continue;

        // If metadata doesn't have the key or value doesn't match
        if (!(key in node.metadata) || node.metadata[key] !== value) {
          return false;
        }
      }
    }

    // Check relation filters
    if (filterOptions.relationFilters) {
      const { relationType, connectedTo } = filterOptions.relationFilters;

      if (relationType || (connectedTo && connectedTo.length > 0)) {
        // Check if node has the specified relation with any of the target nodes
        if (!this.graph) return false;

        const hasRequiredRelation = this.graph.edges.some((edge) => {
          // Check relation type
          if (relationType && edge.type !== relationType) return false;

          // Check if the edge connects to this node
          const isConnected = edge.from === node.id || edge.to === node.id;
          if (!isConnected) return false;

          // If connectedTo is specified, check if the other end of the edge is in the list
          if (connectedTo && connectedTo.length > 0) {
            const otherEndId = edge.from === node.id ? edge.to : edge.from;
            return connectedTo.includes(otherEndId);
          }

          return true;
        });

        if (!hasRequiredRelation) return false;
      }
    }

    // Check excluded node IDs
    if (
      filterOptions.excludeNodeIds &&
      filterOptions.excludeNodeIds.includes(node.id)
    ) {
      return false;
    }

    return true;
  }

  private getNodeContext(node: GraphNode): string {
    let context = "";

    // Add file location if available
    if (node.file) {
      context += `File: ${node.file}`;
      if (node.metadata?.location?.line) {
        context += `:${node.metadata.location.line}`;
      }
      context += "\n";
    }

    // Add documentation if available
    if (node.metadata?.documentation) {
      context += `Documentation: ${node.metadata.documentation}\n`;
    }

    // Add connected nodes info
    const connectedNodes = this.getConnectedNodes(node.id);
    if (connectedNodes.length > 0) {
      context += `Connected to: ${connectedNodes
        .slice(0, 3)
        .map((n) => n.name)
        .join(", ")}`;
      if (connectedNodes.length > 3) {
        context += ` and ${connectedNodes.length - 3} more`;
      }
      context += "\n";
    }

    return context.trim();
  }

  private getConnectedNodes(nodeId: string): GraphNode[] {
    if (!this.graph) return [];

    const connectedNodeIds = new Set<string>();

    for (const edge of this.graph.edges) {
      if (edge.from === nodeId) {
        connectedNodeIds.add(edge.to);
      } else if (edge.to === nodeId) {
        connectedNodeIds.add(edge.from);
      }
    }

    return Array.from(connectedNodeIds)
      .map((id) => this.nodeIndex.get(id))
      .filter((node): node is GraphNode => !!node);
  }

  private calculateContextualBoost(
    nodeId: string,
    contextNodeIds: string[]
  ): number {
    if (!this.graph) return 0;

    let boost = 0;

    // Direct connection boost
    for (const edge of this.graph.edges) {
      if (
        (edge.from === nodeId && contextNodeIds.includes(edge.to)) ||
        (edge.to === nodeId && contextNodeIds.includes(edge.from))
      ) {
        boost += 0.5;
      }
    }

    // Same file boost
    const node = this.nodeIndex.get(nodeId);
    if (node && node.file) {
      for (const contextId of contextNodeIds) {
        const contextNode = this.nodeIndex.get(contextId);
        if (contextNode && contextNode.file === node.file) {
          boost += 0.3;
        }
      }
    }

    return boost;
  }

  private calculateTermOverlap(terms1: string[], terms2: string[]): number {
    if (terms1.length === 0 || terms2.length === 0) return 0;

    let matches = 0;
    for (const term1 of terms1) {
      for (const term2 of terms2) {
        if (term1 === term2) {
          matches += 1;
          break;
        } else if (term1.includes(term2) || term2.includes(term1)) {
          matches += 0.5;
          break;
        }
      }
    }

    return matches / Math.max(terms1.length, terms2.length);
  }
}
