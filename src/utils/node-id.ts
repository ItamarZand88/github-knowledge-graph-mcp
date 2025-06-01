/**
 * Utilities for handling node IDs across the GitHub Knowledge Graph system
 */

import type { KnowledgeGraph, GraphNode } from '../types/index.js'
import { logger } from './logger.js'

/**
 * Creates a standardized node ID in the format used by the analyzer
 * @param type Type of the node (e.g., 'File', 'Class', 'Function')
 * @param name Name of the node
 * @param filePath Path to the file where the node is defined
 * @returns Standardized node ID
 */
export function createNodeId(
  type: string,
  name: string,
  filePath: string
): string {
  return `${type.toLowerCase()}:${name}@${filePath}`
}

/**
 * Normalizes a node ID to ensure consistent format
 * Handles different node ID formats and returns the canonical form
 * @param nodeId The node ID to normalize
 * @param graph The knowledge graph for reference lookup
 * @returns Normalized node ID
 */
export function normalizeNodeId(nodeId: string, graph: KnowledgeGraph): string {
  // If ID already matches a node, return it
  if (graph.nodes.some(node => node.id === nodeId)) {
    return nodeId
  }

  // Try to find node by converting slashes
  const normalizedSlashes = nodeId.replace(/\\/g, '/').replace(/\/\//g, '/')
  const withBackslashes = nodeId.replace(/\//g, '\\')

  // Check different slash variations
  const slashVariations = [nodeId, normalizedSlashes, withBackslashes]
  for (const variation of slashVariations) {
    const matchingNode = graph.nodes.find(node => node.id === variation)
    if (matchingNode) {
      return matchingNode.id
    }
  }

  // Try to extract components from ID
  const idParts = parseNodeId(nodeId)
  if (!idParts) {
    // Try to find by name only (as a fallback)
    const nameOnly = nodeId.split(/[_\/\\]/).pop() || nodeId
    const nameMatches = graph.nodes.filter(
      node => node.name === nameOnly || node.id.endsWith(`_${nameOnly}`)
    )

    if (nameMatches.length === 1) {
      return nameMatches[0].id
    } else if (nameMatches.length > 1) {
      logger.warn(
        `Multiple nodes match the name "${nameOnly}". Using the first match.`
      )
      return nameMatches[0].id
    }

    return nodeId // Return original if no match found
  }

  // Try to find nodes by matching parts
  const matches = graph.nodes.filter(node => {
    // Extract parts from the actual node ID
    const nodeParts = parseNodeId(node.id)
    if (!nodeParts) return false

    // Match by parts - requiring type and name match
    return (
      (!idParts.type || nodeParts.type === idParts.type) &&
      (!idParts.name || nodeParts.name === idParts.name) &&
      (!idParts.path || nodeParts.path.includes(idParts.path))
    )
  })

  if (matches.length === 1) {
    return matches[0].id
  } else if (matches.length > 1) {
    logger.warn(
      `Multiple nodes match the ID "${nodeId}". Using the first match.`
    )
    return matches[0].id
  }

  // If all else fails, return the original ID
  return nodeId
}

/**
 * Parses a node ID into its components
 * @param nodeId The node ID to parse
 * @returns Object with type, path, and name components, or null if not parseable
 */
export function parseNodeId(
  nodeId: string
): { type: string; path: string; name: string } | null {
  // New format discovered: type:name@file
  const newFormatMatch = nodeId.match(/^([^:]+):([^@]+)@(.+)$/)
  if (newFormatMatch) {
    return {
      type: newFormatMatch[1],
      name: newFormatMatch[2],
      path: newFormatMatch[3],
    }
  }

  // Legacy formats: Type_path_name or Type_path/name
  const patterns = [
    /^([^_]+)_([^_]+)_(.+)$/, // Type_path_name
    /^([^_]+)_(.+)\/([^\/]+)$/, // Type_path/name
    /^([^_]+)_(.+)\\([^\\]+)$/, // Type_path\name
    /^([^_]+)_(.+)$/, // Type_path (no name)
  ]

  for (const pattern of patterns) {
    const match = nodeId.match(pattern)
    if (match) {
      return {
        type: match[1],
        path: match[2],
        name: match[3] || match[2].split(/[\/\\]/).pop() || '',
      }
    }
  }

  return null
}

/**
 * Checks if a string is a valid node ID format
 * @param nodeId The string to check
 * @returns Boolean indicating if the string is a valid node ID
 */
export function isValidNodeId(nodeId: string): boolean {
  return Boolean(parseNodeId(nodeId))
}

/**
 * Finds a node in the graph by name, type, or partial ID
 * @param graph The knowledge graph to search
 * @param query The query to search for (name, type, partial ID)
 * @param type Optional node type to filter by
 * @returns The matching node or null if not found
 */
export function findNodeByQuery(
  graph: KnowledgeGraph,
  query: string,
  type?: string
): GraphNode | null {
  // Try exact ID match first
  const exactMatch = graph.nodes.find(node => node.id === query)
  if (exactMatch) {
    return exactMatch
  }

  // Try normalized ID
  const normalizedId = normalizeNodeId(query, graph)
  const normalizedMatch = graph.nodes.find(node => node.id === normalizedId)
  if (normalizedMatch) {
    return normalizedMatch
  }

  // Try name match with optional type filter
  const nameMatches = graph.nodes.filter(
    node => node.name === query && (!type || node.type === type)
  )

  if (nameMatches.length === 1) {
    return nameMatches[0]
  } else if (nameMatches.length > 1) {
    // If multiple matches, prefer exported/public entities
    const exportedMatch = nameMatches.find(node => node.metadata?.isExported)
    if (exportedMatch) {
      return exportedMatch
    }
    // Otherwise, return the first match
    return nameMatches[0]
  }

  // Try partial name or fuzzy match as a last resort
  const fuzzyMatches = graph.nodes.filter(
    node =>
      (node.name.includes(query) || query.includes(node.name)) &&
      (!type || node.type === type)
  )

  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0]
  } else if (fuzzyMatches.length > 1) {
    // If multiple matches, prefer exported/public entities
    const exportedMatch = fuzzyMatches.find(node => node.metadata?.isExported)
    if (exportedMatch) {
      return exportedMatch
    }
    // Otherwise, return the first match
    return fuzzyMatches[0]
  }

  return null
}

