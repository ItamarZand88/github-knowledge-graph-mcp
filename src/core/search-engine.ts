import { logger } from '../utils/logger.js';
import type { KnowledgeGraph, GraphNode, SearchFilters } from '../types/index.js';

/**
 * Handles searching within knowledge graphs
 */
export class SearchEngine {
  /**
   * Searches for nodes in a knowledge graph
   */
  searchNodes(
    graph: KnowledgeGraph,
    query: string,
    filters: SearchFilters = {},
    searchMode: 'exact' | 'fuzzy' | 'semantic' = 'fuzzy',
    limit: number = 10
  ): GraphNode[] {
    try {
      // Extract nodes from graph
      const { nodes } = graph;
      
      // Apply node type filters if specified
      let filteredNodes = nodes;
      if (filters.nodeTypes && filters.nodeTypes.length > 0) {
        filteredNodes = filteredNodes.filter(node => 
          filters.nodeTypes!.includes(node.type)
        );
      }
      
      // Apply file pattern filters if specified
      if (filters.filePatterns && filters.filePatterns.length > 0) {
        filteredNodes = filteredNodes.filter(node => {
          return filters.filePatterns!.some(pattern => 
            new RegExp(pattern.replace(/\*/g, '.*')).test(node.file)
          );
        });
      }
      
      // Exclude specified node types
      if (filters.excludeTypes && filters.excludeTypes.length > 0) {
        filteredNodes = filteredNodes.filter(node => 
          !filters.excludeTypes!.includes(node.type)
        );
      }
      
      // Apply search based on the specified mode
      let results: { node: GraphNode; score: number }[] = [];
      
      switch (searchMode) {
        case 'exact':
          results = this.exactSearch(filteredNodes, query);
          break;
        case 'fuzzy':
          results = this.fuzzySearch(filteredNodes, query);
          break;
        case 'semantic':
          results = this.semanticSearch(filteredNodes, query);
          break;
        default:
          results = this.fuzzySearch(filteredNodes, query);
      }
      
      // Sort results by score (descending) and take the top 'limit' results
      const sortedResults = results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      return sortedResults.map(result => result.node);
    } catch (error) {
      logger.error(`Search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }
  
  /**
   * Performs exact matching search
   */
  private exactSearch(
    nodes: GraphNode[],
    query: string
  ): { node: GraphNode; score: number }[] {
    return nodes
      .filter(node => {
        // Exact match on node name or ID
        const matchesName = node.name.toLowerCase() === query.toLowerCase();
        const matchesId = node.id.toLowerCase().includes(query.toLowerCase());
        
        // Check for exact match in metadata
        const matchesMetadata = node.metadata && Object.values(node.metadata).some(
          value => typeof value === 'string' && value.toLowerCase() === query.toLowerCase()
        );
        
        return matchesName || matchesId || matchesMetadata;
      })
      .map(node => ({
        node,
        score: node.name.toLowerCase() === query.toLowerCase() ? 1.0 : 0.9
      }));
  }
  
  /**
   * Performs fuzzy matching search
   */
  private fuzzySearch(
    nodes: GraphNode[],
    query: string
  ): { node: GraphNode; score: number }[] {
    const queryLower = query.toLowerCase();
    
    return nodes
      .map(node => {
        const nameLower = node.name.toLowerCase();
        const idLower = node.id.toLowerCase();
        
        // Calculate basic match scores
        let score = 0;
        
        // Direct substring match in name (higher score)
        if (nameLower.includes(queryLower)) {
          score = 0.8 + (queryLower.length / nameLower.length) * 0.2;
        }
        // Direct substring match in ID
        else if (idLower.includes(queryLower)) {
          score = 0.6 + (queryLower.length / idLower.length) * 0.2;
        }
        // Partial word matching
        else if (this.hasPartialMatch(nameLower, queryLower)) {
          score = 0.5;
        }
        // Match in file path
        else if (node.file.toLowerCase().includes(queryLower)) {
          score = 0.4;
        }
        // Match in metadata (documentation, parameters, etc.)
        else if (
          node.metadata &&
          Object.values(node.metadata).some(
            value => typeof value === 'string' && value.toLowerCase().includes(queryLower)
          )
        ) {
          score = 0.3;
        }
        
        return { node, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score);
  }
  
  /**
   * Performs semantic search (simplified implementation)
   */
  private semanticSearch(
    nodes: GraphNode[],
    query: string
  ): { node: GraphNode; score: number }[] {
    // In a real implementation, this would use embeddings or an API
    // For now, we'll use a more relaxed fuzzy search as a placeholder
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    return nodes
      .map(node => {
        // Prepare node text to search in
        const nodeText = [
          node.name,
          node.type,
          node.file,
          node.metadata?.documentation || '',
          (node.metadata?.parameters || []).join(' ')
        ].join(' ').toLowerCase();
        
        // Calculate how many query terms appear in the node text
        const matchingTerms = queryTerms.filter(term => nodeText.includes(term));
        const score = matchingTerms.length / queryTerms.length;
        
        return { node, score: score > 0 ? score : 0 };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score);
  }
  
  /**
   * Checks if there is a partial match between strings
   */
  private hasPartialMatch(text: string, query: string): boolean {
    // Simple implementation - check if query is part of any word in text
    const words = text.split(/\W+/);
    return words.some(word => word.includes(query) || query.includes(word));
  }
}