/**
 * Find nodes that depend on the given node
 * @param graph The knowledge graph to search
 * @param nodeId The ID of the node to find dependents for
 * @returns Array of nodes that depend on the given node
 */
export function findDependentNodes(
  graph: KnowledgeGraph,
  nodeId: string
): GraphNode[] {
  // Find all edges pointing to this node
  const dependentEdges = graph.edges.filter(edge => edge.to === nodeId)
  
  // Get the source nodes from these edges
  const dependentNodes = dependentEdges
    .map(edge => graph.nodes.find(node => node.id === edge.from))
    .filter((node): node is GraphNode => node !== undefined)
  
  return dependentNodes
}

/**
 * Find nodes that the given node depends on
 * @param graph The knowledge graph to search
 * @param nodeId The ID of the node to find dependencies for
 * @returns Array of nodes that the given node depends on
 */
export function findDependencyNodes(
  graph: KnowledgeGraph,
  nodeId: string
): GraphNode[] {
  // Find all edges coming from this node
  const dependencyEdges = graph.edges.filter(edge => edge.from === nodeId)
  
  // Get the target nodes from these edges
  const dependencyNodes = dependencyEdges
    .map(edge => graph.nodes.find(node => node.id === edge.to))
    .filter((node): node is GraphNode => node !== undefined)
  
  return dependencyNodes
}

/**
 * Analyze node ID patterns in a graph to understand the structure
 */
export function analyzeNodeIdPatterns(graph: KnowledgeGraph): {
  totalNodes: number
  nodeTypes: Record<string, number>
  idPatterns: Array<{
    pattern: string
    count: number
    examples: string[]
  }>
  sampleNodesByType: Record<
    string,
    Array<{ id: string; name: string; file?: string }>
  >
} {
  const nodeTypes: Record<string, number> = {}
  const idPatterns: Map<
    string,
    { count: number; examples: string[] }
  > = new Map()
  const sampleNodesByType: Record<
    string,
    Array<{ id: string; name: string; file?: string }>
  > = {}

  // Count node types and analyze ID patterns
  graph.nodes.forEach(node => {
    // Count node types
    nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1

    // Collect sample nodes by type
    if (!sampleNodesByType[node.type]) {
      sampleNodesByType[node.type] = []
    }
    if (sampleNodesByType[node.type].length < 5) {
      sampleNodesByType[node.type].push({
        id: node.id,
        name: node.name,
        file: node.file,
      })
    }

    // Analyze ID patterns
    const parts = parseNodeId(node.id)
    if (parts) {
      // Create a pattern representation
      const pattern = `${parts.type}:NAME@PATH`
      
      if (!idPatterns.has(pattern)) {
        idPatterns.set(pattern, { count: 0, examples: [] })
      }
      
      const patternInfo = idPatterns.get(pattern)!
      patternInfo.count++
      
      if (patternInfo.examples.length < 3) {
        patternInfo.examples.push(node.id)
      }
    }
  })

  return {
    totalNodes: graph.nodes.length,
    nodeTypes,
    idPatterns: Array.from(idPatterns.entries()).map(([pattern, info]) => ({
      pattern,
      count: info.count,
      examples: info.examples,
    })),
    sampleNodesByType,
  }
}

/**
 * Smart node search with multiple strategies and confidence scores
 */
export function smartNodeSearch(
  graph: KnowledgeGraph,
  query: string,
  options: {
    nodeType?: string
    maxResults?: number
    includePartialMatches?: boolean
  } = {}
): Array<{
  node: GraphNode
  matchType:
    | 'exact_id'
    | 'exact_name'
    | 'partial_name'
    | 'file_match'
    | 'id_contains'
    | 'fuzzy'
    | 'constructed_id'
  confidence: number
}> {
  const results: Array<{
    node: GraphNode
    matchType:
      | 'exact_id'
      | 'exact_name'
      | 'partial_name'
      | 'file_match'
      | 'id_contains'
      | 'fuzzy'
      | 'constructed_id'
    confidence: number
  }> = []

  // Strategy 1: Exact ID match
  const exactIdMatch = graph.nodes.find(node => node.id === query)
  if (exactIdMatch) {
    results.push({
      node: exactIdMatch,
      matchType: 'exact_id',
      confidence: 1.0,
    })
  }

  // Strategy 2: Exact name match
  const exactNameMatches = graph.nodes.filter(
    node =>
      node.name === query &&
      (!options.nodeType || node.type === options.nodeType)
  )
  exactNameMatches.forEach(node => {
    // Only add if not already added by exact ID
    if (!results.some(r => r.node.id === node.id)) {
      results.push({
        node,
        matchType: 'exact_name',
        confidence: 0.9,
      })
    }
  })

  // Stop here if we have perfect matches and don't need partial matches
  if (
    results.length > 0 &&
    results.some(r => r.confidence > 0.8) &&
    !options.includePartialMatches
  ) {
    return results.slice(0, options.maxResults || 10)
  }

  // Strategy 3: File path match (if query looks like a file path)
  if (query.includes('.') || query.includes('/') || query.includes('\\')) {
    const fileMatches = graph.nodes.filter(
      node =>
        (node.file && node.file.includes(query)) ||
        (node.type === 'File' && node.name.includes(query))
    )
    fileMatches.forEach(node => {
      if (!results.some(r => r.node.id === node.id)) {
        results.push({
          node,
          matchType: 'file_match',
          confidence: 0.8,
        })
      }
    })
  }

  // Strategy 4: Partial name match
  const partialNameMatches = graph.nodes.filter(
    node =>
      node.name.toLowerCase().includes(query.toLowerCase()) &&
      (!options.nodeType || node.type === options.nodeType)
  )
  partialNameMatches.forEach(node => {
    if (!results.some(r => r.node.id === node.id)) {
      results.push({
        node,
        matchType: 'partial_name',
        confidence: 0.7,
      })
    }
  })

  // Strategy 5: ID contains query
  const idContainsMatches = graph.nodes.filter(node =>
    node.id.toLowerCase().includes(query.toLowerCase())
  )
  idContainsMatches.forEach(node => {
    if (!results.some(r => r.node.id === node.id)) {
      results.push({
        node,
        matchType: 'id_contains',
        confidence: 0.6,
      })
    }
  })

  // Sort results by confidence and limit
  return results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, options.maxResults || 10)
}

/**
 * Debug node search to help diagnose search issues
 */
export function debugNodeSearch(
  graph: KnowledgeGraph,
  searchTerm: string
): {
  originalQuery: string
  totalNodes: number
  searchResults: {
    strategy: string
    matches: Array<{
      id: string
      name: string
      type: string
      file?: string
    }>
  }[]
} {
  const results: {
    strategy: string
    matches: Array<{
      id: string
      name: string
      type: string
      file?: string
    }>
  }[] = []

  // Strategy 1: Exact ID match
  const exactIdMatches = graph.nodes.filter(node => node.id === searchTerm)
  if (exactIdMatches.length > 0) {
    results.push({
      strategy: 'Exact ID match',
      matches: exactIdMatches.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        file: node.file,
      })),
    })
  }

  // Strategy 2: Exact name match
  const exactNameMatches = graph.nodes.filter(node => node.name === searchTerm)
  if (exactNameMatches.length > 0) {
    results.push({
      strategy: 'Exact name match',
      matches: exactNameMatches.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        file: node.file,
      })),
    })
  }

  // Strategy 3: Partial name match
  const partialNameMatches = graph.nodes.filter(node =>
    node.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  if (partialNameMatches.length > 0) {
    results.push({
      strategy: 'Partial name match',
      matches: partialNameMatches
        .slice(0, 10)
        .map(node => ({
          id: node.id,
          name: node.name,
          type: node.type,
          file: node.file,
        })),
    })
  }

  // Strategy 4: ID contains
  const idContainsMatches = graph.nodes.filter(node =>
    node.id.toLowerCase().includes(searchTerm.toLowerCase())
  )
  if (idContainsMatches.length > 0) {
    results.push({
      strategy: 'ID contains query',
      matches: idContainsMatches
        .slice(0, 10)
        .map(node => ({
          id: node.id,
          name: node.name,
          type: node.type,
          file: node.file,
        })),
    })
  }

  // Strategy 5: File path match
  const filePathMatches = graph.nodes.filter(
    node => node.file && node.file.includes(searchTerm)
  )
  if (filePathMatches.length > 0) {
    results.push({
      strategy: 'File path match',
      matches: filePathMatches
        .slice(0, 10)
        .map(node => ({
          id: node.id,
          name: node.name,
          type: node.type,
          file: node.file,
        })),
    })
  }

  return {
    originalQuery: searchTerm,
    totalNodes: graph.nodes.length,
    searchResults: results,
  }
}